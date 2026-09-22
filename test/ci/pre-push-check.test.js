import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Pre-push checklist — the AGENTS.md YAML/workflow lessons, executed
 * mechanically before every push instead of remembered after a red run.
 *
 * Checks, each naming the lesson tag it enforces:
 *   workflows-parse   [C1] real-YAML parse of workflows + composite action
 *   freeze-integrity  [C2] commit-anchored freeze verification
 *   pin-eol-cover     [C3] every repo-root pin covered by a -text rule
 *   no-skip-ci        [C*] skip tokens honored from ANY message position
 *   repin-reachable   [C*] re-pin commits must be ancestors of HEAD
 *   remote-fresh      [C*] origin/main not ahead (bot-race remedy named)
 *
 * Proven by a happy path on the real repo, sandboxed fail-closed proofs
 * for the named checks (unparseable YAML, mid-message skip token, a re-pin
 * ref rewritten by a rebase, a remote that raced the push), and JSON shape.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(REPO, "scripts", "pre-push-check.mjs");
const NODE = process.execPath;

function runPrePush(cwd, extraArgs = []) {
  const r = spawnSync(NODE, [SCRIPT, "--json", ...extraArgs], {
    encoding: "utf8",
    cwd,
    maxBuffer: 8 * 1024 * 1024,
    timeout: 120_000,
  });
  let parsed = null;
  try { parsed = JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))); } catch { /* surfaced below */ }
  return { code: r.status, parsed, raw: r.stdout + (r.stderr || "") };
}

function named(parsed, name) { return parsed?.checks?.find((c) => c.name === name); }

// ---------- happy path on the real repo ----------
test("happy path: the real repo passes every check it can run offline", () => {
  const { code, parsed, raw } = runPrePush(REPO, ["--offline"]);
  assert.equal(code, 0, `expected exit 0\n${raw}`);
  const names = parsed.checks.map((c) => c.name);
  for (const n of ["workflows-parse", "freeze-integrity", "pin-eol-cover", "no-skip-ci", "repin-reachable", "remote-fresh"]) {
    assert.ok(names.includes(n), `missing check: ${n}`);
  }
  for (const n of ["workflows-parse", "freeze-integrity", "pin-eol-cover", "no-skip-ci", "repin-reachable"]) {
    assert.equal(named(parsed, n).status, "PASS", `${n}: ${named(parsed, n).detail}`);
  }
  assert.equal(named(parsed, "remote-fresh").status, "SKIP", "--offline must skip the fetch advisory");
});

// ---------- sandbox harness ----------
function makeSandbox({ broken = false, skipToken = false } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), "pre-push-sandbox-"));
  const gitDir = join(tmp, "repo");
  const originDir = join(tmp, "origin.git");
  mkdirSync(join(gitDir, ".github", "workflows"), { recursive: true });
  mkdirSync(join(gitDir, "scripts"), { recursive: true });

  const run = (args, opts = {}) => {
    const r = spawnSync("git", [...args], { encoding: "utf8", cwd: gitDir });
    if (r.status !== 0 && !opts.ok) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
    return r;
  };
  const runIn = (cwd, args, opts = {}) => {
    const r = spawnSync("git", [...args], { encoding: "utf8", cwd });
    if (r.status !== 0 && !opts.ok) throw new Error(`git ${args.join(" ")} in ${cwd} failed: ${r.stderr}`);
    return r;
  };

  run(["init", "-q", "-b", "main"]);
  run(["config", "user.email", "t@t"]);
  run(["config", "user.name", "t"]);

  // Slim, dependency-light sandbox: real script + real yaml copied from the
  // repo's node_modules (yaml has zero deps, so a plain copy resolves).
  cpSync(SCRIPT, join(gitDir, "scripts", "pre-push-check.mjs"));
  const repoYaml = join(REPO, "node_modules", "yaml");
  mkdirSync(join(gitDir, "node_modules"), { recursive: true });
  cpSync(repoYaml, join(gitDir, "node_modules", "yaml"), { recursive: true });

  writeFileSync(
    join(gitDir, ".github", "workflows", "ci.yml"),
    broken
      ? "name: x\non: push\njobs:\n  a:\n    runs-on: u\n    steps:\n      - run: echo\n          ...: two points\n"
      : "name: CI\non: push\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo\n"
  );
  writeFileSync(join(gitDir, "README.md"), "sandbox\n");
  run(["add", "-A"]);
  run(["commit", "-qm", skipToken ? "init [skip ci]" : "init"]);

  // A real bare origin so remote-fresh/no-skip-ci ranges are well-defined.
  run(["clone", "-q", "--bare", gitDir.replace(/\\/g, "/"), originDir.replace(/\\/g, "/")]);
  run(["remote", "add", "origin", originDir]);
  run(["fetch", "-q", "origin"]);
  run(["branch", "--set-upstream-to=origin/main", "main"]);
  return { tmp, gitDir, originDir, run, runIn };
}

