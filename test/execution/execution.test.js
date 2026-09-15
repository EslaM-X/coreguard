/**
 * WS-4 — Core-Native Execution Integration: package tests.
 *
 * Explicitly run with: node --test test/execution/
 * (NOT registered in scripts/run-tests.mjs — release-boundary decision, Q-WS4-12.)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  STATUS,
  extractExecutionEvidence,
  executionEvidenceRefOf,
  bindExecutionEvidence,
  verifyExecutionEvidence,
  buildExecutionAttestation,
  verifyExecutionAttestation,
  buildEvidenceReceipt,
  commitmentOf,
  EVIDENCE_KINDS,
  ATTESTATION_KIND,
} from "../../packages/execution/index.js";
import { decisionRecordRef } from "../../packages/firewall/decision-record.js";
import { computeIntentRef, computeManifestId, computeBindingRef } from "../../packages/intent/authorization.js";
import { hashEvidence } from "../../packages/canonical/index.js";
import {
  executionFixture,
  makeProvider,
  makeRawTx,
  makeRawReceipt,
  makeAddress,
  makeTxHash,
  defaultValuePredicate,
  flipRef,
} from "./helpers.js";

const find = (checks, name) => checks.find((c) => c.check === name);

test("W4: extraction normalizes RPC evidence into typed, canonical items", async () => {
  const f = await executionFixture();
  const res = await extractExecutionEvidence({ provider: f.provider, chainId: "1116", ref: { txHash: f.tx.hash } });

  assert.equal(res.ok, true);
  const kinds = res.items.map((i) => i.kind);
  for (const k of ["CHAIN_ID", "BLOCK", "TRANSACTION", "RECEIPT", "LOG", "EXECUTION_REF"]) {
    assert.ok(kinds.includes(k), `missing ${k}`);
  }
  const chain = res.items.find((i) => i.kind === "CHAIN_ID");
  const tx = res.items.find((i) => i.kind === "TRANSACTION");
  const receipt = res.items.find((i) => i.kind === "RECEIPT");
  assert.equal(chain.value, "1116");
  assert.equal(tx.value.txHash, f.tx.hash.toLowerCase());
  assert.equal(tx.value.value, "0");
  assert.equal(tx.value.blockNumber, "480");
  assert.equal(receipt.value.status, "1");
  assert.equal(receipt.value.logs[0].logIndex, "0");
  assert.equal(res.executionRef.txHash, f.tx.hash.toLowerCase());
  assert.equal(res.blockPin.blockHash, ("0x" + "ab".repeat(32)).toLowerCase());
  assert.equal(res.trace.available, false);
  assert.equal(res.trace.status, STATUS.TRACE_UNAVAILABLE);
  // spec §3.3: every item carries { kind, source, value, blockPin, txPin }.
  for (const i of res.items) {
    assert.ok(i.kind && i.source !== undefined && i.value !== undefined, `item shape ${i.kind}`);
    assert.ok("blockPin" in i && "txPin" in i, `pins on ${i.kind}`);
  }
  assert.deepEqual(tx.blockPin, { blockNumber: "480", blockHash: ("0x" + "ab".repeat(32)).toLowerCase() });
  assert.deepEqual(tx.txPin, { txHash: f.tx.hash.toLowerCase() });
});

test("W4: execution evidence ref is deterministic (recommutable, tamper-evidence)", async () => {
  const f = await executionFixture();
  const a = await extractExecutionEvidence({ provider: f.provider, chainId: "1116", ref: { txHash: f.tx.hash } });
  const b = await extractExecutionEvidence({ provider: f.provider, chainId: "1116", ref: { txHash: f.tx.hash } });
  assert.equal(a.executionEvidenceRef, b.executionEvidenceRef);
  const recomputed = await executionEvidenceRefOf({ chainId: a.chainId, executionRef: a.executionRef, items: a.items });
  assert.equal(recomputed, a.executionEvidenceRef);
  // cross-chain cannot share a ref via chainId subscriber: different CHAIN_ID item ⇒ different ref
  const onOtherChain = await extractExecutionEvidence({ provider: makeProvider({ tx: f.tx, receipt: f.receipt, chainId: "1" }), chainId: "1", ref: { txHash: f.tx.hash } });
  assert.notEqual(onOtherChain.executionEvidenceRef, a.executionEvidenceRef);

  const evilReceipt = { ...f.receipt, logs: [{ ...f.receipt.logs[0], data: "0x" + "11".repeat(32) }] };
  const evil = await extractExecutionEvidence({ provider: makeProvider({ tx: f.tx, receipt: evilReceipt }), chainId: "1116", ref: { txHash: f.tx.hash } });
  assert.notEqual(evil.executionEvidenceRef, a.executionEvidenceRef);
});

test("W4: verification reuses @coreguard/evidence createEvidenceBundle (Q-WS4-10/spec §4.1)", async () => {
  const f = await executionFixture();
  const res = await verifyExecutionEvidence({
    provider: f.provider,
    chainId: "1116",
    ref: { txHash: f.tx.hash },
    intent: f.intent,
    frozenDecision: f.record,
    valuePredicate: defaultValuePredicate,
  });
  assert.ok(res.evidenceBundle && res.evidenceBundle.evidence, "bundle must be emitted");
  assert.equal(res.evidenceBundle.evidence.version, "CGEP/1");
  assert.equal(res.evidenceBundle.evidence.intentHash, res.intentRef);
  assert.equal(res.evidenceBundle.hash, res.evidenceHash);
  assert.equal(res.evidenceHash.slice(0, 2), "0x");
  assert.equal(res.evidenceHash.length, 66);
  // Remediation A — the bundle's execution object closes over executionEvidenceRef.
  assert.equal(res.evidenceBundle.evidence.execution.executionEvidenceRef, res.executionEvidenceRef);
  assert.equal(res.evidenceBundle.evidence.execution.blockNumber, "480");
  assert.equal(res.evidenceBundle.evidence.execution.blockHash, ("0x" + "ab".repeat(32)).toLowerCase());
});

test("W4: no `latest` fallback — reads pinned via block number+hash (IN-W4-3)", async () => {
  const f = await executionFixture();
  const res = await extractExecutionEvidence({ provider: f.provider, chainId: "1116", ref: { txHash: f.tx.hash, blockNumber: f.tx.blockNumber, blockHash: f.tx.blockHash } });
  assert.ok(res.ok);
  assert.ok(f.provider.calls.block >= 1);

  const bareTx = { hash: makeTxHash(7), from: f.k.address, to: f.intent.target, input: f.tx.input, value: "0x0", nonce: "0x1" };
  const bareProvider = makeProvider({ tx: bareTx, receipt: f.receipt });
  bareProvider.getTransactionByHash = async () => ({ ...bareTx });
  const unpinned = await extractExecutionEvidence({ provider: bareProvider, chainId: "1116", ref: { txHash: bareTx.hash } });
  assert.equal(unpinned.ok, false);
  assert.ok(unpinned.errors.some((e) => e.includes("BLOCK_PIN_UNSET")), "block pin must be required, never latest");
});

test("W4: no trace-capable provider ⇒ TRACE_UNAVAILABLE — never fabricated (T-W4-7/IN-W4-7)", async () => {
  const f = await executionFixture();
  const res = await verifyExecutionEvidence({
    provider: f.provider,
    chainId: "1116",
    ref: { txHash: f.tx.hash },
    intent: f.intent,
    frozenDecision: f.record,
    valuePredicate: defaultValuePredicate,
    conformance: "TRACE_LEVEL",
  });
  assert.equal(res.status, STATUS.TRACE_UNAVAILABLE);
  assert.equal(res.conformancePath, "RECEIPT_LEVEL");
  assert.ok(res.checks.some((c) => c.label === "TRACE_UNAVAILABLE"));
});

test("W4: trace-level conformance binds via @coreguard/trace normalizeExecution (Q-WS4-4)", async () => {
  const f = await executionFixture();
  f.provider = makeProvider({
    tx: f.tx,
    receipt: f.receipt,
    supportsTrace: true,
    traceFrames: [{ from: f.tx.from, to: f.tx.to, value: "0x0", input: f.tx.input, gasUsed: "0x5208", output: "0x", error: null, calls: [] }],
  });
  const res = await verifyExecutionEvidence({
    provider: f.provider,
    chainId: "1116",
    ref: { txHash: f.tx.hash },
    intent: f.intent,
    frozenDecision: f.record,
    valuePredicate: defaultValuePredicate,
    conformance: "TRACE_LEVEL",
  });
  assert.equal(res.status, STATUS.VERIFIED);
  assert.equal(res.conformancePath, "TRACE_LEVEL");
  assert.equal(res.trace.available, true);
  assert.equal(res.trace.traceHash.slice(0, 2), "0x");
});

test("W4: B-EXEC-1 chain pin — evidence chainId must equal intent.chainId == scope.chainId", async () => {
  const f = await executionFixture();
  const badProvider = makeProvider({ tx: f.tx, receipt: f.receipt, chainId: "1" });
  const res = await verifyExecutionEvidence({
    provider: badProvider,
    chainId: "1",
    ref: { txHash: f.tx.hash },
    intent: f.intent,
    frozenDecision: f.record,
    valuePredicate: defaultValuePredicate,
  });
  assert.equal(res.status, STATUS.NOT_PROVEN);
  assert.equal(find(res.checks, "B-EXEC-1").label, "CHAIN_MISMATCH");
});

test("W4: B-EXEC-2 target/selector pins — mismatch ⇒ NOT_PROVEN", async () => {
  const f = await executionFixture();

  const wrongTarget = { ...f.tx, to: makeAddress(0x99) };
  const t = await verifyExecutionEvidence({
    provider: makeProvider({ tx: wrongTarget, receipt: f.receipt }),
    chainId: "1116",
    ref: { txHash: wrongTarget.hash },
    intent: f.intent,
    frozenDecision: f.record,
    valuePredicate: defaultValuePredicate,
  });
  assert.equal(t.status, STATUS.NOT_PROVEN);
  assert.equal(find(t.checks, "B-EXEC-2").label, "TARGET_MISMATCH");

  const wrongSel = { ...f.tx, input: "0x095ea7b3" + f.intent.recipient.slice(2) + f.tx.value.slice(2).padStart(64, "0") };
  const s = await verifyExecutionEvidence({
    provider: makeProvider({ tx: wrongSel, receipt: f.receipt }),
    chainId: "1116",
    ref: { txHash: wrongSel.hash },
    intent: f.intent,
    frozenDecision: f.record,
    valuePredicate: defaultValuePredicate,
  });
  assert.equal(s.status, STATUS.NOT_PROVEN);
  assert.equal(find(s.checks, "B-EXEC-2").label, "SELECTOR_MISMATCH");
});

test("W4: B-EXEC-2 selector-undeclared ⇒ NOT_RUN (capability gap, never failure-naming)", async () => {
  const f = await executionFixture();
  const noSelIntent = { ...f.intent, selector: null };
  const res = await verifyExecutionEvidence({
    provider: f.provider,
    chainId: "1116",
    ref: { txHash: f.tx.hash },
    intent: noSelIntent,
    frozenDecision: f.record,
    valuePredicate: defaultValuePredicate,
  });
  assert.equal(res.status, STATUS.NOT_RUN);
  assert.equal(find(res.checks, "B-EXEC-2").label, "SELECTOR_UNDECLARED");
});

test("W4: B-EXEC-3 value pin — never invented: no predicate ⇒ NOT_RUN; rejected ⇒ NOT_PROVEN", async () => {
  const f = await executionFixture();

  const noMapping = await verifyExecutionEvidence({
    provider: f.provider,
    chainId: "1116",
    ref: { txHash: f.tx.hash },
    intent: f.intent,
    frozenDecision: f.record,
  });
  assert.equal(noMapping.status, STATUS.NOT_RUN);
  assert.equal(find(noMapping.checks, "B-EXEC-3").label, "VALUE_MAPPING_UNDEFINED");

  const rejected = await verifyExecutionEvidence({
    provider: f.provider,
    chainId: "1116",
    ref: { txHash: f.tx.hash },
    intent: f.intent,
    frozenDecision: f.record,
    valuePredicate: () => false,
  });
  assert.equal(rejected.status, STATUS.NOT_PROVEN);
  assert.equal(find(rejected.checks, "B-EXEC-3").label, "VALUE_MISMATCH");
});

test("W4: B-EXEC-4 EOA caller matches signerBinding ⇒ pass; never inferred (Q-WS4-3)", async () => {
  const f = await executionFixture();
  const res = await verifyExecutionEvidence({
    provider: f.provider,
    chainId: "1116",
    ref: { txHash: f.tx.hash },
    intent: f.intent,
    frozenDecision: f.record,
    valuePredicate: defaultValuePredicate,
  });
  assert.equal(res.status, STATUS.VERIFIED);
  assert.equal(find(res.checks, "B-EXEC-4").label, "RECOVERED_CALLER");
});

test("W4: B-EXEC-4 relayer/meta-tx shape ⇒ NOT_PROVEN / CALLER_NOT_BOUND — claims discarded (T-W4-2)", async () => {
  const f = await executionFixture({ signerKind: "CONTRACT" });
  const res = await verifyExecutionEvidence({
    provider: f.provider,
    chainId: "1116",
    ref: { txHash: f.tx.hash },
    intent: f.intent,
    frozenDecision: f.record,
    valuePredicate: defaultValuePredicate,
    callerClaims: { from: f.k.address, recoveredCaller: f.k.address },
  });
  assert.equal(res.status, STATUS.NOT_PROVEN);
  assert.equal(find(res.checks, "B-EXEC-4").label, "CALLER_NOT_BOUND");
  assert.equal(res.callerClaimsDiscarded, true);
});

test("W4: B-EXEC-5 decisionRef recompute (T-W4-9) — tampered record ⇒ INVALID", async () => {
  const f = await executionFixture();
  const ok = await verifyExecutionEvidence({
    provider: f.provider,
    chainId: "1116",
    ref: { txHash: f.tx.hash },
    intent: f.intent,
    frozenDecision: f.record,
    valuePredicate: defaultValuePredicate,
  });
  assert.equal(find(ok.checks, "B-EXEC-5").label, "DECISION_REF_PIN");

  const tampered = { ...f.record, decisionRef: flipRef(f.record.decisionRef) };
  const bad = await verifyExecutionEvidence({
    provider: f.provider,
    chainId: "1116",
    ref: { txHash: f.tx.hash },
    intent: f.intent,
    frozenDecision: tampered,
    decisionRef: tampered.decisionRef,
    valuePredicate: defaultValuePredicate,
  });
  assert.equal(bad.status, STATUS.INVALID);
  assert.equal(find(bad.checks, "B-EXEC-5").label, "DECISION_REF_MISMATCH");
});

test("W4: missing decision record ⇒ NOT_RUN (never VERIFIED on missing inputs, IN-W4-7)", async () => {
  const f = await executionFixture();
  const res = await verifyExecutionEvidence({
    provider: f.provider,
    chainId: "1116",
    ref: { txHash: f.tx.hash },
    intent: f.intent,
    frozenDecision: null,
    valuePredicate: defaultValuePredicate,
  });
  assert.equal(res.status, STATUS.NOT_RUN);
  assert.equal(find(res.checks, "B-EXEC-5").label, "DECISION_RECORD_MISSING");
});

test("W4: required evidence missing ⇒ UNVERIFIED (never VERIFIED) — fail-closed aggregation", async () => {
  const f = await executionFixture();
  const bare = makeProvider({ tx: f.tx, receipt: f.receipt });
  delete bare.getTransactionReceipt;
  const res = await verifyExecutionEvidence({
    provider: bare,
    chainId: "1116",
    ref: { txHash: f.tx.hash },
    intent: f.intent,
    frozenDecision: f.record,
    valuePredicate: defaultValuePredicate,
  });
  assert.equal(res.status, STATUS.UNVERIFIED);
  assert.equal(res.label, "REQUIRED_EVIDENCE_MISSING");
  assert.ok(res.checks.some((c) => c.check === "EXTRACTION:RECEIPT"));
});

test("W4: NOT_PROVEN dominates NOT_RUN in aggregation (fail-closed order)", async () => {
  const f = await executionFixture();
  const res = await verifyExecutionEvidence({
    provider: f.provider,
    chainId: "1116",
    ref: { txHash: f.tx.hash },
    intent: f.intent,
    frozenDecision: f.record,
    // no valuePredicate ⇒ NOT_RUN; target spins trailing evidence too
  });
  const targetWrong = { ...f.tx, to: makeAddress(0x99) };
  const mixed = await verifyExecutionEvidence({
    provider: makeProvider({ tx: targetWrong, receipt: f.receipt }),
    chainId: "1116",
    ref: { txHash: targetWrong.hash },
    intent: f.intent,
    frozenDecision: f.record,
    valuePredicate: defaultValuePredicate,
  });
  assert.equal(mixed.status, STATUS.NOT_PROVEN);
  assert.equal(mixed.label, "TARGET_MISMATCH");
  assert.ok(find(mixed.checks, "B-EXEC-3").result === "PASS");
});

test("W4: cross-chain evidence cannot bind across chains — immutable seam holds", async () => {
  const f = await executionFixture();
  const chainA = await extractExecutionEvidence({ provider: f.provider, chainId: "1116", ref: { txHash: f.tx.hash } });
  const chainB = await verifyExecutionEvidence({
    provider: makeProvider({ tx: f.tx, receipt: f.receipt, chainId: "1" }),
    chainId: "1",
    ref: { txHash: f.tx.hash },
    intent: f.intent,
    frozenDecision: f.record,
    valuePredicate: defaultValuePredicate,
  });
  assert.equal(chainB.status, STATUS.NOT_PROVEN);
  assert.equal(find(chainB.checks, "B-EXEC-1").label, "CHAIN_MISMATCH");
  assert.ok(chainA.executionEvidenceRef.length === 66);
});

test("W4: full receipt-level happy path ⇒ VERIFIED (POST→PRE seam intact)", async () => {
  const f = await executionFixture();
  const ref = await decodeRef(f);
  const res = await verifyExecutionEvidence({
    provider: f.provider,
    chainId: "1116",
    ref: { txHash: f.tx.hash },
    intent: f.intent,
    frozenDecision: f.record,
    valuePredicate: defaultValuePredicate,
  });
  assert.equal(res.status, STATUS.VERIFIED);
  assert.equal(res.label, "EXECUTION_EVIDENCE_BOUND");
  assert.equal(res.conformancePath, "RECEIPT_LEVEL");
  assert.equal(res.intentRef, ref.intentRef);
  assert.equal(res.executionEvidenceRef, ref.evidenceRef);

  // PRE record untouched, ref still recomputes (immutable seam, Q-FW10).
  assert.equal(Object.isFrozen(f.record), true);
  assert.equal(await decisionRecordRef(f.record), f.record.decisionRef);
});

test("W4: Execution Attestation — commitment, recompute integrity, tamper-evidence", async () => {
  const f = await executionFixture();
  const intentRef = await computeIntentRef(f.intent);
  const manifestId = await computeManifestId(f.declaration);
  const bindingRef = await computeBindingRef({ intentRef, manifestId, signature: f.declaration.signature });

  const verification = await verifyExecutionEvidence({
    provider: f.provider,
    chainId: "1116",
    ref: { txHash: f.tx.hash },
    intent: f.intent,
    frozenDecision: f.record,
    valuePredicate: defaultValuePredicate,
  });

  // Remediation A+2: WS-4 runs no simulation ⇒ no legacy receipt is emitted;
  // the absence of simulation is represented in the consumed verification
  // profile, never as a side annotation a legacy consumer would ignore.
  const simCheck = find(verification.checks, "SIMULATION");
  assert.ok(simCheck, "verification.checks must carry the SIMULATION state");
  assert.equal(simCheck.result, "NOT_RUN");
  assert.equal(simCheck.label, "SIMULATION_NOT_PERFORMED");

  const att = await buildExecutionAttestation({
    chainId: "1116",
    intentRef,
    manifestId,
    bindingRef,
    decisionRef: f.record.decisionRef,
    executionEvidenceRef: verification.executionEvidenceRef,
    evidenceHash: verification.evidenceHash,
    receiptId: null,
    verification,
    conformancePath: verification.conformancePath,
    at: "20260914T120000",
  });
  assert.equal(att.record.kind, ATTESTATION_KIND);
  assert.equal(att.record.attestationRef, att.commitment);
  assert.equal(commitmentOf(att.record), att.commitment);
  assert.equal(Object.isFrozen(att.record), true);
  assert.equal(att.record.evidenceHash, verification.evidenceHash);
  assert.equal(att.record.receiptId, null);

  const intact = await verifyExecutionAttestation(att.record);
  assert.equal(intact.status, STATUS.VERIFIED);
  assert.equal(intact.label, "ATTESTATION_INTACT");

  // The SIMULATION NOT_RUN state is committed inside verification.checks and is
  // genuinely consumed by verifyExecutionAttestation — removing it is tamper.
  const attSim = att.record.verification.checks.find((c) => c.check === "SIMULATION");
  assert.ok(attSim && attSim.result === "NOT_RUN", "attestation commits SIMULATION NOT_RUN in verification.checks");
  const strippedSim = await verifyExecutionAttestation({
    ...att.record,
    verification: { ...att.record.verification, checks: att.record.verification.checks.filter((c) => c.check !== "SIMULATION") },
  });
  assert.equal(strippedSim.status, STATUS.INVALID, "stripping SIMULATION NOT_RUN is tamper-evident — the semantic is committed, not annotated");
  assert.equal(strippedSim.label, "ATTESTATION_TAMPERED");

  const tampered = await verifyExecutionAttestation({ ...att.record, intentRef: flipRef(att.record.intentRef) });
  assert.equal(tampered.status, STATUS.INVALID);
  assert.equal(tampered.label, "ATTESTATION_TAMPERED");
});

test("W4: evidence receipt delegates to @coreguard/evidence createReceipt — only with a GENUINE simulation pin (spec §4.1/remediation A+2)", async () => {
  const f = await executionFixture();
  const verification = await verifyExecutionEvidence({
    provider: f.provider,
    chainId: "1116",
    ref: { txHash: f.tx.hash },
    intent: f.intent,
    frozenDecision: f.record,
    valuePredicate: defaultValuePredicate,
  });
  // A genuine pre-execution simulation pin (fixture): the simulator's own
  // block, distinct from the execution block. WS-4 today does not run
  // simulations (production credentials carry receiptId: null); this models a
  // future simulation-capable workstream exercising the createReceipt path.
  const simPin = { blockNumber: "0x177", blockHash: ("0x" + "cd".repeat(32)).toLowerCase() };
  const receipt = await buildEvidenceReceipt({
    chainId: "1116",
    txHash: f.tx.hash,
    blockHash: f.tx.blockHash,
    blockNumber: f.tx.blockNumber,
    intentRef: verification.intentRef,
    executionEvidenceRef: verification.executionEvidenceRef,
    traceHash: verification.trace.traceHash ?? null,
    result: verification.status,
    checks: verification.checks,
    conformancePath: verification.conformancePath,
    simulation: simPin,
  });
  assert.ok(receipt.receiptId.startsWith("0x") && receipt.receiptId.length === 66, "CGEP/1:RECEIPT content-address");
  assert.equal(receipt.receipt.version, "CGEP/1");
  assert.equal(receipt.receipt.evidenceRoot, verification.executionEvidenceRef);
  assert.equal(receipt.receipt.chainId, "1116");
  assert.equal(receipt.receipt.txHash, f.tx.hash.toLowerCase());
  // The simulation pin is the genuine one and stays distinct from the
  // execution pin (state pinning per execution-receipt.md §5).
  assert.equal(receipt.receipt.simulation.blockNumber, "0x177");
  assert.equal(receipt.receipt.simulation.blockHash, ("0x" + "cd".repeat(32)).toLowerCase());
  assert.equal(receipt.receipt.execution.blockNumber, f.tx.blockNumber);
  assert.notEqual(receipt.receipt.simulation.blockNumber, receipt.receipt.execution.blockNumber);
});

test("W4: evidenceHash closes over executionEvidenceRef — same ref ⇒ same hash; ref change ⇒ hash change (remediation A)", async () => {
  const f = await executionFixture();
  const a = await verifyExecutionEvidence({
    provider: f.provider,
    chainId: "1116",
    ref: { txHash: f.tx.hash },
    intent: f.intent,
    frozenDecision: f.record,
    valuePredicate: defaultValuePredicate,
  });
  const b = await verifyExecutionEvidence({
    provider: f.provider,
    chainId: "1116",
    ref: { txHash: f.tx.hash },
    intent: f.intent,
    frozenDecision: f.record,
    valuePredicate: defaultValuePredicate,
  });

  // Same executionEvidenceRef ⇒ same evidenceHash (determinism, IN-W4-9).
  assert.equal(a.executionEvidenceRef, b.executionEvidenceRef);
  assert.equal(a.evidenceHash, b.evidenceHash);

  // Independent recompute from the bundle matches the stored value (recompute closure).
  assert.equal(await hashEvidence(a.evidenceBundle.evidence), a.evidenceHash);
  assert.equal(a.evidenceBundle.evidence.execution.executionEvidenceRef, a.executionEvidenceRef);

  // Changed items ⇒ changed executionEvidenceRef ⇒ changed evidenceHash (no unbound commitment).
  const evilReceipt = { ...f.receipt, logs: [{ ...f.receipt.logs[0], data: "0x" + "11".repeat(32) }] };
  const evil = await verifyExecutionEvidence({
    provider: makeProvider({ tx: f.tx, receipt: evilReceipt }),
    chainId: "1116",
    ref: { txHash: f.tx.hash },
    intent: f.intent,
    frozenDecision: f.record,
    valuePredicate: defaultValuePredicate,
  });
  assert.equal(evil.status, STATUS.VERIFIED);
  assert.notEqual(evil.executionEvidenceRef, a.executionEvidenceRef);
  assert.notEqual(evil.evidenceHash, a.evidenceHash);

  // A stale pair where the bundle ref diverges from the attestation ref is now
  // detectable: re-derive evidenceHash over the bundle and compare to the stored hash.
  const diverge = { ...a.evidenceBundle.evidence, execution: { ...a.evidenceBundle.evidence.execution, executionEvidenceRef: flipRef(a.executionEvidenceRef) } };
  assert.notEqual(await hashEvidence(diverge), a.evidenceHash);
});

test("W4: no legacy receipt without genuine simulation — SIMULATION NOT_RUN lives in the consumed verification profile (remediation A+2)", async () => {
  const f = await executionFixture();
  const verification = await verifyExecutionEvidence({
    provider: f.provider,
    chainId: "1116",
    ref: { txHash: f.tx.hash },
    intent: f.intent,
    frozenDecision: f.record,
    valuePredicate: defaultValuePredicate,
  });

  // WS-4 executes no simulation: the state is carried in the verification
  // profile and the evidence bundle — the layers that are actually committed
  // and recomputed — not as a side annotation a legacy consumer never reads.
  const simCheck = find(verification.checks, "SIMULATION");
  assert.ok(simCheck, "SIMULATION check must be present in verification.checks");
  assert.equal(simCheck.result, "NOT_RUN");
  assert.equal(simCheck.label, "SIMULATION_NOT_PERFORMED");
  assert.equal(verification.simulation.status, "NOT_RUN");
  assert.equal(verification.simulation.label, "SIMULATION_NOT_PERFORMED");
  assert.equal(verification.simulation.reason, simCheck.reason);

  // The evidence bundle documents it too — evidenceHash closes over verifications.
  const bundleSim = find(verification.evidenceBundle.evidence.verifications, "SIMULATION");
  assert.ok(bundleSim && bundleSim.result === "NOT_RUN", "bundle.verifications carries SIMULATION NOT_RUN");
  assert.equal(await hashEvidence(verification.evidenceBundle.evidence), verification.evidenceHash);

  // No legacy receipt is emitted without real simulation: the legacy receipt
  // builder fails closed rather than fabricate a pin that a presence-only
  // consumer (legacy verifyStatePinning()) would mis-read as simulation truth.
  await assert.rejects(
    buildEvidenceReceipt({
      chainId: "1116",
      txHash: f.tx.hash,
      blockHash: f.tx.blockHash,
      blockNumber: f.tx.blockNumber,
      intentRef: verification.intentRef,
      executionEvidenceRef: verification.executionEvidenceRef,
      traceHash: verification.trace.traceHash ?? null,
      result: verification.status,
      checks: verification.checks,
      conformancePath: verification.conformancePath,
    }),
    /GENUINE simulation/
  );

  // The attestation commits the state in verification.checks — the consumer it
  // is meant for: verifyExecutionAttestation.
  const manifestId = await computeManifestId(f.declaration);
  const att = await buildExecutionAttestation({
    chainId: "1116",
    intentRef: verification.intentRef,
    manifestId,
    bindingRef: await computeBindingRef({ intentRef: verification.intentRef, manifestId, signature: f.declaration.signature }),
    decisionRef: f.record.decisionRef,
    executionEvidenceRef: verification.executionEvidenceRef,
    evidenceHash: verification.evidenceHash,
    receiptId: null,
    verification,
    conformancePath: verification.conformancePath,
  });
  const attSim = att.record.verification.checks.find((c) => c.check === "SIMULATION");
  assert.ok(attSim && attSim.result === "NOT_RUN", "attestation verification.checks commits SIMULATION NOT_RUN");
  const attached = await verifyExecutionAttestation(att.record);
  assert.equal(attached.status, STATUS.VERIFIED);
});

async function decodeRef(f) {
  return {
    intentRef: await computeIntentRef(f.intent),
    evidenceRef: (await extractExecutionEvidence({ provider: f.provider, chainId: "1116", ref: { txHash: f.tx.hash } })).executionEvidenceRef,
  };
}