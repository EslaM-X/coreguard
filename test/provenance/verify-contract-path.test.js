/**
 * Phase B-1 — verifyProvenance contract path (spec V9/V9b/V9c/V9d/V10).
 *
 * End-to-end through the orchestrator with an injected hermetic RPC provider.
 *
 * Guardrail under test: 0x1626ba7e is CONTRACT_AUTHORIZATION evidence — it is
 * NEVER executor proof. VERIFIED on the contract path requires BOTH the magic
 * AND an independently attributable CONTRACT_EXECUTION_BINDING.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import * as EVM from "../../packages/evm/index.js";
import { verifyProvenance } from "../../packages/provenance/index.js";
import { computeManifestId } from "../../packages/provenance/canonical.js";
import { makeTxHash, makeAddress } from "./helpers.js";

const CHAIN = "1116";
const CONTRACT = "0x1111111111111111111111111111111111111111";
const RELAYER = makeAddress(0xaa);   // tx.from (the initiator — NOT the executor)
const TARGET = makeAddress(0xbb);

const TYPES = { ManifestDeclaration: [{ name: "manifestId", type: "bytes32" }] };
const MAGIC = "0x1626ba7e" + "00".repeat(28);
const WRONG = "0xffffffff" + "00".repeat(28);

async function contractManifest({ kind = "STAMP", chainId = CHAIN, sigBytes = "0xdeadbeef", executorType = "SMART_CONTRACT" }) {
  const m = {
    version: "CGEP/1",
    manifestKind: kind,
    nonce: "1",
    declared: { signerBinding: { address: CONTRACT, kind: "EIP1271" }, executorType },
    executionRef: kind === "REGISTRATION"
      ? null
      : { chainId, txHash: makeTxHash(0xc1), blockNumber: "12345" },
  };
  m.manifestId = await computeManifestId(m);
  m.signature = { scheme: "EIP-1271", signer: CONTRACT, bytes: sigBytes };
  return m;
}

/** Provider whose contract returns magic iff calldata carries the digest for `acceptChain`. */
function magicOnlyForChain(acceptChain, manifestId) {
  const expected = EVM.typedDataDigest("ManifestDeclaration", TYPES, { manifestId }, acceptChain);
  const expected64 = Buffer.from(expected).toString("hex").toLowerCase();
  return {
    ethCall: async ({ to, data }) => {
      const digestIn = String(data).toLowerCase().slice(10, 74);
      return { ok: true, data: digestIn === expected64 ? MAGIC : WRONG };
    },
    getCode: async () => "0x60806040",
  };
}

function traceBinding() {
  return {
    rule: "TRACE_CALLER",
    trace: [
      { from: RELAYER, to: CONTRACT },   // relayer → smart account
      { from: CONTRACT, to: TARGET },    // smart account → target (signer is caller/msg.sender)
    ],
  };
}

const baseEvidence = (extra = {}) => ({
  chainId: CHAIN,
  executionFrom: RELAYER,
  executionBlock: "12345",
  ...extra,
});

test("B1 (V9c+V9): relayer-signature contract path — magic + TRACE_CALLER binding ⇒ CONTRACT_AUTHORIZED + BOUND", async () => {
  const m = await contractManifest({});
  const providers = magicOnlyForChain(Number(CHAIN), m.manifestId);
  const out = await verifyProvenance(m, baseEvidence({ executionBinding: traceBinding() }), {
    evm: EVM,
    contractAuth: providers,
  });

  // The relayer is tx.from; the signing contract is the internal caller —
  // binding holds without tx.from == contract (V9c), and the verdict is the
  // contract path prove (V9). No overclaim of executor identity.
  assert.equal(out.verdicts.MANIFEST_SIGNATURE.status, "NOT_APPLICABLE");
  assert.equal(out.verdicts.CONTRACT_AUTHORIZATION.status, "OK");
  assert.equal(out.verdicts.CONTRACT_AUTHORIZATION.label, "EIP1271_MAGIC");
  assert.equal(out.verdicts.CONTRACT_EXECUTION_BINDING.status, "OK");
  assert.equal(out.verdicts.DECLARER_EXECUTION_BINDING.status, "NOT_APPLICABLE");
  assert.equal(out.summary, "MANIFEST_ID_PROVEN + CONTRACT_AUTHORIZED + CONTRACT_EXECUTION_BOUND");
});

