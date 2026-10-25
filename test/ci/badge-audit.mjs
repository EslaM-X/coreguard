/**
 * Shared badge-audit core ([C25]/[C27] discipline: budgets and series names
 * are parsed from scripts/benchmark-trend.mjs, never retyped here).
 *
 * Two surfaces consume this same audit over the same input shape —
 * `historyText` (a perf-history.jsonl text) and `badges` (Map<file, svg text
 * or null>):
 *
 *   - badge-freshness.test.js audits the WORKING TREE bytes — what a local
 *     --badges run would regenerate against, and what the pre-push guard sees.
 *   - main-badge-sync.test.js audits the GIT COMMIT-TREE bytes of main
 *     (ref-resolved) — the state Pages and README actually serve, so a badge
 *     stale ON MAIN fails immediately, even if the working tree looks fresh.
 *
 * `audit()` returns a list of named problems (empty = in sync); every problem
 * names its offender: file, series, expected vs shown.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(fileURLToPath(new URL("../..", import.meta.url)));

// The badge table, parsed from the module: file → series → label → budget
// (→ metric / nightly). Same shape the live pages parse; retyping a budget
// here would rot exactly the way the pages were built to refuse.
const MODULE = readFileSync(join(REPO, "scripts", "benchmark-trend.mjs"), "utf8");
export const ROWS = [...MODULE.matchAll(
  /file:\s*"([^"]+)",\s*series:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*budget:\s*(\d+)(?:,\s*metric:\s*"([a-z0-9]+)")?(?:,\s*nightly:\s*true)?/g
)].map((m) => ({
  file: m[1],
  series: m[2],
  label: m[3],
  budget: Number(m[4]),
  metric: m[5] ?? null,
  nightly: /nightly:\s*true/.test(m[0]),
}));

export function latestBy(historyText) {
  const latest = {};
  for (const line of historyText.split("\n")) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e && e.benchmark && e.stats) latest[e.benchmark] = e;
  }
  return latest;
}

export const fmt = (v) => `${Number(v.toFixed(3))}ms`;
export const COLORS = ["#4c1", "#dfb317", "#e05d44"];
export const severity = (v, budget) => (v <= budget ? 0 : v <= budget * 2 ? 1 : 2);
export const aggregateMessage = (worst, yellows) =>
  worst === 0 ? "all within budget" : worst === 1 ? `${yellows} above budget` : "regression detected";

export const parseAria = (svg) => (svg.match(/aria-label="([^"]+): ([^"]+)"/) ?? [])[2] ?? null;
export const parseColor = (svg) => (svg.match(/fill="#555"\/><rect[^>]*fill="([^"]+)"/) ?? [])[1] ?? null;

// The audit itself. `badges` maps badge FILE NAME → svg text (null = absent).
export function audit(historyText, badges) {
  const problems = [];
  const latest = latestBy(historyText);
  const renderedRows = [];
  for (const row of ROWS) {
    const entry = latest[row.series];
    const badge = badges.get(row.file) ?? null;
    if (!entry) {
      if (row.nightly && !badge) {
        // Nightly depth: no badge until the first recorded point — a notice,
        // not an error ([C]: absence is named, never worn).
        continue;
      }
      problems.push(
        `${row.series} has no ledger points but docs/badges/${row.file} is committed — no badge may precede its history`
      );
      continue;
    }
    if (!badge) {
      problems.push(`docs/badges/${row.file} is MISSING while ${row.series} has recorded points — a stale-absent badge is worse than none (re-run --badges)`);
      continue;
    }
    renderedRows.push({ row, entry, badge });
  }
  for (const { row, entry, badge } of renderedRows) {
    const tracked = entry.stats[row.metric ?? "median"];
    if (parseAria(badge) !== fmt(tracked)) {
      problems.push(
        `docs/badges/${row.file} shows "${parseAria(badge)}" but the ledger's latest ${row.series} point is ${fmt(tracked)} — STALE (re-run --badges)`
      );
    }
    const expectedColor = COLORS[severity(tracked, row.budget)];
    if (parseColor(badge) !== expectedColor) {
      problems.push(`docs/badges/${row.file} color ${parseColor(badge)} contradicts the ladder verdict ${expectedColor} for ${row.series} at ${fmt(tracked)} vs budget ${row.budget}ms — a lying badge`);
    }
    // Commit binding: the badge must wear the sha of the exact point it is
    // derived from. A badge bound to a different run's commit is stale even
    // when its value happens to agree (a flaky median can reprint the same
    // number), and a sha the ledger does not carry is fabricated ([C30]).
    const pointSha = typeof entry.sha === "string" && /^[0-9a-f]{40}$/.test(entry.sha) ? entry.sha : null;
    const badgeSha = (badge.match(/data-sha="([0-9a-f]{40})"/) ?? [])[1] ?? null;
    if (pointSha && badgeSha !== pointSha) {
      problems.push(`docs/badges/${row.file} is bound to ${badgeSha ?? "no commit"} but ${row.series}' latest point was measured at ${pointSha} — STALE COMMIT BINDING (re-run --badges)`);
    }
    if (!pointSha && badgeSha) {
      problems.push(`docs/badges/${row.file} wears data-sha=\"${badgeSha}\" but the ledger carries no commit for ${row.series}' latest point — a fabricated binding`);
    }
  }
  // Aggregate: worst case over EXACTLY the rendered badges.
  if (renderedRows.length > 0) {
    const sevs = renderedRows.map(({ row, entry }) => severity(entry.stats[row.metric ?? "median"], row.budget));
    const worst = Math.max(...sevs);
    const yellows = sevs.filter((s) => s === 1).length;
    const agg = badges.get("perf-all.svg");
    if (!agg) {
      problems.push("docs/badges/perf-all.svg is MISSING while series badges rendered — the aggregate must ALWAYS accompany the set");
    } else {
      if (parseAria(agg) !== aggregateMessage(worst, yellows)) {
        problems.push(`docs/badges/perf-all.svg shows "${parseAria(agg)}" but the set's worst case is "${aggregateMessage(worst, yellows)}" — the aggregate lied about its own set`);
      }
      if (parseColor(agg) !== COLORS[worst]) {
        problems.push(`docs/badges/perf-all.svg color ${parseColor(agg)} contradicts the worst-case verdict ${COLORS[worst]}`);
      }
      if (/data-sha="[0-9a-f]{40}"/.test(agg)) {
        problems.push("docs/badges/perf-all.svg wears a single data-sha — the aggregate is derived state across points that may span commits; it must not claim one measured-at commit");
      }
    }
  }
  // Anything committed under docs/badges inside the perf* family that the
  // module never renders is a stale artifact — README-contract forbids
  // referencing it, and nothing regenerates it, so it can only drift. The
  // specimen-* SVGs are a DIFFERENT family (the badge registry CG-BDG/1's
  // specimens, owned and regenerated by that system) and are out of scope
  // here; perf-all.svg IS declared, generated with the set.
  const declared = new Set([...ROWS.map((r) => r.file), "perf-all.svg"]);
  for (const [file] of badges) {
    if (file.startsWith("perf-") && !declared.has(file)) {
      problems.push(`docs/badges/${file} is committed but NOT declared by the module's badge table — unregenerable artifact, remove or declare it`);
    }
  }
  return problems;
}