// ---------- fail-closed proofs ----------
test("fail-closed: an unparseable workflow fails workflows-parse, file named [C1]", () => {
  const { gitDir, tmp } = makeSandbox({ broken: true });
  const { code, parsed } = runPrePush(gitDir, ["--offline"]);
  assert.equal(code, 1);
  assert.equal(named(parsed, "workflows-parse").status, "FAIL");
  assert.match(named(parsed, "workflows-parse").detail, /workflows.*ci\.yml/);
  rmSync(tmp, { recursive: true, force: true });
});

test("fail-closed: a skip token mid-message fails no-skip-ci, honored from ANY position", () => {
  const { gitDir, run, tmp } = makeSandbox();
  writeFileSync(join(gitDir, "fix.txt"), "x");
  run(["add", "-A"]);
  run(["commit", "-qm", "documented fix [skip ci] for the bot loop"]);
  const { code, parsed } = runPrePush(gitDir, ["--offline"]);
  assert.equal(code, 1);
  const c = named(parsed, "no-skip-ci");
  assert.equal(c.status, "FAIL");
  assert.match(c.detail, /\[skip ci\]/);
  rmSync(tmp, { recursive: true, force: true });
});

test("fail-closed: a re-pin ref rewritten off main fails repin-reachable", () => {
  const { gitDir, originDir, run, tmp } = makeSandbox();
  // Build a record whose re-pin commit is NOT an ancestor of HEAD.
  const root = run(["rev-parse", "HEAD"]).stdout.trim();
  // orphan commit: its tree never merges back
  run(["checkout", "-q", "--orphan", "side"]);
  run(["commit", "--allow-empty", "-qm", "orphan"]);
  const orphan = run(["rev-parse", "HEAD"]).stdout.trim();
  run(["checkout", "-q", "main"]);
  mkdirSync(join(gitDir, "coreguard-assurance-v4.2.2-remediation", "release", "freeze"), { recursive: true });
  const record = {
    recordId: "sb",
    postCommitRePins: [
      { file: "../docs/GOOD.html", commit: root, reason: "reachable" },
      { file: "../docs/BAD.html", commit: orphan, reason: "rewritten off main" },
    ],
  };
  writeFileSync(join(gitDir, "coreguard-assurance-v4.2.2-remediation", "release", "freeze", "freeze-record-4.2.6.json"), JSON.stringify(record));
  run(["add", "-A"]);
  run(["commit", "-qm", "record with orphan re-pin"]);
  const { code, parsed } = runPrePush(gitDir, ["--offline"]);
  assert.equal(code, 1);
  const c = named(parsed, "repin-reachable");
  assert.equal(c.status, "FAIL");
  assert.match(c.detail, /BAD\.html/);
  assert.doesNotMatch(c.detail, /GOOD\.html/);
  rmSync(tmp, { recursive: true, force: true });
});

test("fail-closed: a raced remote fails remote-fresh with the autostash remedy", () => {
  const { gitDir, originDir, run, runIn, tmp } = makeSandbox();
  // Push local main, then advance the bare origin by an external commit.
  run(["push", "-q", "origin", "main"]);
  runIn(originDir, ["config", "user.email", "o@o"]);
  runIn(originDir, ["config", "user.name", "o"]);
  const bare = spawnSync("git", ["commit", "--allow-empty", "-qm", "bot raced"], { encoding: "utf8", cwd: originDir });
  // bare repos refuse `git commit` — emulate the bot by cloning and pushing.
  if (bare.status !== 0) {
    const bot = join(tmp, "bot");
    run(["clone", "-q", originDir, bot]);
    spawnSync("git", ["config", "user.email", "o@o"], { encoding: "utf8", cwd: bot });
    spawnSync("git", ["config", "user.name", "o"], { encoding: "utf8", cwd: bot });
    spawnSync("git", ["commit", "--allow-empty", "-qm", "bot raced"], { encoding: "utf8", cwd: bot });
    spawnSync("git", ["push", "-q", "origin", "main"], { encoding: "utf8", cwd: bot });
  }
  // No --offline here: the advisory fetch must run (it is a local-path
  // fetch against the bare origin — no network needed).
  const { code, parsed } = runPrePush(gitDir);
  assert.equal(code, 1);
  const c = named(parsed, "remote-fresh");
  assert.equal(c.status, "FAIL");
  assert.match(c.detail, /autostash/);
  rmSync(tmp, { recursive: true, force: true });
});
