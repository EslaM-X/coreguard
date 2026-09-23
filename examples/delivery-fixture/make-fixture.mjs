#!/usr/bin/env node
/**
 * make-fixture.mjs — deterministic generator for the CoreGuard DDE
 * bilateral delivery-dispute fixture (DDE/1).
 *
 * HONESTY MODEL (the point of this fixture):
 *   origin: "SYNTHETIC"  — parties, delivery, and dispute are simulated to
 *                          exercise the schema; NO real dispute exists
 *                          between any parties.
 *   execution anchor     — REAL: the public Pilot-1 transaction on Core
 *                          Mainnet, re-verified live against an RPC receipt
 *                          at generation time (status 0x1, block 38712625).
 *   signatures           — REAL EIP-712 over deterministic test keys:
 *                          cryptographically genuine, evidence of nothing
 *                          beyond the fixture itself.
 *
 * Determinism: fixed timestamps, counter-derived keys, RFC-6979 deterministic
 * signing, canonical hashing. Running this twice produces byte-identical
 * output (asserted by test/delivery/fixture.test.js).
 *
 * This script writes evidence records; it never authorizes and never broadcasts.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak, addressFromPublicKey, publicKeyFromPrivateKey, signDigest, typedDataDigestWithDomain } from "../../packages/evm/index.js";
import { domainHash, hashIntent } from "../../packages/canonical/index.js";
import { artifactSha256 } from "../../packages/delivery/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHAIN_ID = "1116";

// Output directory: the fixture dir itself by default; `--out <dir>` writes
// elsewhere (used by the determinism test so the live fixture directory is
// never mutated while parallel test files may be reading it).

// Fixed timestamps — determinism over currency. This fixture documents a
// modeled timeline, not wall-clock reality.
const T = Object.freeze({
  agreed: "2026-09-19T08:00:00Z",
  authorized: "2026-09-19T09:00:00Z",
  anchorChecked: "2026-09-19T12:00:00Z",
  deadline: "2026-09-26T10:00:00Z",
  delivered: "2026-09-24T09:30:00Z",
  acceptance: "2026-09-24T15:00:00Z",
  dispute: "2026-09-24T17:00:00Z",
  recordCloses: "2026-10-01T17:00:00Z",
  generated: "2026-09-19T12:00:00Z",
  retentionUntil: "2027-09-19T00:00:00Z",
});

/** Deterministic key: keccak256("CGEP DDE key <i>") — same pattern as the
 *  provenance test helpers, independent label so the two key spaces differ. */
function seedKey(i) {
  const priv = Buffer.from(keccak(`CGEP DDE key ${i}`)).toString("hex");
  const pub = publicKeyFromPrivateKey(priv);
  return { priv, address: addressFromPublicKey(pub), i };
}

const CLIENT_PRINCIPAL = seedKey(910);
const CLIENT_AGENT = seedKey(911);
const PROVIDER_AGENT = seedKey(912);
const PROVIDER_PRINCIPAL = seedKey(913);

const SYNTHETIC_NOTE =
  "SYNTHETIC identity — a deterministic test key, not a real-world party.";

// --------------------------------------------------------------- agreement

const agreement = {
  origin: "SYNTHETIC",
  recordId: "DDE-FIXTURE-001-AGREEMENT",
  agreementId: "DDE-FIXTURE-001-AGREEMENT",
  version: "1.0.0",
  title: "Synthetic bilateral delivery agreement — brand package",
  client: {
    role: "client (buyer of the deliverable)",
    principalAddress: CLIENT_PRINCIPAL.address,
    agentAddress: CLIENT_AGENT.address,
    authority: "principal scopes the agent by an off-chain mandate for this agreement only",
  },
  provider: {
    role: "provider (produces and delivers the deliverable)",
    principalAddress: PROVIDER_PRINCIPAL.address,
    agentAddress: PROVIDER_AGENT.address,
    authority: "agent signs delivery records within the agreed scope",
  },
  scope: "One brand package: logo.svg, brand-guide.md, handoff-notes.txt",
  compensationWei: "250000000000000000",
  deadlineUtc: T.deadline,
  agreedAtUtc: T.agreed,
  provenance: "SYNTHETIC — modeled agreement to exercise the DDE/1 schema; no real parties",
};

// ----------------------------------------------------- acceptance criteria

