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
 *
 * EVM CRYPTO BOUNDARY (docs/dependency-gate.md): EIP-712 replay, digests and
 * signer recovery require the isolated @coreguard/evm adapter. When the
 * adapter is unavailable the affected checks report status "NOT_RUN" — the
 * verifier NEVER invents a cryptographic result (no P-256 substitution, no
 * guessed signer binding).
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
import { loadEvmAdapter } from "./evm-adapter.js";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

const MANIFEST_TYPES = Object.freeze({
  ManifestDeclaration: Object.freeze([{ name: "manifestId", type: "bytes32" }]),
});

const NOT_RUN_VERDICT = (label, reason) => ({
  status: "NOT_RUN",
  label,
  reason,
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
 * @param {object}  [options]
 *   @param {object}  [options.evm]  injected @coreguard/evm adapter (defaults
 *     to the memoized gate; pass null to force NOT_RUN deterministically)
 * @returns {{ verdicts: object, summary: string, errors: string[] }}
 */
export async function verifyProvenance(manifest, evidence = {}, options = {}) {
  const { chainId, executionFrom, executionBlock } = evidence;
  const errors = [];

  if (typeof chainId !== "string" || !/^[0-9]+$/.test(chainId)) {
    errors.push("evidence.chainId must be a decimal string");
  }
  if (typeof executionFrom !== "string" || !ADDRESS_RE.test(executionFrom)) {
    errors.push("evidence.executionFrom must be an EVM address");
  }

  // EVM adapter: explicit injection wins; else the memoized optional gate.
  let evm = null;
  try {
    evm = options.evm !== undefined ? options.evm : await loadEvmAdapter();
  } catch {
    evm = null;
  }
  const evmReady = Boolean(
    evm &&
    typeof evm.typedDataDigest === "function" &&
    typeof evm.recoverSignerAddress === "function",
  );

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

  if (!evmReady) {
    manifestSignature.status = "NOT_RUN";
    manifestSignature.label = "EVM_ADAPTER_UNAVAILABLE";
  } else if (typeof sig.r === "string" && /^[0-9a-fA-F]{64}$/.test(sig.r) &&
      typeof sig.s === "string" && /^[0-9a-fA-F]{64}$/.test(sig.s) &&
      (sig.v === 27 || sig.v === 28)) {
    try {
      const digest = evm.typedDataDigest(
        "ManifestDeclaration",
        MANIFEST_TYPES,
        { manifestId },
        chainId,
      );
      const recovered = evm.recoverSignerAddress(digest, { r: sig.r, s: sig.s, v: sig.v });
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
      const chkV = await verifyDelegationChain(chain, {
        chainId,
        rootAuthority: declaredSigner,
        executionBlock,
        evm,
      });
      if (chkV.status === "NOT_RUN") {
        delegation.status = "NOT_RUN";
        delegation.label = "EVM_ADAPTER_UNAVAILABLE";
        delegation.reason = chkV.reason;
      } else {
        delegation.status = chkV.valid ? "OK" : "NOT_PROVEN";
        delegation.label = chkV.valid ? "CHAIN_VALID" : `CHAIN_INVALID: ${chkV.reason}`;
        delegation.links = chkV.links;
        delegation.grantee = chkV.grantee || null;
        if (!chkV.valid) errors.push(`DELEGATION_CHAIN: ${chkV.reason}`);
      }
    }

    // DECLARER_EXECUTION_BINDING: root authority == actual execution `from`.
    if (!evmReady) {
      declarerBinding.status = "NOT_RUN";
      declarerBinding.label = "EVM_ADAPTER_UNAVAILABLE";
    } else if (declaredSigner && executionFrom &&
        declaredSigner.toLowerCase() === executionFrom.toLowerCase() &&
        manifestSignature.status === "OK") {
      declarerBinding.status = "OK";
      declarerBinding.label = "DIRECT (signer = tx.from)";
    } else if (delegation.status === "OK" && delegation.grantee &&
        executionFrom && delegation.grantee.toLowerCase() === executionFrom.toLowerCase()) {
      declarerBinding.status = "OK";
      declarerBinding.label = "DELEGATED (grantee = tx.from)";
    } else if (manifestSignature.status !== "OK") {
      declarerBinding.status = manifestSignature.status === "NOT_RUN"
        ? "NOT_RUN"
        : "NOT_PROVEN";
      declarerBinding.label = "DEPENDS_ON_MANIFEST_SIGNATURE";
    } else {
      declarerBinding.status = "NOT_PROVEN";
      declarerBinding.label = "NO (authority != tx.from)";
      errors.push("DECLARER_EXECUTION_BINDING: declared authority does not own tx.from");
    }
  } else {
    // REGISTRATION — binds to an agent identity, no per-execution tx.from.
    if (!evmReady || manifestSignature.status !== "OK") {
      declarerBinding.status = manifestSignature.status;
      declarerBinding.label = manifestSignature.status === "NOT_RUN"
        ? "EVM_ADAPTER_UNAVAILABLE"
        : "DEPENDS_ON_MANIFEST_SIGNATURE";
    } else {
      declarerBinding.status = "OK";
      declarerBinding.label = "REGISTRATION (identity root)";
    }
  }

  // ── 5. ATTESTATION (SIGNATURES / RECOGNITION) ───────────────────────────
  const attestationSignatures = { status: "OK", label: "NONE", list: [] };
  const attestationRecognition = { status: "NOT_PROVEN", label: "NONE", list: [] };
  let attestationNotRun = false;

  for (const att of Array.isArray(evidence.attestations) ? evidence.attestations : []) {
    const sigResult = await verifyAttestationSignature(att, evm);
    const recog = await recognizeAttestation(att, evidence.confidence, evm);
    if (sigResult.status === "NOT_RUN" || recog.verdict === "NOT_RUN") attestationNotRun = true;
    attestationSignatures.list.push({
      issuer: att.issuer,
      valid: sigResult.valid,
      status: sigResult.status,
      reason: sigResult.reason || null,
    });
    attestationRecognition.list.push({
      issuer: att.issuer,
      verdict: recog.verdict,
      label: recog.label,
      reason: recog.reason,
    });
  }

  attestationSignatures.status = attestationNotRun
    ? "NOT_RUN"
    : attestationSignatures.list.some((r) => !r.valid)
      ? "NOT_PROVEN"
      : attestationSignatures.list.length > 0
        ? "OK"
        : "OK";
  attestationSignatures.label = attestationNotRun
    ? "EVM_ADAPTER_UNAVAILABLE"
    : attestationSignatures.list.some((r) => !r.valid)
      ? "BAD_SIGNATURES"
      : attestationSignatures.list.length > 0
        ? "ALL_REPLAY"
        : "NONE";

  if (attestationRecognition.list.length > 0) {
    const anyNotRun = attestationRecognition.list.some((r) => r.verdict === "NOT_RUN");
    const anyAttested = attestationRecognition.list.some((r) => r.verdict === "ATTESTED");
    attestationRecognition.status = anyNotRun
      ? "NOT_RUN"
      : anyAttested
        ? "OK"
        : "NOT_PROVEN";
    attestationRecognition.label = anyNotRun
      ? "EVM_ADAPTER_UNAVAILABLE"
      : anyAttested
        ? "ATTESTED"
        : "NONE_RECOGNIZED";
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

  const criticalNotRun = manifestSignature.status === "NOT_RUN" ||
    declarerBinding.status === "NOT_RUN" ||
    delegation.status === "NOT_RUN";

  const criticalFail = manifestSignature.status === "NOT_PROVEN" ||
    declarerBinding.status === "NOT_PROVEN" ||
    commitment.status === "NOT_PROVEN";

  let summary;
  if (criticalNotRun && !criticalFail) {
    summary = "FAIL_CLOSED: critical EVM checks NOT_RUN (adapter unavailable)";
  } else if (criticalFail) {
    summary = "FAIL_CLOSED: critical axis not proven";
  } else if (attestationRecognition.status === "OK") {
    summary = "MANIFEST_ID_PROVEN + ATTESTED";
  } else {
    summary = "MANIFEST_ID_PROVEN";
  }

  return { verdicts, summary, errors };
}

export { verifyDelegationChain, revocationStatus, normalizeExecutorType };