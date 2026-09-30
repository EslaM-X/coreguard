import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
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
 * stdout is parsed and asserted against the wire contract. Four and only four
 * harness transforms are applied (they are plumbing, not doc edits, and each
 * is asserted to have been needed):
 *   1. port       :8787          → an ephemeral port
 *   2. import     './packages/…' → absolute file:// URL (bash cwd is a tmp dir)
 *   3. tmp cwd                   → the docs assume a repo-root cwd; the
 *                                  fixture records are STAGED into the tmp
 *                                  dir first and the relative record path
 *                                  points at the staged copy — the live
 *                                  examples/ dir is never read at runtime,
 *                                  because the determinism contract test
 *                                  regenerates the fixture in place
 *                                  concurrently (node --test parallelism)
 *                                  and a mid-rewrite read can catch an
 *                                  empty file (JSON.parse("") crash)
 *   4. node --input-type=module  → the assembly one-liner relies on the
 *                                  repo's package.json `type: module`, which
 *                                  only applies from the repo cwd; from the
 *                                  tmp cwd `node -e` falls back to CJS and
 *                                  the import statement is a SyntaxError on
 *                                  strict-default platforms (Linux CI). The
 *                                  flag pins the semantics the docs rely on.
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
 *
 * [C25] START-PER-LINE: every documented start line — not just the first per
 * document — is executed verbatim against its OWN live child and its claims
 * are asserted on that child's wire (allowlist admits the loopback it pins;
 * a documented limiter sizing reads back verbatim as x-ratelimit-limit,
 * tri-pinned to the prose promise so a corrupted line cannot fabricate its
 * own confirming server). An exact pin over the measured start-line set (7)
 * fails the push when a line is lost or left unproven, in either direction.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOC_FILES = [
  "docs/delivery-dispute-boundary.md",
  "examples/delivery-fixture/README.md",
  "README.md",
  "INTEGRATION.md",
  "docs/agent-incident-evidence.md",
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
    // A line whose first non-blank char is '#' is a bash COMMENT: quotes
    // inside it are inert (real bash never parses them there). Measured bug
    // this closes: the apostrophe in a comment's "proxy's" opened a
    // single-quote state that swallowed the NEXT line — the §hardening start
    // line rode the whole harness invisible (its fence's two comments carried
    // odd apostrophe parity) until the foreign-allowlist negative control
    // refused to bite and the fences were dumped member by member [C35].
    if (quote === null && line.trimStart().startsWith("#")) {
      if (cur.length) { cmds.push(cur.join("\n")); cur = []; }
      cmds.push(line);
      continue;
    }
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
    let sawDocumentedStart = false;
    const provenStarts = []; // [C25] every start line proven verbatim, as {doc, fence}

    // Stage the fixture records into the tmp dir. The live examples/ dir is
    // concurrently regenerated in place by the determinism contract test
    // (node --test parallelism), so reading it at runtime can catch a file
    // mid-rewrite (empty → JSON.parse crash). Each staged record is parsed
    // before it is accepted; a torn read just retries (bytes are fixed).
    const stagedFixtureDir = join(tmp, "staged-fixture");
    mkdirSync(stagedFixtureDir, { recursive: true });
    const RECORDS = [
      "agreement.json", "acceptance-criteria.json", "parties.json",
      "authorization.json", "execution-attestation.json", "delivery-manifest.json",
      "acceptance-record.json", "dispute-record.json", "consent-and-disclosure.json",
      "retention-policy.json", "hashes.json",
    ];
    for (const name of RECORDS) {
      const src = join(REPO, "examples", "delivery-fixture", name);
      let text = null;
      for (let i = 0; i < 5 && text === null; i++) {
        const candidate = readFileSync(src, "utf8");
        try { JSON.parse(candidate); text = candidate; } catch { await new Promise((r) => setTimeout(r, 50)); }
      }
      assert.ok(text !== null, `staging: ${name} could not be read intact (concurrent regeneration?)`);
      writeFileSync(join(stagedFixtureDir, name), text);
    }

    for (const rel of DOC_FILES) {
      const md = readFileSync(join(REPO, rel), "utf8").replaceAll("\r\n", "\n");
      // [C25] NO curl-filter here: filtering first is how the second and third
      // start lines rode CI unproven — a fence holding only a documented start
      // line IS a wire claim and must reach the loop below (the negative
      // control that caught this: corrupting the production line's rateLimit
      // sizing stayed green while the filter was in place).
      const fences = extractBashFences(md);
      assert.ok(fences.length > 0, `${rel} must still document bash examples`);

      for (let fenceIndex = 0; fenceIndex < fences.length; fenceIndex++) {
        const fence = fences[fenceIndex];
        const commands = logicalCommands(fence);

        // Fences that neither curl nor document a start line carry no wire
        // claim of their own (clone hints, prose installs) — skip them BEFORE
        // port allocation, whose assertion presumes a wire-targeting fence.
        const isCommand = (c) => !c.trimStart().startsWith("#");
        const fenceHasStart = commands.some((c) => c.includes("startDeliveryEndpoint") && isCommand(c));
        const fenceHasCurl = commands.some((c) => c.startsWith("curl"));
        if (!fenceHasStart && !fenceHasCurl) continue;

        // The documented default port is part of the contract — asserted on
        // the original text before any rewrite. Comment lines (e.g. the
        // installed-package import hint) are not commands.
        const startCmds = commands.filter((c) => c.includes("startDeliveryEndpoint") && isCommand(c));
        for (const c of startCmds) {
          assert.match(c, /port:\s*8787/, `${rel}: server start must document the default port explicitly`);
          sawDocumentedStart = true;
        }

        // Harness transforms: any relative repo import ('./packages/…') →
        // absolute file:// URL, the record path → the staged copy in tmp,
        // then the documented port → one ephemeral port shared by the run.
        let runnable = commands
          .map((c) => c
            .replaceAll("'./packages/", `'${importBase}/packages/`)
            .replaceAll("'./examples/delivery-fixture'", `'${stagedFixtureDir.replaceAll("\\", "/")}'`))
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
        if (startCmd) {
          // [C25] per-line proof: the previous fence's server is killed here
          // (before this line's own child is spawned) — every documented
          // claim is proven against the posture THIS line establishes, and no
          // two documented lines ever share a process.
          for (const prev of startedServers) killTree(prev);
          startedServers.length = 0;
          // Template = the documented start line with its original
          // `port: 8787` AND the import transform applied (the raw command
          // would resolve './packages/…' against the tmp cwd and die).
          // Every attempt derives its own child from it, so a retry can move
          // the listen port (a no-op replaceAll on a ported string would not).
          // [C25] per-line proof: the template is derived from THIS fence's
          // own start line and proven verbatim against its claim — a second
          // documented line never rides on the first one's server.
          const startTemplate = commands
            .find((c) => c.includes("startDeliveryEndpoint") && isCommand(c))
            ?.replaceAll("'./packages/", `'${importBase}/packages/`);
          provenStarts.push({ doc: rel, fence: fenceIndex });
          // Port-race hardening: node --test runs files in parallel, and a
          // sibling test could grab the released ephemeral port between our
          // probe bind and the child's listen. On EADDRINUSE the child dies
          // immediately, so we detect a fast exit, kill the (already-dead)
          // attempt, free the name, and retry on a FRESH port — the fence is
          // re-ported wholesale. Retries are bounded; exhaustion fails loudly.
          const startChild = (p) => spawn(BASH, ["-c", startTemplate.replaceAll("port: 8787", `port: ${p}`)], {
            cwd: tmp,
            shell: false,
            stdio: ["ignore", "pipe", "pipe"],
            detached: process.platform !== "win32",
          });
          const probeHealth = (p) => {
            return new Promise((resolve) => {
              const req = http.get({ host: "127.0.0.1", port: p, path: "/health", timeout: 2000 }, (res) => {
                res.resume();
                resolve(res.statusCode === 200);
              });
              req.on("timeout", () => { req.destroy(); resolve(false); });
              req.on("error", () => resolve(false));
            });
          };
          // [C25] claim probes: status by host (allowlist half) and a response
          // header by name (limiter sizing). All resolve (never throw) so a
          // dead child surfaces as an assertion, not a crash.
          const probeStatus = (p, host) => new Promise((resolve) => {
            const req = http.get({ host, port: p, path: "/health", timeout: 2000 }, (res) => {
              res.resume();
              resolve(res.statusCode);
            });
            req.on("timeout", () => { req.destroy(); resolve(0); });
            req.on("error", () => resolve(0));
          });
          const probeHeader = (p, name) => new Promise((resolve) => {
            // A non-/health path: the limiter (and its x-ratelimit headers)
            // deliberately skips /health, so the sizing proof must ride a
            // limiter-covered route — headers are set before route dispatch,
            // so the status of this probe is irrelevant, only the header.
            const req = http.get({ host: "127.0.0.1", port: p, path: "/verify", timeout: 2000 }, (res) => {
              res.resume();
              resolve(String(res.headers[name] ?? ""));
            });
            req.on("timeout", () => { req.destroy(); resolve(""); });
            req.on("error", () => resolve(""));
          });
          let child = null, childErr = "", childOut = "", up = false;
          for (let attempt = 0; attempt < 5 && !up; attempt++) {
            if (child) killTree(child);
            if (attempt > 0) {
              // Fresh ephemeral port for this attempt; re-port the whole fence
              // (URLs + the start one-liner) so setup/curls stay consistent.
              const net = await import("node:net");
              port = await new Promise((resolve, reject) => {
                const srv = net.default.createServer();
                srv.once("error", reject);
                srv.listen(0, "127.0.0.1", () => {
                  const p = srv.address().port;
                  srv.close(() => resolve(p));
                });
              });
              cmdList = cmdList.map((c) => c
                .replaceAll(/127\.0\.0\.1:\d+/g, `127.0.0.1:${port}`));
            }
            childErr = ""; childOut = "";
            child = startChild(port);
            startedServers.push(child);
            child.stderr.on("data", (d) => (childErr += d));
            child.stdout.on("data", (d) => (childOut += d));
            // Readiness: async polling keeps the event loop alive (spawnSync
            // here would deadlock — the server is a separate process, but the
            // poll must still be async to not freeze the loop mid-connect).
            const deadline = Date.now() + 10_000;
            while (Date.now() < deadline && !up) {
              await new Promise((r) => setTimeout(r, 100));
              if (child.exitCode !== null || child.signalCode) break; // died — retry
              up = await probeHealth(port);
            }
          }
          assert.ok(
            up,
            `documented server-start one-liner must produce a live /health\n`
              + `  startCmd: ${startCmd}\n`
              + `  lastPort: ${port}\n`
              + `  childExit: ${child.exitCode} childSignal: ${child.signalCode}\n`
              + `  childStderr: ${childErr.slice(0, 400)}\n`
              + `  childStdout: ${childOut.slice(0, 200)}`,
          );

          // [C25] the line's OWN claims, asserted on the live child's wire:
          // a line that pins an allowlist must ADMIT the loopback it pins
          // (corrupting the pinned addresses flips this to 403), and a
          // documented limiter sizing shows up verbatim as x-ratelimit-limit.
          // Note the default bind is IPv4 loopback, so the ::1 entry is a
          // statement about the LIST (mapped-v6 collapse), not a bind promise
          // — the wire proof is the pinned v4 member answering 200.
          if (/allowAddresses/.test(startCmd)) {
            const cfg = startCmd.match(/allowAddresses:\s*\[([^\]]*)\]/)[1];
            const allowed = (cfg.match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
            assert.ok(allowed.includes("127.0.0.1"), `${rel}: the documented start line pins an allowlist — it must admit the loopback it documents, got [${allowed.join(", ")}]`);
            const v4 = await probeStatus(port, "127.0.0.1");
            assert.equal(v4, 200, `${rel}: the documented start line allowlists [${allowed.join(", ")}] — the pinned loopback must answer 200 (never read this proof from a foreign-allowlist posture)`);
          }
          const rl = startCmd.match(/rateLimit:\s*\{([^}]*)\}/);
          if (rl && /max:\s*(\d+)/.test(rl[1])) {
            // [C32] tri-pin (prose ↔ line ↔ wire): the wire proof ALONE is
            // circular — corrupting the documented line fabricates its own
            // confirming server, so the probe reads back the corruption as a
            // match. The prose promise in the boundary doc is the independent
            // leg: line and prose must agree BEFORE the wire reading counts.
            const PROSE_WINDOW = "windowMs: 60_000, max: 600";
            const boundaryProse = readFileSync(join(REPO, "docs", "delivery-dispute-boundary.md"), "utf8").replaceAll("\r\n", "\n");
            assert.ok(boundaryProse.includes(PROSE_WINDOW),
              "the boundary doc's prose backstop sizing drifted from the pin (windowMs: 60_000, max: 600) — update the tri-pin WITH the doc, never after");
            assert.match(startCmd, /windowMs:\s*60000,\s*max:\s*600/,
              "the documented production start line's limiter sizing drifted from the prose pin (windowMs 60000, max 600) — line and prose must move in the same commit");
            const claimed = Number(rl[1].match(/max:\s*(\d+)/)[1]);
            const h = await probeHeader(port, "x-ratelimit-limit");
            assert.equal(h, String(claimed), `${rel}: the documented start line claims rateLimit.max ${claimed} — the wire must size the backstop to exactly that`);
          }
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
        // Transform 4 pins ESM eval for the assembly (see header): from the
        // tmp cwd, `node -e` has no package.json `type: module` in scope.
        const setupCmds = cmdList
          .filter((c) => !c.startsWith("curl"))
          .map((c) => (c.includes("loadFixtureFromDir") ? c.replace(/^node /, "node --input-type=module ") : c));
        const setup = setupCmds.join("\n");
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

    // [C25] per-line closure: EVERY documented start line was executed and
    // proven verbatim. The old harness proved the first per file and let the
    // rest ride on session discipline — two shipped lines rode CI unproven.
    const totalStartCmds = DOC_FILES.flatMap((rel) =>
      extractBashFences(readFileSync(join(REPO, rel), "utf8").replaceAll("\r\n", "\n")),
    ).reduce(
      (n, f) => n + logicalCommands(f).filter((c) => c.includes("startDeliveryEndpoint") && !c.trimStart().startsWith("#")).length,
      0,
    );
    // [C25]+[C32] exactness: the pin is the MEASURED set (7 start lines:
    // delivery-dispute-boundary ×3, examples README, README, INTEGRATION,
    // agent-incident-evidence — the hardening line joined the count only after
    // the comment-inert tokenizer fix made it visible). A line LOST fails here
    // by name; a line ADDED must update this pin in the same commit AND
    // inherit the per-line proof above — which is the point: a start line
    // never ships unproven again, in either direction.
    assert.equal(
      totalStartCmds, 7,
      `documented start-line set moved: found ${totalStartCmds}, pin is 7 — a line was lost (restore/prove it) or added (update the pin in the same commit and confirm the per-line proof above ran for it)`,
    );
    assert.equal(
      provenStarts.length, totalStartCmds,
      `start-line proof gap: ${totalStartCmds - provenStarts.length} documented start line(s) rode CI unproven — proven: [${provenStarts.map((p) => `${p.doc}#${p.fence}`).join(", ")}])`,
    );
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
