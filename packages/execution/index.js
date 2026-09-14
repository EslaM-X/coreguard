/**
 * CoreGuard WS-4 — Core-Native Execution Integration (spec/core-native-execution.md).
 *
 * A zero-dep extraction + binding core. It turns Core RPC evidence
 * (block / transaction / receipt / logs) into typed, pinned, canonicalized
 * evidence items bound to the frozen PRE chain (intentRef / manifestId /
 * bindingRef / executionScope / decisionRef), and packages the result into an
 * Execution Attestation with a verifiable commitment.
 *
 * Hard rules enforced here (WS-4 spec §0/§3/§5/§8):
 * - Core = witness/anchor; CoreGuard = verifier. This module never decides.
 * - No trace ≠ fake trace: without a trace-capable provider it reports
 *   `TRACE_UNAVAILABLE`; it never synthesises a trace and never infers a
 *   caller / execution path from a receipt alone.
 * - No `latest` fallback: every read is pinned to an explicit block number +
 *   hash (IN-W4-3). Missing provider capability ⇒ `NOT_RUN`-family (IN-W4-7).
 * - Caller-supplied claims (`callerClaims`) are discarded, never trusted,
 *   never echoed (spec §4 admissible-vs-claim).
 * - `tx.from` is never turned into a *semantic executor proof* in
 *   meta-transaction shape: mismatch ⇒ NOT_PROVEN / CALLER_NOT_BOUND
 *   (Q-WS4-3, T-W4-2).
 * - POST evidence never enters a PRE decision; this module only consumes a
 *   frozen PRE decision record (content-address re-verified, B-EXEC-5).
 * - No new crypto: digests are sha256 via `@coreguard/canonical` only; EVM
 *   crypto (secp256k1/Keccak-256) stays untouched behind the EVM adapter.
 * - Evidence closure: `evidenceHash` closes over `executionEvidenceRef`
 *   (H(CGEP/1:EVIDENCE, bundle) ⊇ executionEvidenceRef ⊇ {executionRef,
 *   items[]}) — no unbound side-by-side commitments are ever emitted.
 * - No simulation claim: WS-4 runs no simulation; receipts carry an explicit
 *   `SIMULATION NOT_RUN / SIMULATION_NOT_PERFORMED` check and pin the
 *   simulation leg to the execution block ONLY as a schema-required marker.
 *
 * Additive-only boundaries preserved: imports are local zero-dep cores only
 * (canonical / `@coreguard/intent` authorization / `@coreguard/trace`); the
 * Firewall's `DECISION_DOMAIN` is redeclared locally and cross-checked by
 * tests (same convention as WS-2 SDK).
 */

import {
  canonicalize,
  domainHash,
  canonicalUintString,
  hashTrace,
} from "../canonical/index.js";
import { scopeOfIntent, computeIntentRef } from "../intent/authorization.js";
import { normalizeExecution } from "../trace/index.js";
import { createEvidenceBundle, createReceipt } from "../evidence/index.js";

export const EXECUTION_EVIDENCE_DOMAIN = "CGEP/1:EXECUTION-EVIDENCE";
export const EXECUTION_ATTESTATION_DOMAIN = "CGEP/1:EXECUTION-ATTESTATION";
export const DECISION_DOMAIN = "CGEP/1:FW-DECISION";
export const ATTESTATION_RECORD_VERSION = "CGEP/1:EXECUTION-ATTESTATION/1";
export const ATTESTATION_KIND = "EXECUTION_ATTESTATION";

export const EVIDENCE_KINDS = Object.freeze([
  "CHAIN_ID",
  "BLOCK",
  "TRANSACTION",
  "RECEIPT",
  "LOG",
  "EXECUTION_REF",
  "TRACE",
]);

export const CHECK_RESULTS = Object.freeze(["PASS", "FAIL", "NOT_RUN", "NOT_PROVEN"]);