const acceptanceCriteria = {
  origin: "SYNTHETIC",
  recordId: "DDE-FIXTURE-001-CRITERIA",
  criteriaRef: "DDE-FIXTURE-001-CRITERIA",
  agreementRef: agreement.agreementId,
  version: "1.0.0",
  note: "Machine-inspectable acceptance criteria fixed before delivery. Conformity is judged by the parties against these criteria — never by the DDE engine.",
  criteria: [
    {
      id: "C-SCOPE",
      statement: "Delivery includes an artifact with id 'logo.svg'.",
      check: { kind: "artifact-exists", artifactId: "logo.svg" },
    },
    {
      id: "C-FORMAT",
      statement: "Artifact 'logo.svg' is valid SVG markup (content starts with '<svg').",
      check: { kind: "artifact-prefix", artifactId: "logo.svg", prefix: "<svg" },
    },
    {
      id: "C-TIMELINE",
      statement: "Delivery was submitted no later than the agreement deadline.",
      check: { kind: "submitted-before-deadline" },
    },
    {
      id: "C-QUALITY",
      statement: "Artifact 'brand-guide.md' defines at least 3 hex color tokens under the '## Color tokens' section.",
      check: { kind: "section-hex-count", artifactId: "brand-guide.md", section: "## Color tokens", min: 3 },
    },
  ],
  provenance: "SYNTHETIC — criteria authored for the fixture scenario",
};

// ------------------------------------------------------------ authorization

const intent = {
  agreementId: agreement.agreementId,
  clientAgent: CLIENT_AGENT.address,
  providerAgent: PROVIDER_AGENT.address,
  maxValueWei: agreement.compensationWei,
  deadlineUtc: T.deadline,
};

const INTENT_TYPES = {
  DeliveryIntent: [
    { name: "agreementId", type: "string" },
    { name: "intentHash", type: "bytes32" },
    { name: "maxValueWei", type: "uint256" },
    { name: "deadlineUtc", type: "string" },
  ],
};
const INTENT_DOMAIN = { name: "CoreGuard DDE Delivery Intent", version: "1", chainId: BigInt(CHAIN_ID) };

const intentHash = await hashIntent(intent);
const intentDigest = typedDataDigestWithDomain(
  "DeliveryIntent",
  INTENT_TYPES,
  { agreementId: intent.agreementId, intentHash, maxValueWei: BigInt(intent.maxValueWei), deadlineUtc: intent.deadlineUtc },
  INTENT_DOMAIN,
);
const intentSig = await signDigest(intentDigest, CLIENT_AGENT.priv);

const authorization = {
  origin: "SYNTHETIC",
  recordId: "DDE-FIXTURE-001-AUTH",
  scheme: "EIP-712",
  subject: CLIENT_AGENT.address,
  signer: CLIENT_AGENT.address,
  intent,
  intentHash,
  signature: {
    r: intentSig.r,
    s: intentSig.s,
    v: intentSig.v,
    digest: "0x" + Buffer.from(intentDigest).toString("hex"),
  },
  domain: { name: INTENT_DOMAIN.name, version: INTENT_DOMAIN.version, chainId: CHAIN_ID },
  signedAtUtc: T.authorized,
  authorityNote:
    "The client agent signs the delivery intent within the principal's mandate. Signature is cryptographically real (replayable) and evidences only this fixture — the identities behind it are " + SYNTHETIC_NOTE,
};

// ----------------------------------------------------- execution attestation

const execution = {
  origin: "REAL",
  recordId: "DDE-FIXTURE-001-EXEC",
  executionId: "DDE-FIXTURE-001-EXEC",
  network: "core-mainnet",
  chainId: CHAIN_ID,
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
    agreementCompensationWei: agreement.compensationWei,
    settledByExecutionCoupon: false,
    note: "The execution coupon (0.001 CORE) does not settle the modeled compensation (0.25 CORE). Absence of settlement evidence supports 'not evidenced as settled', never a verified nonpayment finding; actual settlement remains UNKNOWN in this record.",
  },
  verifiedVia: {
    rpc: "rpc.coredao.org",
    method: "eth_getTransactionReceipt",
    checkedAtUtc: T.anchorChecked,
  },
  reference: "examples/pilot/proof-artifact-1.json — Pilot-1 public proof artifact (VERIFIED)",
  provenance:
    "REAL — public Pilot-1 Core Mainnet transaction; receipt fields re-verified live from the RPC at fixture generation. This anchors the EXECUTION layer only: the execution coupon transfer is settled on-chain; the modeled agreement compensation is NOT evidenced as settled by it (compensationSettlement.evidenceStatus = NOT_EVIDENCED_AS_SETTLED); actualStatus = UNKNOWN; never delivery conformity.",
};

// --------------------------------------------------------- delivery manifest

