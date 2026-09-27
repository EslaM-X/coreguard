// ============================================================================
// EXECUTABLE CONTRACT — coreguard-gate41-visual.html bilingual dictionary
// ----------------------------------------------------------------------------
// AGENTS.md asserted for several cycles that the AR/EN dashboard pair is paired
// "637/637" by structural pairing. Nothing in the tree ever checked 637, and the
// figure is dead - so the pair was, as v0.5.27 recorded, unverified BY MACHINE.
// The invariant that is real is different, and this file pins it:
//
//   the page ships ONE runtime dictionary, D = {"nodes": { "<key>":
//   {ar, en} }, "attrs": ...}, and apply() iterates it replacing
//   [data-i18n="<key>"] .innerHTML. The contract is therefore a BIJECTION:
//   every key the markup uses has an entry, and every entry is used.
//
// Measured today: 277 static markup keys <-> 277 entries, 0 missing, 0 orphan.
//
// Two things that LOOK like defects and are not, recorded so a future session
// does not "fix" them:
//
//   1. Three entries (84, 93, 104) have an .ar with no Arabic: they are the
//      bare arrows "<-" and "->". That is CORRECT - the page is RTL, so the
//      directional glyph flips. The rule below is "an .ar without Arabic must be
//      language-neutral", not "must contain Arabic".
//   2. Twenty-nine entries embed a NESTED data-i18n attribute inside their .ar
//      value (e.g. entry 5 carries <span data-i18n="6">). The outer entry
//      replaces innerHTML wholesale, so the inner attribute is redundant and
//      order-dependent - but because the same key also appears in static markup
//      (the bijection proves it), nothing is orphaned and the page renders
//      correctly. This is pinned as a COUNT, not asserted as zero: changing it
//      is a change to a live investor-facing page and must be a deliberate act.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const PAGE_REL = "docs/coreguard-gate41-visual.html";
const PAGE = join(REPO, PAGE_REL);

const html = readFileSync(PAGE, "utf8");

