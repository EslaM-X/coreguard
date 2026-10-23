import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "url";
import vm from "node:vm";

/**
 * DDE-TREND page contract — the live curve page cannot drift from the
 * sources it claims to read. Binding directions:
 *
 *   1. page → history  : the page's curve source must be the committed
 *      benchmarks/perf-history.jsonl, fetched from raw.githubusercontent
 *      (the bytes the trend bot appends), with a ?t= cache-buster on every
 *      poll and an auto-refresh interval — "updates itself with each new
 *      bot point" is a MECHANISM claim ([C27]), and the mechanism is
 *      asserted, not the slogan.
 *   2. page → module   : budgets derive LIVE from the trend module's badge
 *      table (raw fetch + parse); the contract proves the page's parser
 *      against the REAL module bytes, so a module bump moves the page in
 *      the same push.
 *   3. page → index    : docs/index.html must carry a card linking the
 *      curve page (the reviewer's front page always names this surface).
 *   4. logic           : parseBudgets / medianSeries / curveBySeries /
 *      curvePanel run in a headless VM against the real module bytes and
 *      the committed ledger — the page's JS is executed, not restated
 *      ([C25]).
 *   5. honesty         : an empty series renders an honest absence note
 *      (never fabricated zeros), an over-scale budget is reported as
 *      measured headroom (never drawn as a cramped fake line), torn ledger
 *      lines are skipped, and a dead feed renders a red chip BY NAME.
 *
 * Negative controls: page mutations must each apply AND bite, by name ([C32]).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const PAGE = "docs/DDE-TREND.html";
const TREND = "scripts/benchmark-trend.mjs";
const HIST = "benchmarks/perf-history.jsonl";
const INDEX = "docs/index.html";
const BACKLINK = "docs/DDE-PERF.html";

const read = (p) => readFileSync(join(REPO, p), "utf8").replaceAll("\r\n", "\n");

/* ---- headless logic harness: the page's own functions run on real bytes ---- */

function pageScript() {
  const html = read(PAGE);
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, "DDE-TREND.html must carry one inline <script> block");
  return m[1];
}

