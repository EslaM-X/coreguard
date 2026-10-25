import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

/**
 * QUICKSTART page contract — the quick-start templates page cannot drift
 * from the sources it documents. Binding directions:
 *
 *   1. page → generator : commands derive from scripts/create-integration.mjs's
 *      own usage() header and package.json's scripts.create:integration —
 *      never retyped ([C25]).
 *   2. page → templates : both template trees come from the GitHub API
 *      contents endpoint — the on-disk template directories must match the
 *      endpoint paths the page fetches.
 *   3. page → engine    : the "live example" is the committed engine
 *      (templates/integration-dde/engine-dde.mjs) running the committed
 *      fixture; the contract executes the REAL engine against the REAL
 *      bytes and runs the page's renderers on that real output.
 *   4. page → gate      : the acceptance predicate is derived from
 *      payout-gate.mjs's own source, and the REAL gate process agrees with
 *      the page's rendered verdict.
 *   5. index → page     : docs/index.html carries a card linking the page.
 *
 * Negative controls: page mutations must each apply AND bite, by name ([C32]).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const PAGE = "docs/QUICKSTART.html";
const GENERATOR = "scripts/create-integration.mjs";
const PKG = "package.json";
const ENGINE = "templates/integration-dde/engine-dde.mjs";
const GATE = "templates/integration-dde/payout-gate.mjs";
const SHIM = "packages/crypto-shim-playground.js";
const FIXTURE_DIR = "templates/integration-dde/dde-fixture";
const TEMPLATES = ["templates/integration", "templates/integration-dde"];
const INDEX = "docs/index.html";

const read = (p) => readFileSync(join(REPO, p), "utf8").replaceAll("\r\n", "\n");

/* ---- headless logic harness: the page's own functions run on real bytes ---- */

function pageScript() {
  const m = read(PAGE).match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, "QUICKSTART.html must carry the inline <script> block");
  return m[1];
}

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
  // A page's derived helper (e.g. parseFileKey inside buildFixture) is
  // injected — VM() executes the committed page's own definition for it.
  const extra = extraHelpers[fnName];
  const context = { result: null, __args: args, ...(extra ?? {}) };
  vm.createContext(context);
  vm.runInContext(`result = (${src})(...__args)`, context, { filename: `page:${fnName}` });
  return context.result;
}

  // A page's derived helper (esc inside the renderers, parseFileKey inside
  // buildFixture) is injected as the committed page's own definition.
  const esc = (...a) => runPageFn("esc", ...a);
  const extraHelpers = {
    buildFixture: { parseFileKey: null },
    statusBlock: { esc },
    checkRow: { esc },
    gateBlock: { esc },
  };
  extraHelpers.buildFixture.parseFileKey = (...a) => runPageFn("parseFileKey", ...a);

const VM = {
  esc: (...a) => runPageFn("esc", ...a),
  parseUsage: (...a) => runPageFn("parseUsage", ...a),
  parseModes: (...a) => runPageFn("parseModes", ...a),
  parseFileKey: (...a) => runPageFn("parseFileKey", ...a),
  parsePredicate: (...a) => runPageFn("parsePredicate", ...a),
  renderCommands: (...a) => runPageFn("renderCommands", ...a),
  buildFixture: (...a) => runPageFn("buildFixture", ...a),
  statusBlock: (...a) => runPageFn("statusBlock", ...a),
  checkRow: (...a) => runPageFn("checkRow", ...a),
  gateBlock: (...a) => runPageFn("gateBlock", ...a),
};

/* ---- binding collector: the page's source bindings as pure violations ---- */

const CLIENT_SOURCES = [
  ["RAW_GENERATOR", 'RAW + "scripts/create-integration.mjs"'],
  ["RAW_PACKAGE", 'RAW + "package.json"'],
  ["RAW_ENGINE", 'RAW + "templates/integration-dde/engine-dde.mjs"'],
  ["RAW_GATE", 'RAW + "templates/integration-dde/payout-gate.mjs"'],
  ["RAW_SHIM", 'RAW + "packages/crypto-shim-playground.js"'],
  ["RAW_FIXTURE", 'RAW + "templates/integration-dde/dde-fixture/"'],
  ["API_TEMPLATES", '"/contents/templates/integration"'],
  ["API_TEMPLATES_DDE", '"/contents/templates/integration-dde"'],
];

