#!/usr/bin/env node
// ============================================================================
// COREGUARD ASSURANCE - FREEZE RECORD VERIFIER (validate-freeze.mjs)
// ----------------------------------------------------------------------------
// Commit-anchored verification: hashes each pinned file from the GIT COMMIT
// named by the record's `gitCommit` field (via `git show <commit>:<path>`),
// not from the working disk. Rationale: the disk is mutable — any editor, any
// stray test run changes it — so disk hashing can never prove WHICH bytes the
// freeze covers. A commit is immutable and independently fetchable; anchoring
// to it makes every claim checkable with one command and closes the
// "did bytes change after the freeze?" defect class that consumed several
// assurance cycles.
//
// Modes:
//   node validate-freeze.mjs <record>                 → commit-anchored (default).
//       Requires record.gitCommit. `git` must exist; MISSING entries are
//       reported as COMMIT-MISSING (not disk-missing). FAIL-CLOSED.
//   node validate-freeze.mjs <record> --commit <sha>  → verify the commit the
//       record declares IS the commit given (case-insensitive prefix match);
//       mismatch is an immediate FAIL (prevents verifying a different tree).
//   node validate-freeze.mjs <record> --disk          → legacy disk mode.
//       Prints an explicit caveat: disk bytes are UNPINNED and prove nothing
//       about the frozen tree. Kept only so a reviewer can triage a mismatch
//       against their working copy. Not valid evidence; packet items must not
//       cite it.
//
// postCommitRePins: the record may list entries re-pinned after the freeze
// timestamp (the documented integrity-rule exception, e.g. README text edited
// then re-pinned). Each entry names a file + the commit whose tree it is
// pinned against; such entries are verified from THAT commit and skipped in
// the main pass. Anything not whitelisted there is verified against gitCommit.
//
// Schema support: v2 (4.2.6: sha256.releaseFiles/quarantineFiles arrays)
//                 v1 (4.2.2–4.2.5: sha256[] + quarantineIntegrity.files[])
// Path roots: v2 release → platform dir · v2 quarantine → repo root ·
//             v1 quarantine paths carry ../ prefixes (resolved against repo
//             root inside the commit).
// Historical records (4.2.2–4.2.5) have no gitCommit field and intentionally
// FAIL in commit mode with COMMIT-UNANCHORED — correct fail-closed behavior;
// only the current record is expected to PASS.
//
// Exit codes: 0 = all pins match the anchor | 1 = any mismatch/missing/unanchored
//             | 2 = usage/parse error.
// Separation of duties: this verifier NEVER writes and NEVER authorizes.
// ============================================================================

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const recordPath = argv.find((a) => !a.startsWith("--"));
const commitIdx = argv.indexOf("--commit");
const commitArg = commitIdx !== -1 ? argv[commitIdx + 1] : undefined;
const diskMode = argv.includes("--disk");

if (!recordPath || (commitIdx !== -1 && !commitArg)) {
  console.error("usage: node validate-freeze.mjs <freeze-record.json> [--commit <sha>] [--disk]");
  process.exit(2);
}

let record;
try {
  record = JSON.parse(readFileSync(recordPath, "utf8"));
} catch (e) {
  console.error(`[invalid] freeze record is not parseable JSON: ${e.message}`);
  process.exit(1);
}

const platformDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(platformDir, "..");

const releaseFiles = record.sha256?.releaseFiles ?? (Array.isArray(record.sha256) ? record.sha256 : []);
const quarantineFiles = record.sha256?.quarantineFiles ?? record.quarantineIntegrity?.files ?? [];

// ---- git plumbing ----------------------------------------------------------
// Hash a path from a commit's tree: `git show <commit>:<repoRelPath>`.
// Byte-exact because .gitattributes marks the evidence trees `-text` (no
// CRLF normalization on checkout), so blobs are the bytes the freeze captured.
const PLATFORM_DIR_NAME = "coreguard-assurance-v4.2.2-remediation"; // v2/v1 record scope
function gitBlob(commit, repoRelPath) {
  return execFileSync("git", ["-C", repoRoot, "show", `${commit}:${repoRelPath}`], {
    maxBuffer: 256 * 1024 * 1024,
  });
}

