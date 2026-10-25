import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { audit } from "./badge-audit.mjs";

/**
 * Commit binding — every trend point records the exact git commit whose code
 * was measured, and every badge derived from a point wears that point's sha,
 * so a badge links back to the run that produced it and nowhere else.
 *
 * Rules enforced (each proven by a control that bites by name):
 *   1. a recorded point carries `sha` == git HEAD of the measured checkout;
 *   2. no reachable git ⇒ NO sha recorded and NO data-sha fabricated — a
 *      missing git never invents a binding ([C30]);
 *   3. `--badges` stamps each series badge with its latest point's sha; the
 *      aggregate (derived state, possibly spanning commits) wears none;
 *   4. the shared audit rejects a wrong binding, a missing binding, a
 *      fabricated binding, and a single sha on the aggregate — by file name.
 */

const REPO = join(fileURLToPath(new URL("../..", import.meta.url)));
const SCRIPT = join(REPO, "scripts", "benchmark-trend.mjs");
const SHA40 = /^[0-9a-f]{40}$/;

const PASS_ENTRY = (benchmark, median, extra = {}) =>
  JSON.stringify({ benchmark, utc: "2026-10-24T00:00:00Z", runner: "Linux", stats: { median }, gate: "PASS", ...extra });

const FULL_HISTORY = [
  PASS_ENTRY("dde-http-wire-perf:engine", 0.2),
  PASS_ENTRY("dde-http-wire-perf:wire", 1.2),
  PASS_ENTRY("dde-sdk-verify-perf", 0.3),
];

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "perf-sha-"));
  mkdirSync(join(dir, "benchmarks"), { recursive: true });
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function git(args, dir) {
  return spawnSync("git", args, { cwd: dir, encoding: "utf8" });
}

function gitSandbox() {
  const s = sandbox();
  git(["init"], s.dir);
  git(["config", "user.email", "ci@example.invalid"], s.dir);
  git(["config", "user.name", "ci"], s.dir);
  writeFileSync(join(s.dir, "seed.txt"), "seed\n");
  git(["add", "seed.txt"], s.dir);
  git(["commit", "-m", "seed"], s.dir);
  return s;
}

const run = (script, args, dir, extraEnv = {}) =>
  execFileSync(process.execPath, [script, ...args], {
    cwd: dir,
    env: { ...process.env, PERF_TREND_REPO: dir, ...extraEnv },
    encoding: "utf8",
  });

const seedHistory = (dir, lines) => writeFileSync(join(dir, "benchmarks", "perf-history.jsonl"), lines.join("\n") + "\n");

