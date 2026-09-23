#!/usr/bin/env node
/**
 * make-assent-pair.mjs — deterministic generator for the A/B assent pair.
 *
 * Next test requested by People's Court / Epistemic Labs (elizaOS #21788,
 * 2026-09-23): a paired synthetic fixture with IDENTICAL execution and
 * delivery receipts but DIFFERENT modeled consent:
 *   A — ASSENT_PRESENT  : both synthetic principals assent to the pinned
 *                         agreement version, within stated authority.
 *   B — ASSENT_MISSING  : party-B assent is absent / scoped to another
 *                         action — recorded UNKNOWN, never filled in from the
 *                         execution receipt or delivery manifest.
 *
 * Neither case establishes real-world party authority, payment of the
 * modeled compensation, or a merits outcome. No EIP-712 signatures exist in
 * this pair: modeled assent is declared fixture data, not cryptographic or
 * portable consent.
 *
 *   node examples/delivery-fixture/pairs/assent-pair/make-assent-pair.mjs
 *   node …/make-assent-pair.mjs --out <dir>   → write into <dir> instead of HERE
 *
 * Deterministic: fixed timestamps, no Date.now(), no network. Writes
 * assent-a.json, assent-b.json, expected-field-map.json, pair-hashes.json.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const outArg = process.argv.indexOf("--out");
const OUT = outArg > -1 ? process.argv[outArg + 1] : HERE;

const PV = "assent-pair-v1.0.0";
const T = {
  generated: "2026-09-23T12:00:00Z",
  anchorChecked: "2026-09-19T12:00:00Z",
  submitted: "2026-09-24T09:30:00Z",
};

const CLIENT_PRINCIPAL = "0x716891f369eadbd06bb0a2c2ed091a193e4390e6";
const CLIENT_AGENT = "0xd418cb172087efbcf7a4126d914bf904b5c9f149";
const PROVIDER_PRINCIPAL = "0xb240f6879da4c214d534fd18874ee12142b8c274";
const PROVIDER_AGENT = "0xc1e7d8017ee82da93e85b2c48955070dc6b2f13d";

// ------------------------------------------------- identical execution anchor
// The SAME object feeds both A and B → byte-identical execution records.

const execution = {
  origin: "REAL",
  recordId: "ASSENT-PAIR-EXEC",
  executionId: "ASSENT-PAIR-EXEC",
  network: "core-mainnet",
  chainId: "1116",
  txHash: "0xe67c61fda81200bf026faee31c23a7b7e7f56ed24f06ffe24f071fa06891a9b8",
  receipt: {
    status: "0x1 (success)",
    blockNumber: "38712625",
    from: "0xea41becdeb612d8625bf3060809964f1dab43244",
    to: "0x7b4ce161d65e679c30ba738a522a09d63880992c",
    gasUsed: "21000",
    valueWei: "1000000000000000",
  },
  executionCoupon: {
    role: "independent public execution anchor only — a REAL settled transfer; NOT settlement of the modeled agreement",
    valueWei: "1000000000000000",
  },
  compensationSettlement: {
    evidenceStatus: "NOT_EVIDENCED_AS_SETTLED",
    actualStatus: "UNKNOWN",
    agreementCompensationWei: "250000000000000000",
    settledByExecutionCoupon: false,
    note: "The execution coupon (0.001 CORE) does not settle the modeled compensation (0.25 CORE). Absence of settlement evidence supports 'not evidenced as settled', never a verified nonpayment finding; actual settlement remains UNKNOWN in this record.",
  },
  verifiedVia: {
    rpc: "rpc.coredao.org",
    method: "eth_getTransactionReceipt",
    checkedAtUtc: T.anchorChecked,
  },
  reference: "examples/pilot/proof-artifact-1.json — Pilot-1 public proof artifact (VERIFIED)",
  provenance: "REAL — public Pilot-1 Core Mainnet transaction, used identically in A and B. Anchors the EXECUTION layer only; never delivery conformity.",
};

// --------------------------------------------- identical delivery manifest
// The SAME object feeds both A and B → byte-identical delivery records.

const delivery = {
  origin: "SYNTHETIC",
  recordId: "ASSENT-PAIR-DELIVERY",
  deliveryId: "ASSENT-PAIR-DELIVERY",
  agreementRef: "DDE-FIXTURE-001-AGREEMENT@1.0.0",
  executionRef: "ASSENT-PAIR-EXEC",
  submittedAtUtc: T.submitted,
  submittedBy: PROVIDER_AGENT,
  artifacts: [
    {
      id: "logo.svg",
      content: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"120\" height=\"120\" viewBox=\"0 0 120 120\">\n  <title>CoreGuard Shield — synthetic delivery fixture</title>\n  <rect x=\"8\" y=\"8\" width=\"104\" height=\"104\" rx=\"18\" fill=\"#0d1b2a\"/>\n  <path d=\"M60 22 L92 38 V66 C92 86 78 98 60 104 C42 98 28 86 28 66 V38 Z\" fill=\"#1b998b\"/>\n  <circle cx=\"60\" cy=\"62\" r=\"16\" fill=\"#f4f7fa\"/>\n</svg>\n",
      sha256: "0xc32337044edb72a552977bd1699200dabe2e9fab0523292ccb3678b8e555cb36",
      bytes: 372,
    },
    {
      id: "brand-guide.md",
      content: "# Brand Guide — synthetic fixture artifact\n\n## Color tokens\n- Primary: #1b998b\n- Surface: #0d1b2a\n\n## Typography\n- Display: system sans-serif, 700\n",
      sha256: "0xdf5d7e13a448060b370b7663778cea1d4cfb3e7fea294b45163475fc19bb38ad",
      bytes: 149,
    },
    {
      id: "handoff-notes.txt",
      content: "Handoff notes — synthetic fixture artifact.\nThe logo uses the shield motif agreed in the brief.\nSource files available on request within the retention window.\n",
      sha256: "0xfd5dffd73a664d4a7f0ab144340299980fa6d8f65626dbdcc477fa708200041f",
      bytes: 161,
    },
  ],
  provenance: "SYNTHETIC — artifact contents modeled; SHA-256 pins real over the exact embedded bytes; identical in A and B by construction.",
};

// ---------------------------------------------------------------- consent

const consentAttest = {
  permitted: ["CLIENT_PRINCIPAL", "PROVIDER_PRINCIPAL"],
  note: "Modeled assent is declared fixture data — not a cryptographic/portable signature and not evidence of real-world authority or consent.",
};

const modeledAssentNote =
  "Derived tri-state aggregate over per-party modeled assent; the party-level fields are authoritative. State space: FULL (all modeled principals assented) | PARTIAL (at least one assented, at least one other status) | MISSING (none assented) | UNKNOWN (no per-party assent data). An aggregate must never be read as establishing bilateral assent.";

const consentA = {
  alternativeId: "A",
  scopeRef: "ASSENT-DEED-2026-09-23/O1",
  agreementVersion: "DDE-FIXTURE-001-AGREEMENT@1.0.0",
  modeledAssent: "FULL",
  modeledAssentDerivedFrom: ["parties.principalA.assent", "parties.principalB.assent"],
  modeledAssentNote,
  parties: {
    principalA: { role: "client", principalAddress: CLIENT_PRINCIPAL, assent: "ASSENTED", scope: "OBLIGATION-1 — this pinned agreement", withinStatedAuthority: true },
    principalB: { role: "provider", principalAddress: PROVIDER_PRINCIPAL, assent: "ASSENTED", scope: "OBLIGATION-1 — this pinned agreement", withinStatedAuthority: true },
  },
  attestation: consentAttest,
};

const consentB = {
  alternativeId: "B",
  scopeRef: "ASSENT-DEED-2026-09-23/O1",
  agreementVersion: "DDE-FIXTURE-001-AGREEMENT@1.0.0",
  modeledAssent: "PARTIAL",
  modeledAssentDerivedFrom: ["parties.principalA.assent", "parties.principalB.assent"],
  modeledAssentNote,
  parties: {
    principalA: { role: "client", principalAddress: CLIENT_PRINCIPAL, assent: "ASSENTED", scope: "OBLIGATION-1 — this pinned agreement", withinStatedAuthority: true },
    principalB: { role: "provider", principalAddress: PROVIDER_PRINCIPAL, assent: "UNKNOWN", scope: "UNKNOWN — prior modeled assent scoped to ACTION-9 (another action); no modeled assent covers this obligation", withinStatedAuthority: "UNKNOWN" },
  },
  unknownFields: ["principalBAssentForThisObligation"],
  attestation: consentAttest,
  note: "B lacks modeled assent for this obligation. modeledAssent 'PARTIAL' derives from principalA ASSENTED + principalB UNKNOWN — it must not be read as bilateral assent; B's UNKNOWN stays UNKNOWN in parties.principalB.assent and is never filled in from the execution receipt or the delivery manifest.",
};

// ------------------------------------------------------------------- cases

const UNKNOWN_GLOBAL = ["realWorldAuthority", "modeledCompensationSettlement", "meritsOutcome"];

const caseA = {
  packageVersion: PV,
  fixtureId: "ASSENT-PAIR-A",
  scenario: "ASSENT_PRESENT",
  synthetic: true,
  origin: "SYNTHETIC",
  execution,
  delivery,
  consent: consentA,
  unknowns: [...UNKNOWN_GLOBAL],
  boundary: "Execution facts can be verified; consent/origination is modeled and separate. A does not establish real-world authority, payment of the modeled compensation, or a merits outcome.",
};

const caseB = {
  packageVersion: PV,
  fixtureId: "ASSENT-PAIR-B",
  scenario: "ASSENT_MISSING",
  synthetic: true,
  origin: "SYNTHETIC",
  execution,
  delivery,
  consent: consentB,
  unknowns: ["principalBAssentForThisObligation", ...UNKNOWN_GLOBAL],
  boundary: "Identical execution and delivery receipts as A; the ONLY modeled difference is party-B assent. The unknown is preserved as UNKNOWN, never derived from the receipt.",
};

// --------------------------------------------------------- expected-field map

const SAME_EXEC = "SAME_IN_A_B";
const expectedFieldMap = [
  { field: "packageVersion", A: PV, B: PV, source: "package manifest", permittedAttester: "OWNER", unknown: false, note: "pinned version" },
  { field: "scenario", A: "ASSENT_PRESENT", B: "ASSENT_MISSING", source: "scenario definition", permittedAttester: "OWNER", unknown: false, note: "the ONLY intended difference" },
  { field: "execution.txHash", A: SAME_EXEC, B: SAME_EXEC, source: "RPC eth_getTransactionByHash", permittedAttester: "INDEPENDENT — public chain", unknown: false },
  { field: "execution.receipt.status", A: "0x1 (success)", B: "0x1 (success)", source: "RPC eth_getTransactionReceipt", permittedAttester: "INDEPENDENT — public chain", unknown: false },
  { field: "execution.receipt.blockNumber", A: "38712625", B: "38712625", source: "RPC eth_getTransactionReceipt", permittedAttester: "INDEPENDENT — public chain", unknown: false },
  { field: "execution.receipt.gasUsed", A: "21000", B: "21000", source: "RPC eth_getTransactionReceipt", permittedAttester: "INDEPENDENT — public chain", unknown: false },
  { field: "execution.receipt.valueWei", A: "1000000000000000", B: "1000000000000000", source: "RPC eth_getTransactionByHash", permittedAttester: "INDEPENDENT — public chain", unknown: false, note: "execution coupon only" },
  { field: "execution.executionCoupon.role", A: "independent anchor only", B: "independent anchor only", source: "fixture declaration", permittedAttester: "OWNER (label)", unknown: false },
  { field: "execution.compensationSettlement.evidenceStatus", A: "NOT_EVIDENCED_AS_SETTLED", B: "NOT_EVIDENCED_AS_SETTLED", source: "absence of settlement evidence — 'not evidenced as settled', never a verified nonpayment finding", permittedAttester: "NONE — absence cannot be attested from a receipt", unknown: false },
  { field: "execution.compensationSettlement.actualStatus", A: "UNKNOWN", B: "UNKNOWN", source: "actual settlement is not knowable from this fixture", permittedAttester: "NONE", unknown: true },
  { field: "delivery.artifacts[0..2].sha256", A: SAME_EXEC, B: SAME_EXEC, source: "exact embedded bytes (engine artifactSha256)", permittedAttester: "PROVIDER (submission) — engine re-hashes", unknown: false },
  { field: "delivery.submittedBy", A: PROVIDER_AGENT, B: PROVIDER_AGENT, source: "fixture record", permittedAttester: "PROVIDER (submission)", unknown: false },
  { field: "consent.modeledAssent", A: "FULL", B: "PARTIAL", source: "derived tri-state aggregate over per-party modeled assent (party-level fields authoritative)", permittedAttester: "NONE — derived label, never attested; never a read for bilateral assent", unknown: false, note: "B's principalB UNKNOWN stays UNKNOWN in consent.parties.principalB.assent" },
  { field: "consent.parties.principalA.assent", A: "ASSENTED", B: "ASSENTED", source: "modeled synthetic", permittedAttester: "CLIENT_PRINCIPAL", unknown: false },
  { field: "consent.parties.principalB.assent", A: "ASSENTED", B: "UNKNOWN", source: "A modeled; B absent / scoped to another action", permittedAttester: "PROVIDER_PRINCIPAL", unknown: true, note: "B: preserved as unknown, not filled from the receipt" },
  { field: "consent.parties.principalB.withinStatedAuthority", A: "true", B: "UNKNOWN", source: "A modeled; B absent", permittedAttester: "PROVIDER_PRINCIPAL", unknown: true },
  { field: "unknowns.principalBAssentForThisObligation", A: "n/a", B: "preserved UNKNOWN", source: "B consent.unknownFields", permittedAttester: "NONE", unknown: true },
  { field: "unknowns.realWorldAuthority", A: "UNKNOWN", B: "UNKNOWN", source: "neither case models it", permittedAttester: "NONE", unknown: true },
  { field: "unknowns.modeledCompensationSettlement", A: "UNKNOWN — not evidenced as settled", B: "UNKNOWN — not evidenced as settled", source: "evidenceStatus NOT_EVIDENCED_AS_SETTLED; actualStatus UNKNOWN", permittedAttester: "NONE", unknown: true },
  { field: "unknowns.meritsOutcome", A: "UNKNOWN", B: "UNKNOWN", source: "no adjudication modeled", permittedAttester: "NONE", unknown: true },
];

// ----------------------------------------------------------- pin manifest

const manifest = {
  manifest: {
    algorithm: "sha256",
    packageVersion: PV,
    generatedBy: "examples/delivery-fixture/pairs/assent-pair/make-assent-pair.mjs",
    generatedAtUtc: T.generated,
    selfExcluded: ["pair-hashes.json"],
    note: "A/B assent pair — identical execution + delivery receipts; modeled consent differs. Every emitted file pinned by SHA-256 over its exact bytes.",
  },
  pairs: {
    A: "ASSENT_PRESENT",
    B: "ASSENT_MISSING",
    executionIdentical: true,
    deliveryIdentical: true,
    consentDiffersBy: "consent.parties.principalB.assent (+ scope/authority markers + unknownFields + aggregate modeledAssent A=FULL / B=PARTIAL)",
  },
  files: {},
};

const records = {
  "assent-a.json": caseA,
  "assent-b.json": caseB,
  "expected-field-map.json": { packageVersion: PV, description: "Expected-field map for the A/B assent pair — labels execution facts identically and shows B lacks modeled party-B assent for this obligation.", rows: expectedFieldMap },
};

mkdirSync(OUT, { recursive: true });
for (const [name, rec] of Object.entries(records)) {
  const json = JSON.stringify(rec, null, 2) + "\n";
  const buf = Buffer.from(json, "utf8");
  manifest.files[name] = "0x" + createHash("sha256").update(buf).digest("hex");
  records[name] = { json, bytes: buf.length };
}

for (const [name, { json }] of Object.entries(records)) {
  writeFileSync(join(OUT, name), json, "utf8");
}
writeFileSync(join(OUT, "pair-hashes.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.log(`assent pair written: ${Object.keys(records).length + 1} files (A, B, expected-field-map + pair-hashes.json)`);
console.log(`  A = ASSENT_PRESENT  · B = ASSENT_MISSING  · package ${PV}`);
console.log(`  execution + delivery: identical by construction (single shared objects)`);
console.log(`  consent diff: consent.parties.principalB.assent (A=ASSENTED / B=UNKNOWN + scope + authority) · aggregate modeledAssent A=FULL / B=PARTIAL`);
console.log(`  settlement  : evidenceStatus NOT_EVIDENCED_AS_SETTLED · actualStatus UNKNOWN (in both)`);