import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

/**
 * Governance dashboard — bilingual payout section contract.
 *
 * The dashboard's #payout section is bilingual per the AGENTS.md
 * "Bilingual dashboard i18n architecture": hoisted L() prelude reading
 * window.cgLang, full innerHTML swap per [data-i18n], re-render on
 * cg41:lang. EN defaults live in the markup; AR strings live in the
 * PAYOUT_GATE_I18N dictionary. This contract keeps the two sides honest:
 *
 *   1. every data-i18n key exists in the dictionary, exactly once;
 *   2. EN default and AR value are structurally paired — same inline-tag
 *      sequence — so the Arabic render preserves the English emphasis
 *      (a dropped <b> silently flattens the law of the gate);
 *   3. the toggle lifecycle works: dispatch cg41:lang → Arabic applied,
 *      dir=rtl set; snapshot restored (default stays EN);
 *   4. fail-closed proof: a sandbox page whose Arabic value drops a <b>
 *      fails this same pairing check, named by key;
 *   5. the whole page script (prelude + tamper demo) still parses.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PAGE = join(REPO, "docs", "GOVERNANCE-DASHBOARD.html");
const NODE = process.execPath;

function loadParts(html) {
  const ds = html.indexOf("var PAYOUT_GATE_I18N = {");
  const de = html.indexOf("};", ds);
  assert.ok(ds !== -1 && de !== -1, "PAYOUT_GATE_I18N dictionary present in prelude");
  const dict = eval("({" + html.slice(ds + "var PAYOUT_GATE_I18N = {".length, de) + "})");
  const sect = html.slice(html.indexOf('<section id="payout"'), html.indexOf("PATH TO GO"));
  assert.ok(sect.length > 100, "#payout section present");
  return { dict, sect };
}

/** Extract an element's innerHTML for data-i18n=k via depth tracking (no regex balancing). */
function enDefault(sect, k) {
  const i = sect.indexOf(`data-i18n="${k}"`);
  if (i === -1) return null;
  const gt = sect.indexOf(">", i);
  let depth = 1;
  for (let j = gt + 1; j < sect.length; ) {
    const lt = sect.indexOf("<", j);
    if (lt === -1) return null;
    if (sect.startsWith("</", lt)) depth--;
    else if (sect[lt + 1] !== "!" && sect[lt + 1] !== "/") depth++;
    const close = sect.indexOf(">", lt);
    if (depth === 0) return sect.slice(gt + 1, lt);
    j = close + 1;
  }
  return null;
}

function tagSeq(s) {
  return (s.match(/<\/?[a-z][^>]*>/g) || []).join("");
}

function balanced(s) {
  for (const t of ["b", "span", "a"]) {
    const o = (s.match(new RegExp("<" + t + "(\\s|>)", "g")) || []).length;
    const c = (s.match(new RegExp("</" + t + ">", "g")) || []).length;
    if (o !== c) return false;
  }
  return true;
}

const arabic = /[\u0600-\u06FF]/;

function pairingViolations(dict, sect) {
  const violations = [];
  const used = [...sect.matchAll(/data-i18n="(\w+)"/g)].map((m) => m[1]);
  const need = [...new Set(used)];
  for (const k of need) {
    if (!dict[k]) { violations.push(`${k}: missing from dictionary`); continue; }
    const en = enDefault(sect, k);
    if (en == null) { violations.push(`${k}: EN default not extractable`); continue; }
    if (tagSeq(en) !== tagSeq(dict[k])) violations.push(`${k}: EN/AR inline-tag sequences differ`);
    if (!balanced(en) || !balanced(dict[k])) violations.push(`${k}: unbalanced tags`);
    if (arabic.test(en)) violations.push(`${k}: EN default contains Arabic`);
    if (!arabic.test(dict[k])) violations.push(`${k}: AR value lacks Arabic`);
  }
  for (const k of Object.keys(dict)) {
    if (!need.includes(k)) violations.push(`${k}: dictionary key unused by markup`);
  }
  const dupes = used.filter((k, i) => used.indexOf(k) !== i);
  for (const k of new Set(dupes)) violations.push(`${k}: data-i18n key used more than once`);
  return violations;
}

