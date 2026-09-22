/**
 * Reviewer-table contract — the README's expected verdict lines are matched
 * against the LIVE runner output, so the table cannot drift from behavior.
 *
 * The reviewer-commands table in examples/delivery-fixture/README.md quotes
 * exact verdict lines ("mutations: 10 · caught: 10 · survived: 0", …). This
 * test parses those rows FROM THE TABLE ITSELF (no duplicated expectations
 * here), runs each documented command against the real adversarial runner,
 * normalizes only the inherently variable values (commit-derived seed,
 * seed-list contents, max-cycle timing) into the table's placeholders, and
 * demands the documented line appear verbatim in the live output.
 *
 * Drift this catches: a reworded or re-spaced summary line, a changed
 * default (rounds/budget/cycle count), a broken placeholder, a renamed
 * field — the table goes stale, this goes red naming the row. The table is
 * the expectation; the runner is the truth; the cycle-count literal (66 =
 * 1 control + 10 mutations + 5 batteries + 50 fuzz rounds) is structural
 * and MUST stay literal so an added mutation forces an honest table update.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const README = join(REPO, "examples", "delivery-fixture", "README.md");
const RUNNER = join(REPO, "examples", "delivery-fixture", "adversarial-runner.mjs");

/** The reviewer-commands table's adversarial-runner rows, parsed live from
 *  the README. Each row: { cmd (first backtick span of the command cell),
 *  expected (first backtick span of the expected-verdict cell) }. */
function parseRunnerRows() {
  const md = readFileSync(README, "utf8").replaceAll("\r\n", "\n");
  return md
    .split("\n")
    .filter((l) => l.startsWith("| `adversarial-runner.mjs"))
    .map((line) => {
      const cells = line.split("|");
      const cmd = (cells[1].match(/`([^`]+)`/) || [])[1];
      const expected = (cells[3].match(/`([^`]+)`/) || [])[1];
      return { cmd, expected };
    });
}

test("reviewer table: adversarial-runner verdict lines match live runner output", () => {
  const rows = parseRunnerRows();
  assert.ok(rows.length >= 6, `expected >=6 adversarial-runner rows in the reviewer table, found ${rows.length} — the table lost coverage`);

  // Group rows by documented command; the two "(same run)" rows share one
  // command and therefore one live run.
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.cmd)) groups.set(row.cmd, []);
    groups.get(row.cmd).push(row);
  }

  // Per documented command: the live invocation and the normalizer that
  // folds variable values into the table's placeholders. Nothing else is
  // normalized — a reworded or re-spaced verdict line must fail here.
  const cases = {
    "adversarial-runner.mjs": { args: [], normalize: (s) => s },
    "adversarial-runner.mjs --fuzz 50": { args: ["--fuzz", "50"], normalize: (s) => s },
    "adversarial-runner.mjs --fuzz 25 --seed <commit-derived>": {
      args: ["--fuzz", "25", "--seed", "777000"],
      normalize: (s) => s.replace(/seed \d+/, "seed <N>"),
    },
    "adversarial-runner.mjs --fuzz 50 --seeds <s1,s2,…>": {
      args: ["--fuzz", "50", "--seeds", "424242,777"],
      normalize: (s) => s.replace(/fuzz x\d+/, "fuzz xN").replace(/over seeds \[[^\]]*\]/, "over seeds […]"),
    },
    "adversarial-runner.mjs --fuzz 50 --budget-ms 250": {
      args: ["--fuzz", "50", "--budget-ms", "250"],
      normalize: (s) => s.replace(/max [\d.]+ms/, "max <max-ms>ms").replace(/total \d+ms/, "total <total-ms>ms"),
    },
  };

  assert.deepEqual(
    [...groups.keys()].sort(),
    Object.keys(cases).sort(),
    "table commands and live handlers must correspond 1:1 — a new runner row needs a live handler, a removed row needs its handler dropped",
  );

  for (const [cmd, rowsForCmd] of groups) {
    const spec = cases[cmd];
    const r = spawnSync(process.execPath, [RUNNER, ...spec.args], { cwd: REPO, encoding: "utf8" });
    assert.equal(r.status, 0, `live run for "${cmd}" must succeed:\n${r.stdout}\n${r.stderr}`);
    const lines = ((r.stdout ?? "") + (r.stderr ?? "")).split("\n").map(spec.normalize);
    for (const row of rowsForCmd) {
      assert.ok(
        lines.includes(row.expected),
        `reviewer table drifted from live behavior:\n` +
          `  command      : ${cmd}\n` +
          `  table says   : ${row.expected}\n` +
          `  live summary : ${lines.filter((l) => /survived|perf|gate cycles/.test(l)).join(" ⏎ ")}`,
      );
    }
  }
});
