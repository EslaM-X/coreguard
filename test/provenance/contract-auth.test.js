/**
 * Phase B-1 — contract-auth axis (spec V4/V5/V6/V7, Q-B1.1/B1.2; binding V9b).
 *
 * Provider is injected and hermetic — no network. Asserts NOT_PROVEN / NOT_RUN
 * separation, execution-block pinning, no latest fallback, EOA fails closed,
 * and the strict execution-binding attribution rule.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import * as EVM from "../../packages/evm/index.js";
import {
  evaluateContractAuthorization,
  evaluateContractExecutionBinding,
} from "../../packages/provenance/contract-auth.js";

const CONTRACT = "0x1111111111111111111111111111111111111111";
const EXEC_FROM = "0x2222222222222222222222222222222222222222";
const TARGET = "0x3333333333333333333333333333333333333333";
const DIGEST = "0x9405da1aebd20c2e652140f5cbbd0b5dea8974458dad85396279b2df23766754";
const BLOCK = "12345";

function magicCmp(res) {
  return { res, wasInjected: true };
}

function fakeProvider({ code = "0x60806040", callResult = null, capture = null, codeCapture = null } = {}) {
  return {
    ethCall: capture
      ? async (args) => { capture(args); return callResult; }
      : async () => callResult,
    getCode: async (args) => {
      if (codeCapture) codeCapture(args);
      return code;
    },
  };
}

const okCall = { ok: true, data: "0x1626ba7e" + "00".repeat(28) };

test("brand-new: happy path — code present + magic ⇒ OK at execution-block state", async () => {
  const calls = [];
  const codeAt = [];
  const p = fakeProvider({ callResult: okCall, capture: (a) => calls.push(a), codeCapture: (a) => codeAt.push(a) });
  const out = await evaluateContractAuthorization({
    digest: DIGEST, signatureBytes: "0xdeadbeef", contract: CONTRACT,
    blockNumber: BLOCK, ethCall: p.ethCall, getCode: p.getCode, evm: EVM,
  });
  assert.equal(out.status, "OK");
  assert.equal(out.label, "EIP1271_MAGIC");
  assert.equal(out.atBlock, BLOCK);
  assert.equal(calls[0].block, BLOCK);       // execution-block state, no latest
  assert.equal(calls[0].data.slice(0, 10), "0x1626ba7e");
  assert.equal(codeAt[0].block, BLOCK);
});

test("contract-auth (V4): EOA-as-contract — empty code at block ⇒ NOT_PROVEN", async () => {
  const p = fakeProvider({ code: "0x", callResult: okCall });
  const out = await evaluateContractAuthorization({
    digest: DIGEST, signatureBytes: "0x", contract: CONTRACT,
    blockNumber: BLOCK, ethCall: p.ethCall, getCode: p.getCode, evm: EVM,
  });
  assert.equal(out.status, "NOT_PROVEN");
  assert.equal(out.label, "NO_CODE_AT_BLOCK");
});

test("contract-auth (V5): missing provider ⇒ NOT_RUN, never invented", async () => {
  const noEth = await evaluateContractAuthorization({
    digest: DIGEST, signatureBytes: "0x", contract: CONTRACT,
    blockNumber: BLOCK, ethCall: null, getCode: async () => "0x60", evm: EVM,
  });
  assert.equal(noEth.status, "NOT_RUN");
  assert.equal(noEth.label, "NO_RPC_PROVIDER");

  const noCode = await evaluateContractAuthorization({
    digest: DIGEST, signatureBytes: "0x", contract: CONTRACT,
    blockNumber: BLOCK, ethCall: async () => okCall, getCode: null, evm: EVM,
  });
  assert.equal(noCode.status, "NOT_RUN");
  assert.equal(noCode.label, "NO_CODE_PROVIDER");

  const noEvm = await evaluateContractAuthorization({
    digest: DIGEST, signatureBytes: "0x", contract: CONTRACT,
    blockNumber: BLOCK, ethCall: async () => okCall, getCode: async () => "0x60", evm: null,
  });
  assert.equal(noEvm.status, "NOT_RUN");
  assert.equal(noEvm.label, "EVM_ADAPTER_UNAVAILABLE");
});

test("contract-auth (V6): revert/wrong-magic are NOT_PROVEN — the call RAN", async () => {
  const reverted = await evaluateContractAuthorization({
    digest: DIGEST, signatureBytes: "0x", contract: CONTRACT,
    blockNumber: BLOCK,
    ethCall: async () => ({ ok: false, code: "REVERTED" }),
    getCode: async () => "0x60", evm: EVM,
  });
  assert.equal(reverted.status, "NOT_PROVEN");
  assert.equal(reverted.label, "REVERTED");

  const wrongMagic = await evaluateContractAuthorization({
    digest: DIGEST, signatureBytes: "0x", contract: CONTRACT,
    blockNumber: BLOCK,
    ethCall: async () => ({ ok: true, data: "0xffffffff" + "00".repeat(28) }),
    getCode: async () => "0x60", evm: EVM,
  });
  assert.equal(wrongMagic.status, "NOT_PROVEN");
  assert.equal(wrongMagic.label, "NOT_MAGIC");
});

test("contract-auth (Q-B1.1.7/T9): historical unavailable ⇒ NOT_RUN, no latest fallback", async () => {
  const out = await evaluateContractAuthorization({
    digest: DIGEST, signatureBytes: "0x", contract: CONTRACT,
    blockNumber: BLOCK,
    ethCall: async () => ({ ok: false, code: "HISTORICAL_STATE_UNAVAILABLE" }),
    getCode: async () => "0x60", evm: EVM,
  });
  assert.equal(out.status, "NOT_RUN");
  assert.equal(out.label, "HISTORICAL_STATE_UNAVAILABLE");

  const noBlock = await evaluateContractAuthorization({
    digest: DIGEST, signatureBytes: "0x", contract: CONTRACT,
    blockNumber: null, ethCall: async () => okCall, getCode: async () => "0x60", evm: EVM,
  });
  assert.equal(noBlock.status, "NOT_RUN");
  assert.equal(noBlock.label, "NO_EXECUTION_BLOCK");
});

test("contract-auth (Q-B1.2): explicit caller context is forwarded when the profile states it", async () => {
  const calls = [];
  const p = fakeProvider({ callResult: okCall, capture: (a) => calls.push(a) });
  await evaluateContractAuthorization({
    digest: DIGEST, signatureBytes: "0x", contract: CONTRACT,
    blockNumber: BLOCK, from: EXEC_FROM, ethCall: p.ethCall, getCode: p.getCode, evm: EVM,
  });
  assert.equal(calls[0].from, EXEC_FROM);
});

// ── CONTRACT_EXECUTION_BINDING ──────────────────────────────────────────

const chain = [
  { from: EXEC_FROM, to: CONTRACT },
  { from: CONTRACT, to: TARGET },
];

test("binding (V9c): relayer-shape trace — signer is internal caller ⇒ OK (tx.from is only the initiator)", async () => {
  const out = await evaluateContractExecutionBinding({
    evidence: { executionBinding: { rule: "TRACE_CALLER", trace: chain } },
    signerBinding: { address: CONTRACT },
    executionFrom: EXEC_FROM,
  });
  assert.equal(out.status, "OK");
  assert.equal(out.label, "TRACE_CALLER");
});

test("binding (V9b/V9d): no binding evidence (receipt/logs alone) ⇒ NOT_PROVEN", async () => {
  const none = await evaluateContractExecutionBinding({
    evidence: { receipt: { status: "0x1" }, logs: [] },
    signerBinding: { address: CONTRACT },
    executionFrom: EXEC_FROM,
  });
  assert.equal(none.status, "NOT_PROVEN");
  assert.equal(none.label, "NO_ATTRIBUTION");
});

test("binding (V9b/V9d): signer not caller ⇒ NOT_PROVEN", async () => {
  const out = await evaluateContractExecutionBinding({
    evidence: { executionBinding: { rule: "TRACE_CALLER", trace: [{ from: EXEC_FROM, to: TARGET }] } },
    signerBinding: { address: CONTRACT },
    executionFrom: EXEC_FROM,
  });
  assert.equal(out.status, "NOT_PROVEN");
  assert.equal(out.label, "TRACE_NO_CONTRACT");
});

test("binding: trace root mismatch / disconnection / empty / malformed ⇒ NOT_PROVEN", async () => {
  const rootBad = await evaluateContractExecutionBinding({
    evidence: { executionBinding: { rule: "TRACE_CALLER", trace: [{ from: TARGET, to: TARGET }] } },
    signerBinding: { address: CONTRACT }, executionFrom: EXEC_FROM,
  });
  assert.equal(rootBad.label, "TRACE_ROOT");

  const disconn = await evaluateContractExecutionBinding({
    evidence: {
      executionBinding: {
        rule: "TRACE_CALLER",
        trace: [
          { from: EXEC_FROM, to: EXEC_FROM },
          { from: TARGET, to: TARGET },
        ],
      },
    },
    signerBinding: { address: CONTRACT }, executionFrom: EXEC_FROM,
  });
  assert.equal(disconn.label, "TRACE_DISCONNECTED");

  const empty = await evaluateContractExecutionBinding({
    evidence: { executionBinding: { rule: "TRACE_CALLER", trace: [] } },
    signerBinding: { address: CONTRACT }, executionFrom: EXEC_FROM,
  });
  assert.equal(empty.label, "TRACE_EMPTY");

  const malformed = await evaluateContractExecutionBinding({
    evidence: { executionBinding: { rule: "TRACE_CALLER", trace: [{ from: "nope" }] } },
    signerBinding: { address: CONTRACT }, executionFrom: EXEC_FROM,
  });
  assert.equal(malformed.label, "TRACE_MALFORMED");
});

test("binding: PROTOCOL_STATE_TRANSITION requires an injected deterministic checker (never self-asserted)", async () => {
  const noChecker = await evaluateContractExecutionBinding({
    evidence: { executionBinding: { rule: "PROTOCOL_STATE_TRANSITION", transitionHash: "0xaa" } },
    signerBinding: { address: CONTRACT }, executionFrom: EXEC_FROM,
  });
  assert.equal(noChecker.status, "NOT_PROVEN");
  assert.equal(noChecker.label, "TRANSITION_NO_CHECKER");

  const ok = await evaluateContractExecutionBinding({
    evidence: { executionBinding: { rule: "PROTOCOL_STATE_TRANSITION", verify: async () => ({ ok: true }) } },
    signerBinding: { address: CONTRACT }, executionFrom: EXEC_FROM,
  });
  assert.equal(ok.status, "OK");

  const reject = await evaluateContractExecutionBinding({
    evidence: { executionBinding: { rule: "PROTOCOL_STATE_TRANSITION", verify: async () => ({ ok: false, reason: "x" }) } },
    signerBinding: { address: CONTRACT }, executionFrom: EXEC_FROM,
  });
  assert.equal(reject.status, "NOT_PROVEN");
});

test("binding: unknown rule ⇒ NO_ATTRIBUTION NOT_PROVEN", async () => {
  const out = await evaluateContractExecutionBinding({
    evidence: { executionBinding: { rule: "WE_TRUST_THE_VIBE" } },
    signerBinding: { address: CONTRACT }, executionFrom: EXEC_FROM,
  });
  assert.equal(out.status, "NOT_PROVEN");
  assert.equal(out.label, "NO_ATTRIBUTION");
});