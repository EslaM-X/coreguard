/**
 * CoreGuard AgentProof — verify-provenance Orchestrator (CGEP/1:AGENT-PROVENANCE §7)
 *
 * Per-check, fail-closed report. Each axis is evaluated independently and
 * fully (Checks Table §7):
 *
 *   PROVENANCE_COMMITMENT       manifestId recomputed from manifestCore == declared
 *                               (with anchored commitment when evidence gives proofRef).
 *   MANIFEST_SIGNATURE          EIP-712 replay; recovered signer == declared signer.
 *   DECLARER_EXECUTION_BINDING  authority over THIS execution:
 *                                 STAMP: root authority == actual tx.from
 *                                        (direct or via delegation chain).
 *   DELEGATION_CHAIN            ordered, scoped, non-expired, root-authority-correct.
 *   ATTESTATION_SIGNATURES      replayed vs issuer (crypto axis).
 *   ATTESTATION_RECOGNITION     trusted-issuer policy → ATTESTED/NOT_PROVEN.
 *   EXECUTOR_TYPE               normalized enum (advisory only, never a verdict).
 *   REVOCATION                  §5b: NEVER "PROVEN" without authoritative evidence.
 *
 * The manifest is treated as untrusted input; everything is recomputed from
 * the rooted domainHash over the declared manifestCore.
 */

import { validateManifest } from "./manifest.js";
import { computeManifestId } from "./canonical.js";
import { verifyDelegationChain } from "./delegation.js";
import {
  verifyAttestationSignature,
  recognizeAttestation,
  revocationStatus,
} from "./attestation.js";
import { normalizeExecutorType } from "./taxonomy.js";
import { typedDataDigest, recoverSignerAddress } from "./eip712.js";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

const MANIFEST_TYPES = Object.freeze({
  ManifestDeclaration: Object.freeze([{ name: "manifestId", type: "bytes32" }]),
});

/**
 * Verify a full AgentProof manifest against a specific execution.
 *
 * @param {object} manifest  untrusted manifest (envelope + declared)
 * @param {object} evidence
 *   @param {string} evidence.chainId          anchoring chainId (1116/1114)
 *   @param {string} evidence.executionFrom    actual tx.from address
 *   @param {string} [evidence.executionBlock] decimal block number
 *   @param {object} [evidence.commitment]     { root, proof } anchor reference
 *   @param {Array}  [evidence.attestations]   signed attestation envelopes
 *   @param {object} [evidence.confidence]     { trustedAttestors [...] }
 *   @param {object} [evidence.revocationEvidence] { revocationProof {...} }
 * @returns {{ verdicts: object, summary: string, errors: string[] }}
 */
