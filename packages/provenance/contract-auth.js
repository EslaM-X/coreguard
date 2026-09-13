/**
 * CoreGuard AgentProof — Phase B-1 EIP-1271 contract auth (spec Q-B1.1/B1.2/B1.3).
 *
 * Two independent axes, both fail-closed:
 *
 *   CONTRACT_AUTHORIZATION     — read-only `isValidSignature` via injected,
 *                                execution-block-pinned `eth_call`. Magic value
 *                                ⇒ OK. Revert/wrong-magic ⇒ NOT_PROVEN (call
 *                                ran). No provider / historical state
 *                                unavailable ⇒ NOT_RUN (never NOT_PROVEN, and
 *                                NO fallback to `latest`).
 *
 *   CONTRACT_EXECUTION_BINDING — strict admissible-evidence rule: OK ONLY when
 *                                supplied evidence independently attributes the
 *                                execution to the signing contract. Receipt-only
 *                                / arbitrary logs / tx.from-equality alone NEVER
 *                                suffice. Unattributable ⇒ NOT_PROVEN.
 *
 * No network dependency here — the provider functions are injected per call
 * (same pattern as the EVM adapter gate). This module never claims a
 * `STATICCALL` opcode was executed and never treats the magic value as
 * executor proof (authorization ≠ execution proof).
 *
 * Injected provider contract (see Q-B1.1/Q-B1.2):
 *   ethCall({ to, data, block, from? }) => Promise<{
 *     ok: boolean,
 *     data?: "0x…",                             // ok→ return data
 *     code?: "REVERTED" | "HISTORICAL_STATE_UNAVAILABLE" | string,
 *   }>
 *   getCode({ address, block }) => Promise<"0x…hex">  // "" / "0x" ⇒ EOA
 *   ethCall/getCode must NOT silently substitute `latest` — callers supply the
 *   execution block; absence ⇒ NOT_RUN.
 */

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL_RE = /^[0-9]+$/;

function hexOf(u) {
  return "0x" + Buffer.from(u).toString("hex");
}

/**
 * CONTRACT_AUTHORIZATION — EIP-1271 read-only check at execution-block state.
 *
 * @param {object} args
 * @param {string}  args.digest           already-computed manifest digest ("0x…")
 * @param {string}  args.signatureBytes   signature.bytes ("0x…", may be "0x")
 * @param {string}  args.contract         signerBinding.address
 * @param {string}  args.blockNumber      execution block (decimal string)
 * @param {string}  [args.from]           caller context when the profile states it
 * @param {Function} args.ethCall         injected read-only provider
 * @param {Function} args.getCode         injected code-at-block provider
 * @param {object}  args.evm              loaded @coreguard/evm adapter (has
 *                                        isValidSignatureCalldata/isErc1271Magic)
 * @returns {Promise<{status,label,reason?,atBlock?}>}
 */
export async function evaluateContractAuthorization({
  digest,
  signatureBytes,
  contract,
  blockNumber,
  from,
  ethCall,
  getCode,
  evm,
}) {
  if (!evm || typeof evm.isValidSignatureCalldata !== "function" ||
      typeof evm.isErc1271Magic !== "function") {
    return { status: "NOT_RUN", label: "EVM_ADAPTER_UNAVAILABLE", reason: "EIP-1271 primitives unavailable" };
  }
  if (typeof ethCall !== "function") {
    return { status: "NOT_RUN", label: "NO_RPC_PROVIDER", reason: "no injected ethCall provider" };
  }
  if (typeof getCode !== "function") {
    return { status: "NOT_RUN", label: "NO_CODE_PROVIDER", reason: "no injected getCode provider" };
  }
  if (typeof blockNumber !== "string" || !DECIMAL_RE.test(blockNumber)) {
    return { status: "NOT_RUN", label: "NO_EXECUTION_BLOCK", reason: "execution-block state required; no latest fallback" };
  }
  if (!ADDRESS_RE.test(String(contract || ""))) {
    return { status: "NOT_PROVEN", label: "INVALID_CONTRACT", reason: "signerBinding.address must be an address" };
  }

  // T3 / V4: EOA-as-contract fails closed — code must be present at the block.
  let code;
  try {
    code = String(await getCode({ address: contract, block: blockNumber }) || "");
  } catch (e) {
    return { status: "NOT_RUN", label: "CODE_LOOKUP_ERROR", reason: `getCode threw: ${e.message}` };
  }
  if (code.replace(/^0x/i, "").length === 0) {
    return {
      status: "NOT_PROVEN",
      label: "NO_CODE_AT_BLOCK",
      reason: "address has empty code at execution block (EOA) — kind EIP1271 fails closed",
    };
  }

  let calldata;
  try {
    calldata = evm.isValidSignatureCalldata(digest, signatureBytes || "0x");
  } catch (e) {
    return { status: "NOT_PROVEN", label: "CALDATA_ERROR", reason: e.message };
  }

  let res;
  try {
    res = await ethCall({ to: contract, data: calldata, block: blockNumber, ...(from ? { from } : {}) });
  } catch (e) {
    return { status: "NOT_RUN", label: "PROVIDER_ERROR", reason: `ethCall threw: ${e.message}` };
  }

  if (res && res.ok) {
    if (evm.isErc1271Magic(res.data || "0x")) {
      return { status: "OK", label: "EIP1271_MAGIC", atBlock: blockNumber };
    }
    return { status: "NOT_PROVEN", label: "NOT_MAGIC", reason: "return data is not the EIP-1271 magic value" };
  }

  const codeName = res && res.code;
  if (codeName === "REVERTED") {
    return { status: "NOT_PROVEN", label: "REVERTED", reason: "isValidSignature reverted (call ran; fail-closed)" };
  }
  if (codeName === "HISTORICAL_STATE_UNAVAILABLE") {
    return { status: "NOT_RUN", label: "HISTORICAL_STATE_UNAVAILABLE", reason: "provider cannot serve execution-block state; no latest fallback" };
  }
  return { status: "NOT_RUN", label: "PROVIDER_ERROR", reason: `eth_call failed: ${codeName || "unknown"}` };
}