export const STATUS = Object.freeze({
  VERIFIED: "VERIFIED",
  INVALID: "INVALID",
  INCONCLUSIVE: "INCONCLUSIVE",
  UNVERIFIED: "UNVERIFIED",
  NOT_PROVEN: "NOT_PROVEN",
  NOT_RUN: "NOT_RUN",
  TRACE_UNAVAILABLE: "TRACE_UNAVAILABLE",
});

/* ---------- internal helpers ---------- */

function hexQuantityToDec(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === "number") return canonicalUintString(String(v));
  const s = String(v).trim();
  if (/^0x/i.test(s)) return canonicalUintString(BigInt(s).toString());
  return canonicalUintString(s);
}

function toLowerHex(v) {
  if (v === undefined || v === null) return null;
  return String(v).toLowerCase();
}

function functionSelector(input) {
  const s = toLowerHex(input) || "";
  if (s.startsWith("0x") && s.length >= 10) return s.slice(0, 10);
  return null;
}

function findItem(items, kind) {
  return items.find((i) => i.kind === kind) || null;
}

/** Recompute the content-address of a decision record body (strip `decisionRef`
 * then H(CGEP/1:FW-DECISION, canonicalize(body)) — mirrors the Firewall's own
 * recordRef convention; DECISION_DOMAIN is cross-checked by tests). */
async function recomputeDecisionRef(record) {
  const { decisionRef: _ref, ...body } = record;
  return domainHash(DECISION_DOMAIN, body);
}

function normalizeLog(log) {
  return {
    address: toLowerHex(log.address || ""),
    topics: (log.topics || []).map((t) => toLowerHex(t)),
    data: toLowerHex(log.data) || "0x",
    logIndex: hexQuantityToDec(log.logIndex),
  };
}

/* ---------- extraction ---------- */

/**
 * Extract typed execution evidence from an injected read-only provider.
 *
 * @param {object} args
 * @param {object} args.provider   injected { eth_chainId, getBlockByNumber,
 *        getTransactionByHash, getTransactionReceipt, supportsTrace?, getTrace? }
 * @param {string|number} args.chainId   expected/declared chain id
 * @param {object} args.ref        { txHash, blockNumber?, blockHash? } — the
 *        execution reference; blockNumber/blockHash MUST come from a caller
 *        pin or from the transaction object, never `latest`.
 * @returns {Promise<{ok, items, chainId, blockPin, executionRef,
 *          executionEvidenceRef, trace, errors}>}
 */
