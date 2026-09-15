/**
 * WS-5 — offline conformance suite over the FROZEN real live-evidence corpus
 * (spec/core-live-conformance.md §5/§6/§7).
 *
 *  - C-L-1..8 : real-data read-only conformance + determinism
 *  - A-W5-1..8: adversarial corpus over REAL payloads
 *  - §7       : independent recomputation (Path B) byte-equality with Path A
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  verifyExecutionEvidence,
  extractExecutionEvidence,
  buildExecutionAttestation,
  verifyExecutionAttestation,
} from "../../../packages/execution/index.js";
import { computeBindingRef } from "../../../packages/intent/authorization.js";
import { makeIntent, makeDeclaration, signDeclaration, seedKey } from "../../firewall/helpers.js";
import { decisionRecordFor } from "../../sdk/helpers.js";
import { defaultValuePredicate } from "../../execution/helpers.js";
import { makeReplay, rawBlock, rawTx, rawReceipt, TX_HASH, CHAIN_ID_HEX, PIN_BLOCK_NUMBER_DEC, PIN_BLOCK_HASH, MANIFEST } from "./rawReplay.js";
import { executionEvidenceRefOf, intentRefOf, evidenceHashOf, attestationRefOf, canon, deriveItems, hexDec } from "./recompute/recompute.js";
import { canonicalize } from "../../../packages/canonical/index.js";

const CHAIN_ID_DEC = "1114"; // Core Testnet2
const SIGNER = rawTx.from;
const TARGET = rawTx.to;
const SELECTOR = rawTx.input.slice(0, 10);
const DIRECT_AMOUNT = String(BigInt(rawReceipt.logs[0].data));

async function frozenPRE() {
  const intent = makeIntent({
    chainId: CHAIN_ID_DEC,
    signer: SIGNER,
    nonce: String(BigInt(rawTx.nonce)),
    action: "STAKE",
    target: TARGET,
    selector: SELECTOR,
    amount: DIRECT_AMOUNT,
  });
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  const { record, decisionRef } = await decisionRecordFor({ intent, declaration, decisionBlock: PIN_BLOCK_NUMBER_DEC });
  return { intent, declaration, record, decisionRef };
  }

/** Path A verification over the RAW replay (wire hex eth_chainId, no external
 * shim). WS-5R trains the boundary inside @coreguard/execution so the raw node
 * hex is normalized to canonical decimal in-boundary. */
async function runVerify({ intent, record, decisionRef, provider, chainId = CHAIN_ID_DEC, ref = { txHash: TX_HASH }, overrides = {} }) {
  return verifyExecutionEvidence({
    provider,
    chainId,
    ref,
    intent,
    frozenDecision: record,
    decisionRef: decisionRef ?? record.decisionRef,
    signerKind: "EOA",
    valuePredicate: defaultValuePredicate,
    ...overrides,
  });
}

test("C-L-1 chainId conformance (WS-5R) — raw wire hex is normalized to canonical decimal inside the boundary", async () => {
  // Wire fact: the frozen Core Testnet2 node returns hex "0x45a".
  assert.equal(CHAIN_ID_HEX, "0x45a");
  const raw = await extractExecutionEvidence({ provider: makeReplay(), chainId: CHAIN_ID_DEC, ref: { txHash: TX_HASH } });
  assert.equal(raw.chainId, CHAIN_ID_DEC);
  assert.equal(raw.items.find((i) => i.kind === "CHAIN_ID").value, CHAIN_ID_DEC, "in-boundary hex→decimal normalization (F-W5-3 fix)");
});

test("C-L-1b chainId boundary fail-closed — decimal passthrough stays canonical, junk → NOT_RUN (no fatal, no fabricate)", async () => {
  const dec = await extractExecutionEvidence({ provider: makeReplay({ chainIdOverride: "1114" }), chainId: CHAIN_ID_DEC, ref: { txHash: TX_HASH } });
  assert.equal(dec.items.find((i) => i.kind === "CHAIN_ID").value, CHAIN_ID_DEC, "decimal input stays canonical decimal");
  const hexu = await extractExecutionEvidence({ provider: makeReplay({ chainIdOverride: "0X45A" }), chainId: CHAIN_ID_DEC, ref: { txHash: TX_HASH } });
  assert.equal(hexu.items.find((i) => i.kind === "CHAIN_ID").value, CHAIN_ID_DEC, "uppercase 0X hex is normalized");
  const junk = await extractExecutionEvidence({ provider: makeReplay({ chainIdOverride: "not-a-chain-id" }), chainId: CHAIN_ID_DEC, ref: { txHash: TX_HASH } });
  assert.equal(junk.items.some((i) => i.kind === "CHAIN_ID"), false, "unparseable chainId → CHAIN_ID evidence absent (NOT_RUN, never fabricated)");
});