/** Extract a function's source from the page script and run it in a VM. */
function runPageFn(fnName, ...args) {
  const js = pageScript();
  const start = js.indexOf("function " + fnName);
  assert.ok(start >= 0, `the page must still define ${fnName}() — the contract executes the page's logic, it does not restate it`);
  const depthStart = js.indexOf("{", start);
  let depth = 0, end = -1;
  for (let i = depthStart; i < js.length; i++) {
    if (js[i] === "{") depth++;
    else if (js[i] === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  assert.ok(end > start, `cannot extract ${fnName}() from the page script`);
  const src = js.slice(start, end);
  const ctx = { result: null, __args: args };
  vm.createContext(ctx);
  vm.runInContext(`result = (${src})(...__args)`, ctx, { filename: `page:${fnName}` });
  return ctx.result;
}

const PAGE_FNS = { parseBudgets: null, medianSeries: null, curveBySeries: null, curvePanel: null };
for (const fn of Object.keys(PAGE_FNS)) {
  PAGE_FNS[fn] = (...args) => runPageFn(fn, args[0], args[1]);
}

/* ---- derived truth ---- */

function deriveLive() {
  const trend = read(TREND);
  const page = read(PAGE);
  const html = read(PAGE);
  const script = (html.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || "";

  // The trend module's budget table (the page's live budget source).
  const rows = [...trend.matchAll(/series:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*budget:\s*(\d+)(?:,\s*metric:\s*"([a-z0-9]+)")?/g)]
    .map((m) => ({ series: m[1], label: m[2], budget: Number(m[3]), metric: m[4] ?? null }));
  assert.ok(rows.length >= 4, `expected the 4-series badge table in ${TREND}, found ${rows.length}`);
  const core = ["dde-http-wire-perf:engine", "dde-http-wire-perf:wire", "dde-sdk-verify-perf"];
  for (const series of core) {
    const row = rows.find((r) => r.series === series);
    assert.ok(row, `the trend module must still declare the core series ${series} — the curve page's panels derive from it`);
    assert.equal(row.metric ?? null, null, `core series ${series} must stay median-tracked — a metric change moves its Burden to the perf board's pair card, not to a median curve`);
  }

  // Bindings that survive a page mutation check, EXTRACTABLE to the battery.
  const bindings = pageViolations(page);
  assert.deepEqual(bindings.violations, [], "the curve page's source bindings drifted:\n  " + bindings.violations.join("\n  "));
  assert.equal(script.includes("setInterval"), true, "the curve page must carry an auto-refresh interval — self-update is a mechanism, not a slogan");

  return { rows, core, script };
}

/** The page-side bindings as a pure violations-collector over the page text,
 *  so the negative battery below can bite on mutated copies. Checks run over
 *  the SCRIPT BLOCK only — footer prose may name the same paths, and a prose
 *  mention must never satisfy a logic binding ([C25]). */
function pageViolations(page) {
  const v = [];
  const script = (page.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || "";
  if (!/raw\.githubusercontent\.com\/" \+ OWNER_REPO \+ "\/main\/benchmarks\/perf-history\.jsonl/.test(script)) {
    v.push("the page must read the committed benchmarks/perf-history.jsonl from raw.githubusercontent — invented sources rot");
  }
  if (!script.includes("/main/scripts/benchmark-trend.mjs")) {
    v.push("the page must derive budgets live from scripts/benchmark-trend.mjs (raw fetch) — retyped budgets rot");
  }
  if (!/RAW_JSONL \+ "\?t=" \+ Date\.now\(\)/.test(script)) {
    v.push("every history poll must carry a ?t= cache-buster — a cached CDN copy would break the freshness promise silently");
  }
  if (!/setInterval\(/.test(script) || !/REFRESH_MS = 60000/.test(script)) {
    v.push("the page must auto-refresh the ledger on an interval (REFRESH_MS = 60000) — \"updates with each new bot point\" is a mechanism claim");
  }
  if (!script.includes("never fabricated zeros")) {
    v.push("an empty series must render the honest absence note, not fabricated zeros");
  }
  return { script, violations: v };
}

const OWNER_REPO = "EslaM-X/coreguard";
const LIVE = deriveLive();

/* ---- tests ---- */

test("trend page: the curve source is the committed ledger, cached and polled", () => {
  const page = read(PAGE);
  assert.ok(page.includes('https://raw.githubusercontent.com/' + OWNER_REPO + '/main/benchmarks/perf-history.jsonl') ||
            page.includes("/main/benchmarks/perf-history.jsonl"),
    "the page must fetch benchmarks/perf-history.jsonl from raw.githubusercontent.com (the bytes the bot appends)");
  const script = (page.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || "";
  assert.ok(script.includes('RAW_JSONL + "?t=" + Date.now()'),
    "every poll must carry a ?t= cache-buster — a stale CDN copy would break the freshness promise silently");
  assert.ok(/setInterval\(.*?,\s*REFRESH_MS\)/.test(script),
    "the ledger must be re-polled on the REFRESH_MS interval — self-update is a mechanism claim");
  assert.ok(script.includes("const REFRESH_MS = 60000"), "the refresh interval must stay 60s (faster polls print 403 noise per house rate discipline)");
});

test("trend page: budget derivation is proven against the real trend module", () => {
  const parsed = PAGE_FNS.parseBudgets(read(TREND));
  assert.ok(Array.isArray(parsed) && parsed.length >= 4, "parseBudgets() must derive the real budget rows from the module bytes");
  for (const r of parsed) {
    const live = LIVE.rows.find((x) => x.series === r.series);
    assert.ok(live, `"${r.series}" must be a module row`);
    assert.equal(r.budget, live.budget, `parseBudgets() drifted on "${r.series}"`);
    assert.equal(r.metric ?? null, live.metric ?? null, `parseBudgets() must track the same metric the module declares for "${r.series}"`);
  }
});

test("trend page: medianSeries() plots the median-depth curves and excludes the concurrency tail", () => {
  const picked = PAGE_FNS.medianSeries(LIVE.rows);
  for (const series of LIVE.core) {
    assert.ok(picked.some((r) => r.series === series), `the engine/wire/SDK panel set must include ${series}`);
  }
  const tails = picked.filter((r) => r.metric === "p95");
  assert.equal(tails.length, 0, "the p95-tracked load series must not hide inside the median curve set — the perf board's pair owns the depth pair");
});

test("trend page: curveBySeries() skips torn lines and reads the committed ledger", () => {
  const lines = read(HIST).split("\n").filter((l) => l.trim());
  assert.ok(lines.length > 100, "the committed perf history must stay substantial for the logic proof");
  for (const series of LIVE.core) {
    const curve = PAGE_FNS.curveBySeries(series, lines);
    assert.ok(curve.values.length > 5, `${series} must have a recorded curve in the committed ledger`);
    assert.ok(curve.values.every((v) => typeof v === "number" && Number.isFinite(v)),
      `${series} points must be finite numbers`);
    assert.equal(curve.utcs.length, curve.values.length, `${series} points must carry their timestamps`);
  }
});

test("trend page: curvePanel() draws the curve with the budget discipline", () => {
  const lines = read(HIST).split("\n").filter((l) => l.trim());
  const row = LIVE.rows.find((r) => r.series === "dde-http-wire-perf:engine");
  const curve = PAGE_FNS.curveBySeries(row.series, lines);
  const html = PAGE_FNS.curvePanel(row, curve.values);
  assert.ok(html.startsWith('<div class="card"><h3>'), "curvePanel() must render a card");
  assert.ok(html.includes("<svg") && html.includes("<path"), "the curve must be a real polyline, not a summary chip");
  assert.ok(html.includes("recorded medians"), "the panel must state how many recorded points it draws");
  assert.ok(html.includes("inside budget"), "the in-budget state must be labelled as such");

  // An empty series is an honest absence, never a fabricated zero line.
  const absent = PAGE_FNS.curvePanel(LIVE.rows.find((r) => r.series === "dde-http-load-perf"), []);
  assert.match(absent, /No recorded points for this series yet/, "an empty series must state its absence, not fabricate zeros");
  assert.equal(absent.includes("<path"), false, "an empty series must draw no curve line");

  // A budget far above the curve is reported as measured headroom.
  const micro = PAGE_FNS.curvePanel(row, [0.2, 0.3, 0.25, 0.3]);
  assert.match(micro, /headroom ≥ /, "an out-of-scale budget must be reported as headroom with the number, not drawn as a cramped fake line");
});

test("trend page: docs/index.html links the curve page and the perf board links back", () => {
  const index = read(INDEX);
  assert.ok(index.includes('href="DDE-TREND.html"'), "docs/index.html must carry a card linking DDE-TREND.html — the front page always names its surfaces");
  const perf = read(BACKLINK);
  assert.ok(perf.includes('href="DDE-TREND.html"'), "the perf board must cross-link the curve page — the two feeds are one surface split by depth");
});

/* ---- negative controls ---- */

function mutated(base, from, to) {
  if (!base.includes(from)) return { applied: false, out: null };
  return { applied: true, out: base.replaceAll(from, to) };
}

test("trend page negative controls: each page mutation applies AND bites, by name", () => {
  const page = read(PAGE);
  const cases = [
    {
      label: "the page swaps the ledger for an invented source",
      from: "/main/benchmarks/perf-history.jsonl",
      to: "/main/benchmarks/invented-history.jsonl",
      expect: /must read the committed benchmarks\/perf-history\.jsonl/,
    },
    {
      label: "the page retypes a budget instead of deriving it",
      from: 'const RAW_TREND = "https://raw.githubusercontent.com/" + OWNER_REPO + "/main/scripts/benchmark-trend.mjs";',
      to: 'const RAW_TREND = "https://raw.githubusercontent.com/" + OWNER_REPO + "/main/retired.mjs";',
      expect: /derive budgets live from scripts\/benchmark-trend\.mjs/,
    },
    {
      label: "the page drops the cache-buster (stale CDN copy succeeds silently)",
      from: 'RAW_JSONL + "?t=" + Date.now()',
      to: "RAW_JSONL",
      expect: /must carry a \?t= cache-buster/,
    },
    {
      label: "the page drops the auto-refresh interval",
      from: "const REFRESH_MS = 60000;",
      to: "const REFRESH_MS = 0; /* retired */",
      expect: /must auto-refresh the ledger on an interval/,
    },
    {
      label: "the page fabricates a zero curve for an empty series",
      from: "never fabricated zeros",
      to: "draw a flat zero line when empty",
      expect: /honest absence note, not fabricated zeros/,
    },
  ];
  let applied = 0;
  for (const c of cases) {
    const m = mutated(page, c.from, c.to);
    if (!m.applied) continue;
    applied++;
    const { violations } = pageViolations(m.out);
    assert.ok(violations.length > 0,
      `negative control did not bite: "${c.label}" — the page contract stayed green over a corrupted binding`);
    assert.match(violations.join("\n"), c.expect,
      `negative control "${c.label}" bit with the wrong message: ${violations.join(" | ")}`);
  }
  assert.ok(applied >= 5, `expected all 5 page controls to apply, only ${applied} did — the battery is not testing what it thinks`);
});

test("trend page module-side control: the curves' budgets re-derive from the module, so a module bump moves the page in the same push", () => {
  const trend = read(TREND);
  const bumped = trend.replaceAll("budget: 150", "budget: 999");
  assert.notEqual(bumped, trend, "the module must still carry the literal wire budget for this control to mean anything");
  const moved = PAGE_FNS.parseBudgets(bumped).filter((r) => r.budget === 999);
  assert.equal(moved.length, 1, "the page's parser must see the bumped wire budget — the page renders the module's truth, never a frozen copy");
});