export async function extractExecutionEvidence({ provider, chainId, ref }) {
  const errors = [];
  if (!provider || typeof provider !== "object") {
    return { ok: false, items: [], chainId: null, blockPin: null, executionRef: null, executionEvidenceRef: null, trace: { available: false, status: STATUS.TRACE_UNAVAILABLE }, errors: ["provider missing — NOT_RUN"] };
  }
  if (!ref || !ref.txHash) {
    return { ok: false, items: [], chainId: null, blockPin: null, executionRef: null, executionEvidenceRef: null, trace: { available: false, status: STATUS.TRACE_UNAVAILABLE }, errors: ["ref.txHash required"] };
  }

  const items = [];
  const txHash = toLowerHex(ref.txHash);
  const pinFor = (blockPinValue, txPinValue) => ({ blockPin: blockPinValue ?? null, txPin: txPinValue ?? null });

  let rawTx = null;
  let rawReceipt = null;

  let chainIdItem = null;
  if (typeof provider.eth_chainId === "function") {
    try {
      chainIdItem = { kind: "CHAIN_ID", source: "provider.eth_chainId", value: String(await provider.eth_chainId()), blockPin: null, txPin: null };
    } catch (e) {
      errors.push(`eth_chainId failed: ${e.message}`);
    }
  } else {
    errors.push("provider.eth_chainId missing — CHAIN_ID unavailable (NOT_RUN)");
  }
  if (chainIdItem) items.push(chainIdItem);

  let txItem = null;
  if (typeof provider.getTransactionByHash === "function") {
    try {
      const tx = await provider.getTransactionByHash(txHash);
      if (tx && tx.hash) {
        rawTx = tx;
        txItem = {
          kind: "TRANSACTION",
          source: "provider.getTransactionByHash",
          value: {
            txHash: toLowerHex(tx.hash),
            from: toLowerHex(tx.from) || "",
            to: toLowerHex(tx.to) || "",
            value: hexQuantityToDec(tx.value),
            input: toLowerHex(tx.input) || "0x",
            nonce: hexQuantityToDec(tx.nonce),
            blockNumber: hexQuantityToDec(tx.blockNumber),
            blockHash: toLowerHex(tx.blockHash) || "",
          },
          blockPin: { blockNumber: hexQuantityToDec(tx.blockNumber ?? null), blockHash: toLowerHex(tx.blockHash) || "" },
          txPin: { txHash: toLowerHex(tx.hash) },
        };
        items.push(txItem);
      } else {
        errors.push("transaction not found");
      }
    } catch (e) {
      errors.push(`getTransactionByHash failed: ${e.message}`);
    }
  } else {
    errors.push("provider.getTransactionByHash missing — TRANSACTION unavailable (NOT_RUN)");
  }

  let receiptItem = null;
  if (typeof provider.getTransactionReceipt === "function") {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt && receipt.transactionHash) {
        rawReceipt = receipt;
        receiptItem = {
          kind: "RECEIPT",
          source: "provider.getTransactionReceipt",
          value: {
            txHash: toLowerHex(receipt.transactionHash),
            status: hexQuantityToDec(receipt.status),
            gasUsed: hexQuantityToDec(receipt.gasUsed),
            transactionIndex: hexQuantityToDec(receipt.transactionIndex),
            blockNumber: hexQuantityToDec(receipt.blockNumber),
            blockHash: toLowerHex(receipt.blockHash) || "",
            logs: (receipt.logs || []).map(normalizeLog),
          },
          blockPin: { blockNumber: hexQuantityToDec(receipt.blockNumber ?? null), blockHash: toLowerHex(receipt.blockHash) || "" },
          txPin: { txHash: toLowerHex(receipt.transactionHash) },
        };
        items.push(receiptItem);
      } else {
        errors.push("receipt not found");
      }
    } catch (e) {
      errors.push(`getTransactionReceipt failed: ${e.message}`);
    }
  } else {
    errors.push("provider.getTransactionReceipt missing — RECEIPT unavailable (NOT_RUN)");
  }

  // Log items (from the receipt only — never synthesized).
  if (receiptItem) {
    for (const log of receiptItem.value.logs) {
      items.push({ kind: "LOG", source: "receipt.logs", value: log, blockPin: { blockNumber: receiptItem.value.blockNumber, blockHash: receiptItem.value.blockHash }, txPin: { txHash } });
    }
  }

  // Block pin — STRICTLY pinned; never `latest`.
  let blockPin = null;
  if (typeof provider.getBlockByNumber === "function") {
    const candidateNum =
      (ref.blockNumber !== undefined && ref.blockNumber !== null) ? String(ref.blockNumber)
      : (txItem && txItem.value.blockNumber) ? txItem.value.blockNumber
      : null;
    const candidateHash =
      (ref.blockHash !== undefined && ref.blockHash !== null) ? toLowerHex(ref.blockHash)
      : (txItem && txItem.value.blockHash) ? txItem.value.blockHash
      : null;
    if (!candidateNum && !candidateHash) {
      errors.push("BLOCK_PIN_UNSET — no pinned blockNumber/blockHash (no `latest` fallback)");
    } else {
      try {
        const block = await provider.getBlockByNumber(candidateNum, candidateHash);
        if (block && (block.number !== undefined || block.hash)) {
          blockPin = { blockNumber: hexQuantityToDec(block.number ?? candidateNum), blockHash: toLowerHex(block.hash ?? candidateHash) };
          items.push({ kind: "BLOCK", source: "provider.getBlockByNumber", value: { blockNumber: blockPin.blockNumber, blockHash: blockPin.blockHash }, blockPin, txPin: null });
        } else {
          errors.push("block not found at pinned ref");
        }
      } catch (e) {
        errors.push(`getBlockByNumber failed: ${e.message}`);
      }
    }
  } else {
    errors.push("provider.getBlockByNumber missing — BLOCK unavailable (NOT_RUN)");
  }

  const executionRef = { txHash, blockNumber: blockPin ? blockPin.blockNumber : (txItem ? txItem.value.blockNumber : null), blockHash: blockPin ? blockPin.blockHash : (txItem ? txItem.value.blockHash : null) };
  if (executionRef.txHash) items.push({ kind: "EXECUTION_REF", source: "derived", value: executionRef, blockPin, txPin: { txHash } });

  // Optional trace — ONLY from an explicitly trace-capable provider.
  const trace = { available: false, status: STATUS.TRACE_UNAVAILABLE, reason: null };
  if (provider.supportsTrace === true && typeof provider.getTrace === "function") {
    try {
      const rawTrace = await provider.getTrace(txHash);
      if (Array.isArray(rawTrace) && rawTrace.length > 0) {
        if (!rawTx || !rawReceipt) {
          errors.push("raw tx/receipt unavailable for trace normalization");
        } else {
          const normalized = normalizeExecution(rawTx, rawReceipt, rawTrace, null, null);
          const traceHash = await hashTrace({ txHash, trace: normalized });
          items.push({ kind: "TRACE", source: "provider.getTrace", value: { normalized, traceHash }, blockPin, txPin: { txHash } });
          trace.available = true;
          trace.status = "TRACE_OK";
          trace.traceHash = traceHash;
        }
      } else {
        errors.push("getTrace returned no frames");
      }
    } catch (e) {
      errors.push(`getTrace failed: ${e.message}`);
    }
  }

  const executionEvidenceRef = await executionEvidenceRefOf({ chainId, executionRef, items });
  return { ok: errors.length === 0, items, chainId, blockPin, executionRef, executionEvidenceRef, trace, errors };
}