test("C-L-2 block-pin conformance — cross-object back-reference", async () => {
  assert.equal(rawBlock.number, rawTx.blockNumber);
  assert.equal(rawBlock.hash.toLowerCase(), rawTx.blockHash.toLowerCase());
  assert.equal(rawReceipt.blockHash.toLowerCase(), rawBlock.hash.toLowerCase());
  assert.equal(PIN_BLOCK_NUMBER_DEC, hexDec(rawBlock.number));
});

test("C-L-3 transaction conformance — full wire fields present", () => {
  for (const f of ["hash", "from", "to", "value", "input", "nonce", "blockNumber", "blockHash", "v", "r", "s", "chainId"]) {
    assert.ok(rawTx[f] !== undefined && rawTx[f] !== null, `missing tx field ${f}`);
  }
  assert.equal(rawTx.chainId, CHAIN_ID_HEX);
  assert.match(rawTx.hash, /^0x[0-9a-f]{64}$/);
  assert.match(rawTx.from, /^0x[0-9a-f]{40}$/);
});

test("C-L-4 receipt/log conformance — full wire fields present", () => {
  assert.ok(rawReceipt.logs.length >= 1);
  const log = rawReceipt.logs[0];
  for (const f of ["address", "topics", "data", "logIndex", "blockNumber", "transactionHash", "blockHash"]) {
    assert.ok(log[f] !== undefined, `missing log field ${f}`);
  }
  assert.equal(rawReceipt.status, "0x1");
});

test("C-L-5 extraction end-to-end over real envelopes — raw wire hex, VERIFIED with NO external shim (WS-5R)", async () => {
  const { intent, record, decisionRef } = await frozenPRE();
  const v = await runVerify({ intent, record, decisionRef, provider: makeReplay() });
  assert.equal(v.status, "VERIFIED");
  assert.equal(v.conformancePath, "RECEIPT_LEVEL");
  assert.ok(v.executionEvidenceRef.startsWith("0x") && v.executionEvidenceRef.length === 66);
  assert.equal(v.simulation.status, "NOT_RUN"); // receiptId null path
  assert.ok(v.evidenceHash);
  assert.equal(v.checks.find((c) => c.check === "B-EXEC-1:CHAIN" && c.result !== "PASS"), undefined, "chain binding must PASS on genuine hex wire data");
});

test("C-L-5b attestation closure over real evidence (receiptId null, SIMULATION committed)", async () => {
  const { intent, declaration, record, decisionRef } = await frozenPRE();
  const v = await runVerify({ intent, record, decisionRef, provider: makeReplay() });
  const intentRef = await intentRefOf(intent);
  const manifestId = declaration.manifestId;
  const bindingRef = await computeBindingRef({ intentRef, manifestId, signature: declaration.signature });
  const att = await buildExecutionAttestation({
    chainId: CHAIN_ID_DEC,
    intentRef,
    manifestId,
    bindingRef,
    decisionRef,
    executionEvidenceRef: v.executionEvidenceRef,
    evidenceHash: v.evidenceHash,
    receiptId: null,
    verification: { status: v.status, label: v.label, checks: v.checks },
    conformancePath: "RECEIPT_LEVEL",
  });
  assert.equal(att.record.receiptId, null);
  const re = await verifyExecutionAttestation(att.record);
  assert.equal(re.status, "VERIFIED");
  assert.equal(re.label, "ATTESTATION_INTACT");
});

