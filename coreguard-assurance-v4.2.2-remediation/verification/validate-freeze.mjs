#!/usr/bin/env node
// ============================================================================
// COREGUARD ASSURANCE - FREEZE RECORD VERIFIER (validate-freeze.mjs)
// ----------------------------------------------------------------------------
// Independent, zero-dependency verifier for freeze-record-*.json: recomputes
// every pinned SHA-256 from disk. The reviewer's tool for the packet's
// "أعد حسابه من القرص" items (H1, H4) and the freeze-integrity claim.
//
// Schema support: v2 (4.2.6: sha256.releaseFiles/quarantineFiles arrays)
//                 v1 (4.2.2–4.2.5: sha256[] + quarantineIntegrity.files[])
// Path roots: v2 release → platform dir · v2 quarantine → repo root ·
//             v1 release → platform dir · v1 quarantine paths carry ../ prefixes.
// Historical records may FAIL against current bytes (engine evolved) — that is
// correct fail-closed behavior; only the current record must PASS.
//
// Exit codes: 0 = all pins match | 1 = any MISSING/MISMATCH | 2 = usage/parse error.
// Separation of duties: this verifier NEVER writes and NEVER authorizes.
// ============================================================================

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const recordPath = argv.find((a) => !a.startsWith("--"));
if (!recordPath) {
  console.error("usage: node validate-freeze.mjs <freeze-record.json>");
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

let match = 0;
const bad = [];

for (const [entries, base] of [[releaseFiles, platformDir], [quarantineFiles, repoRoot]]) {
  for (const e of entries) {
    // v1 quarantine entries carry ../ prefixes (repo-root relative) — resolve as-is.
    const abs = e.file.startsWith("..") ? resolve(base, e.file) : join(base, e.file);
    if (!existsSync(abs)) { bad.push(`MISSING ${e.file}`); continue; }
    if (createHash("sha256").update(readFileSync(abs)).digest("hex") !== e.sha256.replace(/^0x/, "")) {
      bad.push(`MISMATCH ${e.file}`);
      continue;
    }
    match++;
  }
}

const total = releaseFiles.length + quarantineFiles.length;
console.log(`freeze-record: ${record.recordId ?? record.releaseId ?? "?"} (supersedes ${record.supersedesRecord ?? record.supersedesRelease ?? "-"})`);
console.log(`releaseFiles=${releaseFiles.length} quarantineFiles=${quarantineFiles.length} excluded=${record.categoryCounts?.excluded ?? "-"}`);
for (const b of bad) console.error(`  ✗ ${b}`);
if (bad.length === 0 && match === total) {
  console.log(`validate-freeze: PASS (${match}/${total} MATCH)`);
  process.exit(0);
} else {
  console.error(`validate-freeze: FAIL (${match}/${total} MATCH)`);
  process.exit(1);
}
