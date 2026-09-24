#!/usr/bin/env node
/**
 * make-dispute-package.mjs — deterministic generator for an ADAL/1 dispute
 * package (single-file, pinned). Builds on the committed A/B assent pair:
 * the evidence layer is re-read from the committed assent record and
 * re-serialized deterministically, so it stays byte-comparable to the pair.
 *
 * The dispute package adds the disputed-record layers described in the
 * elizaOS #21788 thread: agreement ref, parties' positions + requested
 * remedy, a closure point, a NEVER-prefilled award slot, a reference-only
 * escrow interface, and a not-built tribunal adapter.
 *
 * Honesty labels enforced by construction:
 *   - awardSlot.status = UNKNOWN, adjudicator = NONE  (CoreGuard never fills it)
 *   - escrowRef.deployed = false, chain = "none"       (reference only)
 *   - adapter.integrationStatus = NOT_BUILT            (no live integration)
 *
 *   node examples/delivery-fixture/pairs/dispute-package/make-dispute-package.mjs --case A
 *   node …/make-dispute-package.mjs --case A --out <dir>
 *
 * Deterministic: fixed timestamps, no Date.now(), no network, no Math.random.
 * Writes dispute-package.json + dispute-hashes.json.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PAIR_DIR = join(HERE, "..", "assent-pair");
const args = process.argv.slice(2);
const caseIdx = args.indexOf("--case");
const CASE = args[caseIdx + 1];
const outIdx = args.indexOf("--out");
const OUT = outIdx > -1 ? args[outIdx + 1] : HERE;

if (CASE !== "A" && CASE !== "B") {
  console.error("usage: node .../make-dispute-package.mjs --case A|B [--out <dir>]");
  process.exit(2);
}

const PV = "dispute-package-v1.0.0";
const PROTO = "ADAL/1";
const T = {
  generated: "2026-09-24T12:00:00Z",
  closesAt: "2026-10-24T00:00:00Z",
};

// ----------------------------------------------- read committed evidence layer
const srcName = CASE === "A" ? "assent-a.json" : "assent-b.json";
const srcJson = readFileSync(join(PAIR_DIR, srcName), "utf8");
const evidence = JSON.parse(srcJson); // re-serialized deterministically below

// ------------------------------------------------------------- positions layer
const positions = {
  principalA: {
    role: evidence.consent.parties.principalA.role,
    principalAddress: evidence.consent.parties.principalA.principalAddress,
    position: CASE === "A"
      ? "Claims the delivery satisfies the pinned agreement; modeled consent covers this obligation."
      : "Claims the delivery satisfies the pinned agreement and models assent as within scope at performance time.",
    requestedRemedy: "PROCEED_PERFORMANCE — record is closed, no remedy requested.",
    record: "party statement, not an adjudication.",
  },
  principalB: {
    role: evidence.consent.parties.principalB.role,
    principalAddress: evidence.consent.parties.principalB.principalAddress,
    position: CASE === "A"
      ? "Agrees delivery conforms on the recorded acceptance test; no reservation stated."
      : "Disputes acceptance: modeled assent for this obligation is UNKNOWN (scoped to another action), so acceptance is not evidenced.",
    requestedRemedy: CASE === "A"
      ? "PROCEED_PERFORMANCE — no remedy requested."
      : "HOLD_SETTLEMENT — do not settle the modeled compensation; unknown stays unknown.",
    record: "party statement, not an adjudication.",
  },
  closure: "positions lock at the record's closesAtUtc; replacements require a new package version.",
};

// --------------------------------------------------------------- closure layer
const closure = {
  closesAtUtc: T.closesAt,
  opensAtUtc: T.generated,
  policy: "record closes at closesAtUtc; after that the package bytes are the dispute record (no in-place edits).",
  note: "the point at which the record closes, per the disputed-record shape.",
};

// ------------------------------------------------------------------ award slot
const awardSlot = {
  status: "UNKNOWN",
  signedReasonedAward: null,
  adjudicator: "NONE",
  note: "NEVER prefilled by CoreGuard. A genuine award is a signed record from an external adjudicator over this package's bytes (packageRevision + pins). This package contains no award.",
};

// ----------------------------------------------------------- escrow reference
const escrowRef = {
  kind: "REFERENCE_INTERFACE",
  deployed: false,
  chain: "none",
  synthetic: true,
  lifecycle: [
    "OPEN — escrow not engaged (reference only)",
    "LOCKED — funds held pending acceptance (future)",
    "ADJUDICATION — closed dispute package handed to external adjudicator",
    "SETTLEMENT_HANDOFF — signed award instruction executes out/back",
  ],
  note: "Reference-only interface. Nothing is deployed, signed, or broadcast (binding governance: CONDITIONAL NO-GO). A real deployment requires the owner's separate explicit authorization.",
};

// ---------------------------------------------------------------- adapter layer
const adapter = {
  integrationStatus: "NOT_BUILT",
  transportContract: {
    method: "POST",
    body: "this dispute-package.json byte-for-byte",
    expectedResponse: "ack with packageRevision, or a signed reasoned award",
  },
  consumers: [],
  note: "Reference transport contract only. No live API connection exists; no platform integration is claimed or implied.",
};

// ------------------------------------------------------------ assemble + pin
const pkg = {
  protocolVersion: PROTO,
  packageVersion: PV,
  caseRef: CASE,
  synthetic: true,
  origin: "SYNTHETIC",
  generatedAtUtc: T.generated,
  generatedBy: "examples/delivery-fixture/pairs/dispute-package/make-dispute-package.mjs",
  agreement: {
    agreementVersion: evidence.consent.agreementVersion,
    acceptanceTest: "delivery artifacts vs the pinned acceptance criteria — acceptance itself is not adjudicated by this record",
    scopeRef: evidence.consent.scopeRef,
  },
  evidence,
  positions,
  closure,
  awardSlot,
  escrowRef,
  adapter,
  unknowns: [...evidence.unknowns, "acceptanceOutcome", "adjudicationOutcome"],
  boundary: "synthetic dispute package record: execution facts verifiable; consent, acceptance, and adjudication are separate layers. Establishes no real-world authority, payment of the modeled compensation, or a merits outcome.",
};

const records = { "dispute-package.json": pkg };
const manifest = {
  manifest: {
    algorithm: "sha256",
    protocolVersion: PROTO,
    packageVersion: PV,
    generatedBy: "examples/delivery-fixture/pairs/dispute-package/make-dispute-package.mjs",
    generatedAtUtc: T.generated,
    selfExcluded: ["dispute-hashes.json"],
    note: "ADAL/1 dispute package — evidence layer re-serialized from the committed assent pair; positions/closure/award-slot/escrow/adapter modeled; award UNKNOWN; escrow reference-only; adapter NOT_BUILT.",
  },
  caseRef: CASE,
  evidenceSource: join("assent-pair", srcName),
  files: {},
};

// evidence byte-parity guard: the re-serialized evidence record must be
// byte-identical to the committed assent file (deterministic generator).
// We verify by generating the package into a temp dir from a fresh read and
// comparing the source blob hash — implemented here as a structural guard:
const reserialized = JSON.stringify(evidence, null, 2) + "\n";
if (Buffer.compare(Buffer.from(reserialized, "utf8"), Buffer.from(srcJson, "utf8")) !== 0) {
  console.error("refusing: evidence layer does not byte-match the committed assent record (generator drift).");
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
for (const [name, rec] of Object.entries(records)) {
  const json = JSON.stringify(rec, null, 2) + "\n";
  const buf = Buffer.from(json, "utf8");
  manifest.files[name] = "0x" + createHash("sha256").update(buf).digest("hex");
  writeFileSync(join(OUT, name), json, "utf8");
}
writeFileSync(join(OUT, "dispute-hashes.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.log(`dispute package written: dispute-package.json + dispute-hashes.json`);
console.log(`  protocol : ${PROTO} · package ${PV} · case ${CASE}`);
console.log(`  evidence : ${srcName} byte-parity re-serialized from committed pair`);
console.log(`  award    : ${awardSlot.status} (never prefilled) · escrow: deployed=${escrowRef.deployed} · adapter: ${adapter.integrationStatus}`);