test("C-L-6 independent recomputation — Path B == Path A (executionEvidenceRef / evidenceHash / attestationRef)", async () => {
  const { intent, declaration, record, decisionRef } = await frozenPRE();
  const v = await runVerify({ intent, record, decisionRef, provider: makeReplay() });

  // Path B over the SAME raw payloads, feeding the WIRE chainId hex "0x45a" so the
  // independent fold must apply the same in-boundary canonicalization to agree.
  const p = { chainIdValue: CHAIN_ID_HEX, block: rawBlock, tx: rawTx, receipt: rawReceipt, txHash: TX_HASH };
  const refB = await executionEvidenceRefOf(p);
  assert.equal(refB, v.executionEvidenceRef);

  // Independent evidenceHash fold (bundle rebuilt from independently derived refs).
  const intentRefB = await intentRefOf(intent);
  const evidenceB = {
    version: "CGEP/1",
    intentHash: intentRefB,
    policyHash: null,
    traceHash: null,
    stateDeltaHash: null,
    result: v.status,
    verifications: v.checks,
    simulation: null,
    execution: {
      blockNumber: p.block.number ?? rawTx.blockNumber,
      blockHash: p.block.hash,
      executionEvidenceRef: refB,
    },
  };
  // normalize execution pin hex like WS-4 (hexQuantityToDec on blockNumber)
  evidenceB.execution.blockNumber = hexDec(evidenceB.execution.blockNumber);
  const hashB = await evidenceHashOf(evidenceB);
  assert.equal(hashB, v.evidenceHash);

  // Independent attestationRef recompute from the committed record.
  const intentRefA = await intentRefOf(intent);
  const manifestId = declaration.manifestId;
  const bindingRef = await computeBindingRef({ intentRef: intentRefA, manifestId, signature: declaration.signature });
  const att = await buildExecutionAttestation({
    chainId: CHAIN_ID_DEC,
    intentRef: intentRefA,
    manifestId,
    bindingRef,
    decisionRef,
    executionEvidenceRef: v.executionEvidenceRef,
    evidenceHash: v.evidenceHash,
    receiptId: null,
    verification: { status: v.status, label: v.label, checks: v.checks },
    conformancePath: "RECEIPT_LEVEL",
  });
  const attB = await attestationRefOf(att.record);
  assert.equal(attB, att.attestationRef);
});

test("C-L-7 determinism double-run — identical refs/hashes bytes", async () => {
  const { intent, record, decisionRef } = await frozenPRE();
  const a = await runVerify({ intent, record, decisionRef, provider: makeReplay() });
  const b = await runVerify({ intent, record, decisionRef, provider: makeReplay() });
  assert.equal(b.executionEvidenceRef, a.executionEvidenceRef);
  assert.equal(b.evidenceHash, a.evidenceHash);
  assert.equal(JSON.stringify(b.checks), JSON.stringify(a.checks));
});

test("C-L-8 read-only guard — replay exposes the allowlist reads only and records no writes", async () => {
  const provider = makeReplay();
  const { intent, record, decisionRef } = await frozenPRE();
  await runVerify({ intent, record, decisionRef, provider });
  const proof = provider.readOnlyProof;
  assert.ok(proof.noWrites, "write-capable method invoked: " + proof.calls.join(","));
  assert.ok(proof.onlyReads, "forbidden method invoked");
  assert.deepEqual([...new Set(proof.calls)].sort(), [
    "eth_chainId",
    "getBlockByNumber",
    "getTransactionByHash",
    "getTransactionReceipt",
  ]);
});

/* ---------------- adversarial corpus over REAL payloads ---------------- */

test("A-W5-1 wrong block hash — commitment-chain tamper detection (provenance-bound engine)", async () => {
  const { intent, record, decisionRef } = await frozenPRE();
  const honest = await runVerify({ intent, record, decisionRef, provider: makeReplay() });
  // self-consistent tampered world: block hash rewritten in block AND tx (WS-4
  // receives a consistent "other chain view"; the engine is provenance-bound).
  const badHash = PIN_BLOCK_HASH.slice(0, -1) + (PIN_BLOCK_HASH.endsWith("a") ? "b" : "a");
  const evil = await runVerify({
    intent, record, decisionRef,
    provider: makeReplay({ blockHash: badHash, tx: { blockHash: badHash, blockNumber: rawTx.blockNumber } }),
  });
  assert.notEqual(evil.executionEvidenceRef, honest.executionEvidenceRef, "mutation must change the ref (tamper visible to commitment chain)");
  assert.notEqual(evil.evidenceHash, honest.evidenceHash);
  // finding F-W5-1: cross-object back-reference (block.hash vs tx.blockHash) is NOT
  // enforced by WS-4 itself; enforcement today is provider/replay side.
});

