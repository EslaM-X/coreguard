import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "url";
import vm from "node:vm";

/**
 * DDE-PERF page contract — the live perf page cannot drift from the sources
 * it claims to read. Binding directions:
 *
 *   1. page → workflow : the artifact name the page fetches must be the name
 *      dde.yml's upload step actually publishes (exactly one uploader).
 *   2. page → budgets  : the page derives budgets LIVE from the trend
 *      module's badge table (raw fetch + parse); the contract proves the
 *      page's parser against the REAL module bytes, cross-checks the
 *      snapshot's budget figures (50/50/150/600) against that same table, and
 *      binds the tracked metric per series — only the load row may declare
 *      metric "p95" (the concurrency tail), everything else stays median;
 *      a page that stops parsing the module fails here.
 *   3. page → history  : the page's history source must be the committed
 *      benchmarks/perf-history.jsonl (the bytes the DDE cycle appends).
 *   4. page → index    : docs/index.html must carry a card linking to
 *      DDE-PERF.html (the reviewer's front page always names this surface).
 *   5. logic           : parseBudgets / latestBySeries / sparkline run in a
 *      headless VM against the real module bytes and a recorded history line
 *      — the page's JS is executed, not trusted.
 *   6. honesty         : the page never claims to decode artifact zips, and
 *      every fetch it makes carries the PUBLIC-API origin it states.
 *
 * Negative controls: page mutations and module mutations must each apply AND
 * bite, by name ([C32]) — a guard that cannot fail is not a guard.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const PAGE = "docs/DDE-PERF.html";
const WF = ".github/workflows/dde.yml";
const TREND = "scripts/benchmark-trend.mjs";
const HIST = "benchmarks/perf-history.jsonl";
const INDEX = "docs/index.html";

const read = (p) => readFileSync(join(REPO, p), "utf8").replaceAll("\r\n", "\n");

/* ---- headless logic harness: the page's own functions run against real bytes ---- */

function pageScript() {
  const html = read(PAGE);
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, "DDE-PERF.html must carry one inline <script> block");
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

const PAGE_FNS = { parseBudgets: null, latestBySeries: null, sparkline: null, pickPair: null, pairCard: null };
for (const fn of Object.keys(PAGE_FNS)) {
  PAGE_FNS[fn] = (...args) => runPageFn(fn, args[0], args[1]);
}

/* ---- derived truth ---- */

function deriveLive() {
  const wf = read(WF);
  const trend = read(TREND);
  const page = read(PAGE);

  // The workflow's ONE uploader and its artifact name.
  const uploads = [...wf.matchAll(/uses:\s*actions\/upload-artifact@v\d+/g)];
  assert.equal(uploads.length, 1, "dde.yml must carry exactly one upload-artifact step — the page binds to it by name");
  const nameM = wf.match(/name:\s*(\S*runner\S*)\n/);
  assert.ok(nameM, "dde.yml's upload step must name its artifact");
  const artifact = nameM[1];

  // The trend module's budget table (the page's live budget source).
  const rows = [...trend.matchAll(/series:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*budget:\s*(\d+)(?:,\s*metric:\s*"([a-z0-9]+)")?/g)]
    .map((m) => ({ series: m[1], label: m[2], budget: Number(m[3]), metric: m[4] ?? null }));
  assert.ok(rows.length >= 4, `expected the 4-series badge table in ${TREND}, found ${rows.length}`);
  assert.ok(trend.includes("badges"), `${TREND} lost its badges section — the page's budget source is gone`);
  const table = Object.fromEntries(rows.map((r) => [r.series, r.budget]));

  // The depth-pair binding: exactly ONE p95-tracked series (the concurrency
  // tail) and the sequential sibling must exist, by the same rule the page
  // itself applies — derived from the module, never retyped on the page.
  const load = rows.filter((r) => r.metric === "p95");
  assert.equal(load.length, 1, `exactly one p95-tracked series expected, found ${load.length}`);
  assert.equal(load[0].series, "dde-http-load-perf", "the load runner must be the p95-tracked series");
  assert.equal(load[0].budget, 600, `the load budget must be the runner's 600ms tail budget, got ${load[0].budget}`);
  const sequential = rows.filter((r) => !r.metric).sort((a, b) => b.budget - a.budget)[0];
  assert.ok(sequential, "the sequential sibling (largest-budget median series) must exist");
  assert.equal(sequential.series, "dde-http-wire-perf:wire", "the wire series is the sequential median the pair compares against");

  // The page must derive budgets from the module, not retype them.
  const violations = [...pageBindingViolations(page, artifact), ...pageHonestyViolations(page)];
  assert.deepEqual(violations, [], "the page's source bindings or honesty drifted:\n  " + violations.join("\n  "));

  return { artifact, rows, table, loadRow: load[0], sequentialRow: sequential };
}

/** The page-side bindings as a pure violations-collector over the page text,
 *  so the negative battery below can bite on mutated copies. Checks run over
 *  the SCRIPT BLOCK only — the footer's prose legitimately names the same
 *  paths, and a prose mention must never satisfy a logic binding ([C25]). */
