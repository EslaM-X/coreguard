/**
 * CoreGuard AgentProof — verify-provenance Orchestrator (CGEP/1:AGENT-PROVENANCE §7)
 *
 * Per-check, fail-closed report. Each axis is evaluated independently and
 * fully (Checks Table §7):
 *
 *   PROVENANCE_COMMITMENT       manifestId recomputed from manifestCore == declared
 *                               (with anchored commitment when evidence gives proofRef).
 *   MANIFEST_SIGNATURE          EIP-712 replay; recovered signer == declared signer
 *                               (EOA kind). EIP-1271 kind: NOT_APPLICABLE — the
 *                               signature envelope carries contract-supplied bytes
 *                               and the authority check is CONTRACT_AUTHORIZATION.
 *   CONTRACT_AUTHORIZATION      EIP-1271 read-only isValidSignature @ execution-block
 *                               state (Phase B-1; magic ⇒ OK — NEVER executor proof).
 *   CONTRACT_EXECUTION_BINDING  strict admissible-evidence attribution of the signing
 *                               contract to this execution (Q-B1.3; tx.from ∉ proof).
 *   DECLARER_EXECUTION_BINDING  authority over THIS execution:
 *                                 STAMP: root authority == actual tx.from
 *                                        (direct or via delegation chain).
 *                                 EIP1271 kind: NOT_APPLICABLE (binding via
 *                                 CONTRACT_EXECUTION_BINDING instead).
 *   DELEGATION_CHAIN            ordered, scoped, non-expired, root-authority-correct.
 *   ATTESTATION_SIGNATURES      replayed vs issuer (crypto axis).
 *   ATTESTATION_RECOGNITION     trusted-issuer policy → ATTESTED/NOT_PROVEN.
 *   EXECUTOR_TYPE               normalized enum (advisory only, never a verdict).
 *   REVOCATION                  §5b: NEVER "PROVEN" without authoritative evidence.
 *   IDENTITY_CLAIMS             identity self-claims (DECLARED), v2 attestation
 *                               claim-set binding under the Phase B cap
 *                               (ID-CAP-OI002-1 → never ATTESTED/VERIFIED).
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
import {
  validateIdentity,
  detectIdentityContradiction,
  resolveIdentityClaims,
} from "./identity.js";
import { normalizeExecutorType } from "./taxonomy.js";
import { loadEvmAdapter } from "./evm-adapter.js";
import {
  evaluateContractAuthorization,
  evaluateContractExecutionBinding,
} from "./contract-auth.js";

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
 * [] — Identity claims axis (§6, Phase B).
 *
 * Identity never produces VERIFIED and — while the Phase B cap is active —
 * never ATTESTED: a fully-passing v2 (claim-set-bound) attestation resolves
 * every covered field to DECLARED with label ATTESTED_BLOCKED_BY_CAP.
 *
 * @param {object} deps
 * @param {object} deps.manifest           validated untrusted manifest
 * @param {string} deps.manifestId         recomputed canonical manifestId
 * @param {object} deps.commitment         PROVENANCE_COMMITMENT verdict
 * @param {object} deps.manifestSignature  MANIFEST_SIGNATURE verdict
 * @param {object} deps.declarerBinding    DECLARER_EXECUTION_BINDING verdict
 * @param {object} deps.signerBinding      declared signerBinding
 * @param {string} deps.chainId            evidence chainId
 * @param {string} [deps.executionBlock]   decimal block number (null → skip time window)
 * @param {object} [deps.confidence]       trusted-issuer policy
 * @param {Array}  [deps.attestations]     claimed attestation envelopes
 * @param {object} [deps.revocationEvidence]
 * @param {object} [deps.evm]              @coreguard/evm adapter (null → NOT_RUN)
 * @param {Array}  [deps.siblingManifests] other manifests for the same execution
 *                                        (identity contradiction detection)
 */