test("A-W5-1b inconsistent tx.blockHash is rejected at the pinned-block layer (IN-W4-3 replay guard)", async () => {
  const { intent, record, decisionRef } = await frozenPRE();
  const bad = PIN_BLOCK_HASH.slice(0, -1) + (PIN_BLOCK_HASH.endsWith("a") ? "b" : "a");
  const v = await runVerify({
    intent, record, decisionRef,
    provider: makeReplay({ tx: { blockHash: bad } }),
  });
  assert.equal(v.status, "UNVERIFIED"); // block read rejected at the pin layer → fail closed
});

test("A-W5-2 cross-chain mismatch → NOT_PROVEN / CHAIN_MISMATCH", async () => {
  const { intent, record, decisionRef } = await frozenPRE();
  const v = await runVerify({ intent, record, decisionRef, provider: makeReplay({ chainIdOverride: "0x1" }) });
  assert.equal(v.status, "NOT_PROVEN");
  assert.equal(v.label, "CHAIN_MISMATCH");
});

test("A-W5-3 altered logs — real receipt log data flipped → ref/hash change (tamper detect)", async () => {
  const { intent, record, decisionRef } = await frozenPRE();
  const honest = await runVerify({ intent, record, decisionRef, provider: makeReplay() });
  const flipped = "0x" + rawReceipt.logs[0].data.slice(2).replace(/0$/, "1");
  const evil = await runVerify({
    intent, record, decisionRef,
    provider: makeReplay({ receipt: { logs: [{ ...rawReceipt.logs[0], data: flipped }] } }),
  });
  assert.notEqual(evil.executionEvidenceRef, honest.executionEvidenceRef);
  assert.notEqual(evil.evidenceHash, honest.evidenceHash);
});

test("A-W5-4 missing historical state → UNVERIFIED (fail closed), EXTRACTION:BLOCK NOT_RUN", async () => {
  const { intent, record, decisionRef } = await frozenPRE();
  const v = await runVerify({ intent, record, decisionRef, provider: makeReplay({ missingState: true }, {}) });
  assert.equal(v.status, "UNVERIFIED");
  assert.equal(v.label, "REQUIRED_EVIDENCE_MISSING");
  const b = v.checks.find((c) => c.check === "EXTRACTION:BLOCK");
  assert.ok(b && b.result === "NOT_RUN" && b.label === "BLOCK_MISSING");
});

test("A-W5-5 relayer / meta-tx — REAL payload with from replaced → NOT_PROVEN / CALLER_NOT_BOUND", async () => {
  const { intent, record, decisionRef } = await frozenPRE();
  const v = await runVerify({ intent, record, decisionRef, provider: makeReplay({ tx: { from: "0x" + "11".repeat(20) } }) });
  assert.equal(v.status, "NOT_PROVEN");
  assert.equal(v.label, "CALLER_NOT_BOUND");
});

test("A-W5-6 unavailable trace — capability NOT present → TRACE_UNAVAILABLE; never fabricated", async () => {
  const { intent, record, decisionRef } = await frozenPRE();
  const r = await runVerify({ intent, record, decisionRef, provider: makeReplay() });
  assert.equal(r.trace.available, false);
  assert.equal(r.trace.status, "TRACE_UNAVAILABLE");
  const tl = await runVerify({ intent, record, decisionRef, provider: makeReplay(), overrides: { conformance: "TRACE_LEVEL" } });
  assert.equal(tl.status, "TRACE_UNAVAILABLE");
});

test("A-W5-7 latest fallback attempt → hard error at the pin layer + fail-closed verify", async () => {
  await assert.rejects(() => makeReplay().getBlockByNumber("latest", "0x0"));
  await assert.rejects(() => makeReplay().getBlockByNumber("earliest", "0x0"));
  const { intent, record, decisionRef } = await frozenPRE();
  const v = await runVerify({ intent, record, decisionRef, provider: makeReplay(), ref: { txHash: TX_HASH, blockNumber: "latest" } });
  assert.equal(v.status, "UNVERIFIED");
});

