import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The Debugging Breakthroughs section of AGENTS.md is a cost-ranked index:
 * every `| C# |` table row must have exactly one matching detailed
 * `- [C#] **…**:` lesson, and both lists must stay highest-cost first.
 *
 * This balance already broke once in practice: documenting [C24], a
 * replace-instead-of-insert edit swapped the whole [C23] lesson out of the
 * file — only a pre-commit review of `git diff --cached` caught it, and the
 * same class had silently mangled test files before. This contract makes the
 * class unshippable: a dropped lesson, an index row without a lesson, a
 * duplicate tag, or a broken cost ranking now fails the push by name.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const MD = readFileSync(join(REPO, "AGENTS.md"), "utf8").replaceAll("\r\n", "\n");

const SECTION_START = MD.indexOf("## Debugging Breakthroughs & Misleading Errors");
const SECTION_END = MD.indexOf("## Files That Change Together");
const SECTION = SECTION_START >= 0 && SECTION_END > SECTION_START
  ? MD.slice(SECTION_START, SECTION_END)
  : "";

const TABLE_START = SECTION.indexOf("| Rank | Entry |");
const LESSONS_START = SECTION.indexOf("- [C");

/** `| C23 | … |` rows from the cost-ranked table, in document order. */
function tableIds() {
  if (TABLE_START < 0) return [];
  const table = SECTION.slice(TABLE_START, LESSONS_START > TABLE_START ? LESSONS_START : undefined);
  return [...table.matchAll(/^\| (C\d+) \|/gm)].map((m) => m[1]);
}

/** `- [C24] **…**` lesson tags from the detail list, in document order. */
function lessonIds() {
  if (LESSONS_START < 0) return [];
  return [...SECTION.slice(LESSONS_START).matchAll(/^-\s*\[(C\d+)\]\s*\*\*/gm)].map((m) => m[1]);
}

function duplicates(ids) {
  return ids.filter((id, i) => ids.indexOf(id) !== i);
}

test("agents index: every C# table row has exactly one detailed lesson, and vice versa", () => {
  assert.ok(SECTION_START >= 0, "Debugging Breakthroughs section missing from AGENTS.md");
  assert.ok(SECTION_END > SECTION_START, "Debugging Breakthroughs section lost its end delimiter");
  assert.ok(TABLE_START > 0 && LESSONS_START > TABLE_START,
    "section structure: the cost-ranked table must precede the detailed lessons");

  const t = tableIds();
  const l = lessonIds();
  assert.ok(t.length >= 20, `index table unexpectedly small (${t.length} rows) — structure changed?`);
  assert.deepEqual(duplicates(t), [], "duplicate C# rows in the index table");
  assert.deepEqual(duplicates(l), [], "duplicate detailed lessons for the same C# tag");

  const rowsWithoutLesson = t.filter((id) => !l.includes(id));
  assert.deepEqual(rowsWithoutLesson, [],
    "index rows without a detailed lesson — a lesson was likely destroyed by a replace-instead-of-insert edit");

  const lessonsWithoutRow = l.filter((id) => !t.includes(id));
  assert.deepEqual(lessonsWithoutRow, [],
    "detailed lessons missing their index row — add the | C# | table line");
});

test("agents index: both lists stay cost-ranked (C1 = costliest, ascending tag order)", () => {
  // The section preamble ranks by session cost, "highest first" — and C1 is
  // the costliest, so that convention means ASCENDING tag numbers in both
  // lists (C1, C2, … Cn). New entries belong at the END (append after the
  // last lesson), never interleaved into the middle.
  const t = tableIds().map((id) => Number(id.slice(1)));
  const l = lessonIds().map((id) => Number(id.slice(1)));
  assert.ok(t.length > 0 && l.length > 0, "empty index — structure changed?");
  assert.deepEqual(t, [...t].sort((a, b) => a - b),
    "index table must stay ascending by tag (C1 = highest session cost first)");
  assert.deepEqual(l, [...l].sort((a, b) => a - b),
    "detailed lessons must stay ascending by tag — append new lessons at the end, never between existing ones");
});

test("agents index: the tag sequence has no gaps — a missing number is a destroyed lesson, not a renumbering style", () => {
  // The measured failure this closes: a merge edit swallowed the whole [C33]
  // bullet into the tail of [C34]'s line — same push, same file, invisible to
  // the pairing tests above, because a bijection between the survivors proves
  // that they agree with each OTHER, never that the sequence is complete:
  // duplicates are asserted away, an unnumbered gap is not a pair, and the
  // ranking test sorts instead of requiring density. Rule: C1..Cmax must ALL
  // be present; a superseded lesson reuses its tag, it is never retired.
  const all = [...tableIds(), ...lessonIds()].map((id) => Number(id.slice(1)));
  assert.ok(all.length > 0, "empty index — structure changed?");
  const max = Math.max(...all);
  const missing = [];
  for (let n = 1; n <= max; n++) if (!all.includes(n)) missing.push("C" + n);
  assert.deepEqual(missing, [],
    "tag sequence has gaps: " + missing.join(", ") + " — a numbered lesson was destroyed or renamed; restore it under its own tag (measured case: [C35])");
});

test("agents index: every detailed lesson title is bolded — the ** marker is how the extractor tells a lesson from prose", () => {
  // lessonIds() only recognizes "- [C#] **…"; a title that loses its bold
  // markers stops being a lesson to this contract and would surface as a
  // missing-row failure in the pairing test — but the actual defect is style
  // drift, and it deserves to be named as what it is.
  const unbolded = [...SECTION.slice(LESSONS_START).matchAll(/^- \[(C\d+)\](?!\s*\*\*)/gm)].map((m) => m[1]);
  assert.deepEqual(unbolded, [],
    "lesson entries without the bolded (**…**) title the contract keys on: " + unbolded.join(", "));
});