/** commitment of an extracted evidence set (recommutable, tamper-evidence).
 * Canonical body = `{ executionRef, items[] }` (spec §4.1); chainId is an
 * evidence item (`CHAIN_ID`), never a top-level trust shortcut. */
export async function executionEvidenceRefOf({ chainId, executionRef, items }) {
  void chainId; // chain separation is carried by the CHAIN_ID item inside `items`
  return domainHash(EXECUTION_EVIDENCE_DOMAIN, { executionRef, items });
}

/* ---------- binding checks (B-EXEC-1..5) ---------- */

function check(kind, result, label, reason = null) {
  return { check: kind, result, label, reason };
}

/**
 * Bind extracted execution evidence against the frozen PRE chain.
 * All inputs are recomputed/trusted; `callerClaims` is discarded.
 * @returns {Promise<{ok, checks, status, label, reason}>}
 */
export async function bindExecutionEvidence({
  evidence,
  intent,
  signerKind = "EOA",
  frozenDecision,
  decisionRef,
  valuePredicate,
}) {
  const checks = [];
  const items = evidence && evidence.items ? evidence.items : [];
  const chainItem = findItem(items, "CHAIN_ID");
  const txItem = findItem(items, "TRANSACTION");

  // B-EXEC-1 — chain pin.
  const scope = scopeOfIntent(intent);
  const declaredChain = String(intent.chainId ?? "");
  if (!chainItem) {
    checks.push(check("B-EXEC-1", "NOT_RUN", "CHAIN_ID_UNAVAILABLE", "provider chainId missing"));
  } else if (String(chainItem.value) !== declaredChain || String(scope.chainId) !== declaredChain) {
    checks.push(check("B-EXEC-1", "NOT_PROVEN", "CHAIN_MISMATCH", "evidence chainId != intent.chainId == scope.chainId"));
  } else {
    checks.push(check("B-EXEC-1", "PASS", "CHAIN_PIN"));
  }

  // B-EXEC-2 — target/selector pin.
  if (!txItem) {
    checks.push(check("B-EXEC-2", "NOT_RUN", "TX_UNAVAILABLE"));
  } else {
    let targetResult = null;
    let selectorResult = null;
    const target = String(intent.target ?? "").toLowerCase();
    if (!txItem.value.to) {
      targetResult = check("B-EXEC-2", "NOT_RUN", "TARGET_UNAVAILABLE");
    } else if (String(txItem.value.to).toLowerCase() !== target) {
      targetResult = check("B-EXEC-2", "NOT_PROVEN", "TARGET_MISMATCH", "tx.to != intent.target");
    } else {
      targetResult = check("B-EXEC-2", "PASS", "TARGET_PIN");
    }
    const sel = functionSelector(txItem.value.input);
    const declaredSel = String(intent.selector ?? "");
    if (!sel) {
      selectorResult = check("B-EXEC-2", "NOT_RUN", "SELECTOR_UNAVAILABLE", "no calldata selector extractable");
    } else if (!declaredSel) {
      selectorResult = check("B-EXEC-2", "NOT_RUN", "SELECTOR_UNDECLARED", "intent.selector not set");
    } else if (sel !== declaredSel.toLowerCase()) {
      selectorResult = check("B-EXEC-2", "NOT_PROVEN", "SELECTOR_MISMATCH", "selector(input) != intent.selector");
    } else {
      selectorResult = check("B-EXEC-2", "PASS", "SELECTOR_PIN");
    }
    if (targetResult.result === "NOT_PROVEN" || selectorResult.result === "NOT_PROVEN") {
      checks.push((targetResult.result === "NOT_PROVEN" ? targetResult : selectorResult));
    } else if (targetResult.result === "NOT_RUN" || selectorResult.result === "NOT_RUN") {
      checks.push((targetResult.result === "NOT_RUN" ? targetResult : selectorResult));
    } else {
      checks.push(check("B-EXEC-2", "PASS", "TARGET_SELECTOR_PIN"));
    }
  }

  // B-EXEC-3 — value/asset pin (only via an explicit policy-defined predicate).
  if (typeof valuePredicate !== "function") {
    checks.push(check("B-EXEC-3", "NOT_RUN", "VALUE_MAPPING_UNDEFINED", "no policy-defined value predicate — value/asset equivalence not invented"));
  } else if (!txItem) {
    checks.push(check("B-EXEC-3", "NOT_RUN", "TX_UNAVAILABLE"));
  } else {
    let ok = false;
    try {
      ok = Boolean(await valuePredicate({ value: txItem.value.value, amount: String(intent.amount ?? ""), intent, evidence }));
    } catch (e) {
      return { ok: false, checks, status: STATUS.NOT_RUN, label: "VALUE_PREDICATE_ERROR", reason: e.message };
    }
    checks.push(ok ? check("B-EXEC-3", "PASS", "VALUE_PIN") : check("B-EXEC-3", "NOT_PROVEN", "VALUE_MISMATCH", "policy-defined value predicate rejected tx value vs intent amount"));
  }

  // B-EXEC-4 — caller / attribution (strict; never inferred).
  if (!txItem) {
    checks.push(check("B-EXEC-4", "NOT_RUN", "TX_UNAVAILABLE"));
  } else if (!txItem.value.from) {
    checks.push(check("B-EXEC-4", "NOT_RUN", "ATTRIBUTION_UNAVAILABLE", "no tx.from evidence"));
  } else {
    const from = String(txItem.value.from).toLowerCase();
    const signer = String(intent.signer ?? "").toLowerCase();
    const kind = String(signerKind).toUpperCase();
    if (from === signer) {
      checks.push(check("B-EXEC-4", "PASS", kind === "EIP1271" || kind === "CONTRACT" ? "CONTRACT_EXECUTED" : "RECOVERED_CALLER"));
    } else {
      checks.push(check("B-EXEC-4", "NOT_PROVEN", "CALLER_NOT_BOUND", "tx.from != signerBinding (meta-tx/relayer shape) — caller never inferred, EIP-1271 magic is never executor proof"));
    }
  }

  // B-EXEC-5 — decision reference recompute (B-EXEC-5 / T-W4-9).
  if (!frozenDecision || typeof frozenDecision !== "object") {
    checks.push(check("B-EXEC-5", "NOT_RUN", "DECISION_RECORD_MISSING", "frozen PRE decision record required"));
  } else {
    const target = decisionRef ?? frozenDecision.decisionRef;
    if (!target) {
      checks.push(check("B-EXEC-5", "NOT_RUN", "DECISION_REF_MISSING"));
    } else {
      const recomputed = await recomputeDecisionRef(frozenDecision);
      if (String(recomputed).toLowerCase() !== String(target).toLowerCase()) {
        checks.push(check("B-EXEC-5", "FAIL", "DECISION_REF_MISMATCH", "decisionRef != H(CGEP/1:FW-DECISION, record) — contradiction"));
      } else {
        checks.push(check("B-EXEC-5", "PASS", "DECISION_REF_PIN"));
      }
    }
  }

  const { status, label, reason } = aggregateChecks(checks);
  return { ok: status === STATUS.VERIFIED, checks, status, label, reason };
}

