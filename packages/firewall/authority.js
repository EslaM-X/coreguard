/**
 * CoreGuard Firewall — Decision-Time Authority Probe (Q-FW1a / Q-FW10).
 *
 * The probe is RECOMPUTED from the bound inputs — the intent digest (replayed
 * via `manifestId` + chainId through the injected EVM adapter) and the declared
 * authority at the labeled `authorityAtState`. The firewall NEVER accepts an
 * opaque caller-supplied boolean probe result (Q-FW1a). The probe is a
 * decision-time input; it is NOT the B-1 execution-block verdict and it is NOT
 * `CONTRACT_EXECUTION_BINDING` (Q-FW10 temporal seam).
 *
 * EOA path     — EIP-712 replay of the ManifestDeclaration digest; recovered
 *                signer == declared signerBinding.address.
 * EIP-1271 path— read-only `isValidSignature` at `authorityAtState` via the
 *                injected `{ ethCall, getCode }` contract-auth providers
 *                (same injection pattern as B-1's `options.contractAuth`;
 *                Q-FW8a keeps EVM/transport injected).
 *
 * Fail-closed (mirrors B-1 NOT_RUN semantics): missing adapter/provider/state ⇒
 * NOT_RUN (never fabricated, never fallback to `latest`); revert/wrong-magic/
 * empty code ⇒ NOT_PROVEN. The magic value is NEVER executor proof (T-FW3).
 */

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL_RE = /^[0-9]+$/;
const HEX64_RE = /^[0-9a-fA-F]{64}$/;

const MANIFEST_TYPES = Object.freeze({
  ManifestDeclaration: Object.freeze([{ name: "manifestId", type: "bytes32" }]),
});

function digestHex(evm, typedDataDigest, manifestId, chainId) {
  const bytes = typedDataDigest("ManifestDeclaration", MANIFEST_TYPES, { manifestId }, chainId);
  if (typeof bytes === "string") return bytes;
  return "0x" + Buffer.from(bytes).toString("hex");
}

/**
 * Evaluate the decision-time authority probe.
 *
 * @param {object} args
 * @param {object}  args.declaration       signed declaration (signerBinding + signature)
 * @param {string}  args.manifestId        bound manifestId (recomputed)
 * @param {string}  args.chainId           bound chainId
 * @param {string}  args.authorityAtState  decision block (decimal string)
 * @param {object}  [args.evm]             injected @coreguard/evm adapter
 * @param {object}  [args.contractAuth]    injected { ethCall, getCode } providers
 * @param {string}  [args.from]            optional caller context for the EIP-1271 eth_call
 * @returns {Promise<{status, label, reason?, path, atState}>}
 */
