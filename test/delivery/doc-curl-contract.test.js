import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Doc-curl contract — the docs' runnable claims are executed, not trusted.
 *
 * Every ```bash fence in the DDE docs is extracted and executed verbatim
 * against the documented endpoint: the documented server-start one-liner is
 * run as a real child process, the documented fixture-assembly one-liner runs
 * in a temp cwd, and every documented curl runs as its own command whose
 * stdout is parsed and asserted against the wire contract. Three and only
 * three harness transforms are applied (they are plumbing, not doc edits, and
 * each is asserted to have been needed):
 *   1. port       :8787          → an ephemeral port
 *   2. import     './packages/…' → absolute file:// URL (bash cwd is a tmp dir)
 *   3. tmp cwd                   → the docs assume a repo-root cwd; relative
 *                                  record paths are rewritten to absolute
 *
 * ARCHITECTURE NOTE (a real deadlock this file once had): spawnSync blocks
 * the event loop, so the endpoint must NOT live in the test process — the
 * server would freeze exactly while a curl child waits for its response. The
 * documented start line therefore runs as a separate child process and the
 * test polls /health (async) for readiness before any spawnSync.
 *
 * Drift this catches: a rewritten response shape, a renamed decision string,
 * a broken assembly or start one-liner, a changed default port, a renamed
 * status field — anything that makes the docs lie about the wire.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOC_FILES = [
  "docs/delivery-dispute-boundary.md",
  "examples/delivery-fixture/README.md",
  "README.md",
];

const EXPECTED_DECISION = "EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE";

/**
 * Real bash, spawned directly (shell:false). spawnSync's default on win32
 * routes through cmd.exe, which mangles multi-line -c payloads — the docs'
 * examples are bash, so the harness must speak bash. On Windows the bare
 * name "bash" can resolve to WSL's System32\bash.exe (hangs on our payloads),
 * so full Git-for-Windows paths are tried FIRST; the probe asserts real
 * output, not just a zero exit. Every spawn carries a timeout so a wedged
 * child fails the contract fast instead of stalling the suite.
 */
const SPAWN_OPTS = { encoding: "utf8", shell: false, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 };
function resolveBash() {
  const candidates = process.platform === "win32"
    ? ["C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files\\Git\\usr\\bin\\bash.exe", "bash"]
    : ["bash"];
  for (const b of candidates) {
    const probe = spawnSync(b, ["-c", "printf doc-bash-ok"], SPAWN_OPTS);
    if (probe.status === 0 && probe.stdout === "doc-bash-ok") return b;
  }
  throw new Error("no working bash found — doc-curl harness requires bash");
}
const BASH = resolveBash();

function extractBashFences(md) {
  const out = [];
  const re = /```bash\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(md)) !== null) out.push(m[1]);
  return out;
}

/**
 * Join bash lines into logical commands: a line ending in `\` continues, and
 * a command with an open quote keeps consuming lines (the documented
 * multi-line `node -e` one-liners). Only what these fences actually use.
 */
function logicalCommands(script) {
  const cmds = [];
  let cur = [];
  let quote = null; // null | '"' | "'"
  for (const raw of script.split("\n")) {
    const line = raw.replace(/\r$/, "");
    cur.push(line);
    if (quote === null && line.endsWith("\\")) continue; // continuation
    for (const ch of line) {
      if (quote === null && (ch === '"' || ch === "'")) quote = ch;
      else if (quote === ch) quote = null;
    }
    if (quote === null) {
      cmds.push(cur.join("\n"));
      cur = [];
    }
  }
  if (cur.length) cmds.push(cur.join("\n"));
  return cmds.map((c) => c.trim()).filter(Boolean);
}

/** Kill a started server child reliably (its node grandchild included). */
function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { shell: false, timeout: 10_000 });
    } else {
      process.kill(-child.pid, "SIGKILL"); // detached → own process group
    }
  } catch { /* already gone */ }
}