function aggregateChecks(checks) {
  if (checks.some((c) => c.result === "FAIL")) {
    const c = checks.find((x) => x.result === "FAIL");
    return { status: STATUS.INVALID, label: c.label, reason: c.reason };
  }
  if (checks.some((c) => c.result === "NOT_PROVEN")) {
    const c = checks.find((x) => x.result === "NOT_PROVEN");
    return { status: STATUS.NOT_PROVEN, label: c.label, reason: c.reason };
  }
  if (checks.some((c) => c.result === "NOT_RUN")) {
    const c = checks.find((x) => x.result === "NOT_RUN");
    return { status: STATUS.NOT_RUN, label: c.label, reason: c.reason };
  }
  return { status: STATUS.VERIFIED, label: "EXECUTION_EVIDENCE_BOUND", reason: null };
}

/* ---------- orchestration ---------- */

/**
 * Verify an execution against the frozen PRE chain (post-execution side).
 * `callerClaims` is discarded — never trusted, never echoed (spec §4.2).
 */
export async function verifyExecutionEvidence({
  provider,
  chainId,
  ref,
  intent,
  frozenDecision,
  decisionRef,
  signerKind = "EOA",
  valuePredicate,
  conformance = "RECEIPT_LEVEL",
  callerClaims,
}) {
  const intentRef = intent ? await computeIntentRef(intent) : null;
  const extraction = await extractExecutionEvidence({ provider, chainId, ref });
  const requiredKinds = ["CHAIN_ID", "BLOCK", "TRANSACTION", "RECEIPT"];
  const missingRequired = requiredKinds.filter((k) => !findItem(extraction.items, k));

  // Trace-level conformance requested but core/L2 provides no trace ⇒
  // capability/provider gap ⇒ TRACE_UNAVAILABLE (never VERIFIED, never fabricated).
  if (conformance === "TRACE_LEVEL" && !extraction.trace.available) {
    return {
      status: STATUS.TRACE_UNAVAILABLE,
      label: "TRACE_UNAVAILABLE",
      reason: "no trace-capable provider — RECEIPT_LEVEL only; trace never synthesised",
      checks: [{ check: "EXTRACTION:TRACE", result: "NOT_RUN", label: "TRACE_UNAVAILABLE", reason: "provider.supportsTrace !== true" }],
      intentRef,
      executionEvidenceRef: extraction.executionEvidenceRef,
      evidenceBundle: null,
      evidenceHash: null,
      conformancePath: "RECEIPT_LEVEL",
      trace: extraction.trace,
      executionRef: extraction.executionRef,
      callerClaimsDiscarded: true,
    };
  }

  const checks = [];
  for (const r of missingRequired) checks.push({ check: `EXTRACTION:${r}`, result: "NOT_RUN", label: `${r}_MISSING`, reason: "required execution evidence unavailable — UNVERIFIED, never VERIFIED" });

  const binding = await bindExecutionEvidence({
    evidence: { chainId: extraction.chainId, executionRef: extraction.executionRef, items: extraction.items },
    intent,
    signerKind,
    frozenDecision,
    decisionRef,
    valuePredicate,
    callerClaims,
  });
  checks.push(...binding.checks);

  let status;
  let label;
  let reason = null;
  if (missingRequired.length > 0) {
    status = STATUS.UNVERIFIED;
    label = "REQUIRED_EVIDENCE_MISSING";
    reason = "required evidence unavailable — claim cannot be made at any level";
  } else if (binding.status === STATUS.INVALID) {
    status = STATUS.INVALID;
    label = binding.label;
    reason = binding.reason;
  } else if (binding.status === STATUS.NOT_PROVEN) {
    status = STATUS.NOT_PROVEN;
    label = binding.label;
    reason = binding.reason;
  } else if (binding.status === STATUS.NOT_RUN) {
    status = STATUS.NOT_RUN;
    label = binding.label;
    reason = binding.reason;
  } else {
    status = STATUS.VERIFIED;
    label = binding.label;
  }

  // evidenceHash closure: the execution object embeds `executionEvidenceRef`, so
  // H(CGEP/1:EVIDENCE, bundle) ⊇ executionEvidenceRef ⊇ { executionRef, items[] }.
  // A change to any item/executionRef changes the ref, changes the bundle, changes
  // evidenceHash — no independent/unbound side-by-side commitments (remediation A).
  const evidenceBundle = await createEvidenceBundle({
    intentHash: intentRef,
    policyHash: frozenDecision && frozenDecision.policy ? frozenDecision.policy.policyHash ?? null : null,
    traceHash: extraction.trace.available ? extraction.trace.traceHash : null,
    stateDeltaHash: null,
    stateDeltaScheme: null,
    result: status,
    verifications: checks,
    simulation: null,
    execution: {
      blockNumber: extraction.executionRef ? extraction.executionRef.blockNumber : null,
      blockHash: extraction.executionRef ? extraction.executionRef.blockHash : null,
      executionEvidenceRef: extraction.executionEvidenceRef,
    },
  });

  return {
    status,
    label,
    reason,
    checks,
    intentRef,
    executionEvidenceRef: extraction.executionEvidenceRef,
    evidenceBundle,
    evidenceHash: evidenceBundle.hash,
    conformancePath: extraction.trace.available ? "TRACE_LEVEL" : "RECEIPT_LEVEL",
    trace: extraction.trace,
    executionRef: extraction.executionRef,
    callerClaimsDiscarded: true,
  };
}

