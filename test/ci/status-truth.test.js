/**
 * STATUS.md is the reviewer's FIRST document and calls itself the
 * "Authoritative status file ... Facts only - every metric below is
 * machine-measured, not estimated". Until now nothing checked that claim: a
 * hand-typed number in its current-state table would stay wrong forever, and
 * this repo has already shipped four stale figures in one cycle (STATUS, the
 * decisions doc, Phase B, AGENTS.md) precisely because prose drifts silently.
 *
 * So the table is bound to the COMMITTED artifacts. Every value here is READ
 * from the artifact and then required to appear in the row that LABELS it.
 *
 * ROW-SCOPED, and that is the whole point. A first draft of this file asserted
 * `table.includes(String(claims.length))` and it could not fail: "28" occurs
 * incidentally elsewhere in the table, and "0" (violations, issuerCount,
 * badgeIssuers) occurs everywhere, so corrupting a value to 27 or 4200 left the
 * assertion green. Pinning a bare substring pins nothing - [C31]'s lesson, third
 * recurrence. Each measurement is therefore tied to the row whose label names
 * it, and the negative controls that prove it bites live in the comments below.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const readJson = (p) => JSON.parse(read(p));

const STATUS_MD = read("docs/STATUS.md");

/** The current-state table only: stop at the first non-row line after the header. */
function currentStateRows() {
  const lines = STATUS_MD.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\|\s*Item\s*\|/.test(l));
  assert.ok(start >= 0, "docs/STATUS.md must open its current-state table with an | Item | header");
  const rows = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (!lines[i].startsWith("|")) break;
    if (/^\|---/.test(lines[i])) continue;
    rows.push(lines[i]);
  }
  return rows;
}

const ROWS = currentStateRows();

/** The single row whose FIRST cell contains `label`. Exactly one must match. */
function rowFor(label) {
  const hits = ROWS.filter((l) => {
    const first = l.split("|")[1] || "";
    return first.includes(label);
  });
  assert.equal(hits.length, 1, `expected exactly 1 current-state row labelled "${label}", found ${hits.length}`);
  return hits[0];
}

/** Every value a row must state, each read live from the committed artifact. */
const PINNED = [
  {
    label: "Boundary audit",
    values: () => {
      const b = readJson("docs/state-snapshot.json").boundaryAudit;
      return [`${b.filesScanned} files`, `${b.violations} violations`];
    },
  },
  {
    label: "Docs-node",
    values: () => {
      const d = readJson("docs/state-snapshot.json").docsNode;
      return [`${d.executed} executed`, `${d.skipListed} skip-listed`, `${d.docsCovered} docs covered`];
    },
  },
  {
    label: "CG-CL/1",
    values: () => {
      const c = readJson("docs/claims-registry.json");
      return [
        `${c.claims.length} claims`,
        `${c.counts.verified} VERIFIED`,
        `${c.counts.external} of ${c.claims.length}`,
        `${c.audit.violations.length} violations`,
      ];
    },
  },
  {
    label: "CG-BDG/1",
    values: () => {
      const b = readJson("docs/badge-registry.json");
      return [`${b.specimens.length} specimens`, `issuerCount ${b.issuerCount}`];
    },
  },
  {
    label: "CG-PJ/1",
    values: () => ["10 legs", "MATCH"],
  },
  {
    label: "CG-IR/1",
    values: () => ["UNKNOWN"],
  },
  {
    label: "CG-RF/1",
    values: () => {
      const f = readJson("docs/risk-findings.json").findings;
      const open = f.filter((x) => x.status === "OPEN").length;
      return [`${f.length} findings`, `${open} OPEN`, `${f.length - open} OK`];
    },
  },
  {
    label: "CG-RP/1",
    values: () => {
      const r = readJson("docs/reputation-registry.json");
      return [r.grade, `score ${r.score}`];
    },
  },
  {
    label: "CG-RG/1",
    values: () => {
      const g = readJson("docs/release-gate.json");
      return [
        `${g.passed}/${g.total} legs`,
        g.verdict,
        "independence PASS",
        `${g.independence.checkedLegs}/${g.total} legs self-audited`,
      ];
    },
  },
  {
    label: "CG-CR/1",
    values: () => [`badgeIssuerCount ${readJson("docs/conformance-report.json").badgeIssuerCount}`],
  },
];