const ARTIFACTS = {
  "logo.svg":
'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">\n' +
'  <title>CoreGuard Shield — synthetic delivery fixture</title>\n' +
'  <rect x="8" y="8" width="104" height="104" rx="18" fill="#0d1b2a"/>\n' +
'  <path d="M60 22 L92 38 V66 C92 86 78 98 60 104 C42 98 28 86 28 66 V38 Z" fill="#1b998b"/>\n' +
'  <circle cx="60" cy="62" r="16" fill="#f4f7fa"/>\n' +
"</svg>\n",

  // Deliberately short: only 2 hex tokens under '## Color tokens' — the
  // quality criterion requires at least 3. This is the modeled defect.
  "brand-guide.md":
"# Brand Guide — synthetic fixture artifact\n\n" +
"## Color tokens\n" +
"- Primary: #1b998b\n" +
"- Surface: #0d1b2a\n\n" +
"## Typography\n" +
"- Display: system sans-serif, 700\n",

  "handoff-notes.txt":
"Handoff notes — synthetic fixture artifact.\n" +
"The logo uses the shield motif agreed in the brief.\n" +
"Source files available on request within the retention window.\n",
};

const artifacts = [];
for (const [id, content] of Object.entries(ARTIFACTS)) {
  artifacts.push({
    id,
    content,
    sha256: await artifactSha256(content),
    bytes: Buffer.byteLength(content, "utf8"),
  });
}

const delivery = {
  origin: "SYNTHETIC",
  recordId: "DDE-FIXTURE-001-DELIVERY",
  deliveryId: "DDE-FIXTURE-001-DELIVERY",
  agreementRef: agreement.agreementId,
  executionRef: execution.executionId,
  submittedAtUtc: T.delivered,
  submittedBy: PROVIDER_AGENT.address,
  artifacts,
  provenance:
    "SYNTHETIC — artifact contents modeled for the scenario; SHA-256 pins are real over the exact embedded bytes (single hash definition: packages/delivery artifactSha256)",
};

// --------------------------------------------------------- acceptance record

const acceptanceRecord = {
  origin: "SYNTHETIC",
  recordId: "DDE-FIXTURE-001-ACCEPTANCE",
  acceptanceId: "DDE-FIXTURE-001-ACCEPTANCE",
  criteriaRef: acceptanceCriteria.criteriaRef,
  deliveryRef: delivery.deliveryId,
  verdict: "REJECTED",
  basis: ["CRITERIA_EVALUATION"],
  derivedFrom: "criteria",
  evaluations: [
    { criterionId: "C-SCOPE", result: "PASS", observed: "artifact 'logo.svg' present in the delivery manifest" },
    { criterionId: "C-FORMAT", result: "PASS", observed: "'logo.svg' content begins with '<svg'" },
    { criterionId: "C-TIMELINE", result: "PASS", observed: `submitted ${T.delivered} <= deadline ${T.deadline}` },
    {
      criterionId: "C-QUALITY",
      result: "FAIL",
      observed: "'brand-guide.md' defines 2 hex color tokens under '## Color tokens'; the criterion requires at least 3",
    },
  ],
  signedBy: [CLIENT_AGENT.address],
  recordedAtUtc: T.acceptance,
  note: "The rejection rests solely on the recorded criterion evaluations. It is a party act under DDE/1 — it is not derived from execution facts, and payment settlement plays no part in it.",
};

// ------------------------------------------------------------ dispute record

const disputeRecord = {
  origin: "SYNTHETIC",
  recordId: "DDE-FIXTURE-001-DISPUTE",
  disputeId: "DDE-FIXTURE-001-DISPUTE",
  acceptanceRef: acceptanceRecord.acceptanceId,
  openedAtUtc: T.dispute,
  recordClosesAtUtc: T.recordCloses,
  closedAtUtc: null,
  partyA: {
    role: "provider",
    agentAddress: PROVIDER_AGENT.address,
    position: "The delivered package matches the agreed scope; the quality criterion was applied more strictly than the brief required.",
    requestedRemedy: "NONE",
  },
  partyB: {
    role: "client",
    agentAddress: CLIENT_AGENT.address,
    position: "'brand-guide.md' misses the required minimum of three color tokens; the package is incomplete as specified.",
    requestedRemedy: "REWORK",
  },
  engineAdjudication: "NONE — the DDE engine names no winner; it preserves both positions and the closed evidence record.",
  provenance: "SYNTHETIC — a modeled disagreement for schema exercise; no real dispute exists between any parties",
};

// -------------------------------------------------- consent and disclosure

const fixtureRef = await domainHash("DDE/1:FIXTURE-REF", {
  agreementId: agreement.agreementId,
  version: agreement.version,
});
const GRANT_SCOPE =
  "Redacted public review of this fixture: all parties are synthetic; the on-chain anchor is a public transaction; no secrets and no personal data are included.";