/**
 * Reference an existing @coreguard/evidence receipt (never re-implemented) for
 * the extractor's evidence — specs `execution-receipt.md`.
 *
 * Simulation semantics: WS-4 executes NO simulation. The CGEP/1 receipt schema
 * (`createReceipt`) requires a `simulation` pin object, so the receipt's
 * `simulation` leg is pinned to the SAME execution block — a schema-required
 * marker ONLY, never evidence that a simulation was performed. Every receipt
 * records this explicitly as `{ check: "SIMULATION", result: "NOT_RUN",
 * label: "SIMULATION_NOT_PERFORMED" }`; consumers must not read
 * `receipt.simulation` as simulation evidence (spec §6).
 */
export async function buildEvidenceReceipt({ chainId, txHash, blockHash, blockNumber, intentRef, executionEvidenceRef, traceHash, result, checks, conformancePath, verifierVersion = "coreguard-ws4/0.1.0" }) {
  const simExec = { blockNumber: String(blockNumber ?? ""), blockHash: (blockHash || "").toLowerCase() };
  return createReceipt({
    chainId,
    txHash,
    blockHash,
    blockNumber,
    intentHash: intentRef,
    policyHash: null,
    executionTraceHash: traceHash ?? null,
    stateDeltaHash: null,
    evidenceRoot: executionEvidenceRef,
    simulation: simExec,
    execution: simExec,
    verifierVersion,
    verificationLevel: conformancePath === "TRACE_LEVEL" ? "L2" : "L1",
    result,
    checks: [
      { check: "SIMULATION", result: "NOT_RUN", label: "SIMULATION_NOT_PERFORMED", reason: "WS-4 executes no simulation — the execution block pin is NOT simulation evidence" },
      ...(checks ?? []),
    ],
  });
}