function pageViolations(page) {
  const v = [];
  const script = (page.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || "";
  for (const [name, anchor] of CLIENT_SOURCES) {
    if (!script.includes(anchor)) {
      v.push(`${name}: the page must fetch this committed source from the anchor \`${anchor}\` — a retyped or invented source rots ([C25])`);
    }
  }
  if (!script.includes('OWNER_REPO = "EslaM-X/coreguard"')) {
    v.push("OWNER_REPO: the page must pin the repo constant it fetches against");
  }
  for (const id of ["chip-generator", "chip-templates", "chip-engine", "tree-default", "tree-dde", "engine-checks", "engine-gate", "feed-errors", "try-cmd"]) {
    if (!page.includes(`id="${id}"`)) {
      v.push(`id="${id}": the page must carry this element — a dead source e.g. engine feed must render its red chip by name, never fail silently`);
    }
  }
if (!/function feedError\(/.test(script)) {
  v.push("feedError(): the page must render a dark feed as a named error block — never a silent empty panel");
}
  return v;
}

test("QUICKSTART structure: every fed element, card in index, and source anchors exist", () => {
  const page = read(PAGE);
  assert.deepEqual(pageViolations(page), [],
    "the quick-start page's source bindings drifted:\n  " + pageViolations(page).join("\n  "));

  // Language switcher — the page documents in both languages.
  assert.ok(page.includes('id="btn-ar"') && page.includes('id="btn-en"'), "the bilingual switcher must be wired");
  assert.ok(page.includes('html[lang="en"] [data-lang-text="ar"]'), "the AR/EN switch must hide the other language");

  // The aggregate front page always names this surface.
  assert.ok(read(INDEX).includes('href="QUICKSTART.html"'), "docs/index.html must carry a card linking the quick-start page");
});

test("negative controls: each page mutation applies AND bites, by name", () => {
  const base = read(PAGE);

  // Control 1 — the engine source anchor is silently swapped to a private
  // mirror: the derivation contract must name RAW_ENGINE.
  const privateEngine = base.replace('RAW + "templates/integration-dde/engine-dde.mjs"', 'RAW + "static/engine-fork.mjs"');
  assert.notEqual(privateEngine, base, "the mutation must actually apply");
  const v1 = pageViolations(privateEngine);
  assert.ok(v1.some((p) => p.startsWith("RAW_ENGINE")), `a silently swapped engine source must bite by name, got:\n  ${v1.join("\n  ")}`);

  // Control 2 — the fixture feed is dropped (engine table could render with
  // retyped numbers): must bite by name.
  const noFixture = base.replace('RAW + "templates/integration-dde/dde-fixture/"', 'RAW + "static/fixture-copy/"');
  assert.notEqual(noFixture, base, "the mutation must actually apply");
  const v2 = pageViolations(noFixture);
  assert.ok(v2.some((p) => p.startsWith("RAW_FIXTURE")), `a fixture feed swap must bite by name, got:\n  ${v2.join("\n  ")}`);

  // Control 3 — the template-tree feeds point at the wrong directory: the
  // documented tree and the fetched tree diverge.
  const wrongTree = base.replace('"/contents/templates/integration-dde"', '"/contents/templates/integration-fork"');
  assert.notEqual(wrongTree, base, "the mutation must actually apply");
  const v3 = pageViolations(wrongTree);
  assert.ok(v3.some((p) => p.startsWith("API_TEMPLATES_DDE")), `a wrong tree endpoint must bite by name, got:\n  ${v3.join("\n  ")}`);

  // Control 4 — a dark feed stops rendering by name (silent panel).
  // Silencing the definition (not just the call) must bite by name.
  const silent = base.replace(/function feedError\(/, "function feedErrorOff(_msg") ;
  assert.notEqual(silent, base, "the mutation must actually apply");
  const v4 = pageViolations(silent);
  assert.ok(v4.some((p) => p.includes("feedError")), `a silenced feed must bite by name, got:\n  ${v4.join("\n  ")}`);
});

test("derived commands: parseUsage + renderCommands run on the real generator and package bytes", () => {
  const usage = VM.parseUsage(read(GENERATOR));
  assert.ok(usage.command.startsWith("node scripts/create-integration.mjs"), `usage must derive the real node invocation, got: ${usage.command}`);
  for (const dir of [usage.defaultDir, usage.ddeDir]) {
    assert.ok(existsSync(join(REPO, dir)), `usage() names "${dir}" — that template directory must exist in the repo`);
  }
  assert.ok(usage.defaultDir.endsWith("templates/integration"), `default mode must scaffold the guard-floor template, got: ${usage.defaultDir}`);
  assert.ok(usage.ddeDir.endsWith("templates/integration-dde"), "--dde mode must scaffold the DDE evidence template, got: ${usage.ddeDir}");

  // Not both modes pointing at the same template (parseUsage refuses).
  assert.notEqual(usage.defaultDir, usage.ddeDir);

  const cmds = VM.renderCommands(usage, JSON.parse(read(PKG)));
  assert.equal(cmds.script, JSON.parse(read(PKG)).scripts["create:integration"], "npm command must be package.json's own script, not a retyped shorthand");
  assert.equal(cmds.nodeDde, usage.command + " --dde", "the --dde invocation must be the derived node command plus the flag");

  // Header per-mode descriptions derive from the generator's own prose.
  const modes = VM.parseModes(read(GENERATOR));
  assert.ok(modes.def.length > 20 && /default/.test(modes.def), "the default-mode description must come from the generator header");
  assert.ok(modes.dde.length > 20 && /--dde/i.test(modes.dde), "the --dde description must come from the generator header");
});

test("derived fixture: parseFileKey + buildFixture run on the real engine and record bytes", async () => {
  const engine = read(ENGINE);
  const pairs = VM.parseFileKey(engine);
  assert.ok(pairs.length >= 10, `the engine's FILE_TO_KEY must carry the ten DDE records, got ${pairs.length}`);
  for (const [file] of pairs) {
    assert.ok(existsSync(join(REPO, FIXTURE_DIR, file)), `the engine binds fixture file "${file}" — it must exist in dde-fixture/`);
  }

  const files = { "hashes.json": read(join(FIXTURE_DIR, "hashes.json")) };
  for (const [file] of pairs) files[file] = read(join(FIXTURE_DIR, file));
  const fixture = VM.buildFixture(engine, files);
  for (const [, key] of pairs) {
    assert.ok(fixture[key] && typeof fixture[key] === "object", `buildFixture must place record "${key}" the way the engine's loader does`);
  }
  assert.equal(fixture.origin, "SYNTHETIC", "the fixture origin must come from the committed hashes.json");
});

test("live engine equivalence: the page's renderers display exactly what the committed engine computes", async () => {
  const mod = await import(pathToFileURL(join(REPO, ENGINE)).href);
  const fixDir = join(REPO, FIXTURE_DIR).replaceAll("\\", "/") + "/";
  const report = await mod.verifyDeliveryFixture(mod.loadFixtureFromDir(fixDir));

  assert.equal(report.status, "VERIFIED", "the committed fixture must verify — the page's example must never show a stale verdict");

  // statusBlock renders the real verdict.
  const block = VM.statusBlock(report);
  assert.ok(block.includes("VERIFIED") && block.includes(report.decision), `statusBlock must show the engine's own status + decision: ${block}`);
  assert.equal(block.includes("bad"), false, "a VERIFIED engine result must render in the passing style");

  // checkRow renders every real check, passing style marks PASS rows.
  const rows = report.checks.map((c) => VM.checkRow(c));
  assert.equal(rows.length, report.checks.length, "every engine check must be rendered");
  for (let i = 0; i < rows.length; i++) {
    assert.ok(rows[i].includes(report.checks[i].id), `row ${i} must name the engine's check id ${report.checks[i].id}`);
    const styleOk = (report.checks[i].result === "PASS") === rows[i].includes('class="ok"');
    assert.ok(styleOk, `row ${i} styling must agree with the engine's own result`);
  }

  // The gate: page's derived predicate + engine's releaseWhen, against the
  // committed acceptance record — HOLD, same as the real payout-gate run.
  const gateSrc = read(GATE);
  const predicateSrc = VM.parsePredicate(gateSrc);
  assert.ok(predicateSrc.includes("CRITERIA_EVALUATION") && predicateSrc.includes("signedBy"), "the acceptance predicate must derive from payout-gate.mjs's own body");
  const acc = JSON.parse(read(join(FIXTURE_DIR, "acceptance-record.json")));
  const predicate = new Function("acc", `return (${predicateSrc})`)(acc);
  const gate = mod.releaseWhen(report, predicate);
  assert.equal(gate.release, false, "the committed fixture is party-REJECTED on criteria — the release law must hold it");
  assert.equal(predicate, false, "the platform predicate reads the acceptance record, never execution or settlement");
  const gateHtml = VM.gateBlock(gate);
  assert.ok(gateHtml.includes("HOLD"), "gateBlock must render HOLD for a held gate");
});

test("process equivalence: the real payout-gate CLI agrees with the page's rendered verdict", () => {
  const out = spawnSync(process.execPath, ["payout-gate.mjs", "--json"], {
    cwd: join(REPO, "templates/integration-dde"),
    encoding: "utf8",
  });
  // The scaffold's law: a held gate exits 2 (held, not broken).
  assert.equal(out.stdout, out.stdout, "stdout is defined");
  const j = JSON.parse(out.stdout);
  assert.equal(j.tool, "payout-gate");
  assert.equal(j.scenarios[0].release, false, "the shipped fixture must be held by the real gate");
  assert.equal(j.scenarios[1].release, false, "a payment-settled claim must release nothing — the boundary is the acceptance record");
  // The page's renderer must speak the same direction for the same data.
  assert.ok(VM.gateBlock({ release: j.scenarios[0].release, reasons: j.scenarios[0].reasons }).includes("HOLD"),
    "the page and the CLI must agree in direction on the shipped scenario");
});