const GRANT_TYPES = {
  RedactionGrant: [
    { name: "grantor", type: "address" },
    { name: "fixtureRef", type: "bytes32" },
    { name: "scope", type: "string" },
  ],
};
const GRANT_DOMAIN = { name: "CoreGuard DDE Redaction Grant", version: "1", chainId: BigInt(CHAIN_ID) };

async function makeGrant(principal) {
  const digest = typedDataDigestWithDomain(
    "RedactionGrant",
    GRANT_TYPES,
    { grantor: principal.address, fixtureRef, scope: GRANT_SCOPE },
    GRANT_DOMAIN,
  );
  const sig = await signDigest(digest, principal.priv);
  return {
    grantor: principal.address,
    fixtureRef,
    scope: GRANT_SCOPE,
    signature: { r: sig.r, s: sig.s, v: sig.v, digest: "0x" + Buffer.from(digest).toString("hex") },
  };
}

const consentAndDisclosure = {
  origin: "SYNTHETIC",
  recordId: "DDE-FIXTURE-001-CONSENT",
  chainId: CHAIN_ID,
  fixtureRef,
  disclosure: {
    origin: "SYNTHETIC",
    realDisputeExists: false,
    realTransactionAnchor: true,
    realSignatures: true,
    signatureMeaning: "cryptographically genuine EIP-712 replays over deterministic fixture keys — not evidence that real parties consented to anything",
    secretsRemoved: true,
    personalDataRemoved: true,
    peoplesCourtConsent: "none — inclusion of a People's Court mapping implies no endorsement, procedure, or agreement by People's Court / Epistemic Labs",
  },
  redactionGrants: [
    await makeGrant(CLIENT_PRINCIPAL),
    await makeGrant(PROVIDER_PRINCIPAL),
  ],
};

// --------------------------------------------------------- retention policy

const retentionPolicy = {
  origin: "SYNTHETIC",
  recordId: "DDE-FIXTURE-001-RETENTION",
  retentionUtcUntil: T.retentionUntil,
  allowPublicArchive: true,
  purgeCommitment: "Either grantor may request deletion of the fixture artifacts after the retention window; the on-chain anchor remains public regardless.",
  contactNote: "Fixture maintained in the coreguard repository under examples/delivery-fixture/.",
};

// ----------------------------------------------------------------- assemble

const records = {
  "agreement.json": agreement,
  "acceptance-criteria.json": acceptanceCriteria,
  "parties.json": {
    origin: "SYNTHETIC",
    recordId: "DDE-FIXTURE-001-PARTIES",
    client: agreement.client,
    provider: agreement.provider,
    keysNote: "All addresses derive deterministically from counter-based test keys (keccak256(\"CGEP DDE key <i>\")). " + SYNTHETIC_NOTE,
  },
  "authorization.json": authorization,
  "execution-attestation.json": execution,
  "delivery-manifest.json": delivery,
  "acceptance-record.json": acceptanceRecord,
  "dispute-record.json": disputeRecord,
  "consent-and-disclosure.json": consentAndDisclosure,
  "retention-policy.json": retentionPolicy,
};

const manifest = {
  manifest: {
    algorithm: "sha256",
    generatedBy: "examples/delivery-fixture/make-fixture.mjs",
    generatedAtUtc: T.generated,
    selfExcluded: ["hashes.json"],
    note: "Every record file is pinned by SHA-256 over its exact bytes. hashes.json cannot hash itself — the single declared self-exclusion.",
  },
  fixture: {
    origin: "SYNTHETIC",
    realDisputeExists: false,
    lifecycleState: "DISPUTE_OPEN",
    ddeVersion: "DDE/1",
  },
  files: {},
};

for (const [name, rec] of Object.entries(records)) {
  const json = JSON.stringify(rec, null, 2) + "\n";
  const buf = Buffer.from(json, "utf8");
  manifest.files[name] =
    "0x" + (await import("node:crypto")).createHash("sha256").update(buf).digest("hex");
  records[name] = { json, bytes: buf.length };
}

const outArg = process.argv.indexOf("--out");
const OUT = outArg > -1 ? process.argv[outArg + 1] : HERE;
mkdirSync(OUT, { recursive: true });
for (const [name, { json }] of Object.entries(records)) {
  writeFileSync(join(OUT, name), json, "utf8");
}
writeFileSync(join(OUT, "hashes.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.log(`fixture written: ${Object.keys(records).length + 1} files (10 records + hashes.json)`);
console.log(`  parties: client=${CLIENT_AGENT.address} provider=${PROVIDER_AGENT.address}`);
console.log(`  anchor : ${execution.txHash} (REAL, receipt re-verified ${T.anchorChecked})`);
console.log(`  verdict: ${acceptanceRecord.verdict} on C-QUALITY — synthetic dispute for schema exercise`);