/* ---------- execution attestation ---------- */

/**
 * Build a portable Execution Attestation.
 * On-chain carries ONLY the commitment / receipt reference — never raw
 * evidence (spec §9).
 *
 * @returns {Promise<{record, canonical, attestationRef, commitment}>}
 */
export async function buildExecutionAttestation({
  chainId,
  intentRef,
  manifestId,
  bindingRef,
  decisionRef,
  executionEvidenceRef,
  evidenceHash,
  receiptId,
  verification,
  conformancePath,
  at = "0",
  verifier = "coreguard-ws4",
}) {
  const body = {
    version: ATTESTATION_RECORD_VERSION,
    kind: ATTESTATION_KIND,
    chainId: String(chainId ?? ""),
    intentRef,
    manifestId,
    bindingRef,
    decisionRef: decisionRef || null,
    executionEvidenceRef,
    evidenceHash: evidenceHash ?? null,
    receiptId: receiptId ?? null,
    verification: verification
      ? { status: verification.status, label: verification.label, checks: (verification.checks || []).map((c) => ({ check: c.check, result: c.result })) }
      : null,
    conformancePath: conformancePath || "RECEIPT_LEVEL",
    at: String(at ?? "0"),
    verifier,
  };
  const canonical = canonicalize(body);
  const attestationRef = await domainHash(EXECUTION_ATTESTATION_DOMAIN, JSON.parse(canonical));
  const record = deepFreeze({ ...body, attestationRef });
  return { record, canonical, attestationRef, commitment: attestationRef };
}

