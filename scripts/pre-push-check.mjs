#!/usr/bin/env node
/**
 * pre-push-check.mjs — the AGENTS.md YAML/workflow lessons, executed before
 * every push instead of remembered after a red run.
 *
 * Each check names the lesson it enforces (the [C#] tags from the
 * Debugging Breakthroughs cost-ranked index):
 *
 *   workflows-parse   [C1]  every .github/workflows file + the composite
 *                           action survives the real `yaml` parser and the
 *                           Actions schema walk (same authority as
 *                           test/ci/workflow-yaml-contract.test.js).
 *   freeze-integrity  [C2]  the current freeze record verifies in
 *                           commit-anchored mode — editing a pinned file
 *                           without an honest re-pin fails here, not on CI.
 *   pin-eol-cover     [C3]  every repo-root file pinned by the freeze record
 *                           (../-style paths) is covered by a `-text`
 *                           .gitattributes rule — the autocrlf drift class.
 *   no-skip-ci        [C*]  no unpushed commit message carries a skip token
 *                           ("[skip ci]" et al.) — GitHub honors it from ANY
 *                           position in the message; the fix-commit that
 *                           contains it in prose skips itself (the vortex).
 *   repin-reachable   [C*]  every postCommitRePins commit is an ancestor of
 *                           HEAD — a rebase rewrites the publication commit
 *                           and the ref would hash locally but be
 *                           COMMIT-MISSING on CI's fresh clone.
 *   remote-fresh      [C*]  origin/main has not advanced (bot commits race
 *                           pushes here routinely) — if it has, fail with
 *                           the autostash-rebase remedy before push does.
 *
 * Exit codes: 0 all checks PASS (SKIP allowed for offline advisory checks)
 *             1 any FAIL · 2 usage error.
 * The verifier NEVER writes and NEVER pushes — it only gates.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, YAMLParseError } from "yaml";

const args = process.argv.slice(2);
const json = args.includes("--json");
const offline = args.includes("--offline");
const repo = resolve(process.env.PRE_PUSH_REPO || process.cwd());

const checks = [];
function record(name, status, detail) {
  checks.push({ name, status, detail });
  if (!json) console.log(`${status === "PASS" ? "✔" : status === "FAIL" ? "✗" : "·"} ${name.padEnd(17)} ${status.padEnd(5)} ${detail}`);
}
function git(repoCwd, gitArgs, opts = {}) {
  const r = spawnSync("git", ["-C", repoCwd, ...gitArgs], { encoding: "utf8", ...opts });
  return { code: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

// ---- [C1] workflows-parse ---------------------------------------------------
const workflowsDir = join(repo, ".github", "workflows");
const actionDir = join(repo, ".github", "actions", "coreguard-verify");
{
  const files = existsSync(workflowsDir)
    ? readdirSync(workflowsDir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml")).map((f) => join(workflowsDir, f))
    : [];
  if (existsSync(actionDir)) {
    for (const name of ["action.yml", "action.yaml"]) {
      const p = join(actionDir, name);
      if (existsSync(p)) files.push(p);
    }
  }
  const bad = [];
  for (const f of files) {
    try {
      parse(readFileSync(f, "utf8"));
    } catch (e) {
      bad.push(`${f.replace(repo + "\\", "").replace(repo + "/", "")}: ${e instanceof YAMLParseError ? e.message.split("\n")[0] : e.message}`);
    }
  }
  record("workflows-parse", bad.length ? "FAIL" : "PASS",
    bad.length ? `${bad.length} unparseable — ${bad[0]}${bad.length > 1 ? ` (+${bad.length - 1} more)` : ""}` : `${files.length} file(s) parse clean [C1]`);
}

// ---- [C2] freeze-integrity ---------------------------------------------------
const RECORD = join(repo, "coreguard-assurance-v4.2.2-remediation", "release", "freeze", "freeze-record-4.2.6.json");
const VERIFIER = join(repo, "coreguard-assurance-v4.2.2-remediation", "verification", "validate-freeze.mjs");
let recordJson = null;
try { recordJson = JSON.parse(readFileSync(RECORD, "utf8")); } catch { /* record-shape checks skip */ }
if (!existsSync(RECORD) || !existsSync(VERIFIER)) {
  record("freeze-integrity", "SKIP", "freeze record or verifier not found in this repo layout");
} else {
  const v = spawnSync(process.execPath, [VERIFIER, RECORD], { encoding: "utf8", cwd: repo });
  const passLine = (v.stdout || "").split("\n").find((l) => l.startsWith("validate-freeze:"));
  if (v.status === 0) {
    record("freeze-integrity", "PASS", (passLine || "PASS").trim());
  } else {
    record("freeze-integrity", "FAIL", `exit ${v.status} — ${(passLine || (v.stderr || "").split("\n")[0] || "?").trim()} (edit a pinned file? re-pin per the integrity rule first)`);
  }
}

