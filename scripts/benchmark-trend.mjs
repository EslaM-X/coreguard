#!/usr/bin/env node
/**
 * benchmark-trend.mjs — performance trend tracking across pushes.
 *
 * Appends this run's benchmark medians to benchmarks/perf-history.jsonl
 * (one JSON object per line) and fails when a median drifts more than 2x
 * from the trailing five-entry baseline for its series. Cold CI runners
 * are noisy, so 2x is the regression bar — not a tuning target.
 *
 *   node scripts/benchmark-trend.mjs --file <report.json>   # append + gate
 *   node scripts/benchmark-trend.mjs --status               # gate only, no append
 *
 * Report contract (the --json output of both benchmark runners):
 *   { benchmark: string, stats: { median: number, ... }, gate: "PASS"|"FAIL", ... }
 *   benchmark-dde-http.mjs uses per-layer stat blocks instead of a single
 *   `stats` (engine = the shared 50ms-budget series, wire = the wire series);
 *   both are tracked as separate series under the same report file.
 *
 * Gates (fail-closed, exit 1):
 *   - the report's own gate must be PASS (never record a failing run as a
 *     trend point)
 *   - each tracked series (benchmark name) with >= 5 history entries must
 *     have median <= 2x the median-of-medians of its last 5 entries;
 *     the offender names baseline, current, and ratio
 *   - the history file must stay parseable: torn/truncated lines are
 *     reported and skipped, never silently re-written
 *
 * History is one line per push, append-only: perf history is evidence,
 * not state to be rewritten.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const HISTORY = join(REPO, "benchmarks", "perf-history.jsonl");
const BASELINE_WINDOW = 5;
const DRIFT_FACTOR = 2;

function parseHistory() {
  if (!existsSync(HISTORY)) return { entries: [], torn: 0 };
  const lines = readFileSync(HISTORY, "utf8").split("\n").filter((l) => l.trim() !== "");
  const entries = [];
  let torn = 0;
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (e && e.benchmark && e.stats && typeof e.stats.median === "number") entries.push(e);
      else torn += 1;
    } catch {
      torn += 1;
    }
  }
  return { entries, torn };
}

function medianOf(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const fileArg = process.argv.indexOf("--file");
const statusOnly = process.argv.includes("--status");
const dryRun = process.argv.includes("--dry-run"); // gate, report, write nothing (PR runs)
if (fileArg === -1 && !statusOnly) {
  console.error("benchmark-trend: pass --file <benchmark-report.json> (append+gate) or --status (gate only)");
  process.exit(2);
}

let reports = []; // one or two series points extracted from the report file
if (fileArg > -1) {
  const path = process.argv[fileArg + 1];
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (!raw?.benchmark || !raw?.gate) {
    console.error("benchmark-trend: report is missing benchmark/gate — not a benchmark --json output");
    process.exit(2);
  }
  // Single-series shape (benchmark-dde.mjs): { stats: { median } }.
  if (raw.stats && typeof raw.stats.median === "number") {
    reports.push({ benchmark: raw.benchmark, gate: raw.gate, stats: raw.stats });
  }
  // Dual-series shape (benchmark-dde-http.mjs): { engine: {...}, wire: {...} } —
  // each block becomes its own trend series (engine <name>, wire <name>).
  for (const layer of ["engine", "wire"]) {
    const block = raw[layer];
    if (block && typeof block.median === "number") {
      reports.push({
        benchmark: `${raw.benchmark}:${layer}`,
        gate: raw.gate,
        stats: block,
      });
    }
  }
  if (reports.length === 0) {
    console.error("benchmark-trend: no series with a numeric median found in the report");
    process.exit(2);
  }
}

const { entries, torn } = parseHistory();
const failures = [];

// baseline: trailing BASELINE_WINDOW entries of the same series
const seriesEntries = {};
const records = [];
for (const rep of reports) {
  const series = entries.filter((e) => e.benchmark === rep.benchmark);
  seriesEntries[rep.benchmark] = series.length;
  const baseline = series.slice(-BASELINE_WINDOW);
  if (baseline.length >= BASELINE_WINDOW) {
    const baseMedian = medianOf(baseline.map((e) => e.stats.median));
    const ratio = rep.stats.median / baseMedian;
    if (ratio > DRIFT_FACTOR) {
      failures.push(
        `median ${rep.stats.median}ms is ${ratio.toFixed(2)}x the ${BASELINE_WINDOW}-run baseline ` +
        `(${baseMedian}ms) — drift beyond the ${DRIFT_FACTOR}x regression bar for ${rep.benchmark}`
      );
    }
  }
  if (rep.gate !== "PASS") {
    failures.push(`report gate is ${rep.gate} — a failing run is never recorded as a trend point`);
    continue;
  }
  records.push({
    benchmark: rep.benchmark,
    utc: new Date().toISOString(),
    // runner identity: machine noise is real; the 2x bar absorbs it, the
    // field makes it visible when comparing CI vs local entries
    runner: process.env.RUNNER_OS ?? process.platform,
    stats: rep.stats,
    gate: rep.gate,
  });
}

const blocked = failures.length > 0; // any gate failure → record NOTHING
const record = (!statusOnly && !dryRun && !blocked) ? records : [];

if (!statusOnly && !dryRun && record.length) {
  mkdirSync(dirname(HISTORY), { recursive: true });
  writeFileSync(HISTORY, record.map((r) => JSON.stringify(r)).join("\n") + "\n", { flag: "a" });
}

const status = {
  trend: "benchmark-trend",
  file: "benchmarks/perf-history.jsonl",
  totalEntries: entries.length + record.length,
  series: reports.map((r) => ({
    benchmark: r.benchmark,
    historyEntries: seriesEntries[r.benchmark] ?? undefined,
    median: r.stats.median,
  })),
  tornLines: torn,
  recorded: record.length,
  dryRun,
  gate: failures.length === 0 ? "PASS" : "FAIL",
  failures,
};

console.log(JSON.stringify(status, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
