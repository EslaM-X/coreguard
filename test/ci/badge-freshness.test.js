import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Badge freshness at COMMIT granularity — the trend bot regenerates the
 * badges and appends the medians in the SAME commit, so the committed badge
 * set must never disagree with the committed ledger's last recorded points.
 * Nothing enforced that disagreement before: a bot cycle that appended a
 * ledger point without regenerating a badge (or vice versa) would leave the
 * README advertising last cycle's number with today's credibility, and the
 * perf-badges contract could not see it (it tests the GENERATOR in
 * sandboxes — this audit reads the COMMITTED bytes, where staleness is
 * actually visible).
 *
 * The audit re-derives exactly what `--badges` rendered, from the same
 * sources: for every row declared in the module's BADGE_SERIES table, the
 * LATEST ledger entry for that series is the badge's value, the badge's
 * color is the value-vs-budget verdict of the severity ladder, and the
 * budgets come from parsing the module — never retyped here ([C25]/[C27]).
 * The perf·all aggregate must be the worst case of exactly the rendered
 * set. Nightly-depth absence is honored (no badge until it records). Every
 * failure names its offender: file, series, expected vs shown. The mutation
 * controls prove each rule bites: stale value, lying color, phantom badge.
 */

const REPO = join(fileURLToPath(new URL("../..", import.meta.url)));
const read = (p) => readFileSync(join(REPO, p), "utf8");

const MODULE = read("scripts/benchmark-trend.mjs");
const HISTORY = read("benchmarks/perf-history.jsonl");
const BADGES_DIR = join(REPO, "docs", "badges");

// The badge table, parsed from the module: file → series → label → budget
// (→ metric / nightly). Same shape the live pages parse; retyping a budget
// here would rot exactly the way the pages were built to refuse.
const ROWS = [...MODULE.matchAll(
  /file:\s*"([^"]+)",\s*series:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*budget:\s*(\d+)(?:,\s*metric:\s*"([a-z0-9]+)")?(?:,\s*nightly:\s*true)?/g
)].map((m) => ({
  file: m[1],
  series: m[2],
  label: m[3],
  budget: Number(m[4]),
  metric: m[5] ?? null,
  nightly: /nightly:\s*true/.test(m[0]),
}));
assert.equal(ROWS.length, 4, "the badge table must declare its four rows");

// Ledger → last parseable entry per series (append-only ⇒ last line wins;
// torn lines are skipped exactly as the recorder refuses to rewrite them).
function latestBy(historyText) {
  const latest = {};
  for (const line of historyText.split("\n")) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e && e.benchmark && e.stats) latest[e.benchmark] = e;
  }
  return latest;
}

const fmt = (v) => `${Number(v.toFixed(3))}ms`;
const COLORS = ["#4c1", "#dfb317", "#e05d44"];
const severity = (v, budget) => (v <= budget ? 0 : v <= budget * 2 ? 1 : 2);
const aggregateMessage = (worst, yellows) =>
  worst === 0 ? "all within budget" : worst === 1 ? `${yellows} above budget` : "regression detected";

const parseAria = (svg) => (svg.match(/aria-label="([^"]+): ([^"]+)"/) ?? [])[2] ?? null;
const parseColor = (svg) => (svg.match(/fill="#555"\/><rect[^>]*fill="([^"]+)"/) ?? [])[1] ?? null;

