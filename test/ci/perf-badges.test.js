import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

/**
 * Live perf badges — the repo page's median numbers are a contract, not
 * decoration. The generator (benchmark-trend.mjs --badges) must be:
 *   deterministic  — the same history yields byte-identical SVGs
 *   truthful       — the value shown is the LATEST recorded median
 *   fail-closed    — no history / a FAIL latest entry aborts with no badges
 *   budget-colored — green within the series budget, yellow inside the 2x
 *                    regression bar, red beyond it
 * and the README must embed exactly the badge files the generator writes,
 * so the page can never show a badge that is not being regenerated.
 */

const REPO = join(fileURLToPath(new URL("../..", import.meta.url)));
const SCRIPT = join(REPO, "scripts", "benchmark-trend.mjs");
const README = readFileSync(join(REPO, "README.md"), "utf8");

const PASS_ENTRY = (benchmark, median, gate = "PASS") =>
  JSON.stringify({ benchmark, utc: "2026-09-21T00:00:00Z", runner: "Linux", stats: { median }, gate });

const FULL_HISTORY = [
  PASS_ENTRY("dde-http-wire-perf:engine", 0.226),
  PASS_ENTRY("dde-http-wire-perf:wire", 1.597),
  PASS_ENTRY("dde-sdk-verify-perf", 0.298),
];

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "perf-badges-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function runBadges(repo, historyLines) {
  mkdirSync(join(repo, "benchmarks"), { recursive: true });
  writeFileSync(join(repo, "benchmarks", "perf-history.jsonl"), historyLines.join("\n") + "\n");
  return execFileSync(process.execPath, [SCRIPT, "--badges"], {
    cwd: repo,
    env: { ...process.env, PERF_TREND_REPO: repo },
    encoding: "utf8",
  });
}

const badge = (repo, file) => readFileSync(join(repo, "docs", "badges", file), "utf8");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

test("badge generation is deterministic: same history → byte-identical SVGs", () => {
  const a = sandbox();
  try {
    runBadges(a.dir, FULL_HISTORY);
    const first = ["perf-engine.svg", "perf-wire.svg", "perf-sdk.svg"].map((f) => sha256(badge(a.dir, f)));
    runBadges(a.dir, FULL_HISTORY);
    const second = ["perf-engine.svg", "perf-wire.svg", "perf-sdk.svg"].map((f) => sha256(badge(a.dir, f)));
    assert.deepEqual(first, second);
  } finally {
    a.cleanup();
  }
});

test("each badge shows the LATEST recorded median of its series, labeled", () => {
  const s = sandbox();
  try {
    // older point first, newer (0.314) must be the one displayed
    runBadges(s.dir, [
      PASS_ENTRY("dde-http-wire-perf:engine", 0.2),
      PASS_ENTRY("dde-http-wire-perf:wire", 1.0),
      PASS_ENTRY("dde-sdk-verify-perf", 0.298),
      PASS_ENTRY("dde-http-wire-perf:engine", 0.314),
      PASS_ENTRY("dde-http-wire-perf:wire", 1.42),
    ]);
    assert.match(badge(s.dir, "perf-engine.svg"), /perf·engine<\/text><text [^>]*>0\.314ms</);
    assert.match(badge(s.dir, "perf-wire.svg"), /perf·wire<\/text><text [^>]*>1\.42ms</);
    assert.match(badge(s.dir, "perf-sdk.svg"), /perf·sdk<\/text><text [^>]*>0\.298ms</);
  } finally {
    s.cleanup();
  }
});

test("no history → exit 1, error names the series, no badge is written", () => {
  const s = sandbox();
  try {
    assert.throws(
      () => runBadges(s.dir, [PASS_ENTRY("dde-sdk-verify-perf", 0.3)]),
      (err) => err.status === 1 && /no history entries for dde-http-wire-perf:engine/.test(err.stderr)
    );
    assert.equal(existsSync(join(s.dir, "docs", "badges", "perf-sdk.svg")), false);
  } finally {
    s.cleanup();
  }
});

test("a FAIL latest entry never becomes a badge (exit 1, nothing written)", () => {
  const s = sandbox();
  try {
    assert.throws(
      () =>
        runBadges(s.dir, [
          PASS_ENTRY("dde-http-wire-perf:engine", 0.2),
          PASS_ENTRY("dde-http-wire-perf:wire", 1.0),
          PASS_ENTRY("dde-sdk-verify-perf", 0.3, "FAIL"),
        ]),
      (err) => err.status === 1 && /latest dde-sdk-verify-perf entry has gate FAIL/.test(err.stderr)
    );
    assert.equal(existsSync(join(s.dir, "docs", "badges")), false);
  } finally {
    s.cleanup();
  }
});

test("badge color encodes the budget state: green ≤1x, yellow ≤2x, red beyond", () => {
  const s = sandbox();
  try {
    // engine budget = 50ms (mirrors the runner's enforced budget)
    const history = (engineMedian) => [
      PASS_ENTRY("dde-http-wire-perf:engine", engineMedian),
      PASS_ENTRY("dde-http-wire-perf:wire", 1.0),
      PASS_ENTRY("dde-sdk-verify-perf", 0.3),
    ];
    runBadges(s.dir, history(50));
    assert.match(badge(s.dir, "perf-engine.svg"), /fill="#4c1"/, "at budget → green");
    runBadges(s.dir, history(75));
    assert.match(badge(s.dir, "perf-engine.svg"), /fill="#dfb317"/, "between 1x and 2x → yellow");
    runBadges(s.dir, history(120));
    assert.match(badge(s.dir, "perf-engine.svg"), /fill="#e05d44"/, "beyond 2x → red");
  } finally {
    s.cleanup();
  }
});

test("the README embeds exactly the three badge files the generator writes", () => {
  for (const [file, label] of [
    ["perf-engine.svg", "DDE perf · engine"],
    ["perf-wire.svg", "DDE perf · wire"],
    ["perf-sdk.svg", "DDE perf · sdk"],
  ]) {
    assert.match(README, new RegExp(`\\[${label}\\]\\(docs/badges/${file}\\)`));
  }
  // and no live badge is referenced that the generator does not produce
  const generated = new Set(["perf-engine.svg", "perf-wire.svg", "perf-sdk.svg"]);
  for (const m of README.matchAll(/docs\/badges\/([a-z0-9.-]+\.svg)/g)) {
    assert.ok(generated.has(m[1]), `README references docs/badges/${m[1]} which --badges never generates`);
  }
});