export async function buildIdentityVerdict({
  manifest,
  manifestId,
  commitment,
  manifestSignature,
  declarerBinding,
  signerBinding,
  chainId,
  executionRef,
  executionBlock,
  confidence,
  attestations,
  revocationEvidence,
  evm,
  siblingManifests,
}) {
  if (commitment.status !== "OK") {
    return { status: "NOT_EVALUATED", label: "COMMITMENT_NOT_PROVEN" };
  }

  const validation = validateIdentity(manifest.declared);
  const manifestList = Array.isArray(siblingManifests)
    ? [manifest, ...siblingManifests]
    : [manifest];
  const suspicion = detectIdentityContradiction(manifestList, executionRef);

  const resolved = await resolveIdentityClaims({
    validation,
    base: {
      manifestSignature: (manifestSignature && manifestSignature.status) || "NOT_PROVEN",
      declarerBinding: (declarerBinding && declarerBinding.status) || "NOT_PROVEN",
    },
    attestations: Array.isArray(attestations) ? attestations : [],
    context: {
      chainId,
      executionRef,
      manifestId,
      currentBlock: executionBlock ?? null,
      confidence: confidence || {},
      evm,
      identityRoot: (signerBinding || {}).address || "",
      revocationEvidence: revocationEvidence || {},
    },
    suspicion,
  });

  const identity = {
    manifest: resolved.manifest,
    claims: resolved.claims,
    overall: resolved.overall,
  };
  if (resolved.overall.error) {
    identity.status = "INPUT_ERROR";
    identity.label = "MALFORMED_INPUT";
  } else if (resolved.manifest === "INVALID") {
    identity.status = "NOT_PROVEN";
    identity.label = "CONTRADICTION";
  } else {
    identity.status = resolved.overall.state;
    identity.label = resolved.overall.state;
  }
  return identity;
}

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
* @param {object} [evidence.confidence]     { trustedAttestors [...] }
 * @param {object} [evidence.revocationEvidence] { revocationProof {...} }
 * @param {string} [evidence.contractCallerContext]  EIP-1271 eth_call `from` when the
 *                                     verification profile states a caller context
 *                                     (Q-B1.2; absent ⇒ not asserted, never substituted)
 * @param {object} [evidence.executionBinding] { rule: "TRACE_CALLER"|"PROTOCOL_STATE_TRANSITION", ... }
 *                                     CONTRACT_EXECUTION_BINDING admissible evidence
 * @param {object}  [options]
 * @param {object}  [options.evm]  injected @coreguard/evm adapter (defaults
 *     to the memoized gate; pass null to force NOT_RUN deterministically)
 * @param {object}  [options.contractAuth]  injected read-only providers for the
 *     EIP-1271 path: { ethCall, getCode } (Q-B1.5 — never a package dependency)
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

  // ── 2. MANIFEST_SIGNATURE / CONTRACT_AUTHORIZATION ───────────────────────
  const sig = manifest.signature || {};
  const bindingKind = (manifest.declared?.signerBinding || {}).kind;
  const isContractPath = bindingKind === "EIP1271" && sig.scheme === "EIP-1271";
  const contractPathMismatch = (bindingKind === "EIP1271") !== (sig.scheme === "EIP-1271");

  const manifestSignature = { status: "NOT_PROVEN", label: "NO_SIGNATURE" };
  const contractAuthorization = { status: "NOT_APPLICABLE", label: "EOA_PATH" };
  const contractExecutionBinding = { status: "NOT_APPLICABLE", label: "EOA_PATH" };

  if (isContractPath) {
    // Signature envelope carries contract-supplied bytes; the cryptographic
    // authority check is CONTRACT_AUTHORIZATION (EIP-1271), not EOA recovery.
    manifestSignature.status = "NOT_APPLICABLE";
    manifestSignature.label = "CONTRACT_PATH (EIP-1271)";
    manifestSignature.contract = (manifest.declared.signerBinding || {}).address || null;

    const providers = options.contractAuth || {};
    if (!evmReady) {
      contractAuthorization.status = "NOT_RUN";
      contractAuthorization.label = "EVM_ADAPTER_UNAVAILABLE";
    } else {
      const digest = "0x" + Buffer.from(
        evm.typedDataDigest("ManifestDeclaration", MANIFEST_TYPES, { manifestId }, chainId),
      ).toString("hex");
      const caOut = await evaluateContractAuthorization({
        digest,
        signatureBytes: sig.bytes || "0x",
        contract: manifest.declared.signerBinding.address,
        blockNumber: executionBlock,
        from: evidence.contractCallerContext, // profile-stated caller context; absent ⇒ not asserted
        ethCall: providers.ethCall,
        getCode: providers.getCode,
        evm,
      });
      Object.assign(contractAuthorization, caOut);
      if (caOut.status === "NOT_PROVEN") errors.push(`CONTRACT_AUTHORIZATION: ${caOut.label}`);
    }

    const ebOut = await evaluateContractExecutionBinding({
      evidence,
      signerBinding: manifest.declared.signerBinding,
      executionFrom,
    });
    Object.assign(contractExecutionBinding, ebOut);
    if (ebOut.status === "NOT_PROVEN") errors.push(`CONTRACT_EXECUTION_BINDING: ${ebOut.label}`);
  } else if (contractPathMismatch) {
    manifestSignature.status = "NOT_PROVEN";
    manifestSignature.label = "CONTRACT_CONSISTENCY_MISMATCH";
    errors.push("signerBinding.kind / signature.scheme EIP-1271 consistency violated");
  } else if (!evmReady) {
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

  // Contract path: EOA `tx.from` equality is irrelevant to contract execution
  // binding (Q-B1.3 invariant: tx.from identifies the initiator, not the
  // executor). Authority binding is carried by CONTRACT_EXECUTION_BINDING.
  if (isContractPath) {
    declarerBinding.status = "NOT_APPLICABLE";
    declarerBinding.label = "CONTRACT_BINDING_PATH";
  } else if (schema.kind === "STAMP") {
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

  // ── 7. IDENTITY_CLAIMS (§6, Phase B — cap ID-CAP-OI002-1) ───────────────
  const identity = await buildIdentityVerdict({
    manifest,
    manifestId,
    commitment,
    manifestSignature,
    declarerBinding,
    signerBinding: manifest.declared && manifest.declared.signerBinding,
    chainId,
    executionRef: manifest.executionRef || null,
    executionBlock,
    confidence: evidence.confidence,
    attestations: evidence.attestations,
    revocationEvidence: evidence.revocationEvidence,
    evm,
    siblingManifests: evidence.siblingManifests,
  });
  if (identity.status === "INPUT_ERROR") {
    if (Array.isArray(identity.overall && identity.overall.error)) {
      errors.push(`IDENTITY_CLAIMS: ${identity.overall.error.join("; ")}`);
    } else {
      errors.push("IDENTITY_CLAIMS: MALFORMED_INPUT");
    }
  } else if (identity.status === "NOT_PROVEN" && identity.label === "CONTRADICTION") {
    errors.push("IDENTITY_CLAIMS: identity contradiction across manifests for the same executionRef");
  }

  // ── Verdict ─────────────────────────────────────────────────────────────
  const verdicts = {
    PROVENANCE_COMMITMENT: commitment,
    MANIFEST_SIGNATURE: manifestSignature,
    CONTRACT_AUTHORIZATION: contractAuthorization,
    CONTRACT_EXECUTION_BINDING: contractExecutionBinding,
    DECLARER_EXECUTION_BINDING: declarerBinding,
    DELEGATION_CHAIN: delegation,
    ATTESTATION_SIGNATURES: attestationSignatures,
    ATTESTATION_RECOGNITION: attestationRecognition,
    EXECUTOR_TYPE: executorTypeStatus,
    REVOCATION: revocations,
    IDENTITY_CLAIMS: identity,
  };

  const criticalNotRun = manifestSignature.status === "NOT_RUN" ||
    contractAuthorization.status === "NOT_RUN" ||
    declarerBinding.status === "NOT_RUN" ||
    delegation.status === "NOT_RUN";

  const criticalFail = manifestSignature.status === "NOT_PROVEN" ||
    contractAuthorization.status === "NOT_PROVEN" ||
    contractExecutionBinding.status === "NOT_PROVEN" ||
    declarerBinding.status === "NOT_PROVEN" ||
    commitment.status === "NOT_PROVEN";

  let summary;
  if (criticalNotRun && !criticalFail) {
    summary = "FAIL_CLOSED: critical checks NOT_RUN (adapter/provider unavailable)";
  } else if (criticalFail) {
    summary = "FAIL_CLOSED: critical axis not proven";
  } else if (isContractPath) {
    summary = "MANIFEST_ID_PROVEN + CONTRACT_AUTHORIZED + CONTRACT_EXECUTION_BOUND";
  } else if (attestationRecognition.status === "OK") {
    summary = "MANIFEST_ID_PROVEN + ATTESTED";
  } else {
    summary = "MANIFEST_ID_PROVEN";
  }

  return { verdicts, summary, errors };
}

export { verifyDelegationChain, revocationStatus, normalizeExecutorType };