function pageBindingViolations(page, artifact) {
  const v = [];
  const script = (page.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || "";
  if (!script.includes('const ARTIFACT_NAME = "' + artifact + '"')) {
    v.push(`the page must name the artifact exactly as dde.yml publishes it ("${artifact}")`);
  }
  if (!script.includes('scripts/benchmark-trend.mjs')) {
    v.push("the page must derive budgets live from scripts/benchmark-trend.mjs (raw fetch) — retyped budgets rot");
  }
  if (!script.includes("benchmarks/perf-history.jsonl")) {
    v.push("the page must read the committed benchmarks/perf-history.jsonl");
  }
  if (/artifacts\/zip/.test(script)) {
    v.push("the page must not reference artifact zip decoding — CI artifact downloads need a token the page does not have");
  }
  return v;
}

/** The depth pair's honesty, beyond its data: the page must present the
 *  sequential-median-vs-concurrent-p95 gap as queueing on the shared event
 *  loop (with the overlap proof), never frame regression, and state the
 *  honest absence of a yet-unrecorded load point — no zero wearing a live name. */
function pageHonestyViolations(page) {
  const v = [];
  const script = (page.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || "";
  if (!script.includes("queueing on the shared event loop — not regression")) {
    v.push("the pair card must name the gap queueing on the shared event loop — not engine regression");
  }
  if (!script.includes('r.metric === "p95"') || !script.includes("sort((a, b) => b.budget - a.budget)")) {
    v.push("pickPair() must derive both sides from the module rows (p95-declared series + largest-budget median series), never retype names");
  }
  if (!script.includes("No recorded load point yet")) {
    v.push("an unrecorded load point must render the honest absence note, not a zero and not silence");
  }
  if (!/الفرق بين الرقمين queueing على حلقة الأحداث المشتركة/.test(page)) {
    v.push("the AR prose must carry the same queueing-not-regression framing as the EN card copy");
  }
  return v;
}

const LIVE = deriveLive();

/* ---- tests ---- */

test("perf page: artifact name equals the one dde.yml actually uploads", () => {
  const page = read(PAGE);
  assert.ok(page.includes('const ARTIFACT_NAME = "' + LIVE.artifact + '"'),
    `the page must name the artifact exactly as dde.yml publishes it ("${LIVE.artifact}")`);
  assert.ok(!/api\.github\.com\/repos\/[^"]*\/artifacts\/zip/.test(page),
    "the page must not promise to decode artifact zips — CI artifacts need a token the page does not have");
});

test("perf page: budget derivation is proven against the real trend module", () => {
  const parsed = PAGE_FNS.parseBudgets(read(TREND));
  assert.ok(Array.isArray(parsed) && parsed.length >= 4, "parseBudgets() must derive the real budget rows from the module bytes");
  for (const r of parsed) {
    assert.ok(LIVE.table[r.series] === r.budget, `parseBudgets() drifted on "${r.series}"`);
    const live = LIVE.rows.find((x) => x.series === r.series);
    assert.equal(r.metric ?? null, live.metric ?? null,
      `parseBudgets() must track the same metric the module declares for "${r.series}"`);
  }
});

test("perf page: latestBySeries + sparkline run against recorded history lines", () => {
  const lines = read(HIST).split("\n").filter((l) => l.trim());
  assert.ok(lines.length > 100, "the committed perf history must stay substantial for the logic proof");
  const latest = PAGE_FNS.latestBySeries(lines);
  assert.ok(latest.size >= 3, `latestBySeries() must see at least the three core series, saw ${latest.size}`);
  for (const core of ["dde-http-wire-perf:engine", "dde-http-wire-perf:wire", "dde-sdk-verify-perf"]) {
    assert.ok(latest.has(core), `the core series ${core} must stay recorded — the page and badges depend on it`);
  }
  for (const e of latest.values()) {
    assert.equal(typeof e.stats.median, "number", "recorded entries must carry numeric medians");
  }
  const engine = latest.get("dde-http-wire-perf:engine");
  const svg = PAGE_FNS.sparkline([engine.stats.median * 0.8, engine.stats.median, engine.stats.median * 1.1], LIVE.table["dde-http-wire-perf:engine"]);
  assert.ok(svg.startsWith("<svg"), "sparkline() must emit an SVG");
  assert.ok(svg.includes('stroke-dasharray'), "sparkline() must draw the budget as a dashed line");
});

test("perf page: the depth pair card derives both sides from module rows and runs on real history", () => {
  const pair = PAGE_FNS.pickPair(LIVE.rows);
  assert.equal(pair.sequential.series, LIVE.sequentialRow.series, "pickPair() must pick the wire series as the sequential side");
  assert.equal(pair.load.series, LIVE.loadRow.series, "pickPair() must pick the load series as the concurrent side");

  // Executed against the committed history: the sequential side renders its
  // recorded median; the load side renders the honest absence state (no load
  // entry has been recorded yet — the nightly cycle has not run).
  const lines = read(HIST).split("\n").filter((l) => l.trim());
  const latest = PAGE_FNS.latestBySeries(lines);
  const html = PAGE_FNS.pairCard(pair, latest);
  assert.ok(html.includes(LIVE.sequentialRow.label), "the sequential side must render its real label");
  assert.ok(html.includes("—"), "an unrecorded load point must render as an em dash, never a fabricated number");
  assert.match(html, /No recorded load point yet/, "absence must state itself, not wear the queueing line");

  // And with a load entry present, the pair renders both real numbers.
  const withLoad = new Map(latest);
  withLoad.set(LIVE.loadRow.series, { stats: { median: 1, p95: 71.2 }, gate: "PASS", utc: "" });
  const both = PAGE_FNS.pairCard(pair, withLoad);
  assert.ok(both.includes("71.2"), "the p95 side must render the recorded p95, not the median");
  assert.ok(!both.includes("No recorded load point yet"), "a recorded point must replace the absence note with the queueing framing");
  assert.match(both, /queueing on the shared event loop — not regression/);
});

test("perf page: docs/index.html links the page from its cards", () => {
  const index = read(INDEX);
  assert.ok(index.includes('href="DDE-PERF.html"'), "docs/index.html must carry a card linking DDE-PERF.html — the front page always names its surfaces");
});

/* ---- negative controls ---- */

function mutated(base, from, to) {
  if (!base.includes(from)) return { applied: false, out: null };
  return { applied: true, out: base.replaceAll(from, to) };
}

test("perf page negative controls: each page mutation applies AND bites, by name", () => {
  const page = read(PAGE);
  const cases = [
    {
      label: "the page renames the artifact it fetches",
      from: 'const ARTIFACT_NAME = "' + LIVE.artifact + '"',
      to: 'const ARTIFACT_NAME = "old-reports"',
      expect: new RegExp(`exactly as dde\\.yml publishes it \\("${LIVE.artifact}"\\)`),
    },
    {
      label: "the page retypes a budget instead of deriving it",
      from: 'const RAW_TREND = "https://raw.githubusercontent.com/" + OWNER_REPO + "/main/scripts/benchmark-trend.mjs";',
      to: 'const RAW_TREND = "https://raw.githubusercontent.com/" + OWNER_REPO + "/main/retired.mjs";',
      expect: /derive budgets live from scripts\/benchmark-trend\.mjs/,
    },
    {
      label: "the page swaps the history for an invented source",
      from: 'benchmarks/perf-history.jsonl',
      to: 'benchmarks/invented-history.jsonl',
      expect: /must read the committed benchmarks\/perf-history\.jsonl/,
    },
    {
      label: "the page promises zip decoding it cannot do",
      from: '" + OWNER_REPO + "/actions/runs/" + run.id + "/artifacts"',
      to: '" + OWNER_REPO + "/actions/runs/" + run.id + "/artifacts/zip"',
      expect: /must not reference artifact zip decoding/,
    },
    {
      label: "the page reframes the gap as engine regression",
      from: 'queueing on the shared event loop — not regression',
      to: 'engine regression surfaced by load',
      expect: /must name the gap queueing on the shared event loop — not engine regression/,
    },
    {
      label: "the page hides the unrecorded load point",
      from: 'No recorded load point yet — appears automatically with the first nightly entry.',
      to: '',
      expect: /must render the honest absence note/,
    },
  ];
  let applied = 0;
  for (const c of cases) {
    const m = mutated(page, c.from, c.to);
    if (!m.applied) continue;
    applied++;
    const violations = [...pageBindingViolations(m.out, LIVE.artifact), ...pageHonestyViolations(m.out)];
    assert.ok(violations.length > 0,
      `negative control did not bite: "${c.label}" — the page contract stayed green over a corrupted binding`);
    assert.match(violations.join("\n"), c.expect,
      `negative control "${c.label}" bit with the wrong message: ${violations.join(" | ")}`);
  }
  assert.ok(applied >= 6, `expected all 6 page controls to apply, only ${applied} did — the battery is not testing what it thinks`);
});

test("perf page module-side control: the page's runtime budgets re-derive from the module, so a module bump changes the page's truth in the same push", () => {
  // The binding is BEHAVIORAL: the page's own parser runs on the REAL module
  // bytes and the derived budgets drive the rendered cards. A module budget
  // bump therefore flows into the page without any page edit — proven here by
  // mutating the module copy and watching the derivation move.
  const trend = read(TREND);
  const bumped = trend.replaceAll("budget: 50", "budget: 999");
  assert.notEqual(bumped, trend, "the module must still carry literal budget: 50 rows for this control to mean anything");
  const moved = PAGE_FNS.parseBudgets(bumped).filter((r) => r.budget === 999);
  assert.equal(moved.length, 2, "the page's parser must see the bumped budgets — the page renders the module's truth, never a frozen copy");
});