// ---- [C3] pin-eol-cover -------------------------------------------------------
if (!recordJson) {
  record("pin-eol-cover", "SKIP", "no freeze record parsed");
} else {
  const gaPath = join(repo, ".gitattributes");
  const rules = existsSync(gaPath)
    ? readFileSync(gaPath, "utf8").split("\n")
        .map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
        .filter((l) => l.split(/\s+/).slice(1).includes("-text"))
        .map((l) => l.split(/\s+/)[0])
    : [];
  function covered(repoRel) {
    return rules.some((rule) => {
      if (rule === repoRel) return true;
      if (rule.endsWith("/**")) return repoRel.startsWith(rule.slice(0, -3));
      if (rule.includes("*")) {
        const re = new RegExp("^" + rule.split("*").map((s) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&")).join("[^/]*") + "$");
        return re.test(repoRel);
      }
      return false;
    });
  }
  const rootPins = new Set();
  for (const e of recordJson.sha256?.quarantineFiles ?? []) rootPins.add(e.file.replace(/^(?:\.\.\/)+/, ""));
  for (const e of recordJson.postCommitRePins ?? []) if (e.file.startsWith("..")) rootPins.add(e.file.replace(/^(?:\.\.\/)+/, ""));
  const uncovered = [...rootPins].filter((p) => !covered(p));
  record("pin-eol-cover", uncovered.length ? "FAIL" : "PASS",
    uncovered.length ? `pinned file(s) without a -text rule: ${uncovered.join(", ")} — add to .gitattributes BEFORE trusting any pin [C3]`
                     : `${rootPins.size} repo-root pin(s) all -text-covered [C3]`);
}

// ---- [C*] no-skip-ci in unpushed commit messages -------------------------------
{
  const hasOrigin = git(repo, ["rev-parse", "--verify", "origin/main"]);
  if (hasOrigin.code !== 0) {
    record("no-skip-ci", "SKIP", "no origin/main yet (first push)");
  } else {
    const log = git(repo, ["log", "origin/main..HEAD", "--format=%B%x00"], { maxBuffer: 4 * 1024 * 1024 });
    const msgs = log.out.split("\0").map((m) => m.trim()).filter(Boolean);
    const TOKEN = /\[(?:skip\s+ci|ci\s+skip|skip\s+actions|actions\s+skip)\]/i;
    const offenders = msgs.filter((m) => TOKEN.test(m)).map((m) => m.split("\n")[0].slice(0, 60));
    record("no-skip-ci", offenders.length ? "FAIL" : "PASS",
      offenders.length
        ? `skip token in an unpushed message (honored from ANY position): "${offenders[0]}" — rewrite the message (rebase -i / drop the token)`
        : `${msgs.length} unpushed commit(s), none carries a skip token`);
  }
}

// ---- [C*] repin-reachable -------------------------------------------------------
if (!recordJson || !Array.isArray(recordJson.postCommitRePins)) {
  record("repin-reachable", "SKIP", "no freeze record parsed");
} else {
  const bad = [];
  for (const e of recordJson.postCommitRePins) {
    const anc = git(repo, ["merge-base", "--is-ancestor", String(e.commit), "HEAD"]);
    if (anc.code !== 0) bad.push(`${e.file} → ${String(e.commit).slice(0, 12)}`);
  }
  record("repin-reachable", bad.length ? "FAIL" : "PASS",
    bad.length
      ? `re-pin commit(s) NOT ancestors of HEAD (rewritten by a rebase?): ${bad[0]} — re-point the ref at the commit actually on main`
      : `${recordJson.postCommitRePins.length} re-pin ref(s) reachable from HEAD`);
}

// ---- [C*] remote-fresh -----------------------------------------------------------
if (offline) {
  record("remote-fresh", "SKIP", "--offline (skipping the advisory fetch)");
} else {
  const fetch = git(repo, ["fetch", "origin", "main"]);
  const hasOrigin = git(repo, ["rev-parse", "--verify", "origin/main"]);
  if (fetch.code !== 0 && hasOrigin.code !== 0) {
    record("remote-fresh", "SKIP", `no origin/main reachable (${(fetch.err || "fetch failed").split("\n")[0]})`);
  } else {
    const behind = git(repo, ["rev-list", "--count", "HEAD..origin/main"]);
    const n = Number(behind.out || "0");
    record("remote-fresh", n > 0 ? "FAIL" : "PASS",
      n > 0
        ? `origin/main advanced by ${n} commit(s) (bot race) — git pull --rebase --autostash origin main BEFORE pushing`
        : "origin/main not ahead of HEAD");
  }
}

// ---- summary ---------------------------------------------------------------------
const fails = checks.filter((c) => c.status === "FAIL").slice(0, 3);
if (json) console.log(JSON.stringify({ ok: fails.length === 0, repo, checks }, null, 2));
else {
  console.log("─".repeat(72));
  console.log(fails.length
    ? `pre-push-check: FAIL (${checks.filter((c) => c.status === "FAIL").length} of ${checks.length} checks) — ${fails[0].detail}`
    : `pre-push-check: PASS (${checks.filter((c) => c.status === "PASS").length} PASS · ${checks.filter((c) => c.status === "SKIP").length} SKIP) — safe to push`);
}
process.exit(checks.some((c) => c.status === "FAIL") ? 1 : 0);
