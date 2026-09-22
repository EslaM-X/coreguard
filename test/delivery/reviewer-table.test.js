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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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

// ---------------------------------------------------------------------------
// real-fixture-intake kit — the same contract, second table.
//
// The intake README documents the operator path a REAL case travels
// (build → gate → convert → verify → red refusal). Its rows are parsed from
// that table, executed live against the real tools in a temp workspace in
// procedure order, and matched verbatim after folding only per-run variable
// values (workspace paths, the archive hash) into the table's placeholders.
// A reworded gate line, a changed exit contract, or a converter that starts
// overwriting outputs goes red here, naming the row.

const INTAKE_DIR = join(REPO, "examples", "real-fixture-intake");
const INTAKE_README = join(INTAKE_DIR, "README.md");
const MAKE = join(INTAKE_DIR, "make-intake-candidate.mjs");
const PRELUDE = join(INTAKE_DIR, "prelude.mjs");
const CONVERT = join(INTAKE_DIR, "convert-to-fixture.mjs");

function parseIntakeRows() {
  const md = readFileSync(INTAKE_README, "utf8").replaceAll("\r\n", "\n");
  const lines = md.split("\n");
  const header = lines.findIndex((l) => l.startsWith("| Command | Proves | Expected verdict"));
  assert.ok(header !== -1, "intake README lost its reviewer-commands table");
  const rows = [];
  for (let i = header + 2; i < lines.length && lines[i].startsWith("|"); i++) {
    const cells = lines[i].split("|");
    rows.push({
      cmd: (cells[1].match(/`([^`]+)`/) || [])[1],
      expected: (cells[3].match(/`([^`]+)`/) || [])[1],
    });
  }
  return rows;
}

test("intake kit reviewer table: documented verdict lines match the live tools", () => {
  const rows = parseIntakeRows();
  assert.ok(rows.length >= 6, `expected >=6 intake rows in the reviewer table, found ${rows.length} — the table lost coverage`);

  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.cmd)) groups.set(row.cmd, []);
    groups.get(row.cmd).push(row);
  }

  // One workspace shared by the whole documented procedure, in row order.
  const ws = mkdtempSync(join(tmpdir(), "intake-reviewer-table-"));
  const candidate = join(ws, "candidate");
  const outDir = join(ws, "fixture-dir");
  const zipPath = join(ws, "attachment.zip");
  const redCandidate = join(ws, "red-candidate");
  const redOut = join(ws, "never");
  mkdirSync(redCandidate); // empty candidate → the gate must refuse it

  try {
    const run = (args) => spawnSync(process.execPath, args, { cwd: REPO, encoding: "utf8" });
    const sdkSnippet =
      "import('./packages/delivery/sdk.js').then(m => m.verifyFixture({ fixtureDir: process.argv[1] })).then(r => { console.log(r.status, r.decision); process.exit(r.status === 'VERIFIED' ? 0 : 1); })";

    // Per documented command: the live invocation, its expected exit, and
    // the normalizer folding variable values into the table's placeholders.
    const cases = {
      "make-intake-candidate.mjs <candidate-dir>": { args: [MAKE, candidate], status: 0 },
      "prelude.mjs <candidate-dir>": { args: [PRELUDE, candidate], status: 0 },
      "convert-to-fixture.mjs <candidate-dir> <out-dir>": { args: [CONVERT, candidate, outDir], status: 0 },
      "convert-to-fixture.mjs <candidate-dir> --out-zip <archive.zip>": { args: [CONVERT, candidate, "--out-zip", zipPath], status: 0 },
      "verifyFixture({ fixtureDir: '<out-dir>' })": {
        args: ["--input-type=module", "-e", sdkSnippet, outDir], status: 0,
      },
      "convert-to-fixture.mjs <red candidate> <out-dir>": {
        args: [CONVERT, redCandidate, redOut], status: 1, outDirMustStayAbsent: true,
      },
    };

    assert.deepEqual(
      [...groups.keys()].sort(),
      Object.keys(cases).sort(),
      "intake table commands and live handlers must correspond 1:1 — a new row needs a live handler, a removed row needs its handler dropped",
    );

    for (const [cmd, rowsForCmd] of groups) {
      const spec = cases[cmd];
      const r = run(spec.args);
      assert.equal(
        r.status,
        spec.status,
        `live run for "${cmd}" must exit ${spec.status}:\n${r.stdout}\n${r.stderr}`,
      );
      if (spec.outDirMustStayAbsent) {
        assert.ok(!existsSync(redOut), `red candidate must not create ${redOut} — the converter wrote something`);
      }
      const lines = ((r.stdout ?? "") + (r.stderr ?? ""))
        .split("\n")
        .map((l) =>
          l
            .replaceAll("\\", "/")
            .replaceAll(join(ws, "candidate").replaceAll("\\", "/"), "<candidate-dir>")
            .replaceAll(join(ws, "fixture-dir").replaceAll("\\", "/"), "<out-dir>")
            .replaceAll(join(ws, "never").replaceAll("\\", "/"), "<out-dir>")
            .replace(/sha256 0x[0-9a-f]+/, "sha256 0x…")
            .trim(),
        );
      for (const row of rowsForCmd) {
        assert.ok(
          lines.includes(row.expected),
          `intake reviewer table drifted from live behavior:\n` +
            `  command    : ${cmd}\n` +
            `  table says : ${row.expected}\n` +
            `  live output: ${lines.filter((l) => l.length > 0).slice(-8).join(" ⏎ ")}`,
        );
      }
    }
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});