test("B1 (V9d): magic WITHOUT execution attribution ⇒ overall NOT_PROVEN (never executor proof)", async () => {
  const m = await contractManifest({});
  const providers = magicOnlyForChain(Number(CHAIN), m.manifestId);
  // evidence has receipt/logs only — no executionBinding rule
  const out = await verifyProvenance(m, baseEvidence({ receipt: { status: "0x1" }, logs: [] }), {
    evm: EVM,
    contractAuth: providers,
  });

  assert.equal(out.verdicts.CONTRACT_AUTHORIZATION.status, "OK");
  assert.equal(out.verdicts.CONTRACT_EXECUTION_BINDING.status, "NOT_PROVEN");
  assert.equal(out.verdicts.CONTRACT_EXECUTION_BINDING.label, "NO_ATTRIBUTION");
  assert.match(out.summary, /FAIL_CLOSED/);
  assert.ok(out.errors.some((e) => /CONTRACT_EXECUTION_BINDING/.test(e)));
});

test("B1 (V9b): EIP-1271 OK but signer never an internal caller ⇒ NOT_PROVEN", async () => {
  const m = await contractManifest({});
  const providers = magicOnlyForChain(Number(CHAIN), m.manifestId);
  const out = await verifyProvenance(m, baseEvidence({
    executionBinding: {
      rule: "TRACE_CALLER",
      trace: [{ from: RELAYER, to: TARGET }], // contract absent from call path
    },
  }), { evm: EVM, contractAuth: providers });

  assert.equal(out.verdicts.CONTRACT_AUTHORIZATION.status, "OK");
  assert.equal(out.verdicts.CONTRACT_EXECUTION_BINDING.status, "NOT_PROVEN");
  assert.equal(out.verdicts.CONTRACT_EXECUTION_BINDING.label, "TRACE_NO_CONTRACT");
  assert.match(out.summary, /FAIL_CLOSED/);
});

test("B1 (V5-orch): contract path with no injected providers ⇒ CONTRACT_AUTHORIZATION NOT_RUN, never fabricated", async () => {
  const m = await contractManifest({});
  const out = await verifyProvenance(m, baseEvidence({ executionBinding: traceBinding() }), {
    evm: EVM, // no contractAuth
  });

  assert.equal(out.verdicts.CONTRACT_AUTHORIZATION.status, "NOT_RUN");
  assert.equal(out.verdicts.CONTRACT_AUTHORIZATION.label, "NO_RPC_PROVIDER");
  assert.match(out.summary, /NOT_RUN/);
});

test("B1 (V9c-no): a NON-relayer trace BREAKS the binding even when magic returns (fail-closed)", async () => {
  const m = await contractManifest({});
  const providers = magicOnlyForChain(Number(CHAIN), m.manifestId);
  const out = await verifyProvenance(m, baseEvidence({
    executionFrom: TARGET, // trace root != executionFrom
    executionBinding: traceBinding(),
  }), { evm: EVM, contractAuth: providers });

  assert.equal(out.verdicts.CONTRACT_EXECUTION_BINDING.status, "NOT_PROVEN");
  assert.equal(out.verdicts.CONTRACT_EXECUTION_BINDING.label, "TRACE_ROOT");
  assert.match(out.summary, /FAIL_CLOSED/);
});

test("B1 (V10): cross-chain replay — 1114-signed bytes do NOT authorize on 1116 (chainId digest guard)", async () => {
  const m = await contractManifest({ chainId: "1114" });
  const m1116 = { ...m, executionRef: { ...m.executionRef, chainId: CHAIN } };
  const manifestId1116 = await computeManifestId(m1116);
  m1116.manifestId = manifestId1116;

  // Contract accepts ONLY digests on chain 1114.
  const providers = magicOnlyForChain(1114, m.manifestId);

  const ok1114 = await verifyProvenance(m, baseEvidence({
    chainId: "1114",
    executionRef: m.executionRef,
    executionBlock: "12345",
    executionBinding: traceBinding(),
  }), { evm: EVM, contractAuth: providers });
  assert.equal(ok1114.verdicts.CONTRACT_AUTHORIZATION.status, "OK");

  const nok1116 = await verifyProvenance(m1116, baseEvidence({ executionBinding: traceBinding() }), {
    evm: EVM,
    contractAuth: providers,
  });
  assert.equal(nok1116.verdicts.CONTRACT_AUTHORIZATION.status, "NOT_PROVEN");
  assert.equal(nok1116.verdicts.CONTRACT_AUTHORIZATION.label, "NOT_MAGIC");
  assert.match(nok1116.summary, /FAIL_CLOSED/);
});

test("B1 (V4): contract path where the address is an EOA (empty code at block) ⇒ NOT_PROVEN", async () => {
  const m = await contractManifest({});
  const out = await verifyProvenance(m, baseEvidence({ executionBinding: traceBinding() }), {
    evm: EVM,
    contractAuth: {
      ethCall: async () => ({ ok: true, data: MAGIC }),
      getCode: async () => "0x",
    },
  });
  assert.equal(out.verdicts.CONTRACT_AUTHORIZATION.status, "NOT_PROVEN");
  assert.equal(out.verdicts.CONTRACT_AUTHORIZATION.label, "NO_CODE_AT_BLOCK");
  assert.match(out.summary, /FAIL_CLOSED/);
});