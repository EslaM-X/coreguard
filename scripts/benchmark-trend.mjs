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
 *   node scripts/benchmark-trend.mjs --badges               # regenerate docs/badges/*.svg
 *
 * Badge mode (used by the trend-recording CI step): reads the LATEST entry
 * of each tracked series and writes deterministic flat-style SVG badges to
 * docs/badges/ so the repo page always shows the last CI-measured median.
 * Fail-closed: a series with no history, or whose latest entry is not a
 * PASS record, aborts badge generation entirely — a stale or lying badge
 * is worse than none.
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

// The repo root is normally the script's own checkout; tests point it at a
// sandbox via PERF_TREND_REPO so gate/badge behavior can be exercised
// without touching the live history.
const REPO = process.env.PERF_TREND_REPO ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const HISTORY = join(REPO, "benchmarks", "perf-history.jsonl");
const BADGES_DIR = join(REPO, "docs", "badges");
const BASELINE_WINDOW = 5;
const DRIFT_FACTOR = 2;

// The README badge set: file → series → display label → the same median
// budget the runner enforces (engine 50ms, wire 150ms, SDK 50ms).
const BADGE_SERIES = [
  { file: "perf-engine.svg", series: "dde-http-wire-perf:engine", label: "perf·engine", budget: 50 },
  { file: "perf-wire.svg", series: "dde-http-wire-perf:wire", label: "perf·wire", budget: 150 },
  { file: "perf-sdk.svg", series: "dde-sdk-verify-perf", label: "perf·sdk", budget: 50 },
];

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

function badgeColor(median, budget) {
  if (median <= budget) return "#4c1"; // within budget
  if (median <= budget * DRIFT_FACTOR) return "#dfb317"; // noisy, inside the 2x regression bar
  return "#e05d44"; // beyond the regression bar
}

function badgeSvg(label, value, color) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const left = esc(label);
  const right = esc(value);
  const lw = 6.5 * label.length + 12;
  const vw = 6.5 * value.length + 12;
  const w = lw + vw;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${left}: ${right}">` +
    `<linearGradient id="g" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>` +
    `<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>` +
    `<g clip-path="url(#r)"><rect width="${w}" height="20" fill="#555"/>` +
    `<rect x="${lw}" width="${vw}" height="20" fill="${color}"/>` +
    `<rect width="${w}" height="20" fill="url(#g)"/></g>` +
    `<g text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11" fill="#fff">` +
    `<text x="${lw / 2}" y="14">${left}</text><text x="${lw + vw / 2}" y="14">${right}</text></g></svg>\n`
  );
}

// Regenerate all badges from the latest recorded medians — atomically:
// every configured series must resolve to a PASS entry or NOTHING is
// written (a half-updated badge row would contradict itself).
function writePerfBadges() {
  const { entries } = parseHistory();
  const svgs = [];
  const errors = [];
  for (const b of BADGE_SERIES) {
    const series = entries.filter((e) => e.benchmark === b.series);
    const latest = series[series.length - 1];
    if (!latest) {
      errors.push(`no history entries for ${b.series} — refusing to emit a stale badge`);
      continue;
    }
    if (latest.gate !== "PASS") {
      errors.push(`latest ${b.series} entry has gate ${latest.gate} — a failing run never becomes a badge`);
      continue;
    }
    const median = latest.stats.median;
    const value = `${Number(median.toFixed(3))}ms`;
    svgs.push({ file: b.file, svg: badgeSvg(b.label, value, badgeColor(median, b.budget)) });
  }
  if (errors.length > 0) {
    for (const e of errors) console.error(`benchmark-trend: ${e}`);
    process.exit(1);
  }
  mkdirSync(BADGES_DIR, { recursive: true });
  for (const s of svgs) writeFileSync(join(BADGES_DIR, s.file), s.svg);
  console.log(JSON.stringify({ badges: svgs.map((s) => `docs/badges/${s.file}`), source: "benchmarks/perf-history.jsonl" }, null, 2));
}

const fileArg = process.argv.indexOf("--file");
const statusOnly = process.argv.includes("--status");
const dryRun = process.argv.includes("--dry-run"); // gate, report, write nothing (PR runs)
const badgesOnly = process.argv.includes("--badges");
if (badgesOnly) {
  if (fileArg > -1 || statusOnly || dryRun) {
    console.error("benchmark-trend: --badges takes no other flags");
    process.exit(2);
  }
  writePerfBadges();
  process.exit(0);
}
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