function hashBuf(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function normalizePin(p) {
  return p.replace(/^0x/, "").toLowerCase();
}

// v2 quarantine entries are repo-root relative; v1 carry ../ prefixes
// (platform-dir relative) — normalize both to repo-root relative paths.
function repoRelPath(e) {
  return e.file.replace(/^(\.\.\/)+/, "");
}

// ---- resolve the anchor commit ---------------------------------------------
if (diskMode) {
  console.log("NOTE: --disk mode hashes WORKING-DISK bytes — unpinned, not evidence; use only to triage a mismatch.");
}

const anchorCommit = record.gitCommit;
if (!diskMode && !anchorCommit) {
  console.error("validate-freeze: FAIL (0/" + (releaseFiles.length + quarantineFiles.length) +
    " MATCH) — record has no gitCommit field (COMMIT-UNANCHORED); the freeze names no immutable reference.");
  console.error("  (records from cycles before commit-anchoring cannot be verified as evidence; re-freeze to anchor)");
  process.exit(1);
}

if (!diskMode && commitArg && anchorCommit &&
    !anchorCommit.toLowerCase().startsWith(commitArg.toLowerCase())) {
  console.error(`validate-freeze: FAIL — record anchors ${anchorCommit} but --commit ${commitArg} was requested; refusing to verify a different tree.`);
  process.exit(1);
}

// ---- verify ----------------------------------------------------------------
let match = 0;
const bad = [];
const rePins = new Map(
  (record.postCommitRePins ?? []).map((r) => [r.file, r.commit])
);

function verifyEntry(e, base) {
  // Repo-root relative path inside the commit tree:
  //  - release entries are platform-dir relative → prefix the platform dir name
  //  - quarantine entries are repo-root relative already (v1 ../ prefixes stripped)
  const rel = e.file.startsWith("..")
    ? repoRelPath(e)
    : (base === repoRoot ? e.file : `${PLATFORM_DIR_NAME}/${e.file}`);
  const pinned = normalizePin(e.sha256);

  // Documented post-freeze re-pin: verify from its own declared commit.
  if (rePins.has(e.file)) {
    const pinCommit = rePins.get(e.file);
    try {
      if (hashBuf(gitBlob(pinCommit, rel)) === pinned) { match++; return; }
      bad.push(`MISMATCH ${e.file} (vs re-pin commit ${pinCommit})`);
    } catch {
      bad.push(`COMMIT-MISSING ${e.file} (re-pin commit ${pinCommit})`);
    }
    return;
  }

  if (diskMode) {
    const abs = e.file.startsWith("..") ? resolve(base, e.file) : join(base, e.file);
    try {
      if (hashBuf(readFileSync(abs)) === pinned) { match++; return; }
      bad.push(`MISMATCH ${e.file} (disk)`);
    } catch {
      bad.push(`MISSING ${e.file} (disk)`);
    }
    return;
  }

  try {
    if (hashBuf(gitBlob(anchorCommit, rel)) === pinned) { match++; return; }
    bad.push(`MISMATCH ${e.file} (vs ${anchorCommit.slice(0, 12)})`);
  } catch {
    bad.push(`COMMIT-MISSING ${e.file} (vs ${anchorCommit.slice(0, 12)})`);
  }
}

for (const [entries, base] of [[releaseFiles, platformDir], [quarantineFiles, repoRoot]]) {
  for (const e of entries) verifyEntry(e, base);
}

const total = releaseFiles.length + quarantineFiles.length;
console.log(`freeze-record: ${record.recordId ?? record.releaseId ?? "?"} (supersedes ${record.supersedesRecord ?? record.supersedesRelease ?? "-"})`);
console.log(`anchor: ${diskMode ? "WORKING DISK (not evidence)" : `commit ${anchorCommit}`}`);
console.log(`releaseFiles=${releaseFiles.length} quarantineFiles=${quarantineFiles.length} excluded=${record.categoryCounts?.excluded ?? "-"}${rePins.size ? ` postCommitRePins=${rePins.size}` : ""}`);
for (const b of bad) console.error(`  ✗ ${b}`);
if (bad.length === 0 && match === total) {
  console.log(`validate-freeze: PASS (${match}/${total} MATCH${diskMode ? ", disk mode — not evidence" : `, anchored @ ${anchorCommit.slice(0, 12)}`})`);
  process.exit(0);
} else {
  console.error(`validate-freeze: FAIL (${match}/${total} MATCH)`);
  process.exit(1);
}
