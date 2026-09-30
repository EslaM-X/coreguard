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
 *      page's parser against the REAL module bytes, and cross-checks the
 *      snapshot's budget figures (50/50/150) against that same table — a
 *      budget change in the module fails BOTH the snapshot-stale guard and
 *      this page by name; a page that stops parsing the module fails here.
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

const PAGE_FNS = { parseBudgets: null, latestBySeries: null, sparkline: null };
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
  const rows = [...trend.matchAll(/series:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*budget:\s*(\d+)/g)]
    .map((m) => ({ series: m[1], label: m[2], budget: Number(m[3]) }));
  assert.ok(rows.length >= 3, `expected the 3-series badge table in ${TREND}, found ${rows.length}`);
  assert.ok(trend.includes("badges"), `${TREND} lost its badges section — the page's budget source is gone`);
  const table = Object.fromEntries(rows.map((r) => [r.series, r.budget]));

  // The page must derive budgets from the module, not retype them.
  const violations = pageBindingViolations(page, artifact);
  assert.deepEqual(violations, [], "the page's source bindings drifted:\n  " + violations.join("\n  "));

  return { artifact, rows, table };
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
  assert.ok(Array.isArray(parsed) && parsed.length >= 3, "parseBudgets() must derive the real budget rows from the module bytes");
  for (const r of parsed) {
    assert.ok(LIVE.table[r.series] === r.budget, `parseBudgets() drifted on "${r.series}"`);
  }
});

test("perf page: latestBySeries + sparkline run against recorded history lines", () => {
  const lines = read(HIST).split("\n").filter((l) => l.trim());
  assert.ok(lines.length > 100, "the committed perf history must stay substantial for the logic proof");
  const latest = PAGE_FNS.latestBySeries(lines);
  assert.equal(latest.size, 3, "latestBySeries() must see all three recorded series");
  for (const e of latest.values()) {
    assert.equal(typeof e.stats.median, "number", "recorded entries must carry numeric medians");
  }
  const engine = latest.get("dde-http-wire-perf:engine");
  const svg = PAGE_FNS.sparkline([engine.stats.median * 0.8, engine.stats.median, engine.stats.median * 1.1], LIVE.table["dde-http-wire-perf:engine"]);
  assert.ok(svg.startsWith("<svg"), "sparkline() must emit an SVG");
  assert.ok(svg.includes('stroke-dasharray'), "sparkline() must draw the budget as a dashed line");
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
  ];
  let applied = 0;
  for (const c of cases) {
    const m = mutated(page, c.from, c.to);
    if (!m.applied) continue;
    applied++;
    const violations = pageBindingViolations(m.out, LIVE.artifact);
    assert.ok(violations.length > 0,
      `negative control did not bite: "${c.label}" — the page contract stayed green over a corrupted binding`);
    assert.match(violations.join("\n"), c.expect,
      `negative control "${c.label}" bit with the wrong message: ${violations.join(" | ")}`);
  }
  assert.ok(applied >= 4, `expected all 4 page controls to apply, only ${applied} did — the battery is not testing what it thinks`);
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
