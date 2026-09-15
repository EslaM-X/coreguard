/**
 * Pilot-1 `failclosed` — four deterministic fail-closed demonstrations.
 *
 * Every demo is offline + deterministic (no funds, no broadcast) and only
 * proves the machinery REJECTS anomalies. The positive path (a real funded
 * Mainnet execution) is the `capture` command, which is broadcast-gated.
 *
 *   F1 authorization mismatch  -> WS-1 binding NOT_PROVEN
 *   F2 execution mismatch      -> INTENT_EXECUTION_BINDING / POLICY_EVAL FAIL
 *   F2b caller mismatch        -> non-signer executor rejected
 *   F3 missing historical evidence -> UNVERIFIED (required evidence missing)
 *   F4 unavailable trace       -> TRACE_UNAVAILABLE (never fabricated)
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import { hashPolicy, hashTrace } from "@coreguard/canonical";
import { createEvidenceBundle, createReceipt } from "@coreguard/evidence";
import { verifyReceipt } from "@coreguard/verifier";
import { verifyExecutionEvidence } from "@coreguard/execution";
import { buildAuthorization, computeIntentRef } from "@coreguard/intent/authorization.js";
import { agentFromEnv } from "./agent-key.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const load = (rel) => readFile(resolve(here, rel), "utf8").then(JSON.parse);

const results = [];
function record(n, expected, observed, detail) {
  const ok = expected === observed;
  results.push({ demo: n, expected, observed, ok, detail });
  return ok;
}

function fakeTrace(intent, mutation = {}) {
  const from = mutation.from || intent.signer;
  const to = mutation.to || intent.target;
  const value = mutation.value || intent.amount;
  const attacker = "0x0000000000000000000000000000000000000099";
  return {
    txHash: "0x" + "aa".repeat(32),
    blockHash: "0x" + "bb".repeat(32),
    blockNumber: "424242",
    blockTimestamp: "424242000",
    from,
    to,
    value,
    calldata: mutation.calldata ?? "0xa9059cbb" + attacker.slice(2).padStart(64, "0") + BigInt(value).toString(16).padStart(64, "0"),
    nonce: intent.nonce ?? "0",
    gasLimit: "21000",
    gasUsed: "21000",
    status: "1",
    logs: [],
  };
}

async function buildReceiptLike(intent, policy, trace) {
  const intentHash = await computeIntentRef(intent);
  const policyHash = await hashPolicy(policy);
  const evidence = await createEvidenceBundle({
    intentHash,
    policyHash,
    traceHash: await hashTrace(trace),
    stateDeltaHash: "0x" + "11".repeat(32),
    result: "VALID",
    verifications: [{ level: "L1", engine: "coreguard-failclosed" }],
    simulation: null,
    execution: { blockNumber: trace.blockNumber, blockHash: trace.blockHash },
  });
  const { receiptId, receipt } = await createReceipt({
    chainId: intent.chainId,
    txHash: trace.txHash,
    blockHash: trace.blockHash,
    blockNumber: trace.blockNumber,
    intentHash,
    policyHash,
    executionTraceHash: null,
    stateDeltaHash: null,
    evidenceRoot: evidence.hash,
    // Demos only: a shape-valid simulation pin keeps STATE_PINNING green so the
    // proven failure is the mismatch itself (in the real pilot the pin comes
    // from the GENUINE eth_call preflight).
    simulation: { blockNumber: String(Number(trace.blockNumber) - 1), blockHash: "0x" + "cc".repeat(32) },
    execution: { blockNumber: trace.blockNumber, blockHash: trace.blockHash },
    verifierVersion: "0.1.0",
    verificationLevel: "L1",
    levelReason: "L1 = committed hashes + state pinning + intent/policy binding; not a trace proof.",
    traceAvailability: {
      status: "TRACE_UNAVAILABLE",
      reason: "pilot env has no archive RPC in scope; L1 does not require a canonical trace.",
    },
    result: "VALID",
    checks: [],
  });
  return { ...receipt, receiptId };
}

export async function failclosed() {
  const intent = await load("artifacts/intent.json");
  const policy = await load("artifacts/policy.json");
  const declaration = await load("artifacts/declaration.json");
  const agent = agentFromEnv();
  const chainId = String(intent.chainId);

  // --- F1: authorization mismatch (who-authorized lies) ---
  {
    const attacker = "0x" + "99".repeat(20);
    const forgedIntent = { ...intent, signer: attacker };
    const forgedDeclaration = {
      ...declaration,
      intent: forgedIntent,
      signerBinding: { address: attacker, kind: "EOA" },
    };
    const b = await buildAuthorization({ intent: forgedIntent, declaration: forgedDeclaration });
    record("F1", "NOT_PROVEN", b.status, `${b.label}: ${b.reason}`);
  }

  // --- F2: execution mismatch (what-was-executed lies) ---
  {
    const bump = (BigInt(intent.amount) + 100000000000000n).toString();
    const mutated = fakeTrace(intent, { to: intent.target, value: bump });
    const failed = await verifyReceipt(await buildReceiptLike(intent, policy, mutated), null, intent, policy, mutated);
    const policyEval = failed.checks.find((c) => c.check === "POLICY_EVAL");
    const binding = failed.checks.find((c) => c.check === "INTENT_EXECUTION_BINDING");
    const observed = failed.result;
    record("F2", "INVALID", observed, `${binding ? binding.detail : "?"} | policy=${policyEval ? policyEval.result : "?"} (funds hijack > declared amount)`);
  }

  // --- F2b: caller mismatch (who-ran lies) ---
  {
    const hijacker = "0x" + "88".repeat(20);
    const intruder = fakeTrace(intent, { from: hijacker });
    const failed = await verifyReceipt(await buildReceiptLike(intent, policy, intruder), null, intent, policy, intruder);
    const binding = failed.checks.find((c) => c.check === "INTENT_EXECUTION_BINDING");
    record("F2b", "INVALID", failed.result, `${binding ? binding.detail : "?"} — non-signer executor`);
  }

  // --- F3: missing historical evidence (archive/state gap) ---
  {
    const provider = {
      eth_chainId: async () => "0x45c",
      getBlockByNumber: async () => null,
      getTransactionByHash: async () => null,
      getTransactionReceipt: async () => null,
      supportsTrace: false,
      getTrace: null,
    };
    const r = await verifyExecutionEvidence({ provider, chainId, ref: { txHash: "0x" + "aa".repeat(32) }, intent });
    const requiredMissing = r.checks.filter((c) => c.result === "NOT_RUN" && /EXTRACTION:/.test(c.check)).length;
    record("F3", "UNVERIFIED", r.status, `${r.label}: ${r.reason} (${requiredMissing} required evidence NOT_RUN)`);
  }

  // --- F4: unavailable trace (never fabricated) ---
  {
    const r = await verifyExecutionEvidence({ provider: void 0, chainId, ref: { txHash: "0x" + "aa".repeat(32) }, intent, conformance: "TRACE_LEVEL" });
    record("F4", "TRACE_UNAVAILABLE", r.status, `${r.label}: ${r.reason}`);
  }

  return { results, ok: results.every((r) => r.ok) };
}