export async function verifyProvenance(manifest, evidence = {}) {
  const { chainId, executionFrom, executionBlock } = evidence;
  const errors = [];

  if (typeof chainId !== "string" || !/^[0-9]+$/.test(chainId)) {
    errors.push("evidence.chainId must be a decimal string");
  }
  if (typeof executionFrom !== "string" || !ADDRESS_RE.test(executionFrom)) {
    errors.push("evidence.executionFrom must be an EVM address");
  }

  // ── 1. PROVENANCE_COMMITMENT ────────────────────────────────────────────
  const commitment = { status: "NOT_PROVEN", label: "NOT_EVALUATED" };

  let schema;
  try {
    schema = validateManifest(manifest);
  } catch (e) {
    return {
      verdicts: { PROVENANCE_COMMITMENT: commitment },
      summary: `FAIL_CLOSED: ${e.message}`,
      errors: [...errors, e.message],
    };
  }

  if (!schema.valid) {
    commitment.status = "NOT_PROVEN";
    commitment.label = "SCHEMA_INVALID";
    return {
      verdicts: { PROVENANCE_COMMITMENT: commitment },
      summary: "FAIL_CLOSED: schema invalid",
      errors: [...errors, ...schema.errors],
    };
  }

  const manifestId = await computeManifestId(manifest);

  if (manifest.manifestId && String(manifest.manifestId).toLowerCase() === manifestId) {
    commitment.status = "OK";
    commitment.label = "MANIFEST_ID_MATCHES";
    const proofRef = evidence.commitment?.proofRef || null;
    commitment.anchored = proofRef ? String(proofRef) : null;
  } else if (manifest.manifestId) {
    commitment.status = "NOT_PROVEN";
    commitment.label = "MANIFEST_ID_MISMATCH";
    errors.push("manifest.manifestId != recomputed manifestId");
  } else {
    commitment.status = "NOT_PROVEN";
    commitment.label = "MANIFEST_ID_MISSING";
    errors.push("manifest.manifestId missing");
  }

  // ── 2. MANIFEST_SIGNATURE ───────────────────────────────────────────────
  const sig = manifest.signature || {};
  const manifestSignature = { status: "NOT_PROVEN", label: "NO_SIGNATURE" };

  if (typeof sig.r === "string" && /^[0-9a-fA-F]{64}$/.test(sig.r) &&
      typeof sig.s === "string" && /^[0-9a-fA-F]{64}$/.test(sig.s) &&
      (sig.v === 27 || sig.v === 28)) {
    try {
      const digest = typedDataDigest(
        "ManifestDeclaration",
        MANIFEST_TYPES,
        { manifestId },
        chainId,
      );
      const recovered = recoverSignerAddress(digest, { r: sig.r, s: sig.s, v: sig.v });
      if (String(recovered).toLowerCase() === String(sig.signer || "").toLowerCase()) {
        manifestSignature.status = "OK";
        manifestSignature.label = "RECOVERED_SIGNER";
        manifestSignature.signer = recovered;
      } else {
        manifestSignature.status = "NOT_PROVEN";
        manifestSignature.label = "SIGNER_MISMATCH";
        errors.push(`recovered signer ${recovered} != declared ${sig.signer}`);
      }
    } catch (e) {
      manifestSignature.status = "NOT_PROVEN";
      manifestSignature.label = "RECOVERY_THREW";
      errors.push(e.message);
    }
  } else {
    manifestSignature.status = "NOT_PROVEN";
    manifestSignature.label = "SIG_MALFORMED";
    errors.push("manifest signature envelope malformed");
  }

  // ── 3. EXECUTOR_TYPE (advisory) ─────────────────────────────────────────
  const executorType = normalizeExecutorType(manifest.declared?.executorType);
  const executorTypeStatus = {
    executorType,
    status: "DECLARED",
    strongest: "DECLARED",
    advisory: true,
  };

  // ── 4. DECLARER_EXECUTION_BINDING + DELEGATION_CHAIN ────────────────────
  const declarerBinding = { status: "NOT_PROVEN", label: "NOT_EVALUATED", txFrom: executionFrom || null };
  const delegation = { status: "NOT_PROVEN", label: "NOT_EVALUATED", links: [], grantee: null };

  const declaredSigner = (manifest.declared?.signerBinding || {}).address || "";
  const chain = Array.isArray(manifest.declared?.delegationChain) ? manifest.declared.delegationChain : [];

  if (schema.kind === "STAMP") {
    if (chain.length === 0) {
      delegation.status = "NOT_PROVEN";
      delegation.label = "NO_DELEGATION_CHAIN";
    } else {
      const chkV = verifyDelegationChain(chain, {
        chainId,
        rootAuthority: declaredSigner,
        executionBlock,
      });
      delegation.status = chkV.valid ? "OK" : "NOT_PROVEN";
      delegation.label = chkV.valid ? "CHAIN_VALID" : `CHAIN_INVALID: ${chkV.reason}`;
      delegation.links = chkV.links;
      delegation.grantee = chkV.grantee || null;
      if (!chkV.valid) errors.push(`DELEGATION_CHAIN: ${chkV.reason}`);
    }

    // DECLARER_EXECUTION_BINDING: root authority == actual execution `from`.
    if (declaredSigner && executionFrom &&
        declaredSigner.toLowerCase() === executionFrom.toLowerCase()) {
      declarerBinding.status = "OK";
      declarerBinding.label = "DIRECT (signer = tx.from)";
    } else if (delegation.status === "OK" && delegation.grantee &&
        executionFrom && delegation.grantee.toLowerCase() === executionFrom.toLowerCase()) {
      declarerBinding.status = "OK";
      declarerBinding.label = "DELEGATED (grantee = tx.from)";
    } else {
      declarerBinding.status = "NOT_PROVEN";
      declarerBinding.label = "NO (authority != tx.from)";
      errors.push("DECLARER_EXECUTION_BINDING: declared authority does not own tx.from");
    }
  } else {
    // REGISTRATION — binds to an agent identity, no per-execution tx.from.
    declarerBinding.status = "OK";
    declarerBinding.label = "REGISTRATION (identity root)";
  }

  // ── 5. ATTESTATION (SIGNATURES / RECOGNITION) ───────────────────────────
  const attestationSignatures = { status: "OK", label: "NONE", list: [] };
  const attestationRecognition = { status: "NOT_PROVEN", label: "NONE", list: [] };

  for (const att of Array.isArray(evidence.attestations) ? evidence.attestations : []) {
    const sigResult = verifyAttestationSignature(att);
    const recog = recognizeAttestation(att, evidence.confidence);
    attestationSignatures.list.push({
      issuer: att.issuer,
      valid: sigResult.valid,
      reason: sigResult.reason || null,
    });
    attestationRecognition.list.push({
      issuer: att.issuer,
      verdict: recog.verdict,
      label: recog.label,
      reason: recog.reason,
    });
  }

  if (attestationSignatures.list.some((r) => !r.valid)) {
    attestationSignatures.status = "NOT_PROVEN";
    attestationSignatures.label = "BAD_SIGNATURES";
  } else if (attestationSignatures.list.length > 0) {
    attestationSignatures.status = "OK";
    attestationSignatures.label = "ALL_REPLAY";
  }

  if (attestationRecognition.list.length > 0) {
    const anyAttested = attestationRecognition.list.some((r) => r.verdict === "ATTESTED");
    attestationRecognition.status = anyAttested ? "OK" : "NOT_PROVEN";
    attestationRecognition.label = anyAttested ? "ATTESTED" : "NONE_RECOGNIZED";
  }

  // ── 6. REVOCATION (§5b — declared ≠ proven) ─────────────────────────────
  const revocations = [];
  for (const att of Array.isArray(evidence.attestations) ? evidence.attestations : []) {
    revocations.push({
      issuer: att.issuer,
      ...revocationStatus(att, evidence.revocationEvidence || {}),
    });
  }

  // ── Verdict ─────────────────────────────────────────────────────────────
  const verdicts = {
    PROVENANCE_COMMITMENT: commitment,
    MANIFEST_SIGNATURE: manifestSignature,
    DECLARER_EXECUTION_BINDING: declarerBinding,
    DELEGATION_CHAIN: delegation,
    ATTESTATION_SIGNATURES: attestationSignatures,
    ATTESTATION_RECOGNITION: attestationRecognition,
    EXECUTOR_TYPE: executorTypeStatus,
    REVOCATION: revocations,
  };

  const criticalFail = manifestSignature.status !== "OK" ||
    declarerBinding.status !== "OK" ||
    commitment.status === "NOT_PROVEN";

  let summary;
  if (criticalFail) {
    summary = "FAIL_CLOSED: critical axis not proven";
  } else if (attestationRecognition.status === "OK") {
    summary = "MANIFEST_ID_PROVEN + ATTESTED";
  } else {
    summary = "MANIFEST_ID_PROVEN";
  }

  return { verdicts, summary, errors };
}

export { verifyDelegationChain, revocationStatus, normalizeExecutorType };