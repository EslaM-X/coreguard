import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, statSync, readFileSync, mkdtempSync, rmSync, existsSync, cpSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Repo-wide docs contract — every documented node/npm command RUNS, not just
 * the curl wire (generalizes doc-curl-contract.test.js, which owns the HTTP
 * surface and stays authoritative for it).
 *
 * SCAN: every *.md(x) outside templates/ (their fences document the GENERATED
 * project's world, which the scaffold run below exercises the way a reader
 * would), every ```bash fence, every logical command (backslash-continuation
 * joined), every line starting with node/npm — plus `cd` lines, because the
 * docs assume a reader who changes directories mid-fence (README's scaffold
 * trio runs inside `cd my-escrow-dapp`).
 *
 * WORLD MODEL ("reader-as-root"): the harness reproduces the reader's world
 * in a mkdtemp sandbox:
 *   - the sandbox root carries JUNCTIONS to the repo's read-only surfaces
 *     (packages/, scripts/, node_modules — so workspace imports by name and
 *     relative `node packages/cli/...` invocations work exactly as documented);
 *   - example trees are STAGED COPIES (proven drift: run-demo.js REWRITES its
 *     sibling receipts — fresh timestamp + receiptId — and `cli verify`
 *     rewrites its --receipt input; the shared examples/ tree must stay
 *     read-only for tests, [C16]);
 *   - fences that touch the write-prone demos start from FRESH copies, so a
 *     previous command's debris (transfer's arc ends tampered) can never
 *     poison a later documented reader.
 *
 * THREE BUCKETS, enforced:
 *   RUN   — executed here (sandboxed when the command writes).
 *   SKIP  — listed in SKIP with a NAMED, still-true reason.
 *   FAIL  — anything else: a new node/npm line in any md file must be
 *           classified or the contract goes red. Docs can no longer grow
 *           untested commands silently.
 *
 * Documented fail-closed exits are CONTRACT, not errors: payout-gate's exit 2
 * is the HOLD; verify-fixture --tamper's exit 1 is the caught tamper; and
 * `verify-run --rpc` against a synthetic receipt (txHash 0x…aa) exits 2 with
 * the full CGEP/1 report — the live chain cannot confirm what never happened,
 * which is the honesty property being sold.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCAN_SKIP_DIRS = new Set(["node_modules", ".git", ".freebuff", "legacy-quarantine", "templates"]);
const SPAWN_OPTS = { encoding: "utf8", shell: false, maxBuffer: 8 * 1024 * 1024 };

function resolveBash() {
  const candidates = process.platform === "win32"
    ? ["C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files\\Git\\usr\\bin\\bash.exe", "bash"]
    : ["bash"];
  for (const b of candidates) {
    const probe = spawnSync(b, ["-c", "printf doc-bash-ok"], { ...SPAWN_OPTS, timeout: 15_000 });
    if (probe.status === 0 && probe.stdout === "doc-bash-ok") return b;
  }
  throw new Error("no working bash found — docs-node contract requires bash");
}
const BASH = resolveBash();

function listMarkdown(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (SCAN_SKIP_DIRS.has(e)) continue;
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) listMarkdown(p, out);
    else if (/\.(md|mdx)$/.test(e)) out.push(p);
  }
  return out;
}

function extractBashFences(md) {
  return [...md.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]);
}

/** Join backslash continuations into logical commands. `cd` lines and `&&`
 *  chains pass through too — the docs assume a reader who changes directories
 *  mid-fence (`cd my-escrow-dapp && node verify-dde.mjs && node --test`), and
 *  dropping either would run the follow-ups in the wrong world.
 *
 *  Multi-line `node -e "…"` stanzas are also absorbed: some fences write the
 *  JS over several physical lines with the quotes opening on the first line
 *  (delivery-dispute-boundary.md, fixture READMEs). A lone `node -e "` is a
 *  bash-parse error, so a line that opens a quote without closing it absorbs
 *  the following lines until the quotes balance — the reader's block, verbatim. */