// The page's own runtime dictionary, read out of its source with brace matching
// (no eval of page logic, no jsdom): `var D = { ... }` is a single literal.
function extractDictionary() {
  const m = /(?:var|const|let)\s+D\s*=\s*\{/.exec(html);
  assert.ok(m, "the page no longer declares the runtime dictionary `D`");
  let i = m.index + m[0].length;
  let depth = 1;
  const start = i;
  while (i < html.length && depth > 0) {
    const c = html[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    i++;
  }
  assert.ok(depth === 0, "the dictionary literal is unbalanced - brace matching ran off the end");
  return eval("({" + html.slice(start, i - 1) + "})");
}

const D = extractDictionary();
const nodes = D.nodes || {};

// Static markup keys only. The one false positive is apply()'s own runtime
// selector `[data-i18n="' + k + '"]`, which is code, not markup - counting it
// would make the "key" literally "' + k + '" and the bijection meaningless.
const markupKeys = [
  ...new Set(
    html
      .split(/\r?\n/)
      .filter((l) => !/querySelector\(\s*['"`]\[data-i18n=/.test(l))
      .join("\n")
      .match(/data-i18n="([^"]+)"/g)
      .map((m) => m.slice('data-i18n="'.length, -1))
  ),
];
const entryKeys = Object.keys(nodes);

const ARABIC = /[\u0600-\u06FF]/;
// "language-neutral" must NOT mean "any ASCII": a first draft allowed letters,
// spaces and punctuation, so pasting a whole English sentence into the ar slot
// passed (caught by negative control NC5). The real distinction is WORDS - a
// bare directional glyph, a number, a path or a tag is neutral; two consecutive
// ASCII letters are a word, and a word in the ar slot is an untranslated string.
const WORD = /[A-Za-z]{2,}/;

test("every markup data-i18n key has a dictionary entry, and vice versa", () => {
  const missing = markupKeys.filter((k) => !(k in nodes));
  const orphan = entryKeys.filter((k) => !markupKeys.includes(k));
  assert.deepEqual(missing, [], `markup keys with no entry: ${missing.join(", ")}`);
  assert.deepEqual(orphan, [], `entries no markup key uses: ${orphan.join(", ")}`);
  assert.equal(
    markupKeys.length,
    entryKeys.length,
    `bijection broken: ${markupKeys.length} markup keys vs ${entryKeys.length} entries`
  );
});

test("the key count is what the dictionary actually holds", () => {
  // A guard that never states a number cannot notice the dictionary shrinking.
  assert.equal(markupKeys.length, 277, `markup key count changed: ${markupKeys.length}`);
  assert.equal(entryKeys.length, 277, `entry count changed: ${entryKeys.length}`);
  assert.ok(markupKeys.every((k) => /^\d+$/.test(k)), "keys are numeric node ids; a new style means re-reading this contract");
});

test("every entry carries a non-empty ar and en", () => {
  const badAr = entryKeys.filter((k) => typeof nodes[k].ar !== "string" || !nodes[k].ar.trim());
  const badEn = entryKeys.filter((k) => typeof nodes[k].en !== "string" || !nodes[k].en.trim());
  assert.deepEqual(badAr, [], `entries with an empty/absent .ar: ${badAr.join(", ")}`);
  assert.deepEqual(badEn, [], `entries with an empty/absent .en: ${badEn.join(", ")}`);
});

test("no .en leaks Arabic, and an .ar without Arabic is language-neutral", () => {
  // The EN side of a bilingual page that still shows Arabic is a broken mirror.
  const enLeaks = entryKeys.filter((k) => ARABIC.test(nodes[k].en));
  assert.deepEqual(enLeaks, [], `.en contains Arabic: ${enLeaks.join(", ")}`);

  // NOT "every .ar must contain Arabic": the RTL arrow glyphs 84/93/104 are
  // correct without it. The rule is that a non-Arabic .ar must carry no WORD -
  // so a whole English sentence pasted into the ar slot is caught, while the
  // bare "<-" is not.
  const arWithoutArabic = entryKeys.filter((k) => !ARABIC.test(nodes[k].ar));
  assert.ok(arWithoutArabic.length > 0, "the language-neutral arrow entries disappeared - re-check this rule");
  const withWords = arWithoutArabic.filter((k) => WORD.test(nodes[k].ar));
  assert.deepEqual(
    withWords,
    [],
    `.ar has no Arabic and contains a word: ${withWords.map((k) => `${k}=${JSON.stringify(nodes[k].ar)}`).join(", ")}`
  );
});

test("the nested-attribute divergence is pinned, not silently changed", () => {
  // These 29 embed data-i18n inside their own .ar value. Harmless today, latent
  // order-dependence tomorrow. The count is asserted so a change is a decision
  // someone makes on purpose rather than an edit that lands unnoticed.
  const nested = entryKeys.filter((k) => /\bdata-i18n\s*=/.test(nodes[k].ar));
  assert.equal(
    nested.length,
    29,
    `nested-attribute entries changed: ${nested.length} (was 29). Removing them means also confirming each inner key still appears in static markup.`
  );
  // and each nested key must ALSO exist in the markup, or the inner entry is
  // only reachable through a value that gets overwritten
  for (const k of nested) {
    const inner = [...nodes[k].ar.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]);
    const orphans = inner.filter((ik) => !markupKeys.includes(ik));
    assert.deepEqual(orphans, [], `entry ${k} nests a key used by no markup: ${orphans.join(", ")}`);
  }
});

test("the page's own switcher drives this dictionary", () => {
  // [C27]: pin the verifier and the artifact to the SAME channel. If apply() ever
  // stops iterating D.nodes, every check above still passes while the page stops
  // translating - so assert the mechanism, not just the data.
  assert.ok(
    /for\s*\(\s*var\s+k\s+in\s+D\.nodes\s*\)/.test(html),
    "apply() no longer iterates D.nodes - the dictionary would be dead weight"
  );
  assert.ok(
    html.includes(`[data-i18n="' + k + '"]`),
    "apply() no longer selects [data-i18n] by the iterated key"
  );
  assert.ok(D.attrs, "the dictionary's attrs block is gone; attribute swaps are unverified");
});