export async function evaluateAuthorityProbe({
  declaration,
  manifestId,
  chainId,
  authorityAtState,
  evm,
  contractAuth,
  from,
}) {
  const signerBinding = (declaration && declaration.signerBinding) || {};
  const signature = (declaration && declaration.signature) || {};
  const kind = signerBinding.kind === "EIP1271" ? "EIP1271" : "EOA";
  const path = kind === "EIP1271" ? "EIP1271" : "EOA";

  if (!ADDRESS_RE.test(String(signerBinding.address || ""))) {
    return { status: "NOT_PROVEN", label: "INVALID_AUTHORITY", reason: "signerBinding.address must be an address", path, atState: authorityAtState || null };
  }

  if (path === "EOA") {
    if (!evm || typeof evm.typedDataDigest !== "function" || typeof evm.recoverSignerAddress !== "function") {
      return { status: "NOT_RUN", label: "EVM_ADAPTER_UNAVAILABLE", reason: "no injected evm adapter for EOA recovery", path, atState: authorityAtState || null };
    }
    const r = String(signature.r || "");
    const s = String(signature.s || "");
    const malformed = !HEX64_RE.test(r) || !HEX64_RE.test(s) ||
      /^[0]+$/.test(r) || /^[0]+$/.test(s) ||
      (signature.v !== 27 && signature.v !== 28);
    if (malformed) {
      return { status: "NOT_PROVEN", label: "SIG_MALFORMED", reason: "EIP-712 envelope malformed", path, atState: authorityAtState || null };
    }
    try {
      const digest = digestHex(evm, evm.typedDataDigest, manifestId, chainId);
      const recovered = evm.recoverSignerAddress(digest, { r, s, v: signature.v });
      if (String(recovered).toLowerCase() === String(signerBinding.address).toLowerCase()) {
        return { status: "OK", label: "RECOVERED_SIGNER", path, atState: authorityAtState || null };
      }
      return { status: "NOT_PROVEN", label: "SIGNER_MISMATCH", reason: `recovered ${recovered} != declared ${signerBinding.address}`, path, atState: authorityAtState || null };
    } catch (e) {
      return { status: "NOT_PROVEN", label: "RECOVERY_THREW", reason: e.message, path, atState: authorityAtState || null };
    }
  }

  // EIP-1271 path — read-only isValidSignature at authorityAtState.
  if (!evm || typeof evm.isValidSignatureCalldata !== "function" || typeof evm.isErc1271Magic !== "function") {
    return { status: "NOT_RUN", label: "EVM_ADAPTER_UNAVAILABLE", reason: "EIP-1271 primitives unavailable", path, atState: authorityAtState || null };
  }
  if (typeof contractAuth === "undefined" || typeof contractAuth.ethCall !== "function" || typeof contractAuth.getCode !== "function") {
    return { status: "NOT_RUN", label: "NO_PROVIDERS", reason: "no injected contractAuth { ethCall, getCode }", path, atState: authorityAtState || null };
  }
  if (typeof authorityAtState !== "string" || !DECIMAL_RE.test(authorityAtState)) {
    return { status: "NOT_RUN", label: "NO_AUTHORITY_STATE", reason: "decision-time state required; no latest fallback", path, atState: null };
  }

  let code;
  try {
    code = String(await contractAuth.getCode({ address: signerBinding.address, block: authorityAtState }) || "");
  } catch (e) {
    return { status: "NOT_RUN", label: "CODE_LOOKUP_ERROR", reason: `getCode threw: ${e.message}`, path, atState: authorityAtState };
  }
  if (code.replace(/^0x/i, "").length === 0) {
    return { status: "NOT_PROVEN", label: "NO_CODE_AT_STATE", reason: "empty code at authorityAtState (EOA under EIP1271 kind) — fails closed", path, atState: authorityAtState };
  }

  let calldata;
  try {
    calldata = evm.isValidSignatureCalldata(digestHex(evm, evm.typedDataDigest, manifestId, chainId), signature.bytes || "0x");
  } catch (e) {
    return { status: "NOT_PROVEN", label: "CALDATA_ERROR", reason: e.message, path, atState: authorityAtState };
  }

  let res;
  try {
    res = await contractAuth.ethCall({ to: signerBinding.address, data: calldata, block: authorityAtState, ...(from ? { from } : {}) });
  } catch (e) {
    return { status: "NOT_RUN", label: "PROVIDER_ERROR", reason: `ethCall threw: ${e.message}`, path, atState: authorityAtState };
  }

  if (res && res.ok) {
    if (evm.isErc1271Magic(res.data || "0x")) {
      return { status: "OK", label: "EIP1271_MAGIC", path, atState: authorityAtState };
    }
    return { status: "NOT_PROVEN", label: "NOT_MAGIC", reason: "return data is not the EIP-1271 magic value", path, atState: authorityAtState };
  }

  const codeName = res && res.code;
  if (codeName === "REVERTED") {
    return { status: "NOT_PROVEN", label: "REVERTED", reason: "isValidSignature reverted (call ran; fail-closed)", path, atState: authorityAtState };
  }
  if (codeName === "HISTORICAL_STATE_UNAVAILABLE") {
    return { status: "NOT_RUN", label: "HISTORICAL_STATE_UNAVAILABLE", reason: "cannot serve authorityAtState; no latest fallback", path, atState: authorityAtState };
  }
  return { status: "NOT_RUN", label: "PROVIDER_ERROR", reason: `eth_call failed: ${codeName || "unknown"}`, path, atState: authorityAtState };
}