function logicalCommands(fence) {
  const cmds = [];
  let cur = null;
  let quoteOpen = 0;
  for (const line of fence.split("\n")) {
    const t = line.trim();
    if (cur !== null) {
      cur.push(line);
      quoteOpen += (line.match(/"/g) || []).length;
      if (!line.trimEnd().endsWith("\\") && quoteOpen % 2 === 0) { cmds.push(cur.join("\n")); cur = null; }
      continue;
    }
    if (/^(node|npm)\s|^cd\s/.test(t)) {
      cur = [line];
      quoteOpen = (line.match(/"/g) || []).length;
      if (!line.trimEnd().endsWith("\\") && quoteOpen % 2 === 0) { cmds.push(cur.join("\n")); cur = null; }
      continue;
    }
  }
  if (cur !== null) cmds.push(cur.join("\n"));
  return cmds.map((c) => c.replace(/\s+$/, "")).filter(Boolean);
}

function q(p) {
  return process.platform === "win32" ? `"${p}"` : `'${p}'`;
}

const PKG_SCRIPTS = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")).scripts;

/**
 * SKIP table — every exclusion carries a reason that is a claim about the
 * world. A command lands here ONLY because running it in a CI test would
 * violate a stronger rule than the docs contract itself.
 */
const SKIP = [
  { re: /(^|\s)npm (install|ci)(\s|$)/, reason: "registry install (npm ci is owned by every workflow's setup step; the documented @coreguard/sdk install is E404 — unpublished)" },
  { re: /npm test/, reason: "full suite — this contract runs inside it (recursion)" },
  { re: /npm run (corpus|benchmark)(\s|$)/, reason: "corpus rewrites committed benchmarks/ (the make-fixture rule); plain benchmark re-derives it from the corpus" },
  { re: /npm run benchmark:/, reason: "perf medians are owned by the DDE Evidence Cycle (dde.yml runs benchmark-dde/-http + trend badges); not re-run here" },
  { re: /npm run (anchor:plan|anchor:verify)/, reason: "rewrites committed scripts/live-anchor-planned.json (freeze-adjacent) / drives PowerShell against live Mainnet state" },
  { re: /npm run demo:90s(:live)?(\s|$)/, reason: "demo:90s is its own recorded chain (submission pipeline); :live re-derives from Core Mainnet (external network)" },
  { re: /npm run release:dry/, reason: "heavy release planner — owned by test/ci/publish-gate.test.js (dry-run contract with the credential gate)" },
  { re: /npm run publish:check/, reason: "publish machinery (npm pack + tarball gate) — owned by test/ci/publish-gate.test.js" },
  { re: /node examples\/live\/live-verify\.js/, reason: "live Core Mainnet RPC (external network, non-deterministic block input)" },
  { re: /verify-run --bundle.*--rpc/, reason: "live Testnet2 RPC on a committed bundle — the offline --bundle form below covers the contract" },
  { re: /build-verifier\.mjs --update/, reason: "promotes the frozen wasm artifact (dev-only by its own header; the gate mode path stays frozen)" },
  { re: /startDeliveryEndpoint/, reason: "server-start one-liner — executed against a live child by doc-curl-contract.test.js (double-binding port 8787 here would also hang this fence)" },
  { re: /^cd coreguard$/, reason: "lands in the fresh clone created by the documented `git clone` in the same fence (external network) — the package's own verification fences run from the package root" },
  { re: /forge /, reason: "Solidity toolchain (foundry) — a non-Node contract file guarded by the CI Contracts job (forge build / forge test), not a node/npm command; not installed on every dev box" },
];

/** Build the reader's world: junctions for read-only surfaces, copies for the rest. */
function buildSandbox(tmp) {
  mkdirSync(join(tmp, "examples"), { recursive: true });
  symlinkSync(join(REPO, "packages"), join(tmp, "packages"), "junction");
  symlinkSync(join(REPO, "scripts"), join(tmp, "scripts"), "junction");
  symlinkSync(join(REPO, "node_modules"), join(tmp, "node_modules"), "junction");
  for (const rel of ["examples/delivery-fixture", "examples/vault", "examples/agent-platform-integration", "examples/real-fixture-intake", "examples/transfer", "examples/swap", "examples/multistep", "examples/provenance", "examples/reference-tribunal"]) {
    assert.ok(existsSync(join(REPO, rel)), `sandbox staging source missing in repo: ${rel}`);
    cpSync(join(REPO, rel), join(tmp, rel), { recursive: true });
    assert.ok(existsSync(join(tmp, rel)), `sandbox staging failed for: ${rel}`);
  }
  assert.ok(existsSync(join(tmp, "examples", "delivery-fixture", "verify-fixture.mjs")), "sandbox: verify-fixture.mjs must exist after staging");
}

/** Fresh copies before any fence that runs the write-prone demos / CLI. */
function stageFresh(tmp, rels) {
  for (const rel of rels) {
    rmSync(join(tmp, rel), { recursive: true, force: true });
    cpSync(join(REPO, rel), join(tmp, rel), { recursive: true });
  }
}

/** Resolve a `npm run <name> [-- args]` line to its underlying node command.
 *  Documented trailing comments (`npm run demo:vault   # …`) are stripped —
 *  they are prose, not argv. */
function rewriteNpmRun(line, tmp, counter) {
  const m = line.replace(/\s+#.*$/, "").match(/^npm run ([\w:@-]+)(?:\s+--\s+(.*))?$/);
  if (!m) return null;
  const [, name, args] = m;
  const script = PKG_SCRIPTS[name];
  if (!script || !script.startsWith("node ")) return null;
  const argv = args ? " " + args : "";
  let cmd = script + argv;
  // sandbox the out dirs these generators write to
  if (/make-(dispute|evidence)-package\.mjs/.test(cmd)) {
    cmd = cmd.replace(/--out\s+\S+(?= --out|$)/, "").replace(/--out\s+\S+\s*$/, "").trim() + " --out " + q(join(tmp, "pkg-out-" + counter.n++));
  }
  // peoples-court adapter: `--case <x>` must be a DELIVERED package dir (the
  // README template and the ecosystem quickstart name the previous step's
  // output); point it at the staged reference-A so the dry-run reads real
  // bytes, not a bare filename. Its own out defaults beside the case.
  if (/peoples-court-adapter\/cli\.mjs/.test(cmd)) {
    cmd = cmd.replace(/--case\s+("[^"]+"|\S+)/, "--case " + q(join(tmp, "examples", "delivery-fixture", "pairs", "dispute-package", "reference-A")));
  }
  return cmd;
}

/** Per-line contract for a runnable command. */
function expectFor(cmd) {
  if (/verify-fixture\.mjs --tamper/.test(cmd)) return { exit: [1], match: /FAIL/ };
  if (/verify-fixture\.mjs --json/.test(cmd)) return { exit: [0], json: true };
  // MORE SPECIFIC FIRST: run-http-payout-gate.mjs contains payout-gate.mjs
  // as a substring — the wire demo's verdict is its exit code (0 = all 9
  // scenarios behaved), it does not print the scaffold's HOLD summary.
  if (/run-http-payout-gate\.mjs/.test(cmd)) return { exit: [0] };
  if (/payout-gate\.mjs/.test(cmd)) return { exit: [0, 2], match: /HOLD/ }; // exit 2 = the documented HOLD
  if (/verify-dde\.mjs/.test(cmd)) return { exit: [0] };
  // The docs define verify-run/verify-provenance as an EXIT-CODE DISCIPLINE
  // (README: `exit 0=VERIFIED 2=INVALID 3=UNVERIFIED 4=INCONCLUSIVE`) over the
  // CGEP/1 report — not "this input must verify". The harness fills the
  // documented placeholders with staged demo files, so which verdict a given
  // pairing deserves is the engine's honest call; the contract is that the
  // command runs and exits within the documented discipline — printing pure
  // JSON only when the documented command itself asked for --json.
  if (cmd.includes("packages/cli") && /verify-run|verify-provenance/.test(cmd)) {
    return { exit: [0, 2, 3, 4], json: /--json/.test(cmd) };
  }
  return { exit: [0] };
}

test("every documented node/npm command in the repo runs, is skip-listed with a reason, or fails the contract", () => {
  const tmp = mkdtempSync(join(tmpdir(), "docs-node-"));
  const executed = [];
  const skipped = [];
  const perDoc = {};
  const counter = { n: 0 };

  try {
    buildSandbox(tmp);

    // Intake kit needs a modeled REAL candidate for its prelude/convert fences
    // (the docs build it with make-intake-candidate.mjs — not itself fenced).
    const candidateDir = join(tmp, "candidate");
    const mk = spawnSync(process.execPath, ["--input-type=module", "-e",
      `const { makeCandidate } = await import(${JSON.stringify("file:///" + join(REPO, "examples", "real-fixture-intake", "make-intake-candidate.mjs").replaceAll("\\", "/"))}); makeCandidate(${JSON.stringify(candidateDir)}); console.log("candidate staged")`,
    ], { ...SPAWN_OPTS, timeout: 60_000 });
    assert.equal(mk.status, 0, `intake candidate must be buildable: ${mk.stderr}`);

    const docs = listMarkdown(REPO).sort();
    assert.ok(docs.length > 100, `the scan must see the real doc tree, saw ${docs.length}`);

    for (const doc of docs) {
      const md = readFileSync(doc, "utf8").replaceAll("\r\n", "\n");
      const rel = doc.slice(REPO.length + 1).replaceAll("\\", "/");
      // Placeholders are DOC-scoped: a reader uses the SAME `<out-dir>`
      // across fences of one page (convert → verify), so a bind made in one
      // fence must resolve to the identical path in every later fence of that
      // document (real-fixture-intake's convert → verify chain is such a flow).
      const docVars = new Map();
      const docVar = (slot) => {
        if (!docVars.has(slot)) docVars.set(slot, join(tmp, `converted-${counter.n++}-${slot.replace(/[^a-z0-9-]/g, "")}`));
        return docVars.get(slot);
      };
      // Self-contained package docs (coreguard-assurance*/) address paths
      // from THEIR package root (node verification/validate-freeze.mjs …) —
      // the reader's world there is the package, not the repo.
      const docRoot = rel.startsWith("coreguard-assurance") ? join(REPO, rel.split("/")[0]) : tmp;
      for (const fence of extractBashFences(md)) {
        const lines = logicalCommands(fence);
        if (lines.length === 0) continue;

        // Fresh example copies for any fence that runs the demos or the CLI.
        if (lines.some((l) => /examples\/(transfer|swap|multistep)\/run-demo\.js|packages\/cli\/src\/index\.js|npm run (verify-provenance|dispute-package|evidence-package)/.test(l))) {
          stageFresh(tmp, ["examples/transfer", "examples/swap", "examples/multistep", "examples/provenance"]);
        }

        // The reader starts every fence at the repo root; `cd` inside the
        // fence moves them (tracked below), and the world persists across
        // fences of the same doc (README generates the scaffold in one fence
        // and `cd my-escrow-dapp`s into it in the next).
        let cwd = docRoot;
        for (const line of lines) {
          const t = line.trim();
          // SKIP check FIRST — some skip reasons ARE cd lines (`cd coreguard`
          // needs the git clone the same fence documents; external network).
          const hit0 = SKIP.find((s) => s.re.test(t));
          if (hit0) { skipped.push({ doc: rel, line: t.slice(0, 90), reason: hit0.reason }); continue; }
          // `cd x && node … && node …` chains: split into steps; the cd step
          // moves the world, the rest run as documented.
          if (t.includes("&&") && /^(cd\s)/.test(t)) {
            for (const step of t.split("&&")) {
              const s = step.trim().replace(/^\(|\)$/g, "");
              if (!s) continue;
              const scd = s.match(/^cd\s+(.+?)$/);
              if (scd) {
                cwd = resolve(cwd, scd[1].trim().replace(/^["']|["']$/g, ""));
                assert.ok(existsSync(cwd), `${rel}: documented 'cd ${scd[1].trim()}' must land in an existing directory`);
                continue;
              }
              const r = spawnSync(BASH, ["-c", s], { cwd, ...SPAWN_OPTS, timeout: 120_000 });
              assert.equal(r.status, 0, `${rel}: documented chain step must run: ${s}\n${r.stderr.slice(0, 300)}`);
              executed.push({ doc: rel, line: s.slice(0, 90) });
              perDoc[rel] = (perDoc[rel] || 0) + 1;
            }
            continue;
          }
          const cdM = t.match(/^cd\s+(.+?)\s*(#.*)?$/);
          if (cdM) {
            const target = cdM[1].trim().replace(/^["']|["']$/g, "");
            cwd = resolve(cwd, target);
            assert.ok(existsSync(cwd), `${rel}: documented 'cd ${target}' must land in an existing directory (the generating fence must come first)`);
            continue;
          }

          const hit = SKIP.find((s) => s.re.test(t));
          if (hit) { skipped.push({ doc: rel, line: t.slice(0, 90), reason: hit.reason }); continue; }

          // Scaffold family: run the documented generator at the fence cwd
          // (it materializes ./<name> right there), then the fence's own cd
          // puts the trio inside it — the reader's world, executed.
          if (/create[-:]integration/.test(t)) {
            const dde = /--dde/.test(t);
            const name = dde ? "my-escrow-dapp" : "my-dapp";
            // npm's form needs the workspace package.json in cwd (absent in
            // the sandbox by design) — the README documents the same
            // generator invocable directly; run that equivalent. It runs at
            // the current world cwd, materializing ./<name> right there.
            const gen = spawnSync(BASH, ["-c", `node ${q(join(REPO, "scripts", "create-integration.mjs"))} ${name}${dde ? " --dde" : ""}`], { cwd, ...SPAWN_OPTS, timeout: 60_000 });
            assert.equal(gen.status, 0, `${rel}: documented scaffold must run: ${gen.stderr}`);
            assert.ok(existsSync(join(cwd, name, "package.json")), `${rel}: scaffold must materialize ${name}/`);
            if (dde) {
              assert.ok(existsSync(join(cwd, name, "verify-dde.mjs")) && existsSync(join(cwd, name, "payout-gate.mjs")), "dde scaffold must ship the documented verifier + payout gate");
            } else {
              assert.ok(existsSync(join(cwd, name, "verify.mjs")) && existsSync(join(cwd, name, "example.mjs")), "guard scaffold must ship the documented verifier + lifecycle example");
            }
            executed.push({ doc: rel, line: t.slice(0, 90) });
            perDoc[rel] = (perDoc[rel] || 0) + 1;
            continue;
          }

          let cmd = t.replace(/\s+#.*$/, "").trimEnd(); // trailing doc comments are prose, not argv
          // Documented placeholders → real, sandboxed targets. The CLI reads
          // STAGED copies (it rewrites its --receipt input); VERIFY-RUN.md's
          // bare `receipt.json`-style names get the same staged files (the
          // doc documents a usage TEMPLATE, not repo paths).
          const bare = (name) => q(join(tmp, "examples/transfer", name));
          // case-study's `verify-assent-pair.mjs` runs "from any pair dir" —
          // its cwd IS the pair (it pins the four pair files relative to cwd).
          if (/verify-assent-pair\.mjs/.test(cmd)) {
            // run from the pair dir with the RELATIVE doc path — the reader's
            // "from any pair dir" world (an absolute path + pair cwd would
            // double-resolve and never find the script).
            const pairRel = "examples/delivery-fixture/pairs/assent-pair";
            const rel_cmd = cmd.replace(/examples\/delivery-fixture\/pairs\/assent-pair\/verify-assent-pair\.mjs/, "verify-assent-pair.mjs");
            const pr = spawnSync(BASH, ["-c", rel_cmd], { cwd: join(tmp, pairRel), ...SPAWN_OPTS, timeout: 120_000 });
            assert.equal(pr.status, 0, `${rel}: documented pair verifier must pass from the pair dir: ${pr.stderr.slice(0, 300)}`);
            executed.push({ doc: rel, line: t.slice(0, 90) });
            perDoc[rel] = (perDoc[rel] || 0) + 1;
            continue;
          }
          cmd = cmd
            .replaceAll("--receipt receipt.json", "--receipt " + bare("receipt-valid.json"))
            .replaceAll("--intent  intent.json", "--intent " + bare("intent.json"))
            .replaceAll("--policy  policy.json", "--policy " + bare("policy.json"))
            .replaceAll("--trace   trace.json", "--trace " + bare("trace.json"))
            .replaceAll("--evidence evidence.json", "--evidence " + q(join(tmp, "examples/provenance/evidence.json")))
            .replaceAll("<fixture-dir>", q(join(tmp, "examples", "delivery-fixture")))
            .replaceAll("<candidate-dir>", q(candidateDir))
            // `--out <dir>` on the DIRECT generator forms (dispute-package-standard
            // / evidence-package-standard) lands in a fresh sandbox dir exactly
            // like the npm-run rewrite's pkg-out; `--case <dir>` on the adapter's
            // template points at the staged reference-A (a delivered package dir).
            .replaceAll("--case <dir>", "--case " + q(join(tmp, "examples", "delivery-fixture", "pairs", "dispute-package", "reference-A")))
            .replaceAll("--out <dir>", "--out " + q(join(tmp, "pkg-out-" + counter.n++)))
            // `<out-dir>` is DOC-scoped: the JS-string form (`fixtureDir: '<out-dir>'`)
            // must equal the shell form (`convert … <out-dir>`) on the same page.
            .replaceAll("'<out-dir>'", "'" + docVar("out").replaceAll("\\", "/") + "'")
            .replaceAll("<out-dir>", q(docVar("out")))
            .replaceAll("<archive.zip>", q(join(tmp, "archive-" + counter.n + ".zip")))
            .replaceAll("--intent <...>", "--intent " + q(join(tmp, "examples/transfer/intent.json")))
            .replaceAll("--policy <...>", "--policy " + q(join(tmp, "examples/transfer/policy.json")))
            .replaceAll("--trace <...>", "--trace " + q(join(tmp, "examples/transfer/trace.json")))
            .replaceAll("--receipt <...>", "--receipt " + q(join(tmp, "examples/transfer/receipt-valid.json")))
            .replaceAll("--evidence <...>", "--evidence " + q(join(tmp, "examples/provenance/evidence.json")))
            .replaceAll("--manifest <...>", "--manifest " + q(join(tmp, "examples/provenance/manifest.json")))
            .replaceAll("--rpc <url>", "--rpc https://rpc.test2.btcs.network")
            .replaceAll("[--seed 424242]", "--seed 424242")
            // `demo allow|attack` documents a CHOICE, not literal argv —
            // run one documented arm of it.
            .replace(/demo\s+allow\|attack/, "demo allow")
            // Doc optional-arg brackets are reader syntax (`[--json]`,
            // `[--evidence <...> --intent <...>]`): unwrap a bracket ONLY
            // when it starts with `--` and ends at an arg boundary — the
            // quoted JS of one-liners (`[name, pin]`, `reasons[0]`) must
            // survive untouched (proven failure modes).
            .replaceAll(/\[--[^\]]*\](?=\s|$)/g, (m) => m.slice(1, -1));
          counter.n += 1;

          // npm run forms → their underlying node command (npm needs the
          // workspace package.json in cwd, which the sandbox omits).
          if (cmd.startsWith("npm run ")) {
            const rewritten = rewriteNpmRun(cmd, tmp, counter);
            assert.ok(rewritten, `${rel}: unhandled npm run form (must be skip-listed or rewritten): ${t}`);
            cmd = rewritten;
          }

          // make-fixture must NEVER write the shared tree from a test ([C16])
          // — the documented command gains the generator's own --out flag.
          if (/make-fixture\.mjs/.test(cmd)) cmd = cmd + " --out " + q(join(tmp, "fixture-out-" + counter.n++));

          // [C15] (same plumbing as the curl contract's transform 4): the
          // documented multi-line `node -e "import …"` assembly relies on the
          // repo cwd's `type: module`; from any other cwd eval falls back to
          // CJS and the import statement is a SyntaxError. Pin the ESM
          // semantics ONLY for import-style stanzas — CJS-style `node -e
          // "const fs = require(…)"` lines (REVIEW-GUIDE step 4) must keep
          // their documented commonjs eval.
          cmd = cmd.replace(/^node -e "(?=\(|import\s)/, "node --input-type=module -e \"");

          const expect = expectFor(cmd);
          // CLI invocations (`node packages/cli/src/index.js …`) run from the
          // REAL repo root: their main-module guard compares argv[1] against
          // fileURLToPath(import.meta.url), and a junction path breaks that
          // equality — the CLI then exits 0 SILENTLY (proven failure mode).
          // Their file arguments still point at the staged sandbox copies, so
          // the write-isolation contract holds.
          const runCwd = /node packages\/cli\/src\/index\.js/.test(cmd) ? REPO : cwd;
          const r = spawnSync(BASH, ["-c", cmd], { cwd: runCwd, ...SPAWN_OPTS, timeout: 120_000 });
          const okExit = expect.exit.includes(r.status);
          if (!okExit || (expect.match && !expect.match.test(r.stdout)) || (expect.json && !isJson(r.stdout))) {
            assert.fail(
              `${rel}: documented command must honor its contract\n` +
              `  doc line : ${t}\n` +
              `  ran      : ${cmd}\n` +
              `  cwd      : ${cwd}\n` +
              `  exit     : ${r.status} (expected ${JSON.stringify(expect)})\n` +
              `  stdout   : ${r.stdout.slice(0, 300)}\n` +
              `  stderr   : ${r.stderr.slice(0, 300)}`
            );
          }
          executed.push({ doc: rel, line: t.slice(0, 90) });
          perDoc[rel] = (perDoc[rel] || 0) + 1;
        }

      }

      // The world resets between DOCS (a reader opens each page at the repo
      // root): remove scaffold dirs only after the whole page ran, so the
      // README's generate-fence → cd-fence sequence works exactly as written
      // while the NEXT doc's identical documented command still meets a fresh
      // root (the generator's refuse-to-overwrite contract stays real).
      for (const name of ["my-escrow-dapp", "my-dapp"]) {
        rmSync(join(tmp, name), { recursive: true, force: true });
      }
    }

    // Coverage floors: the contract must stay broad enough to bite.
    assert.ok(executed.length >= 30, `expected >=30 executed documented commands, ran ${executed.length}`);
    const mustCover = {
      "README.md": 18,
      "INTEGRATION.md": 3,
      "REVIEW-GUIDE.md": 4,
      "examples/delivery-fixture/README.md": 5,
      "examples/real-fixture-intake/README.md": 4,
      "docs/case-study-agent-evidence-labels-2026-09-23.md": 2,
      "docs/evidence-package-standard.md": 2,
      "docs/dispute-package-standard.md": 2,
      "docs/peoples-court-fixture-submission-2026-09-23.md": 4,
      "docs/VERIFY-RUN.md": 1,
    };
    for (const [d, min] of Object.entries(mustCover)) {
      const n = perDoc[d] || 0;
      assert.ok(n >= min, `${d}: expected >=${min} executed commands, ran ${n}`);
    }

    // Every skip must carry a named reason (fail the table's own decay).
    for (const s of skipped) assert.ok(s.reason && s.reason.length > 10, `skip without a reason: ${s.line}`);

    console.log(`docs-node contract: ${executed.length} executed · ${skipped.length} skip-listed · ${Object.keys(perDoc).length} docs covered`);
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* tmp */ }
  }
});

function isJson(s) {
  try { JSON.parse(s); return true; } catch { return false; }
}
