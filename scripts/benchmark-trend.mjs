#!/usr/bin/env node
/**
 * benchmark-trend.mjs — performance trend tracking across pushes.
 *
 * Appends this run's benchmark series points to benchmarks/perf-history.jsonl
 * (one JSON object per line) and fails when a series' tracked metric drifts
 * more than 2x from the trailing five-entry baseline for its series. Cold CI
 * runners are noisy, so 2x is the regression bar — not a tuning target.
 *
 * Every series tracks ONE metric, declared in SERIES_METRIC below: the
 * sequential SDK/one-request-at-a-time series track `median` (the stable
 * per-request number), and the concurrent load series tracks `p95` — the
 * tail you actually feel when 50 requests share one event loop. The two
 * numbers describe the same code path at two different depths; the tail
 * under concurrency is queueing on the shared loop, not engine regression,
 * and their budgets (50ms sequential, 600ms concurrent tail) are enforced
 * separately in each runner.
 *
 *   node scripts/benchmark-trend.mjs --file <report.json>   # append + gate
 *   node scripts/benchmark-trend.mjs --status               # gate only, no append
 *   node scripts/benchmark-trend.mjs --badges               # regenerate docs/badges/*.svg
 *
 * Badge mode (used by the trend-recording CI step): reads the LATEST entry
 * of each tracked series and writes deterministic flat-style SVG badges to
 * docs/badges/ so the repo page always shows the last CI-measured median
 * (or p95 for the concurrency series).
 * Fail-closed: a series with no history, or whose latest entry is not a
 * PASS record, aborts badge generation entirely — a stale or lying badge
 * is worse than none. EXCEPTION — dde-http-load-perf is the REMOVED nightly
 * depth: it waits for its first recorded point (a notice, not an error) so
 * the three always-on badges keep regenerating before any nightly run
 * happens or lands.
 *
 * Report contract (the --json output of the benchmark runners):
 *   { benchmark: string, stats: { median: number, ... }, gate: "PASS"|"FAIL", ... }
 *   benchmark-dde-http.mjs uses per-layer stat blocks instead of a single
 *   `stats` (engine = the shared 50ms-budget series, wire = the wire series);
 *   both are tracked as separate series under the same report file.
 *   benchmark-dde-load.mjs's report is tracked as-is (single stats block,
 *   SERIES_METRIC picks its p95 field for badge + drift; its median is still
 *   recorded — the comparison card needs the sequential sibling).
 *
 * Gates (fail-closed, exit 1):
 *   - the report's own gate must be PASS (never record a failing run as a
 *     trend point)
 *   - each tracked series (benchmark name) with >= 5 history entries must
 *     have its tracked metric <= 2x the median-of-tracked-metric of its
 *     last 5 entries; the offender names baseline, current, and ratio
 *   - the history file must stay parseable: torn/truncated lines are
 *     reported and skipped, never silently re-written
 *
 * First-drift alert: the run's FIRST drift breach is surfaced three ways —
 * a structured `alert` (series, metric, current, baseline, ratio) in the
 * --json status, a stderr block in every mode, and — when GITHUB_STEP_SUMMARY
 * is set (CI runs) — a breach row appended to the GitHub run summary, so the
 * failing run's Summary page names the offending series, its 5-run baseline
 * and its ratio without a log scroll. A report whose OWN gate is FAIL is a
 * recording error, not a regression — it never produces the alert. The
 * summary write is best-effort: a failing append never flips the gate.
 *
 * History is one line per push, append-only: perf history is evidence,
 * not state to be rewritten.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The repo root is normally the script's own checkout; tests point it at a
// sandbox via PERF_TREND_REPO so gate/badge behavior can be exercised
// without touching the live history.
const REPO = process.env.PERF_TREND_REPO ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const HISTORY = join(REPO, "benchmarks", "perf-history.jsonl");
const BADGES_DIR = join(REPO, "docs", "badges");
const BASELINE_WINDOW = 5;

// The exact commit whose code was measured at record time — the binding
// between every trend point and the checkout that produced it. Unreachable
// git (no repo, ceiling cut) means NO sha: a missing binding is safer than a
// fabricated one, and the badge audit refuses a binding the ledger never
// carried. GIT_CEILING_DIRECTORIES flows through the environment, so a
// nested checkout can never be handed a parent repository's sha.
const SHA40 = /^[0-9a-f]{40}$/;
function headSha() {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" });
  const sha = r.status === 0 ? r.stdout.trim() : "";
  return SHA40.test(sha) ? sha : null;
}
const DRIFT_FACTOR = 2;

// The README badge set: file → series → display label → budget → the ONE
// metric that series is tracked and badged on (all but the load series are
// `median`, so only load declares an explicit metric). This shape is
// page-bound: the live perf page parses `series … budget … metric` lines
// from this module as its budget table — the row shape here IS the page's
// source of truth, and a change here must move the page in the same push.
// `nightly: true` marks the depth whose badge generation tolerates absence
// until its first recorded point (a notice, not an error) — the always-on
// three keep regenerating before any nightly run happens or lands.
const BADGE_SERIES = [
  { file: "perf-engine.svg", series: "dde-http-wire-perf:engine", label: "perf·engine", budget: 50 },
  { file: "perf-wire.svg", series: "dde-http-wire-perf:wire", label: "perf·wire", budget: 150 },
  { file: "perf-sdk.svg", series: "dde-sdk-verify-perf", label: "perf·sdk", budget: 50 },
  // The concurrent tail: 50 requests in flight share one event loop —
  // its decision number is the tail, not the median.
  { file: "perf-load.svg", series: "dde-http-load-perf", label: "perf·load", budget: 600, metric: "p95", nightly: true },
];
const METRIC = (series) => BADGE_SERIES.find((b) => b.series === series)?.metric ?? "median";

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

// Severity ladder shared by the per-series badges and the aggregate badge:
// 0 = within budget (green), 1 = above budget but inside the 2x regression
// bar (yellow), 2 = beyond the regression bar (red).
function badgeState(value, budget) {
  if (value <= budget) return { sev: 0, color: "#4c1" }; // within budget
  if (value <= budget * DRIFT_FACTOR) return { sev: 1, color: "#dfb317" }; // inside the 2x regression bar
  return { sev: 2, color: "#e05d44" }; // beyond the regression bar
}

function badgeSvg(label, value, color, sha = null) {
  // The commit binding: a per-series badge wears data-sha naming the exact
  // measured commit of its latest point — stale binding detection bites on
  // it. The aggregate never passes one: it sums points that may span commits.
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const left = esc(label);
  const right = esc(value);
  const lw = 6.5 * label.length + 12;
  const vw = 6.5 * value.length + 12;
  const w = lw + vw;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img"${sha ? ` data-sha="${sha}"` : ""} aria-label="${left}: ${right}">` +
    `<linearGradient id="g" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>` +
    `<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>` +
    `<g clip-path="url(#r)"><rect width="${w}" height="20" fill="#555"/>` +
    `<rect x="${lw}" width="${vw}" height="20" fill="${color}"/>` +
    `<rect width="${w}" height="20" fill="url(#g)"/></g>` +
    `<g text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11" fill="#fff">` +
    `<text x="${lw / 2}" y="14">${left}</text><text x="${lw + vw / 2}" y="14">${right}</text></g></svg>\n`
  );
}

// Regenerate all badges from the latest recorded tracked-metric values —
// atomically: every configured series must resolve to a PASS entry or
// NOTHING is written (a half-updated badge row would contradict itself).
// The aggregate `perf-all.svg` then sums the rendered set by worst case —
// one glance answers "are we inside the budgets?" without reading three rows.
// The load series is the removed nightly depth: an absent history is a
// notice, not a gate failure, so the always-on badges survive until the
// nightly recorder fires for the first time.
function writePerfBadges() {
  const { entries } = parseHistory();
  const svgs = [];
  const errors = [];
  const notes = [];
  for (const b of BADGE_SERIES) {
    const series = entries.filter((e) => e.benchmark === b.series);
    const latest = series[series.length - 1];
    if (!latest) {
      if (b.nightly) {
        notes.push(`${b.series} has no history yet — nightly depth; badge waits for the first recorded point`);
        continue;
      }
      errors.push(`no history entries for ${b.series} — refusing to emit a stale badge`);
      continue;
    }
    if (latest.gate !== "PASS") {
      errors.push(`latest ${b.series} entry has gate ${latest.gate} — a failing run never becomes a badge`);
      continue;
    }
    const metric = METRIC(b.series);
    const value = latest.stats[metric];
    const pointSha = typeof latest.sha === "string" && SHA40.test(latest.sha) ? latest.sha : null;
    const { sev, color } = badgeState(value, b.budget);
    svgs.push({ file: b.file, svg: badgeSvg(b.label, `${Number(value.toFixed(3))}ms`, color, pointSha), sev });
  }
  if (errors.length > 0) {
    for (const e of errors) console.error(`benchmark-trend: ${e}`);
    process.exit(1);
  }
  for (const n of notes) console.error(`benchmark-trend: note — ${n}`);
  // Aggregate badge — perf·all: the set's worst case in one glance.
  // Computed ONLY from the badges this run actually rendered (the always-on
  // three; the nightly load tail joins the moment it records) and named the
  // way the ladder speaks: all green → "all within budget"; any series past
  // its budget but inside the bar → "N above budget" (yellow); any series
  // beyond the regression bar → "regression detected" (red). Written with
  // the same all-or-nothing atomicity: no badges → no aggregate.
  if (svgs.length > 0) {
    const worst = Math.max(...svgs.map((s) => s.sev));
    const message = worst === 0 ? "all within budget" : worst === 1 ? `${svgs.filter((s) => s.sev === 1).length} above budget` : "regression detected";
    const aggColor = worst === 0 ? "#4c1" : worst === 1 ? "#dfb317" : "#e05d44";
    svgs.push({ file: "perf-all.svg", svg: badgeSvg("perf·all", message, aggColor), sev: worst });
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
  // benchmark-dde-load.mjs: same shape, but the drift gate + badge track
  // p95 (SERIES_METRIC) — a concurrent burst's decision number is its tail.
  if (raw.stats && typeof raw.stats.median === "number") {
    reports.push({ benchmark: raw.benchmark, gate: raw.gate, stats: raw.stats, metric: METRIC(raw.benchmark) });
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
        metric: METRIC(`${raw.benchmark}:${layer}`),
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
const drifts = []; // structured drift-breach rows — the first-drift alert's source

// baseline: trailing BASELINE_WINDOW entries of the same series
const seriesEntries = {};
const records = [];
// The measured-at commit: identical rows recorded without reachable git
// simply omit it — a point that cannot name its commit stays nameless.
const measuredSha = statusOnly ? null : headSha();

for (const rep of reports) {
  const series = entries.filter((e) => e.benchmark === rep.benchmark);
  seriesEntries[rep.benchmark] = series.length;
  const baseline = series.slice(-BASELINE_WINDOW);
  if (baseline.length >= BASELINE_WINDOW) {
    const baseMetric = medianOf(baseline.map((e) => e.stats[rep.metric]));
    const ratio = rep.stats[rep.metric] / baseMetric;
    if (ratio > DRIFT_FACTOR) {
      drifts.push({
        series: rep.benchmark,
        metric: rep.metric,
        current: rep.stats[rep.metric],
        baseline: baseMetric,
        ratio: Number(ratio.toFixed(2)),
      });
      failures.push(
        `${rep.metric} ${rep.stats[rep.metric]}ms is ${ratio.toFixed(2)}x the ${BASELINE_WINDOW}-run baseline ` +
        `(${baseMetric}ms) — drift beyond the ${DRIFT_FACTOR}x regression bar for ${rep.benchmark}`
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
    // recorded only when non-default: an explicit metric on a median series
    // would be redundant, but a p95-tracked series must say so in its own row
    ...(rep.metric !== "median" ? { metric: rep.metric } : {}),
    // the commit binding — present only when git hands us a real sha ([C30])
    ...(measuredSha ? { sha: measuredSha } : {}),
  });
}

const blocked = failures.length > 0; // any gate failure → record NOTHING
const record = (!statusOnly && !dryRun && !blocked) ? records : [];

if (!statusOnly && !dryRun && record.length) {
  mkdirSync(dirname(HISTORY), { recursive: true });
  writeFileSync(HISTORY, record.map((r) => JSON.stringify(r)).join("\n") + "\n", { flag: "a" });
}

// FIRST-DRIFT ALERT: the first drift breach of this run, structured so the
// failing run names exactly which series, baseline and ratio — a run-summary
// row the reviewer sees beside the red gate. Only drift breaches produce
// it: a report whose own gate is FAIL is a recording error, not a
// regression.
const firstDrift = drifts[0];
const DRIFT_ALERT = firstDrift
  ? [
      "## 🚨 Perf trend gate breached — first drift beyond the regression bar",
      "",
      "| series | metric | current | baseline (5-run median) | ratio |",
      "| --- | --- | --- | --- | --- |",
      `| ${firstDrift.series} | ${firstDrift.metric} | ${firstDrift.current}ms | ${firstDrift.baseline}ms | ${firstDrift.ratio}x |`,
      "",
      `Gate is RED and nothing was recorded: the ${firstDrift.series} series moved ${firstDrift.ratio}x past its trailing ${BASELINE_WINDOW}-run ${firstDrift.metric} baseline (bar = ${DRIFT_FACTOR}x). Compare the curve on docs/DDE-TREND.html.`,
    ].join("\n")
  : null;
if (DRIFT_ALERT) {
  console.error(`benchmark-trend:\n${DRIFT_ALERT}`);
  // Run summary — appended, never clobbered, and best-effort: a summary
  // write failure must not change the gate outcome already computed.
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    try {
      appendFileSync(summaryPath, DRIFT_ALERT + "\n");
    } catch (e) {
      console.error(`benchmark-trend: run-summary append failed (${e.message}) — gate outcome unchanged`);
    }
  }
}

const status = {
  trend: "benchmark-trend",
  file: "benchmarks/perf-history.jsonl",
  totalEntries: entries.length + record.length,
  series: reports.map((r) => ({
    benchmark: r.benchmark,
    historyEntries: seriesEntries[r.benchmark] ?? undefined,
    metric: r.metric,
    median: r.stats.median,
  })),
  tornLines: torn,
  recorded: record.length,
  dryRun,
  gate: failures.length === 0 ? "PASS" : "FAIL",
  // the run's first drifting series, structured (absent while green)
  ...(firstDrift ? { alert: firstDrift } : {}),
  failures,
};

console.log(JSON.stringify(status, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