/**
 * CONTRACT_EXECUTION_BINDING — strict admissible-evidence attribution.
 *
 * Rule "TRACE_CALLER": a connected internal-call path rooted at executionFrom
 * in which the signing contract appears as caller (msg.sender). Structurally
 * invalid, root-mismatched, disconnected, or contract-absent traces ⇒
 * NOT_PROVEN.
 *
 * Rule "PROTOCOL_STATE_TRANSITION": admitted ONLY through an injected,
 * deterministic attribution checker (binding.verify). Absent checker ⇒
 * NOT_PROVEN (no self-asserted attribution).
 *
 * Absent/unrecognized rule (receipt-only, arbitrary logs, tx.from equality) ⇒
 * NOT_PROVEN (NO_ATTRIBUTION).
 */
export async function evaluateContractExecutionBinding({ evidence, signerBinding, executionFrom }) {
  const binding = evidence && evidence.executionBinding;
  if (!binding || typeof binding !== "object") {
    return { status: "NOT_PROVEN", label: "NO_ATTRIBUTION", reason: "no execution-binding evidence (receipt/logs alone never suffice)" };
  }

  const rule = String(binding.rule || "").toUpperCase();
  const contract = String((signerBinding || {}).address || "").toLowerCase();
  const from = String(executionFrom || "").toLowerCase();

  if (rule === "TRACE_CALLER") {
    const frames = binding.trace;
    if (!Array.isArray(frames) || frames.length === 0) {
      return { status: "NOT_PROVEN", label: "TRACE_EMPTY", reason: "TRACE_CALLER requires a non-empty frame list" };
    }
    for (const f of frames) {
      if (typeof f !== "object" || !ADDRESS_RE.test(String(f.from || "")) || !ADDRESS_RE.test(String(f.to || ""))) {
        return { status: "NOT_PROVEN", label: "TRACE_MALFORMED", reason: "trace frames must carry valid from/to addresses" };
      }
    }
    if (frames[0].from.toLowerCase() !== from) {
      return { status: "NOT_PROVEN", label: "TRACE_ROOT", reason: "trace root caller != executionFrom" };
    }
    for (let i = 1; i < frames.length; i += 1) {
      if (frames[i - 1].to.toLowerCase() !== frames[i].from.toLowerCase()) {
        return { status: "NOT_PROVEN", label: "TRACE_DISCONNECTED", reason: "frames do not form a connected call path" };
      }
    }
    const signerIsCaller = frames.some((f) => f.from.toLowerCase() === contract);
    if (!signerIsCaller) {
      return { status: "NOT_PROVEN", label: "TRACE_NO_CONTRACT", reason: "signing contract does not appear as caller (msg.sender)" };
    }
    return { status: "OK", label: "TRACE_CALLER" };
  }

  if (rule === "PROTOCOL_STATE_TRANSITION") {
    if (typeof binding.verify !== "function") {
      return { status: "NOT_PROVEN", label: "TRANSITION_NO_CHECKER", reason: "protocol state-transition rule requires an injected deterministic checker" };
    }
    try {
      const r = await binding.verify({ evidence: binding, contract, executionFrom });
      if (r && r.ok) return { status: "OK", label: "PROTOCOL_STATE_TRANSITION" };
      return { status: "NOT_PROVEN", label: "TRANSITION_REJECTED", reason: (r && r.reason) || "state-transition not attributed" };
    } catch (e) {
      return { status: "NOT_PROVEN", label: "TRANSITION_CHECKER_ERROR", reason: e.message };
    }
  }

  return { status: "NOT_PROVEN", label: "NO_ATTRIBUTION", reason: `unattributable rule "${rule}"` };
}

export { hexOf };