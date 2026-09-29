import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * AIE-1 review page — UX / performance contract.
 *
 * The page's demo surface was upgraded: a sticky top bar with a live run
 * progress bar, a keyboard path (1/2/3 + hero CTA), an honest RUNNING…
 * busy state (a state, never a result), and performance that is MEASURED
 * live and stated ("N checks · M ms in-tab", "engine boot: X ms") — never
 * claimed in static copy. Motion respects prefers-reduced-motion, focus is
 * visible, and the scenario cards are real buttons to assistive tech.
 *
 * These tests hold the upgrade to the repo's own discipline: a UI claim
 * without a contract is a claim nobody can verify.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = join(HERE, "..", "..", "docs", "AIE-1-REVIEW.html");

const html = readFileSync(PAGE, "utf8");
const firstScript = html.indexOf("<script>");
const STATIC_MARKUP = html.slice(0, firstScript); // every byte before any script
const SCRIPTS = html.slice(firstScript);

test("AIE-1 page UX: sticky top bar, live progress bar, hero CTA, and perf surfaces exist", () => {
  // the top bar sticks so the language toggle and brand never leave the viewport
  assert.match(html, /\.top\{[^}]*position:sticky/, "the top bar must be sticky");
  // a fixed, decorative progress bar exists and is driven by prog()
  assert.match(STATIC_MARKUP, /<div class="runprog" id="runprog" aria-hidden="true"><\/div>/);
  assert.match(SCRIPTS, /function prog\(pct\)/, "prog() must drive the progress bar");
  // the hero carries a one-click CTA straight into the honest scenario
  assert.match(STATIC_MARKUP, /<button class="xlink" id="heroRun">/);
  assert.match(SCRIPTS, /getElementById\("heroRun"\)\.addEventListener\("click", \(\) => runScenario\("honest"\)\)/);
  // the two honest performance surfaces exist: per-run verdict line + engine boot line
  assert.match(STATIC_MARKUP, /<div class="perf" id="vperf" hidden><\/div>/, "the perf line starts hidden — it renders only after a real measurement");
  assert.match(STATIC_MARKUP, /<span class="note" id="bootms"><\/span>/, "the engine boot line exists (filled only from a measured value)");
});

test("AIE-1 page UX: the busy state is honest — RUNNING… is a state, never a verdict", () => {
  assert.match(SCRIPTS, /function showBusy\(\)/, "a dedicated busy renderer must exist");
  // RUNNING… appears exactly once — inside showBusy, never as a chip result
  const occurrences = SCRIPTS.split("RUNNING…").length - 1;
  assert.equal(occurrences, 1, "RUNNING… must appear exactly once (showBusy only)");
  assert.match(SCRIPTS, /showBusy[\s\S]{0,400}RUNNING…/);
  // the busy styling is its own class — never aliased onto ok/mid/bad verdict classes
  assert.match(SCRIPTS, /"vbar busy"/);
  assert.match(SCRIPTS, /"vstatus busy"/);
  assert.doesNotMatch(SCRIPTS, /chipClass\([^)]*busy/i);
  // showVerdict carries the measured ms parameter (the perf line's source)
  assert.match(SCRIPTS, /function showVerdict\(report, gate, ms\)/);
});

test("AIE-1 page UX: performance is measured live and stated — never claimed in static copy", () => {
  // boot time: measured at module load, surfaced in the note line
  const bootUses = SCRIPTS.match(/performance\.now\(\)/g) || [];
  assert.ok(bootUses.length >= 2, "performance.now() must instrument both engine boot and per-run verdicts");
  assert.match(SCRIPTS, /bootMs: Math\.round\(performance\.now\(\) - t0\)/);
  assert.match(SCRIPTS, /"engine boot: " \+ SDK\.bootMs \+ " ms"/);
  // per-run: runFixture times the real verifyFixture call and hands ms to the verdict
  assert.match(SCRIPTS, /async function runFixture[\s\S]*?showBusy\(\);[\s\S]*?const t0 = performance\.now\(\);[\s\S]*?await SDK\.verifyFixture/);
  assert.match(SCRIPTS, /showVerdict\(report, gate, Math\.max\(1, Math\.round\(performance\.now\(\) - t0\)\)\)/);
  assert.match(SCRIPTS, /" checks · " \+ ms \+ " ms in-tab"/);
  // no latency number is baked into the static page copy — measured, or silent
  assert.doesNotMatch(STATIC_MARKUP, /\b\d+\s?ms\b/, "static markup must not pre-bake any latency claim");
});

test("AIE-1 page UX: accessibility and motion respect are wired, not decorative", () => {
  // reduced-motion users get instant scroll and no transition choreography
  const media = html.match(/@media \(prefers-reduced-motion:reduce\)\{[\s\S]*?\n  \}/);
  assert.ok(media, "a prefers-reduced-motion block must exist");
  assert.match(media[0], /scroll-behavior:auto/);
  assert.match(media[0], /transition:none/);
  // keyboard focus is always visible
  assert.match(html, /:focus-visible\{outline:2px solid var\(--blue\)/);
  // scenario cards are announced as buttons; keyboard shortcuts skip form fields
  assert.match(SCRIPTS, /el\.setAttribute\("role", "button"\)/);
  assert.match(SCRIPTS, /\/\^\(INPUT\|TEXTAREA\)\$\/\.test\(e\.target\.tagName\)/);
  assert.match(SCRIPTS, /if \(e\.key === "1"\) runScenario\("honest"\)/);
  assert.match(SCRIPTS, /else if \(e\.key === "2"\) runScenario\("tamper"\)/);
  assert.match(SCRIPTS, /else if \(e\.key === "3"\) runScenario\("empty"\)/);
});
