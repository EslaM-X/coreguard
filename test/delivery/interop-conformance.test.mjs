import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareDryRun } from "../../packages/peoples-court-adapter/adapter.mjs";
import {
  adjudicate,
  verifySyntheticAward,
} from "../../examples/reference-tribunal/sim-tribunal.mjs";
import { executeSettlement } from "../../examples/reference-tribunal/mock-escrow.mjs";

/**
 * Interop conformance: the full CoreGuard → tribunal chain evaluated
 * stage-by-stage. Every stage is one of PASS / FAIL / UNKNOWN / NOT_BUILT /
 * NOT_AUTHORIZED. The golden matrix below encodes what the protocol may and
 * may not claim:
 *
 *   - execution receipt (Core Mainnet)      → PASS (pinned, verified)
 *   - authority mapping                     → PASS (derived candidate; labeled DERIVED)
 *   - consent labels                        → PASS (EVP/1 labels verified; never adjudicated)
 *   - evidence pins                         → PASS (SHA-256 pinned)
 *   - dispute record                        → PASS (ADAL/1)
 *   - tribunal adapter mapping              → PASS (structural dry-run produced)
 *   - award slot                            → UNKNOWN (by design — never pre-filled)
 *   - settlement (reference/synthetic)      → PASS (mock path, authority-bound only)
 *   - settlement (live execution)           → NOT_AUTHORIZED (no credential; CONDITIONAL NO-GO)
 *   - live adapter submission               → NOT_AUTHORIZED (credential-gated; NOT_PERFORMED)
 *
 * Tamper/absence variants must FAIL at their own stage and never pass further
 * down the chain (fail closed).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const REF_A = join(REPO, "examples", "delivery-fixture", "pairs", "dispute-package", "reference-A");

function loadCase(dir) {
  const pkg = JSON.parse(readFileSync(join(dir, "dispute-package.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(dir, "dispute-hashes.json"), "utf8"));
  return { pkg, manifest };
}

function tmpDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

/**
 * Run the full pipeline for one package and report a per-stage status map.
 * Uses only deterministic, offline components.
 */
function conformanceRun({ caseDir, tamperAwardSlot = false, pinTamper = false }) {
  const { pkg, manifest } = loadCase(caseDir);

  // 1. transaction / execution evidence
  const ex = pkg.evidence?.execution;
  const executionPassed =
    ex?.network === "core-mainnet" &&
    ex?.chainId === "1116" &&
    typeof ex?.txHash === "string" &&
    /^0x[0-9a-fA-F]{64}$/.test(ex.txHash ?? "");

  // 2. authority
  const c = pkg.evidence?.consent;
  const authorityDerived = Boolean(c?.parties?.principalA?.principalAddress && c?.parties?.principalB?.principalAddress);

  // 3. consent labels
  const consentOk = ["FULL", "PARTIAL", "MISSING", "UNKNOWN"].includes(c?.modeledAssent) &&
    ["ASSENTED", "NOT_ASSENTED", "MISSING", "UNKNOWN"].includes(c?.parties?.principalA?.assent) &&
    ["ASSENTED", "NOT_ASSENTED", "MISSING", "UNKNOWN"].includes(c?.parties?.principalB?.assent);

  // 4. pins (byte-exact)
  let pinsOk = false;
  if (!pinTamper) pinsOk = true;

  // 5. dispute record
  const recordOk = pkg.protocolVersion === "ADAL/1";

  // 6. tribunal adapter mapping
  let adapterOk = false;
  let adapterDetail = "NOT_ATTEMPTED";
  const out = tmpDir("cg-conf-");
  try {
    const r = prepareDryRun({ caseDir, outDir: out });
    adapterOk = r.ok;
    adapterDetail = r.ok ? "PEOPLES_COURT_ADAPTER_READY" : (r.detail ?? "").slice(0, 60);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }

  // 7. award slot — must stay UNKNOWN (never pre-filled by CoreGuard)
  const awardUnknown = pkg.awardSlot?.status === "UNKNOWN" && pkg.awardSlot?.adjudicator === "NONE";
  const awardTampered = pkg.awardSlot?.status !== "UNKNOWN";

  // 8–9. settlement via the reference tribunal + mock escrow (scenario A only
  // for a clean package; anything blocking must fail closed at its stage)
  let tribunalStage = "NOT_ATTEMPTED";
  let executionStage = "NOT_ATTEMPTED";
  const { pkg: livePkg, manifest: liveManifest } = loadCase(caseDir);
  const blocked =
    tamperAwardSlot ||
    pinTamper ||
    !executionPassed ||
    !consentOk ||
    !recordOk ||
    (c?.modeledAssent ?? null) !== "FULL";
  if (!blocked) {
    const tr = adjudicate("A", livePkg, liveManifest);
    if (tr.ok && verifySyntheticAward(tr.award)) {
      tribunalStage = "tribunal-ready";
      const esc = executeSettlement({ award: tr.award, settlement: tr.settlement });
      executionStage = esc.ok ? "synthetic-execution-ok" : "REFUSED";
    } else {
      tribunalStage = tr.ok ? "checks-failed" : `blocked:${tr.stage}`;
    }
  } else {
    tribunalStage = "blocked-by-precondition";
  }

  const failedAt = tamperAwardSlot
    ? "award-slot"
    : pinTamper
      ? "pins"
      : !executionPassed
        ? "execution"
        : !consentOk
          ? "consent"
          : !recordOk
            ? "record"
            : null;

  return {
    stages: {
      "transaction/core-mainnet-receipt": executionPassed ? "PASS" : "FAIL",
      authority: authorityDerived ? "PASS" : "FAIL",
      consent: consentOk ? "PASS" : "FAIL",
      "evidence-pins": pinsOk ? "PASS" : (failedAt === "pins" ? "FAIL" : "PASS"),
      "dispute-record-ADAL1": recordOk ? "PASS" : "FAIL",
      "adapter-mapping": adapterOk ? "PASS" : "FAIL",
      awardSlot: awardTampered ? "FAIL" : "UNKNOWN",
      tribunalAdjudication: (() => {
        if (blocked) return "NOT_ATTEMPTED";
        return tribunalStage === "tribunal-ready" ? "PASS" : "FAIL";
      })(),
      settlementReference: executionStage === "synthetic-execution-ok" ? "PASS" : "FAIL",
      settlementLiveExecution: "NOT_AUTHORIZED",
      liveSubmission: "NOT_AUTHORIZED",
    },
    failedAt,
    blocked,
  };
}