test("A-W5-8 target/selector/value tamper against real intent binding", async () => {
  const { intent, record, decisionRef } = await frozenPRE();
  const t = await runVerify({ intent, record, decisionRef, provider: makeReplay({ tx: { to: "0x" + "bb".repeat(20) } }) });
  assert.equal(t.status, "NOT_PROVEN"); assert.equal(t.label, "TARGET_MISMATCH");
  const s = await runVerify({ intent, record, decisionRef, provider: makeReplay({ tx: { input: "0xa9059cbb0000000000000000000000000000000000000000000000000000000000000001" } }) });
  assert.equal(s.status, "NOT_PROVEN"); assert.equal(s.label, "SELECTOR_MISMATCH");
  const vl = await runVerify({ intent, record, decisionRef, provider: makeReplay({ tx: { value: "0x1" } }) });
  assert.equal(vl.status, "NOT_PROVEN"); assert.equal(vl.label, "VALUE_MISMATCH");
});

test("determinism over Path B — independent canonicalizer is byte-stable", async () => {
  const p = { chainIdValue: CHAIN_ID_DEC, block: rawBlock, tx: rawTx, receipt: rawReceipt, txHash: TX_HASH };
  const a = await executionEvidenceRefOf(p);
  const b = await executionEvidenceRefOf(p);
  assert.equal(a, b);
  assert.equal(canon({ z: 1, a: ["0xAb", 2] }), '{"a":["0xab",2],"z":1}');
});

test("vocabulary guard — transactionIndex present in BOTH Path A and Path B RECEIPT evidence (owner-reviably explicit)", async () => {
  const { intent, record, decisionRef } = await frozenPRE();
  const ex = await extractExecutionEvidence({ provider: makeReplay(), chainId: CHAIN_ID_DEC, ref: { txHash: TX_HASH } });
  const asItemA = ex.items.find((i) => i.kind === "RECEIPT");
  assert.equal(asItemA.value.transactionIndex, hexDec(rawReceipt.transactionIndex), "Path A must carry transactionIndex in RECEIPT.value");
  const p = { chainIdValue: CHAIN_ID_DEC, block: rawBlock, tx: rawTx, receipt: rawReceipt, txHash: TX_HASH };
  const derived = deriveItems(p);
  const bReceipt = derived.items.find((i) => i.kind === "RECEIPT");
  assert.equal(bReceipt.value.transactionIndex, hexDec(rawReceipt.transactionIndex), "Path B must carry transactionIndex in RECEIPT.value");
  assert.equal(bReceipt.value.transactionIndex, asItemA.value.transactionIndex, "Path A and Path B agree on transactionIndex bytes");
  // evidence-path witness: the element also lands in the committed digest closure
  const refA = ex.executionEvidenceRef;
  const refB = await executionEvidenceRefOf(p);
  assert.equal(refB, refA);
});

test("canonicalizer casing parity — Path B mirrors the CGEP/1 scheme byte-for-byte incl. its 0x case-sensitivity", async () => {
  // The CGEP/1 canonicalizer lowercases only strings that START with lowercase "0x"
  // (@coreguard/canonical), so "0X…" is intentionally NOT treated as hex. Path B must
  // mirror exactly that to remain byte-equal (path independence != protocol drift).
  assert.equal(canon("0xAb"), canonicalize("0xAb"));          // `"0xab"` on both
  assert.equal(canon("0XAb"), canonicalize("0XAb"));          // `"0XAb"` on both (non-hex)
  assert.notEqual(canon("0XAb"), canon("0xAb"));              // casing NOT silently normalized
  assert.notEqual(canonicalize("0XAb"), canonicalize("0xAb")); // same in the real module
  // wire records reach the canonicalizer already lowercase (toLowerHex/hexDec), so the
  // evidence digest is stable; "0X" is a documented canonical-input expectation.
  assert.equal(canon(rawTx.blockHash), canonicalize(rawTx.blockHash));
});

test("capture provenance present in the frozen manifest", () => {
  assert.equal(MANIFEST.status, "OK");
  assert.equal(MANIFEST.chainId, CHAIN_ID_HEX);
  assert.ok(MANIFEST.captureTimeUtc);
  assert.ok(MANIFEST.pinnedBlockNumber);
  assert.ok(MANIFEST.pinnedBlockHash);
  for (const [file, sha] of Object.entries(MANIFEST.artifacts)) {
    assert.match(file, /^rpc-/);
    assert.match(sha, /^[0-9a-f]{64}$/);
  }
  // read-only provenance: only allowlist methods were ever issued
  assert.deepEqual([...new Set(MANIFEST.methods)].sort(), ["eth_blockNumber", "eth_chainId", "eth_getBlockByNumber", "eth_getTransactionByHash", "eth_getTransactionReceipt"]);
});