/** Binding/commitment of an existing attestation record (for on-chain anchor or receipt reference). */
export function commitmentOf(record) {
  if (!record || !record.attestationRef) return null;
  return record.attestationRef;
}

/** Re-verify an attestation record by recomputation (tamper-evidence). */
export async function verifyExecutionAttestation(record) {
  if (!record || typeof record !== "object" || record.kind !== ATTESTATION_KIND || !record.attestationRef) {
    return { status: STATUS.NOT_RUN, label: "ATTESTATION_RECORD_INVALID", reason: "record must be a CGEP/1 EXECUTION-ATTESTATION" };
  }
  let recomputed;
  try {
    const { attestationRef: _removed, ...body } = record;
    recomputed = await domainHash(EXECUTION_ATTESTATION_DOMAIN, body);
  } catch (e) {
    return { status: STATUS.INVALID, label: "ATTESTATION_NOT_CANONICAL", reason: e.message };
  }
  if (String(recomputed).toLowerCase() !== String(record.attestationRef).toLowerCase()) {
    return { status: STATUS.INVALID, label: "ATTESTATION_TAMPERED", reason: "record.attestationRef != H(CGEP/1:EXECUTION-ATTESTATION, record) — contradiction" };
  }
  return { status: STATUS.VERIFIED, label: "ATTESTATION_INTACT", record };
}

function deepFreeze(obj) {
  if (obj !== null && typeof obj === "object" && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const key of Object.keys(obj)) deepFreeze(obj[key]);
  }
  return obj;
}