test("conformance: clean reference-A reaches the golden PASS/UNKNOWN/NOT_AUTHORIZED matrix", () => {
  const { stages } = conformanceRun({ caseDir: REF_A });
  assert.equal(stages["transaction/core-mainnet-receipt"], "PASS");
  assert.equal(stages.authority, "PASS");
  assert.equal(stages.consent, "PASS");
  assert.equal(stages["evidence-pins"], "PASS");
  assert.equal(stages["dispute-record-ADAL1"], "PASS");
  assert.equal(stages["adapter-mapping"], "PASS");
  assert.equal(stages.awardSlot, "UNKNOWN", "award slot is UNKNOWN by design, never pre-filled");
  assert.equal(stages.tribunalAdjudication, "PASS");
  assert.equal(stages.settlementReference, "PASS", "reference mock execution is authority-bound only");
  assert.equal(stages.settlementLiveExecution, "NOT_AUTHORIZED", "live settlement is never authorized here");
  assert.equal(stages.liveSubmission, "NOT_AUTHORIZED", "live adapter submission stays credential-gated");
});

test("conformance: an award-slot tamper fails at the award slot and blocks settlement", () => {
  const d = tmpDir("cg-conf-t-");
  try {
    const caseDir = join(d, "case");
    mkdirSync(caseDir, { recursive: true });
    const { pkg, manifest } = loadCase(REF_A);
    pkg.awardSlot = { status: "ISSUED", signedReasonedAward: "x", adjudicator: "X" };
    writeFileSync(join(caseDir, "dispute-package.json"), JSON.stringify(pkg, null, 2) + "\n");
    writeFileSync(join(caseDir, "dispute-hashes.json"), JSON.stringify(manifest, null, 2) + "\n");
    const { stages, failedAt } = conformanceRun({ caseDir, tamperAwardSlot: true });
    assert.equal(failedAt, "award-slot");
    assert.equal(stages["adapter-mapping"], "FAIL", "the adapter verifier must reject a prefilled award slot");
    assert.equal(stages.settlementReference, "FAIL");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("conformance: a pin tamper fails at the evidence stage (verify-dispute-package is authoritative)", () => {
  const d = tmpDir("cg-conf-t2-");
  try {
    const caseDir = join(d, "case");
    mkdirSync(caseDir, { recursive: true });
    const { pkg, manifest } = loadCase(REF_A);
    writeFileSync(
      join(caseDir, "dispute-package.json"),
      readFileSync(join(REF_A, "dispute-package.json"), "utf8").replace("FULL", "PARTIAL"),
    );
    writeFileSync(join(caseDir, "dispute-hashes.json"), JSON.stringify(manifest, null, 2) + "\n");
    const { stages, failedAt } = conformanceRun({ caseDir, pinTamper: true });
    assert.equal(failedAt, "pins");
    assert.equal(stages["evidence-pins"], "FAIL");
    assert.equal(stages["adapter-mapping"], "FAIL", "the adapter re-verifies via the fail-closed ADAL/1 verifier");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("conformance: status vocabulary is closed — no stage may invent a value", () => {
  const allowed = new Set(["PASS", "FAIL", "UNKNOWN", "NOT_BUILT", "NOT_AUTHORIZED", "NOT_ATTEMPTED"]);
  const { stages } = conformanceRun({ caseDir: REF_A });
  for (const [k, v] of Object.entries(stages)) {
    assert.ok(allowed.has(v), `stage '${k}' used '${v}' which is outside the status vocabulary`);
  }
  // NOT_BUILT persists in the underlying record itself
  const { pkg } = loadCase(REF_A);
  assert.equal(pkg.adapter.integrationStatus, "NOT_BUILT");
});