function audit(historyText, badges) {
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

/** Every .svg committed under docs/badges, mapped → its text (null = absent). */
const committedBadges = () => {
  const map = new Map();
  for (const file of existsSync(BADGES_DIR) ? readdirSync(BADGES_DIR) : []) {
    if (file.endsWith(".svg")) map.set(file, read(join("docs", "badges", file)));
  }
  for (const r of ROWS) if (!map.has(r.file)) map.set(r.file, null);
  return map;
};

test("every committed badge is fresh: shows the ledger's LATEST point for its series, by name", () => {
  const problems = audit(HISTORY, committedBadges());
  assert.deepEqual(problems, [], `the committed badge set is stale or lying:\n  ${problems.join("\n  ")}`);
});

test("every badge color is the module-derived value-vs-budget verdict (budgets parsed, not retyped)", () => {
  const latest = latestBy(HISTORY);
  for (const row of ROWS.filter((r) => latest[r.series])) {
    const badge = committedBadges().get(row.file);
    assert.ok(badge, `docs/badges/${row.file} must exist while ${row.series} has points`);
    const v = latest[row.series].stats[row.metric ?? "median"];
    const expectedColor = COLORS[severity(v, row.budget)];
    assert.equal(parseColor(badge), expectedColor, `${row.label}: at ${fmt(v)} vs budget ${row.budget}ms the color must be the ladder's verdict`);
  }
});

test("the aggregate perf·all is the worst case of exactly the rendered set", () => {
  const latest = latestBy(HISTORY);
  const renderedRows = ROWS.filter((r) => latest[r.series]);
  assert.ok(renderedRows.length > 0, "no rendered set — nothing to audit");
  const sevs = renderedRows.map((r) => severity(latest[r.series].stats[r.metric ?? "median"], r.budget));
  const worst = Math.max(...sevs);
  const agg = committedBadges().get("perf-all.svg");
  assert.ok(agg, "the aggregate badge must be committed beside the series badges");
  assert.equal(
    parseAria(agg),
    aggregateMessage(worst, sevs.filter((s) => s === 1).length),
    "the aggregate must speak the worst state of the set it is rendered from"
  );
  assert.equal(parseColor(agg), COLORS[worst], "the aggregate color must be the set's worst verdict");
  for (const a of ROWS.filter((r) => !latest[r.series])) {
    assert.equal(
      existsSync(join(BADGES_DIR, a.file)), false,
      `${a.nightly ? "nightly" : "unrecorded"} series must not wear a badge before its first point`
    );
  }
});

test("each mutation applies AND bites by name: stale value, lying color, phantom badge", () => {
  const real = committedBadges();

  // Mutation 1 — the ledger moves to a newer engine point, the badge stays:
  // exactly the staleness this audit exists to catch.
  const lines = HISTORY.split("\n");
  let lastEngineIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('"dde-http-wire-perf:engine"')) { lastEngineIdx = i; break; }
  }
  assert.ok(lastEngineIdx >= 0, "the ledger must contain engine points for the control to mutate");
  const staleLedger = [
    ...lines.slice(0, lastEngineIdx),
    lines[lastEngineIdx].replace(/("median":)([0-9.]+)/, "$10.0999"),
    ...lines.slice(lastEngineIdx + 1),
  ].join("\n");
  const staleProblems = audit(staleLedger, real);
  assert.ok(
    staleProblems.some((p) => p.includes("perf-engine.svg") && p.includes("STALE") && p.includes("0.1ms")),
    `the stale-value control must bite by name, got: ${staleProblems.join(" | ")}`
  );

  // Mutation 2 — the badge's color contradicts its own number: a badge whose
  // ladder verdict the ladder itself calls a lie.
  const engineBadge = real.get("perf-engine.svg");
  assert.ok(engineBadge && engineBadge.includes(COLORS[0]), "the current engine badge must actually be green for the control to bite");
  const swapped = engineBadge.replace(COLORS[1], "__swap__").split(COLORS[0]).join(COLORS[1]).split("__swap__").join(COLORS[0]);
  const lyingColor = audit(HISTORY, new Map(real).set("perf-engine.svg", swapped));
  assert.ok(
    lyingColor.some((p) => p.includes("perf-engine.svg") && p.includes("color") && p.includes("lyin")),
    `the color-mutation control must bite by name, got: ${lyingColor.join(" | ")}`
  );

  // Mutation 3 — a badge file the module never declares: no badge may live
  // outside the table the generator owns.
  const phantom = audit(HISTORY, new Map(real).set("perf-phantom.svg", '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20" aria-label="perf·phantom: 1ms"></svg>'));
  assert.ok(
    phantom.some((p) => p.includes("perf-phantom.svg") && p.includes("NOT declared")),
    `the phantom-badge control must bite by name, got: ${phantom.join(" | ")}`
  );
});
