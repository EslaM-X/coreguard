import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * First-drift alert — the perf trend gate's harsh answer needs a face.
 * When a series drifts beyond the 2x regression bar, the run must NAME the
 * breach: a structured `alert` (series, metric, current, baseline, ratio)
 * in the --json status, a stderr block, and — when GITHUB_STEP_SUMMARY is
 * set, which CI always provides — a breach row appended to the GitHub run
 * summary, so the failing page shows series | metric | current | baseline |
 * ratio beside the red gate without a log scroll.
 *
 * Fail-closed invariants held: a breached run records NOTHING (history is
 * untouched), a report whose own gate is FAIL is a recording error and never
 * produces the drift alert, a green run emits no alert and no summary, and
 * the summary channel is append-only (pre-existing content survives).
 */

const REPO = join(fileURLToPath(new URL("../..", import.meta.url)));
const SCRIPT = join(REPO, "scripts", "benchmark-trend.mjs");
const SDK = "dde-sdk-verify-perf";

const PASS_ENTRY = (benchmark, median) =>
  JSON.stringify({ benchmark, utc: "2026-10-01T00:00:00Z", runner: "Linux", stats: { median }, gate: "PASS" });

// Baseline ledgers: trailing-window median 0.6 (drift case) / 0.4 (green case).
const DRIFT_LEDGER = () => [0.2, 0.4, 0.6, 0.8, 1.0].map((median) => PASS_ENTRY(SDK, median));
const GREEN_LEDGER = () => [0.2, 0.3, 0.4, 0.5, 0.6].map((median) => PASS_ENTRY(SDK, median));

// Sandbox: PERF_TREND_REPO points the tool at a private ledger, the report
// file carries the run being gated, and GITHUB_STEP_SUMMARY points at a
// local file standing in for the CI run summary.
function sandbox(ledger, reportMedian, reportGate = "PASS") {
  const dir = mkdtempSync(join(tmpdir(), "trend-drift-"));
  const history = join(dir, "benchmarks", "perf-history.jsonl");
  mkdirSync(dirname(history), { recursive: true });
  writeFileSync(history, ledger.join("\n") + "\n");
  const report = join(dir, "report.json");
  writeFileSync(report, JSON.stringify({ benchmark: SDK, gate: reportGate, stats: { median: reportMedian } }));
  return { dir, history, report, summary: join(dir, "run-summary.md") };
}

// benchmark-trend exits 1 on a breached gate — buffer the throw so the
// caller gets { code, stdout, stderr } and the parsed --json status.
function runTrend(g) {
  let run;
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, "--file", g.report], {
      env: { ...process.env, PERF_TREND_REPO: g.dir, GITHUB_STEP_SUMMARY: g.summary },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    run = { code: 0, stdout, stderr: "" };
  } catch (e) {
    run = { code: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
  run.status = run.stdout ? JSON.parse(run.stdout) : null;
  return run;
}

test("first drift breach: the status names series, metric, current, baseline, ratio — and records nothing", () => {
  const g = sandbox(DRIFT_LEDGER(), 2.5); // 2.5 / 0.6 = 4.17x — past the 2x bar
  const run = runTrend(g);
  assert.equal(run.code, 1);
  assert.equal(run.status.gate, "FAIL");
  const alert = run.status.alert;
  assert.ok(alert, "a breached run must expose a structured alert");
  assert.equal(alert.series, SDK);
  assert.equal(alert.metric, "median");
  assert.equal(alert.current, 2.5);
  assert.equal(alert.baseline, 0.6);
  assert.equal(alert.ratio, 4.17);
  assert.ok(run.stderr.includes("🚨 Perf trend gate breached"), "the breach must also reach stderr");
  // fail-closed: the breached run's medians never enter the ledger
  assert.equal(run.status.recorded, 0);
  assert.equal(readFileSync(g.history, "utf8").trim().split("\n").length, 5);
});

test("first drift breach: the GitHub run summary renders the breach row (series | metric | current | baseline | ratio)", () => {
  const g = sandbox(DRIFT_LEDGER(), 2.5);
  const run = runTrend(g);
  assert.equal(run.code, 1);
  const summary = readFileSync(g.summary, "utf8");
  assert.ok(
    summary.includes("## 🚨 Perf trend gate breached — first drift beyond the regression bar"),
    "the summary must carry the alert heading"
  );
  assert.ok(
    summary.includes(`| ${SDK} | median | 2.5ms | 0.6ms | 4.17x |`),
    `the summary must carry the full breach row, got:\n${summary}`
  );
  assert.ok(summary.includes("nothing was recorded"), "the summary must say the run failed closed");
});

test("green run: no alert, no summary file, medians still recorded", () => {
  const g = sandbox(GREEN_LEDGER(), 0.5); // 0.5 / 0.4 = 1.25x — inside the bar
  const run = runTrend(g);
  assert.equal(run.code, 0);
  assert.equal(run.status.gate, "PASS");
  assert.equal("alert" in run.status, false, "a green run must not carry an alert");
  assert.equal(existsSync(g.summary), false, "a green run must not touch the run summary");
  assert.equal(run.status.recorded, 1);
});

test("a report whose own gate is FAIL is a recording error, never a drift alert", () => {
  const g = sandbox(GREEN_LEDGER(), 0.5, "FAIL");
  const run = runTrend(g);
  assert.equal(run.code, 1);
  assert.equal(run.status.gate, "FAIL");
  assert.equal("alert" in run.status, false, "FAIL-gate reports must not wear the drift alert");
  assert.ok(run.status.failures.some((f) => f.includes("report gate is FAIL")));
  assert.equal(existsSync(g.summary), false);
});

test("the run-summary channel is append-only: pre-existing content survives", () => {
  const g = sandbox(DRIFT_LEDGER(), 2.5);
  writeFileSync(g.summary, "preflight note\n");
  const run = runTrend(g);
  assert.equal(run.code, 1);
  const summary = readFileSync(g.summary, "utf8");
  assert.ok(summary.startsWith("preflight note\n"), "existing summary content must survive the append");
  assert.ok(summary.includes(`| ${SDK} | median | 2.5ms | 0.6ms | 4.17x |`), "the breach row must follow it");
});