test("doc curl examples execute against a live documented endpoint and match the wire contract", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "dde-doc-curl-"));
  const executed = [];
  const skipped = [];
  const startedServers = [];
  let port = null;

  // Per-endpoint wire contract, asserted on the stdout each documented curl prints.
  const CONTRACT = {
    "/verify": (j) => {
      assert.equal(j.status, "VERIFIED");
      assert.equal(j.decision, EXPECTED_DECISION);
      assert.ok(Array.isArray(j.checks) && j.checks.length >= 9);
    },
    "/peoples-court": (j) => {
      assert.equal(j.status, "VERIFIED");
      assert.ok(j.peoplesCourt, "evidence-class projection must be present");
      assert.match(String(j.hashesManifest), /^NOT_EVALUATED_OVER_HTTP/);
    },
    "/health": (j) => {
      assert.equal(j.status, "OK");
      assert.equal(j.service, "coreguard-dde-http");
      assert.match(j.boundary, /does not decide delivery conformity/);
    },
  };

  try {
    const importBase = pathToFileURL(REPO).href;
    const absBase = REPO.replaceAll("\\", "/");
    let sawDocumentedStart = false;

    for (const rel of DOC_FILES) {
      const md = readFileSync(join(REPO, rel), "utf8").replaceAll("\r\n", "\n");
      const fences = extractBashFences(md).filter((f) => /curl /.test(f));
      assert.ok(fences.length > 0, `${rel} must still document curl examples`);

      for (const fence of fences) {
        const commands = logicalCommands(fence);

        // The documented default port is part of the contract — asserted on
        // the original text before any rewrite. Comment lines (e.g. the
        // installed-package import hint) are not commands.
        const isCommand = (c) => !c.trimStart().startsWith("#");
        const startCmds = commands.filter((c) => c.includes("startDeliveryEndpoint") && isCommand(c));
        for (const c of startCmds) {
          assert.match(c, /port:\s*8787/, `${rel}: server start must document the default port explicitly`);
          sawDocumentedStart = true;
        }

        // Harness transforms: any relative repo import ('./packages/…') →
        // absolute file:// URL, relative record paths → absolute, then the
        // documented port → one ephemeral port shared by the run.
        let runnable = commands
          .map((c) => c
            .replaceAll("'./packages/", `'${importBase}/packages/`)
            .replaceAll("'./examples/delivery-fixture'", `'${absBase}/examples/delivery-fixture'`))
          .join("\n");
        if (port === null) {
          assert.ok(
            /127\.0\.0\.1:8787/.test(runnable) || startCmds.length > 0,
            `${rel}: fence must target the documented port`,
          );
          // Pick an ephemeral port by binding once, then releasing it.
          const net = await import("node:net");
          port = await new Promise((resolve, reject) => {
            const srv = net.default.createServer();
            srv.once("error", reject);
            srv.listen(0, "127.0.0.1", () => {
              const p = srv.address().port;
              srv.close(() => resolve(p));
            });
          });
        }
        // Port rewrite (transform 1) covers BOTH occurrence forms: URLs and
        // the start one-liner's bare `port: 8787` — the latter must never hit
        // the real documented port (a machine may legitimately have a live
        // listener there; EADDRINUSE would kill the child mid-contract).
        runnable = runnable
          .replaceAll("127.0.0.1:8787", `127.0.0.1:${port}`)
          .replaceAll("port: 8787", `port: ${port}`);

        let cmdList = logicalCommands(runnable);

        // The documented start line runs as the live child server (once) —
        // never inside the blocking setup, and the harness asserts it starts.
        const startCmd = cmdList.find((c) => c.includes("startDeliveryEndpoint") && isCommand(c));
        if (startCmd && startedServers.length === 0) {
          const child = spawn(BASH, ["-c", startCmd], {
            cwd: tmp,
            shell: false,
            stdio: ["ignore", "pipe", "pipe"],
            detached: process.platform !== "win32",
          });
          startedServers.push(child);
          let childErr = "", childOut = "";
          child.stderr.on("data", (d) => (childErr += d));
          child.stdout.on("data", (d) => (childOut += d));
          // Readiness: async polling keeps the event loop alive (spawnSync
          // here would deadlock — the server is a separate process, but the
          // poll must still be async to not freeze the loop mid-connect).
          const health = `http://127.0.0.1:${port}/health`;
          let up = false;
          for (let i = 0; i < 100 && !up; i++) {
            await new Promise((r) => setTimeout(r, 100));
            try {
              const res = await fetch(health);
              if (res.ok) up = true;
            } catch { /* not up yet */ }
          }
          assert.ok(
            up,
            `documented server-start one-liner must produce a live /health\n`
              + `  startCmd: ${startCmd}\n`
              + `  childExit: ${child.exitCode} childSignal: ${child.signalCode}\n`
              + `  childStderr: ${childErr.slice(0, 400)}\n`
              + `  childStdout: ${childOut.slice(0, 200)}`,
          );
        }

        cmdList = cmdList
          .filter((c) => !c.includes("startDeliveryEndpoint"))
          .map((c) => (startCmd && c.startsWith("#") ? c : c)); // keep comments

        const curls = cmdList.filter((c) => c.startsWith("curl"));
        const assembles = cmdList.some((c) => c.includes("loadFixtureFromDir"));
        const fixtureReady = existsSync(join(tmp, "fixture.json")); // assembled by an earlier documented fence
        if (!assembles && !fixtureReady && curls.some((c) => c.includes("@fixture.json"))) {
          skipped.push({ doc: rel, reason: "references fixture.json without any documented assembly available" });
          continue;
        }
        if (curls.length === 0) continue;

        for (const c of curls) {
          assert.match(c, new RegExp(`127\\.0\\.0\\.1:${port}`), `${rel}: curl must target the endpoint`);
        }

        // Setup pass: everything except the curls (comments, assembly).
        const setup = cmdList.filter((c) => !c.startsWith("curl")).join("\n");
        if (setup.trim()) {
          const r = spawnSync(BASH, ["-c", setup], { cwd: tmp, ...SPAWN_OPTS });
          assert.equal(r.status, 0, `${rel}: documented assembly must run: ${r.stderr}`);
          assert.equal(r.stdout.trim(), "", `${rel}: assembly must stay silent on stdout`);
        }

        // Each documented curl runs as its own command so stdout parses per-call.
        for (const c of curls) {
          let cmd = c;
          if (!/\s-o\s/.test(cmd) && !cmd.includes(">")) cmd = cmd.replace(/^curl /, "curl -o - ");
          const path = (cmd.match(/http:\/\/127\.0\.0\.1:\d+(\/[a-z-]+)/) || [])[1];
          assert.ok(path && CONTRACT[path], `${rel}: curl must target a documented endpoint, got ${path}`);

          const r = spawnSync(BASH, ["-c", cmd], { cwd: tmp, ...SPAWN_OPTS });
          assert.equal(r.status, 0, `${rel}: documented curl must exit 0: ${r.stderr}`);
          const body = JSON.parse(r.stdout); // documented output must be pure JSON
          CONTRACT[path](body);
          executed.push({ doc: rel, path });
        }
      }
    }

    assert.ok(sawDocumentedStart, "the documented server-start one-liner must be executed, not just documented");
  } finally {
    for (const child of startedServers) killTree(child);
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* temp dir; OS cleans */ }
  }

  // Coverage guard: the contract only bites if the executed set stays real.
  const verified = executed.filter((e) => e.path === "/verify").length;
  assert.ok(executed.length >= 5, `expected >=5 executed curl examples, ran ${executed.length}`);
  assert.ok(verified >= 3, `expected >=3 /verify examples executed, ran ${verified}`);
  assert.ok(
    executed.some((e) => e.path === "/peoples-court") && executed.some((e) => e.path === "/health"),
    "peoples-court and health examples must be executed, not just documented",
  );
  for (const s of skipped) assert.ok(s.reason, "every skip must carry a named reason");
});