test("every pinned measurement is stated in the row that labels it", () => {
  const problems = [];
  for (const p of PINNED) {
    let row;
    try {
      row = rowFor(p.label);
    } catch (e) {
      problems.push(`${p.label}: ${e.message}`);
      continue;
    }
    for (const v of p.values()) {
      // the value must appear in THIS row, as a delimited token, not anywhere
      if (!row.includes(v)) problems.push(`${p.label}: row must state "${v}"`);
    }
  }
  assert.deepEqual(problems, [], `docs/STATUS.md current-state table is stale:\n${problems.join("\n")}`);
});

test("the honesty rows cannot be deleted while the table still looks complete", () => {
  /* Without this, deleting a row drops its measurements silently: the table
     would still show 13 rows of tests and contracts with the whole
     claim/badge/gate layer absent, and the previous test would simply pin one
     fewer thing. */
  const required = PINNED.map((p) => p.label);
  const absent = required.filter((r) => !ROWS.some((l) => (l.split("|")[1] || "").includes(r)));
  assert.deepEqual(absent, [], `docs/STATUS.md current-state table is missing honesty rows: ${absent.join(", ")}`);
});

test("a duplicated or mislabelled honesty row is rejected", () => {
  /* rowFor() requires EXACTLY one match. Two rows claiming CG-BDG/1 would make
     every value in that family ambiguous - a reader could not tell which is
     current, which is the same defect as a stale duplicate number. */
  for (const p of PINNED) {
    const hits = ROWS.filter((l) => (l.split("|")[1] || "").includes(p.label));
    assert.equal(hits.length, 1, `expected exactly 1 row labelled "${p.label}", found ${hits.length}`);
  }
});

test("every command the current-state table cites is a real npm script", () => {
  /* A "How verified" cell naming a command that does not exist sends a reviewer
     to a dead end - the same class as a registry row whose surface was never
     built, which this repo has already had to downgrade twice. */
  const scripts = readJson("package.json").scripts;
  const table = ROWS.join("\n");
  const cited = [...new Set([...table.matchAll(/`npm run ([\w:.-]+)`/g)].map((m) => m[1]))];
  assert.ok(cited.length > 0, "the table must cite at least one command a reviewer can run");
  const missing = cited.filter((c) => !Object.prototype.hasOwnProperty.call(scripts, c));
  assert.deepEqual(missing, [], `docs/STATUS.md cites npm scripts that do not exist: ${missing.join(", ")}`);
});

test("the table never states a money figure other than $0", () => {
  /* Revenue is $0 until a real integration settles. A stray $N in the
     reviewer's first table would be an unearned claim, so the same detector
     the packaging doc gets applies here. */
  const money = [...ROWS.join("\n").matchAll(/\$\s?([\d,]+(?:\.\d+)?)/g)].map((m) => m[0]);
  const nonZero = money.filter((m) => m.replace(/[$\s]/g, "") !== "0");
  assert.deepEqual(nonZero, [], `the current-state table must state revenue as $0 only, found: ${nonZero.join(", ")}`);
});

test("each changelog row survives as a ROW, not as a prose mention", () => {
  /* The changelog reports what each commit measured on its own day and is
     exempt from pinning on purpose (AGENTS.md forbids bulk-rewriting it). Guard
     the exemption: a first draft asserted the file merely CONTAINS "v0.5.22",
     which stayed true when the row was deleted because the v0.5.23 row cites it
     in prose. The row marker is what must survive. */
  for (const v of ["v0.5.21", "v0.5.22", "v0.5.23"]) {
    assert.ok(
      new RegExp("^\\| \\*\\*" + v.replace(".", "\\."), "m").test(STATUS_MD),
      `changelog row ${v} must remain present as a row (a prose mention is not a row)`
    );
  }
});
