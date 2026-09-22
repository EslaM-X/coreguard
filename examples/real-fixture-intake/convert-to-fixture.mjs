#!/usr/bin/env node
/**
 * convert-to-fixture.mjs — candidate → DDE fixture, one command.
 *
 * Takes an intake candidate that has passed the pre-publication gate
 * (examples/real-fixture-intake/prelude.mjs → GATE GREEN, exit 0) and
 * generates the ten DDE records plus the pin manifest, ready for
 * `verify-fixture.mjs` and submission. Two output modes:
 *
 *   node examples/real-fixture-intake/convert-to-fixture.mjs <candidate-dir> <out-dir>
 *   node examples/real-fixture-intake/convert-to-fixture.mjs <candidate-dir> --out-zip <archive.zip>
 *
 *     → exit 0 = output ready (directory mode: records + hashes.json,
 *                engine-verified · zip mode: attachment-ready archive +
 *                internal audit manifest)
 *       exit 1 = gate RED or a record failed the engine gate after conversion
 *       exit 2 = usage error (missing args, candidate missing, target exists)
 *
 * Design — fail-closed end to end:
 *   1. The prelude gate runs FIRST, on its real entry point, as a subprocess.
 *      Exit 0 (GREEN) is mandatory — nothing converts without a green gate,
 *      and the gate's own findings are echoed verbatim so the operator sees
 *      exactly what stands in the way.
 *   2. Records are the candidate's files, re-serialized (JSON, 2-space, LF)
 *      and verified as written — no field is rewritten by this tool. The
 *      candidate IS the truth; conversion is faithful packaging, not editing.
 *   3. hashes.json is generated last from the written bytes (SHA-256 per
 *      record), then re-read and re-hashed to prove the pins describe the
 *      disk. A pin mismatch after write aborts the conversion (exit 1).
 *   4. The converted fixture is then verified by the REAL verifier
 *      (packages/delivery/sdk.js — the same engine any reviewer runs).
 *      Only an engine-verified fixture may be packaged.
 *   5. Nothing in the candidate directory is ever modified.
 *   6. zip mode: the archive is STORE-only (deterministic, CRC-32 in every
 *      header), fixed UTC member timestamps (Jan 1 2001) and provenance
 *      fields derived from the candidate's pinned bytes (never wall-clock,
 *      never machine-local paths) — two runs over an identical candidate
 *      are byte-identical, so the archive's own sha256 is quotable in the
 *      submission note. It carries an internal AUDIT-MANIFEST.txt
 *      (member CRC-32 + SHA-256 + gate + engine verdict). A reviewer can
 *      re-check any member without trusting the zip: hash the extracted
 *      file, compare to the fixture's own hashes.json, then re-run the
 *      engine on the extraction.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(join(HERE, "..", ".."));
const PRELUDE = join(HERE, "prelude.mjs");

const RECORDS = [
  "agreement.json", "acceptance-criteria.json", "parties.json", "authorization.json",
  "execution-attestation.json", "delivery-manifest.json", "acceptance-record.json",
  "dispute-record.json", "consent-and-disclosure.json", "retention-policy.json",
];

const argv = process.argv.slice(2);
const usage = (msg) => {
  console.error(`usage: convert-to-fixture.mjs <candidate-dir> <out-dir>\n       convert-to-fixture.mjs <candidate-dir> --out-zip <archive.zip>\n  ${msg}\n  candidate must have passed the gate: node examples/real-fixture-intake/prelude.mjs <candidate-dir>`);
  process.exit(2);
};
const zipMode = argv.includes("--out-zip");
if (zipMode && argv.length !== 3) usage("--out-zip takes exactly: <candidate-dir> --out-zip <archive.zip>");
if (!zipMode && argv.length !== 2) usage("exactly two arguments required: <candidate-dir> <out-dir>");
const candidateDir = resolve(zipMode ? argv[0] : argv[0]);
let zipPath = null;
let outDir = null;
if (zipMode) {
  const target = argv[argv.indexOf("--out-zip") + 1];
  if (!target) usage("--out-zip requires an archive path");
  zipPath = isAbsolute(target) ? target : resolve(process.cwd(), target);
  if (!zipPath.toLowerCase().endsWith(".zip")) usage("--out-zip target must end in .zip");
  if (existsSync(zipPath)) usage(`archive already exists: ${zipPath} — conversion never overwrites (fail-closed)`);
  outDir = null; // zip mode leaves nothing on disk outside the archive
} else {
  outDir = resolve(argv[1]);
  if (existsSync(outDir)) usage(`output directory already exists: ${outDir} — conversion never overwrites (fail-closed)`);
  if (candidateDir === outDir) usage("candidate and output directories must differ");
}
if (!existsSync(candidateDir)) usage(`candidate directory not found: ${candidateDir}`);

// ------------------------------------------- step 1 — the gate, on its real entry point

const gate = spawnSync(process.execPath, [PRELUDE, candidateDir], { cwd: REPO, encoding: "utf8" });
const gateOut = (gate.stdout ?? "") + (gate.stderr ?? "");
if (gateOut.trim()) console.log(gateOut.trim()); // echo gate output verbatim (findings visible)

const gateExit = gate.status;
if (gateExit === 2) {
  console.error("convert: gate usage error — check the candidate directory");
  process.exit(2);
}
if (gateExit !== 0) {
  console.error(`convert: GATE RED — nothing converts without a green gate (gate exit ${gateExit})`);
  process.exit(1);
}

// ------------------------------------------- step 2 — faithful packaging (in memory)

const memory = {};
for (const name of RECORDS) {
  const src = join(candidateDir, name);
  if (!existsSync(src)) {
    // The gate already required all ten; this is a belt-and-braces guard.
    console.error(`convert: ${name} missing in candidate — mandatory record absent`);
    process.exit(1);
  }
}

// Normalize non-record files out of the copy set (gate ignores them; conversion copies records only).
const candidateExtras = readdirSync(candidateDir)
  .filter((f) => f.endsWith(".json") && !RECORDS.includes(f) && f !== "hashes.json");
if (candidateExtras.length > 0) {
  console.log(`convert: note — candidate extras ignored (records only): ${candidateExtras.join(", ")}`);
}

for (const name of RECORDS) {
  const obj = JSON.parse(readFileSync(join(candidateDir, name), "utf8")); // parse error → abort
  const txt = JSON.stringify(obj, null, 2) + "\n"; // 2-space, trailing LF — same convention as the committed fixture
  memory[name] = Buffer.from(txt, "utf8");
}

// ------------------------------------------- step 3 — pins from the packaged bytes

const pins = {};
for (const [name, buf] of Object.entries(memory)) {
  pins[name] = "0x" + createHash("sha256").update(buf).digest("hex");
}

const originRec = JSON.parse(memory["consent-and-disclosure.json"].toString("utf8"));
// The candidate's pin manifest — parsed fresh from disk bytes (the gate just
// judged this exact tree) — supplies deterministic provenance fields.
const sourceManifest = JSON.parse(readFileSync(join(candidateDir, "hashes.json"), "utf8"));
const sourcePinsSha = "0x" + createHash("sha256")
  .update(readFileSync(join(candidateDir, "hashes.json")))
  .digest("hex");
const fixtureMeta = {
  origin: "REAL",
  realDisputeExists: true,
  lifecycleState: originRec?.lifecycleState ?? "DISPUTE_OPEN",
  ddeVersion: "DDE/1",
};

const manifest = {
  manifest: {
    algorithm: "sha256",
    generatedBy: "examples/real-fixture-intake/convert-to-fixture.mjs",
    // Determinism: never wall-clock. Reuse the candidate's own manifest
    // timestamp (it describes the gate-judged bytes); fall back to the
    // fixed epoch when the candidate manifest carries none. Two runs over
    // identical candidate bytes therefore produce identical output bytes.
    generatedAtUtc: sourceManifest?.manifest?.generatedAtUtc ?? "1970-01-01T00:00:00Z",
    selfExcluded: ["hashes.json"],
    sourceCandidatePins: sourcePinsSha, // sha256 of the candidate's hashes.json — identifies the judged tree without machine-local paths
    gate: "examples/real-fixture-intake/prelude.mjs GATE GREEN (exit 0)",
    note: "Every record file is pinned by SHA-256 over its exact bytes. hashes.json cannot hash itself — the single declared self-exclusion.",
  },
  fixture: fixtureMeta,
  files: pins,
};
const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n", "utf8");

// ------------------------------------------- step 4 — the engine judges the packaged fixture

// Same engine, same semantics as the reviewer's one-command verifier. In
// directory mode the report judges exactly the bytes on disk (pins were
// re-read from disk before this call). In zip mode the engine judges the
// same packaged records via a temp directory; the archive is written only
// after the engine has accepted those bytes.
const { verifyFixture } = await import("../../packages/delivery/sdk.js");

let sdkReport;
let engineDir;
if (zipMode) {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  engineDir = mkdtempSync(join(tmpdir(), "dde-conv-zip-"));
  for (const [name, buf] of Object.entries(memory)) writeFileSync(join(engineDir, name), buf);
  writeFileSync(join(engineDir, "hashes.json"), manifestBytes);
  sdkReport = await verifyFixture({ fixtureDir: engineDir });
  rmSync(engineDir, { recursive: true, force: true });
} else {
  mkdirSync(outDir, { recursive: true });
  for (const [name, buf] of Object.entries(memory)) writeFileSync(join(outDir, name), buf, "utf8");
  writeFileSync(join(outDir, "hashes.json"), manifestBytes, "utf8");
  // Pins must describe the disk — re-read and re-hash what was written.
  const reread = JSON.parse(readFileSync(join(outDir, "hashes.json"), "utf8"));
  for (const name of RECORDS) {
    const actual = "0x" + createHash("sha256").update(readFileSync(join(outDir, name))).digest("hex");
    if (reread.files[name] !== actual) {
      console.error(`convert: pin mismatch after write — ${name}: pinned ${reread.files[name]} != disk ${actual} (aborting, fail-closed)`);
      process.exit(1);
    }
  }
  sdkReport = await verifyFixture({ fixtureDir: outDir });
}

const ok = sdkReport.status === "VERIFIED";
if (!ok) {
  console.error(`convert-to-fixture: engine gate REJECTED the converted fixture — ${sdkReport.status}`);
  for (const c of sdkReport.checks ?? []) if (c.result === "FAIL") console.error(`  check ${c.id} FAIL — ${(c.mismatches ?? []).join(" · ") || c.name}`);
  process.exit(1);
}

// ------------------------------------------- step 5 — write the chosen output

if (zipMode) {
  writeFileSync(zipPath, buildZip(memory, manifestBytes));
} // directory mode already wrote its output in step 4

// --------------------------------------------------------------- report

const line = "─".repeat(72);
console.log(line);
console.log(zipMode
  ? "convert-to-fixture: candidate → DDE fixture ZIP (gate green → records + pins → engine-verified → attachment archive)"
  : "convert-to-fixture: candidate → DDE fixture (gate green → records + pins → engine-verified)");
console.log(line);
console.log(`  candidate : ${candidateDir}`);
console.log(`  output    : ${zipMode ? zipPath : outDir}  (${zipMode ? "attachment-ready zip" : "records + hashes.json (pins re-read and matched against disk)"})`);
console.log(`  records   : ${RECORDS.length} + hashes.json`);
console.log(`  origin    : ${fixtureMeta.origin} · realDisputeExists: ${fixtureMeta.realDisputeExists} · lifecycle: ${fixtureMeta.lifecycleState}`);
console.log(`  engine    : ${sdkReport.status} (${sdkReport.summary?.pass ?? "?"}/${sdkReport.summary?.total ?? "?"} PASS)`);
for (const c of sdkReport.checks ?? []) {
  const mark = c.result === "PASS" ? "✔" : c.result === "FAIL" ? "✗" : "·";
  console.log(`    ${mark} ${c.id ?? "?"} ${c.result} — ${c.name ?? ""}${c.result === "NOT_RUN" ? ` (${(c.mismatches ?? [])[0] ?? "no EVM adapter"})` : ""}`);
}
console.log(`  decision  : ${sdkReport.decision}`);
if (zipMode) {
  const archiveSha = "0x" + createHash("sha256").update(readFileSync(zipPath)).digest("hex");
  console.log(`  archive   : sha256 ${archiveSha} — paste THIS hash into the submission note (the manifest cannot self-hash)`);
  console.log("  reviewer  : extract, hash members against hashes.json + AUDIT-MANIFEST.txt, re-run the engine on the extraction");
}
console.log(line);
console.log("Ready for submission. Re-verify any time (same engine, any directory):");
console.log("  node -e \"import('packages/delivery/sdk.js').then(m => m.verifyFixture({ fixtureDir: process.argv[1] })).then(r => { console.log(r.status, r.decision); process.exit(r.status === 'VERIFIED' ? 0 : 1); })\" -- <fixture-dir>");
console.log("boundary: Execution verification does not decide delivery conformity.");
process.exit(0);

// --------------------------------------------------------------- zip builder

function buildZip(recordBuffers, manifestBytes) {
  const chunks = [];
  const central = [];
  let offset = 0;

  const ARCHIVE_EPOCH = Date.UTC(2001, 0, 1); // fixed timestamp → deterministic bytes
  const dosTime = ((ARCHIVE_EPOCH / 60000) & 0xffff); // minutes since 1980-01-01 (valid for the 2001 epoch)
  const dosDate = 0x0021; // 2001-01-01 (year offset 21, month 1, day 1)

  const memberMeta = [];
  for (const [name, data] of Object.entries(recordBuffers)) memberMeta.push([name, data]);
  memberMeta.push(["hashes.json", manifestBytes]);

  const archiveManifest = {
    archiveFormat: "ZIP (STORE only — no compression, deterministic bytes)",
    determinism: "two runs over identical candidate bytes produce identical archives (fixed 2001-01-01 UTC member timestamps)",
    auditTrail: {
      generatedBy: "examples/real-fixture-intake/convert-to-fixture.mjs",
      generatedAtUtc: manifest.manifest.generatedAtUtc,
      sourceCandidatePins: manifest.manifest.sourceCandidatePins,
      gate: manifest.manifest.gate,
      engine: { status: sdkReport.status, pass: sdkReport.summary?.pass, total: sdkReport.summary?.total, decision: sdkReport.decision },
      boundary: "Execution verification does not decide delivery conformity.",
    },
    members: memberMeta.map(([name, data]) => ({
      name,
      bytes: data.length,
      crc32: "0x" + crc32(data).toString(16).padStart(8, "0"),
      sha256: "0x" + createHash("sha256").update(data).digest("hex"),
    })),
    reviewerSteps: [
      "1. unzip the attachment into an empty directory",
      "2. re-hash each member (sha256) and compare with hashes.json — mismatch = tampered archive",
      "3. re-run the engine on the extraction: verifyFixture({ fixtureDir: <extraction> }) — must print VERIFIED",
      "4. quote outputs only with the boundary line above",
    ],
    note: "This manifest is a convenience copy; the binding pins live in hashes.json and are re-checked by the engine on extraction. The archive's own sha256 (printed by the converter) belongs in the submission note — a manifest inside an archive cannot hash the archive that contains it.",
  };
  const auditTxt = Buffer.from(
    "CoreGuard DDE — submission archive audit manifest\n" +
    "=================================================\n\n" +
    JSON.stringify(archiveManifest, null, 2) + "\n",
    "utf8",
  );
  memberMeta.push(["AUDIT-MANIFEST.txt", auditTxt]); // hashed/pinned below AFTER construction — no self-hash

  for (const [name, data] of memberMeta) {
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed: 2.0
    local.writeUInt16LE(0x0800, 6); // UTF-8 name flag
    local.writeUInt16LE(0, 8); // STORE
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBytes, data);
    central.push({ nameBytes, crc, size: data.length, offset });
    offset += 30 + nameBytes.length + data.length;
  }

  const centralStart = offset;
  for (const e of central) {
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(0x031e, 4); // made by: unix, 3.0
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8); // UTF-8 flag
    cd.writeUInt16LE(0, 10); // STORE
    cd.writeUInt16LE(dosTime, 12);
    cd.writeUInt16LE(dosDate, 14);
    cd.writeUInt32LE(e.crc, 16);
    cd.writeUInt32LE(e.size, 20);
    cd.writeUInt32LE(e.size, 24);
    cd.writeUInt16LE(e.nameBytes.length, 28);
    // 30..37 stay zero (extra, comment, disk, internal attrs); 38..41 carry
    // unix mode 0644 (rw-r--r--) — made-by is unix (0x031e), and with zero
    // external attributes Info-ZIP extracts mode-0000 files on Linux (EACCES
    // for every reader). Windows masks this; CI caught it.
    cd.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    cd.writeUInt32LE(e.offset, 42);
    chunks.push(cd, e.nameBytes);
    offset += 46 + e.nameBytes.length;
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(central.length, 8);
  eocd.writeUInt16LE(central.length, 10);
  eocd.writeUInt32LE(offset - centralStart, 12);
  eocd.writeUInt32LE(centralStart, 16);
  chunks.push(eocd);

  return Buffer.concat(chunks);
}

function crc32(buf) {
  let c;
  const table = crc32.table ??= (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
