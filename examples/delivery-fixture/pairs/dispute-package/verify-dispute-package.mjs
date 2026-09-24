#!/usr/bin/env node
/**
 * verify-dispute-package.mjs — fail-closed verifier for an ADAL/1 dispute
 * package. Assumes it runs inside the delivered dispute-package dir (the same
 * convention as verify-assent-pair.mjs) and reads dispute-package.json +
 * dispute-hashes.json.
 *
 * Invariants (all must pass; any failure → exit 1, no partial green):
 *   V1  pins: every emitted file's SHA-256 matches dispute-hashes.json
 *       (manifest self-excluded)
 *   V2  protocol identity: protocolVersion ADAL/1 + packageVersion present
 *   V3  synthetic + origin labels present
 *   V4  evidence layer carries EVP/1 labels: consent aggregate derived
 *       tri-state (never boolean); evidenceStatus/actualStatus split; unknowns
 *       preserved; execution txHash present
 *   V5  award slot NEVER prefilled: awardSlot.status === UNKNOWN and
 *       signedReasonedAward === null and adjudicator === "NONE"
 *   V6  escrow is reference-only: escrowRef.deployed === false and
 *       escrowRef.chain === "none"
 *   V7  adapter is NOT built: adapter.integrationStatus === "NOT_BUILT" and
 *       consumers.length === 0
 *   V8  positions is a party record set (both principals present) and closure
 *       present
 *   V9  no overclaim text: package boundary/note mentions no adjudication,
 *       no real-world authority, no payment claim
 *
 * Exit: 0 DISPUTE_PACKAGE OK (N checked) · 1 fail-closed · 2 usage
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const HERE = process.cwd();
const PKG = join(HERE, "dispute-package.json");
const MANIFEST = join(HERE, "dispute-hashes.json");

if (!existsSync(PKG) || !existsSync(MANIFEST)) {
  console.error("usage: run inside a delivered dispute-package dir (dispute-package.json + dispute-hashes.json required).");
  process.exit(2);
}

const fails = [];
const checks = [];

function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  if (!ok) fails.push(`${name}: ${detail}`);
}

const pkg = JSON.parse(readFileSync(PKG, "utf8"));
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));

// V1 — pins match exact bytes
{
  const selfExcluded = manifest.manifest?.selfExcluded ?? [];
  for (const [name, pin] of Object.entries(manifest.files ?? {})) {
    if (!existsSync(join(HERE, name))) {
      check(`V1::${name}`, false, "file missing from delivered tree");
      continue;
    }
    const actual = "0x" + createHash("sha256").update(readFileSync(join(HERE, name))).digest("hex");
    check(`V1::${name}`, actual === pin, `pin mismatch (${actual} != ${pin})`);
  }
  const emitted = ["dispute-package.json", "dispute-hashes.json"];
  for (const f of emitted) {
    if (selfExcluded.includes(f)) continue;
    if (!(f in (manifest.files ?? {}))) check(`V1::${f}`, false, "emitted file not pinned");
  }
}

// V2 — protocol identity
{
  const protoOk = pkg.protocolVersion === "ADAL/1";
  check("V2::protocolVersion", protoOk, `expected ADAL/1, got ${pkg.protocolVersion ?? "(missing)"}`);
  check("V2::packageVersion", typeof pkg.packageVersion === "string" && pkg.packageVersion.length > 0, "packageVersion missing");
  check("V2::caseRef", pkg.caseRef === "A" || pkg.caseRef === "B", `caseRef must be A or B, got ${pkg.caseRef}`);
}

// V3 — synthetic labels
{
  check("V3::synthetic", pkg.synthetic === true, "package must be synthetic: true");
  check("V3::origin", pkg.origin === "SYNTHETIC", `origin must be SYNTHETIC, got ${pkg.origin}`);
}

// V4 — EVP/1 labels inside evidence
{
  const c = pkg.evidence?.consent;
  const agg = c?.modeledAssent;
  const triState = ["FULL", "PARTIAL", "MISSING", "UNKNOWN"].includes(agg);
  check("V4::consentAggregateTriState", triState, `modeledAssent must be a derived tri-state string, got ${JSON.stringify(agg)}`);
  check("V4::consentAggregateNotBoolean", typeof agg === "string", `modeledAssent must never be a boolean, got ${typeof agg}`);
  check("V4::derivationNamed", Array.isArray(c?.modeledAssentDerivedFrom) && c.modeledAssentDerivedFrom.length > 0, "modeledAssentDerivedFrom must name source fields");
  const st = pkg.evidence?.execution?.compensationSettlement;
  check("V4::evidenceStatusSplit", typeof st?.evidenceStatus === "string" && typeof st?.actualStatus === "string", "settlement must carry evidenceStatus AND actualStatus");
  check("V4::noBooleanStatus", typeof st?.status === "undefined", "no boolean status field may exist");
  check("V4::executionTxHash", typeof pkg.evidence?.execution?.txHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(pkg.evidence.execution.txHash ?? ""), "execution txHash missing/malformed");
  check("V4::unknownsPreserved", Array.isArray(pkg.evidence?.unknowns) && pkg.evidence.unknowns.includes("meritsOutcome"), "evidence unknowns must be explicit");
}

// V5 — award slot never prefilled
{
  const a = pkg.awardSlot ?? {};
  check("V5::awardUnknown", a.status === "UNKNOWN", `awardSlot.status must be UNKNOWN, got ${JSON.stringify(a.status)}`);
  check("V5::noSignedAward", a.signedReasonedAward === null, "signedReasonedAward must be null");
  check("V5::adjudicatorNone", a.adjudicator === "NONE", `adjudicator must be NONE, got ${JSON.stringify(a.adjudicator)}`);
}

// V6 — escrow reference-only
{
  const e = pkg.escrowRef ?? {};
  check("V6::escrowNotDeployed", e.deployed === false, `escrowRef.deployed must be false, got ${JSON.stringify(e.deployed)}`);
  check("V6::escrowNoChain", e.chain === "none", `escrowRef.chain must be "none", got ${JSON.stringify(e.chain)}`);
  check("V6::escrowReferenceLabel", e.kind === "REFERENCE_INTERFACE", "escrowRef.kind must be REFERENCE_INTERFACE");
}

// V7 — adapter not built
{
  const a = pkg.adapter ?? {};
  check("V7::adapterNotBuilt", a.integrationStatus === "NOT_BUILT", `adapter.integrationStatus must be NOT_BUILT, got ${JSON.stringify(a.integrationStatus)}`);
  check("V7::noConsumers", Array.isArray(a.consumers) && a.consumers.length === 0, "adapter.consumers must be empty");
}

// V8 — positions + closure present
{
  const p = pkg.positions ?? {};
  check("V8::principalAPosition", typeof p.principalA?.position === "string" && typeof p.principalA?.requestedRemedy === "string", "principalA position/remedy missing");
  check("V8::principalBPosition", typeof p.principalB?.position === "string" && typeof p.principalB?.requestedRemedy === "string", "principalB position/remedy missing");
  check("V8::closure", typeof pkg.closure?.closesAtUtc === "string" && typeof pkg.closure?.policy === "string", "closure missing");
}

// V9 — no overclaim text in the package boundary: the boundary must negate any
// establishment of authority/payment/merits and must not affirm them positively
{
  const b = String(pkg.boundary ?? "").toLowerCase();
  const negates = /\bno\b|never|does not|cannot/.test(b);
  const mentions = /authorit|payment|settlement|merits/.test(b);
  const affirms = /is settlement|was paid|authorizes (the )?(deal|transfer)|(merits|dispute) (resolved|decided)/.test(b);
  check("V9::boundaryLabels", negates && mentions && !affirms, "boundary must negate (not affirm) real-world authority/payment/merits claims");
}

const ok = fails.length === 0;
const tail = ok ? `${checks.length} checks` : `${checks.length} checks — ${fails.length} failures`;
console.log(`dispute package verify: ${ok ? "DISPUTE_PACKAGE OK" : "FAILED"} (${tail})`);
if (!ok) {
  for (const f of fails) console.error(`  ✖ ${f}`);
  process.exit(1);
}
process.exit(0);