const appendedRows = (dir) =>
  readFileSync(join(dir, "benchmarks", "perf-history.jsonl"), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

const badge = (dir, file) => readFileSync(join(dir, "docs", "badges", file), "utf8");

function generatedBadges(dir) {
  const map = new Map();
  for (const file of ["perf-engine.svg", "perf-wire.svg", "perf-sdk.svg", "perf-all.svg"]) {
    map.set(file, badge(dir, file));
  }
  map.set("perf-load.svg", null); // nightly: absent until its first point
  return map;
}

test("a recorded point names the exact commit whose code was measured", () => {
  const s = gitSandbox();
  try {
    const expected = git(["rev-parse", "HEAD"], s.dir).stdout.trim();
    assert.match(expected, SHA40, "the sandbox must have a real HEAD to measure against");
    writeFileSync(join(s.dir, "report.json"), JSON.stringify({
      benchmark: "dde-sdk-verify-perf", gate: "PASS", stats: { median: 0.3 },
    }));
    const status = JSON.parse(run(SCRIPT, ["--file", join(s.dir, "report.json")], s.dir));
    assert.equal(status.recorded, 1, "the report must record its own series point");
    const row = appendedRows(s.dir)[0];
    assert.match(row.sha ?? "", SHA40, "the recorded point must carry a 40-hex git sha");
    assert.equal(row.sha, expected, "the sha must be the HEAD of the checkout that ran the measurement");
  } finally {
    s.cleanup();
  }
});

test("no reachable git → no sha recorded and NO binding fabricated anywhere", () => {
  const s = sandbox();
  try {
    // Ceil the upward .git walk at the sandbox so a stray parent repository
    // can never hand this run a sha that is not its own.
    const ceiling = process.platform === "win32" ? ";" : ":";
    const env = { GIT_CEILING_DIRECTORIES: s.dir + ceiling };
    seedHistory(s.dir, FULL_HISTORY);
    writeFileSync(join(s.dir, "report.json"), JSON.stringify({
      benchmark: "dde-sdk-verify-perf", gate: "PASS", stats: { median: 0.31 },
    }));
    run(SCRIPT, ["--file", join(s.dir, "report.json")], s.dir, env);
    const rows = appendedRows(s.dir);
    assert.equal(Object.hasOwn(rows[rows.length - 1], "sha"), false,
      "a point measured without reachable git history must omit sha, never invent one");

    run(SCRIPT, ["--badges"], s.dir, env);
    for (const file of ["perf-engine.svg", "perf-wire.svg", "perf-sdk.svg", "perf-all.svg"]) {
      assert.doesNotMatch(badge(s.dir, file), /data-sha="/,
        `${file} must wear no data-sha while the ledger carries no commit — a fabricated binding is worse than none`);
    }
    const problems = audit(readFileSync(join(s.dir, "benchmarks", "perf-history.jsonl"), "utf8"), generatedBadges(s.dir));
    assert.deepEqual(problems, [], `the sha-less set must audit clean:\n  ${problems.join("\n  ")}`);
  } finally {
    s.cleanup();
  }
});

test("--badges binds each series badge to its point's exact commit; the aggregate wears none", () => {
  const s = sandbox();
  try {
    const SHA_A = "a".repeat(40), SHA_B = "b".repeat(40), SHA_C = "c".repeat(40);
    const seeded = [
      PASS_ENTRY("dde-http-wire-perf:engine", 0.2, { sha: SHA_A }),
      PASS_ENTRY("dde-http-wire-perf:wire", 1.2, { sha: SHA_B }),
      PASS_ENTRY("dde-sdk-verify-perf", 0.3, { sha: SHA_C }),
    ];
    seedHistory(s.dir, seeded);
    run(SCRIPT, ["--badges"], s.dir);
    assert.match(badge(s.dir, "perf-engine.svg"), new RegExp(`data-sha="${SHA_A}"`),
      "the engine badge must wear its latest point's commit");
    assert.match(badge(s.dir, "perf-wire.svg"), new RegExp(`data-sha="${SHA_B}"`));
    assert.match(badge(s.dir, "perf-sdk.svg"), new RegExp(`data-sha="${SHA_C}"`));
    assert.doesNotMatch(badge(s.dir, "perf-all.svg"), /data-sha=/,
      "the aggregate summarizes points that may span commits — it claims no single measured-at commit");

    const problems = audit(seeded.join("\n"), generatedBadges(s.dir));
    assert.deepEqual(problems, [], `a correctly bound set must audit clean:\n  ${problems.join("\n  ")}`);
  } finally {
    s.cleanup();
  }
});

test("the audit bites by name: wrong binding, missing binding, fabricated binding, aggregate sha", () => {
  const s = sandbox();
  try {
    const SHA_A = "a".repeat(40), SHA_D = "d".repeat(40);
    const seeded = [
      PASS_ENTRY("dde-http-wire-perf:engine", 0.2, { sha: SHA_A }),
      PASS_ENTRY("dde-http-wire-perf:wire", 1.2, { sha: SHA_A }),
      PASS_ENTRY("dde-sdk-verify-perf", 0.3, { sha: SHA_A }),
    ];
    seedHistory(s.dir, seeded);
    run(SCRIPT, ["--badges"], s.dir);
    const real = generatedBadges(s.dir);

    // Control 1 — the badge is bound to a DIFFERENT commit than its point.
    const wrong = badge(s.dir, "perf-engine.svg").replace(`data-sha="${SHA_A}"`, `data-sha="${SHA_D}"`);
    const stale = audit(seeded.join("\n"), new Map(real).set("perf-engine.svg", wrong));
    assert.ok(stale.some((p) => p.includes("perf-engine.svg") && p.includes("STALE COMMIT BINDING")),
      `a wrong binding must bite by file name, got: ${stale.join(" | ")}`);

    // Control 2 — the point carries a commit, the badge does not wear it.
    const stripped = badge(s.dir, "perf-wire.svg").replace(` data-sha="${SHA_A}"`, "");
    assert.notEqual(stripped, badge(s.dir, "perf-wire.svg"), "the mutation must actually apply");
    const missing = audit(seeded.join("\n"), new Map(real).set("perf-wire.svg", stripped));
    assert.ok(missing.some((p) => p.includes("perf-wire.svg") && p.includes("STALE COMMIT BINDING")),
      `a missing binding must bite by file name, got: ${missing.join(" | ")}`);

    // Control 3 — a sha the ledger never recorded: fabricated, refused.
    // The same badges (bound to SHA_A) audited against a sha-less ledger of
    // identical values: the only problem may be the fabricated binding.
    const fabricated = audit(FULL_HISTORY.join("\n"), real);
    assert.ok(fabricated.some((p) => p.includes("perf-engine.svg") && p.includes("fabricated binding")),
      `a fabricated binding must bite by file name, got: ${fabricated.join(" | ")}`);

    // Control 4 — a single measured-at commit on the aggregate: refused.
    const aggSha = audit(seeded.join("\n"),
      new Map(real).set("perf-all.svg", badge(s.dir, "perf-all.svg").replace("role=\"img\"", `role="img" data-sha="${SHA_D}"`)));
    assert.ok(aggSha.some((p) => p.includes("perf-all.svg") && p.includes("must not claim one")),
      `the aggregate must refuse a single-commit claim, got: ${aggSha.join(" | ")}`);
  } finally {
    s.cleanup();
  }
});