test("contract: every payout data-i18n key is in the dictionary, exactly once", () => {
  const html = readFileSync(PAGE, "utf8");
  const { dict, sect } = loadParts(html);
  const used = [...html.matchAll(/data-i18n="(\w+)"/g)].map((m) => m[1]);
  const need = [...new Set(used)];
  assert.ok(need.length >= 10, `expected the full payout key set, found ${need.length}`);
  for (const k of need) assert.ok(dict[k], `key missing from dictionary: ${k}`);
  assert.deepEqual(used.filter((k, i) => used.indexOf(k) !== i), [], "duplicate data-i18n keys");
  assert.deepEqual(Object.keys(dict).filter((k) => !need.includes(k)), [], "unused dictionary keys");
});

test("contract: EN defaults and AR values are structurally paired (same inline tags)", () => {
  const html = readFileSync(PAGE, "utf8");
  const { dict, sect } = loadParts(html);
  assert.deepEqual(pairingViolations(dict, sect), []);
});

test("lifecycle: cg41:lang applies Arabic and restores the EN default", async () => {
  const html = readFileSync(PAGE, "utf8");
  const tmp = mkdtempSync(join(tmpdir(), "dash-i18n-"));
  const page = join(tmp, "dash.html");
  writeFileSync(page, html);
  try {
    // The i18n prelude is the part under this contract; the tamper demo's
    // DOM interactions are out of scope here (parse-tested separately).
    // Slice back to the opening "/*" of the TAMPER DEMO banner so the
    // prelude ends at a block-comment boundary, not inside one.
    const { script } = extractScript(html);
    const cut = script.lastIndexOf("/*", script.indexOf("TAMPER DEMO"));
    const prelude = script.slice(0, cut);
    assert.ok(prelude.includes("PAYOUT_GATE_I18N"), "prelude slice contains the dictionary");

    const vm = await import("node:vm");
    const applied = [];
    const listeners = {};
    const sandbox = {
      window: { cgLang: undefined },
      document: {
        documentElement: { setAttribute: (n, v) => applied.push([n, v]) },
        querySelectorAll: () => [], // no live DOM → innerHTML swaps skipped, attrs still applied
        addEventListener: (t, fn) => { listeners[t] = fn; },
      },
    };
    vm.createContext(sandbox);
    vm.runInContext(prelude, sandbox, { timeout: 2000 });

    // Initial application: default EN, LTR (the governance board's default is unchanged).
    assert.deepEqual(applied.slice(0, 2), [["lang", "en"], ["dir", "ltr"]]);

    // Toggle: set cgLang=ar and fire the documented event → Arabic applied, RTL set.
    sandbox.window.cgLang = "ar";
    assert.ok(listeners["cg41:lang"], "prelude registers the cg41:lang listener");
    listeners["cg41:lang"]({ type: "cg41:lang" });
    assert.ok(applied.some(([n, v]) => n === "lang" && v === "ar"), "lang=ar applied");
    assert.ok(applied.some(([n, v]) => n === "dir" && v === "rtl"), "dir=rtl applied");

    // Restore: EN again → LTR (idempotent round trip).
    sandbox.window.cgLang = "en";
    listeners["cg41:lang"]({ type: "cg41:lang" });
    const lastLang = applied.filter(([n]) => n === "lang").at(-1);
    const lastDir = applied.filter(([n]) => n === "dir").at(-1);
    assert.deepEqual([lastLang, lastDir], [["lang", "en"], ["dir", "ltr"]]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

function extractScript(html) {
  const ss = html.indexOf("<script>") + 8;
  const se = html.indexOf("</" + "script>", ss);
  return { script: html.slice(ss, se) };
}

test("contract: page script (i18n prelude + tamper demo) parses", () => {
  const html = readFileSync(PAGE, "utf8");
  const { script } = extractScript(html);
  const tmp = mkdtempSync(join(tmpdir(), "dash-js-"));
  const f = join(tmp, "page.js");
  writeFileSync(f, script);
  try {
    execFileSync(NODE, ["--check", f], { encoding: "utf8" });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("fail-closed: a dropped <b> in an AR value fails the pairing check, named by key", () => {
  const html = readFileSync(PAGE, "utf8");
  const { dict, sect } = loadParts(html);
  // Hostile tamper: flatten one emphasized phrase in the AR law of the gate.
  const broken = { ...dict, pg_gate_d: dict.pg_gate_d.replace(/<\/?b>/g, "") };
  const violations = pairingViolations(broken, sect);
  assert.ok(violations.some((v) => v.startsWith("pg_gate_d:")),
    `expected a pg_gate_d violation, got: ${JSON.stringify(violations)}`);
});
