#!/usr/bin/env node
/**
 * convert.mjs — candidate → DDE fixture, one command.
 *
 * Takes an intake candidate that has passed the pre-publication gate
 * (examples/real-fixture-intake/prelude.mjs → GATE GREEN, exit 0) and
 * generates the ten DDE records plus the pin manifest, ready for
 * `verify-fixture.mjs` and submission:
 *
 *   node examples/real-fixture-intake/convert.mjs <candidate-dir> <out-dir>
 *     → exit 0 = out-dir ready (records + hashes.json, engine-verified)
 *       exit 1 = gate RED or a record failed the engine gate after conversion
 *       exit 2 = usage error (missing args, candidate missing, out-dir exists)
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
 *      (verify-fixture.mjs) as a subprocess — the same gate any reviewer
 *      runs. Only an engine-verified fixture may be published.
 *   5. Nothing in the candidate directory is ever modified.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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
  console.error(`usage: convert.mjs <candidate-dir> <out-dir>\n  ${msg}\n  candidate must have passed the gate: node examples/real-fixture-intake/prelude.mjs <candidate-dir>`);
  process.exit(2);
};
if (argv.length !== 2) usage("exactly two arguments required: <candidate-dir> <out-dir>");

const candidateDir = resolve(argv[0]);
const outDir = resolve(argv[1]);
if (!existsSync(candidateDir)) usage(`candidate directory not found: ${candidateDir}`);
if (existsSync(outDir)) usage(`output directory already exists: ${outDir} — conversion never overwrites (fail-closed)`);
if (candidateDir === outDir) usage("candidate and output directories must differ");

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

// ------------------------------------------- step 2 — faithful packaging

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

mkdirSync(outDir, { recursive: true });
const written = {};
for (const name of RECORDS) {
  const obj = JSON.parse(readFileSync(join(candidateDir, name), "utf8")); // parse error → abort (candidate must be valid JSON)
  const txt = JSON.stringify(obj, null, 2) + "\n"; // 2-space, trailing LF — same convention as the committed fixture
  writeFileSync(join(outDir, name), txt, "utf8");
  written[name] = Buffer.from(txt, "utf8");
}

// ------------------------------------------- step 3 — pins from the written bytes

const pins = {};
for (const [name, buf] of Object.entries(written)) {
  pins[name] = "0x" + createHash("sha256").update(buf).digest("hex");
}

const originRec = JSON.parse(written["consent-and-disclosure.json"].toString("utf8"));
const fixtureMeta = {
  origin: "REAL",
  realDisputeExists: true,
  lifecycleState: originRec?.lifecycleState ?? "DISPUTE_OPEN",
  ddeVersion: "DDE/1",
};

const manifest = {
  manifest: {
    algorithm: "sha256",
    generatedBy: "examples/real-fixture-intake/convert.mjs",
    generatedAtUtc: new Date().toISOString(),
    selfExcluded: ["hashes.json"],
    sourceCandidate: candidateDir,
    gate: "examples/real-fixture-intake/prelude.mjs GATE GREEN (exit 0)",
    note: "Every record file is pinned by SHA-256 over its exact bytes. hashes.json cannot hash itself — the single declared self-exclusion.",
  },
  fixture: fixtureMeta,
  files: pins,
};

const manifestPath = join(outDir, "hashes.json");
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

// ------------------------------------------- step 4 — pins must describe the disk

const reread = JSON.parse(readFileSync(manifestPath, "utf8"));
for (const name of RECORDS) {
  const actual = "0x" + createHash("sha256").update(readFileSync(join(outDir, name))).digest("hex");
  if (reread.files[name] !== actual) {
    console.error(`convert: pin mismatch after write — ${name}: pinned ${reread.files[name]} != disk ${actual} (aborting, fail-closed)`);
    process.exit(1);
  }
}

// ------------------------------------------- step 5 — the engine judges

// Same engine, same semantics as the reviewer's one-command verifier — run
// on the converted records via the SDK (the CLI verifier reads its own
// committed directory; the reviewer re-runs it against a submitted copy).
const { verifyFixture } = await import("../../packages/delivery/sdk.js");
const sdkReport = await verifyFixture({ fixtureDir: outDir });
const ok = sdkReport.status === "VERIFIED";

if (!ok) {
  console.error(`convert: engine gate REJECTED the converted fixture — ${sdkReport.status}`);
  for (const c of sdkReport.checks ?? []) if (c.result === "FAIL") console.error(`  check ${c.id} FAIL — ${(c.mismatches ?? []).join(" · ") || c.name}`);
  process.exit(1);
}

// --------------------------------------------------------------- report

const line = "─".repeat(72);
console.log(line);
console.log("convert: candidate → DDE fixture (gate green → records + pins → engine-verified)");
console.log(line);
console.log(`  candidate : ${candidateDir}`);
console.log(`  output    : ${outDir}`);
console.log(`  records   : ${RECORDS.length} + hashes.json (pins re-read and matched against disk)`);
console.log(`  origin    : ${fixtureMeta.origin} · realDisputeExists: ${fixtureMeta.realDisputeExists} · lifecycle: ${fixtureMeta.lifecycleState}`);
console.log(`  engine    : ${sdkReport.status} (${sdkReport.summary?.pass ?? "?"}/${sdkReport.summary?.total ?? "?"} PASS)`);
console.log(`  decision  : ${sdkReport.decision}`);
console.log(line);
console.log("Ready for submission. Re-verify any time:");
console.log(`  node examples/delivery-fixture/verify-fixture.mjs (against this directory)`);
console.log("boundary: Execution verification does not decide delivery conformity.");
process.exit(0);
