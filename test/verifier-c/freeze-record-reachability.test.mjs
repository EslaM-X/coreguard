// ============================================================================
// EXECUTABLE CONTRACT — freeze-record reachability
// ----------------------------------------------------------------------------
// A freeze record pins a sha256 for every file in its scope. Those pins only
// mean something while the bytes can be produced, and there are two ways to
// produce them: the file is in the current tree, or it is recoverable from a
// commit. AGENTS.md asserted a THIRD, weaker thing - that deleting a pinned doc
// makes the record "unverifiable for those entries". That claim is false, and
// it was false for the whole time the two files were already gone:
//
//   136 pins across 5 records. 134 are in the current tree. 2 are not:
//   4.2.5's engine-semantics-contract.md and external-evidence-model.md,
//   removed in 5a89f2b - the same commit that introduced 4.2.6. Both recorded
//   hashes still match the blobs at 5a89f2b~1, so the entries are verifiable
//   from history and only tree-reachability was lost.
//
// So the rule this file enforces is the accurate one: every pin is either in
// the tree or hash-verifiable from a ref, AND every pin that is absent from the
// tree is named in the ACTIVE record's scopeGapsClosed with that ref, so the
// recovery pointer is documented rather than folklore. Deleting the note fails
// the build, which is the point - a silent deletion is how a pin becomes
// unverifiable for real.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const PLATFORM = join(REPO, "coreguard-assurance-v4.2.2-remediation");
const FREEZE_DIR = join(PLATFORM, "release", "freeze");

const records = readdirSync(FREEZE_DIR)
  .filter((f) => /^freeze-record-.*\.json$/.test(f))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(FREEZE_DIR, f), "utf8")));

// git addresses paths with forward slashes on every platform; path.join hands
// it backslashes on Windows and every lookup fails with "path does not exist",
// which is indistinguishable from a genuinely missing file. It also wants the
// path RELATIVE to the repo root - an absolute one is not a valid treeish path,
// and it fails the same quiet way.
const toGitPath = (abs) => {
  const rel = abs.startsWith(REPO + sep) ? abs.slice(REPO.length + 1) : abs;
  return rel.split(sep).join("/");
};

const blobAt = (ref, gitPath) =>
  execFileSync("git", ["show", `${ref}:${toGitPath(gitPath)}`], { cwd: REPO, maxBuffer: 1e8 });
const sha256 = (buf) => "0x" + crypto.createHash("sha256").update(buf).digest("hex");

// A record is superseded when some other record names it; whatever is left is
// the active one. Reading it this way means adding a future record needs no
// change here. The two oldest records predate recordId entirely, so undefined
// ids must be filtered before the comparison - otherwise `undefined` lands in
// the superseded set and three records look active at once.
const superseded = new Set(
  records.map((r) => r.supersedesRecord).filter((v) => typeof v === "string" && v.length > 0)
);
const active = records.filter(
  (r) => typeof r.recordId === "string" && r.recordId.length > 0 && !superseded.has(r.recordId)
);
assert.equal(
  active.length,
  1,
  `expected exactly one active record, found [${active.map((r) => r.recordId).join(", ")}]`
);
const ACTIVE = active[0];

// A recovery ref is a hex sha (7-40) or a rev expression like 5a89f2b~1.
const REFS = /(?<![0-9a-fA-Za-z])([0-9a-f]{7,40}(?:~1)?)(?![0-9a-fA-Za-z])/g;
const refsNamedIn = (text) => [...text.matchAll(REFS)].map((m) => m[1]);

const allPins = [];
for (const rec of records) {
  for (const [bucket, base] of [["releaseFiles", PLATFORM], ["quarantineFiles", REPO]]) {
    for (const entry of rec.sha256[bucket] || []) {
      allPins.push({ rec, entry, abs: join(base, entry.file) });
    }
  }
}

const absent = allPins.filter((p) => !existsSync(p.abs));

test("every freeze pin is in the current tree or hash-verifiable from history", () => {
  const unverifiable = [];
  for (const { rec, entry, abs } of absent) {
    const refs = [rec.gitCommit, ...refsNamedIn(ACTIVE.scopeGapsClosed.join("\n"))].filter(Boolean);
    const ok = refs.some((ref) => {
      try {
        return sha256(blobAt(ref, abs)) === entry.sha256;
      } catch {
        return false; // ref or path absent at that ref
      }
    });
    if (!ok) {
      unverifiable.push(`${rec.recordId} ${entry.file} (recorded ${entry.sha256}; tried ${refs.join(", ") || "no ref"})`);
    }
  }
  assert.deepEqual(
    unverifiable,
    [],
    `pins that can be produced neither from the tree nor from any documented ref:\n  ${unverifiable.join("\n  ")}`
  );
});

test("a pin absent from the tree is named in the active record's scopeGapsClosed", () => {
  // This is the half that keeps the note honest. Without it, someone can delete
  // a pinned doc, the hashes stay in the record, and nothing anywhere records
  // where the bytes went - the exact failure AGENTS.md described, minus the
  // false part about verification.
  const notes = ACTIVE.scopeGapsClosed.join("\n");
  const undocumented = absent
    .map((p) => p.entry.file)
    .filter((file) => {
      const base = file.split("/").pop();
      return !notes.includes(base);
    });
  assert.deepEqual(
    undocumented,
    [],
    `deleted-but-pinned files with no entry in ${ACTIVE.recordId}.scopeGapsClosed:\n  ${undocumented.join("\n  ")}`
  );
});

test("the recovery note names a ref that actually verifies the deleted pin", () => {
  // Prose that names no ref, or names one that does not hold the bytes, is not
  // a recovery pointer. Derived, not asserted as a literal, so re-wording the
  // note does not break the contract while a wrong ref does.
  for (const { entry, abs } of absent) {
    const note = ACTIVE.scopeGapsClosed.find((n) => n.includes(entry.file.split("/").pop()));
    assert.ok(note, `no scopeGapsClosed entry mentions ${entry.file}`);
    const refs = [...new Set(refsNamedIn(note))];
    assert.ok(refs.length > 0, `the entry for ${entry.file} names no recovery ref`);
    const verified = refs.some((ref) => {
      try {
        return sha256(blobAt(ref, abs)) === entry.sha256;
      } catch {
        return false;
      }
    });
    assert.ok(verified, `none of the refs named for ${entry.file} (${refs.join(", ")}) hold the recorded bytes`);
  }
});

test("the reachability audit covers every record, and says which pins it checked", () => {
  // Guards against the audit silently shrinking: a record added later, or a pin
  // quietly removed, must change these numbers rather than pass unseen.
  assert.equal(allPins.length, 136, `pin total changed: ${allPins.length}`);
  assert.equal(records.length, 5, `freeze record count changed: ${records.length}`);
  assert.equal(absent.length, 2, `expected exactly 2 pins absent from the tree, found ${absent.length}`);
});
