/**
 * CoreGuard SDK — guard.* surface tests (Phase 1, plan-90d-repo §2.2).
 *
 * Covers:
 *  - authorize ALLOW for a legitimately signed intent (firewall decision path)
 *  - authorize FAIL-CLOSED for the six Phase-1 attacks:
 *      target substitution · recipient substitution · amount inflation ·
 *      unexpected callback · expired intent · calldata mutation
 *  - Q-FW10 seam: execution evidence rejected in the PRE surface
 *  - verify VERIFIED on the transfer fixture + INVALID on a mutated trace
 *  - anchor commitment/proofId identical to scripts/compute-commitment.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { makeIntent, makeDeclaration, signDeclaration, seedKey, makePolicy, makeSimulation, makeAddress } from "../firewall/helpers.js";
import * as EVM from "../../packages/evm/index.js";
import { createGuard } from "../../packages/sdk/index.js";
import { computeReceiptId, domainHash } from "../../packages/canonical/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const fixture = (f) => readFile(join(repoRoot, f), "utf8").then(JSON.parse);

const guard = createGuard();
const k = seedKey(1);

async function signedIntent(overrides = {}) {
  const intent = makeIntent(overrides);
  const declaration = await makeDeclaration({ intent });
  return { intent, declaration: await signDeclaration(declaration, k.priv, intent.chainId) };
}

test("guard.authorize: ALLOW for a consistent signed intent", async () => {
  const { intent, declaration } = await signedIntent();
  const simulation = makeSimulation({}, intent);
  const result = await guard.authorize(intent, {
    declaration,
    policy: makePolicy([], "pol-vault-a"),
    activePolicyIds: ["pol-vault-a"],
    authorityAtState: "1024",
    simulation,
    writer: "tests",
    evm: EVM,
  });
  assert.equal(result.status, "OK");
  assert.equal(result.decision, "ALLOW");
  assert.ok(result.decisionRef, "decisionRef present");
});

test("guard.authorize: DENY when required context is missing (NOT_RUN)", async () => {
  const { intent } = await signedIntent();
  const result = await guard.authorize(intent);
  assert.equal(result.status, "NOT_RUN");
  assert.equal(result.decision, null);
  assert.ok(result.errors.some((e) => e.includes("declaration")));
});

test("guard.authorize: target substitution is BLOCKED", async () => {
  const { intent, declaration } = await signedIntent();
  const attacker = makeAddress(0x0d1);
  const result = await guard.authorize(intent, {
    declaration,
    policy: makePolicy([], "pol-vault-a"),
    activePolicyIds: ["pol-vault-a"],
    authorityAtState: "1024",
    simulation: makeSimulation({ target: attacker }, intent),
    writer: "tests",
    evm: EVM,
  });
  assert.equal(result.decision, "DENY");
});

test("guard.authorize: recipient substitution is BLOCKED", async () => {
  const { intent, declaration } = await signedIntent();
  const attacker = makeAddress(0x0d2);
  const result = await guard.authorize(intent, {
    declaration,
    policy: makePolicy([], "pol-vault-a"),
    activePolicyIds: ["pol-vault-a"],
    authorityAtState: "1024",
    simulation: makeSimulation({ recipient: attacker }, intent),
    writer: "tests",
    evm: EVM,
  });
  assert.equal(result.decision, "DENY");
});

test("guard.authorize: amount inflation is BLOCKED", async () => {
  const { intent, declaration } = await signedIntent();
  const inflated = String(BigInt(intent.amount) * 2n);
  const result = await guard.authorize(intent, {
    declaration,
    policy: makePolicy([], "pol-vault-a"),
    activePolicyIds: ["pol-vault-a"],
    authorityAtState: "1024",
    simulation: makeSimulation({ amount: inflated }, intent),
    writer: "tests",
    evm: EVM,
  });
  assert.equal(result.decision, "DENY");
});

test("guard.authorize: unexpected callback (unmodeled execution) never ALLOWs", async () => {
  const { intent, declaration } = await signedIntent();
  const result = await guard.authorize(intent, {
    declaration,
    policy: makePolicy([], "pol-vault-a"),
    activePolicyIds: ["pol-vault-a"],
    authorityAtState: "1024",
    simulation: { ...makeSimulation({}, intent), callback: makeAddress(0x0d3) },
    writer: "tests",
    evm: EVM,
  });
  // Unmodelable PRE input must fail closed: DENY + NOT_PROVEN, never ALLOW.
  assert.equal(result.decision, "DENY");
  assert.equal(result.status, "NOT_PROVEN");
});

test("guard.authorize: expired intent is BLOCKED", async () => {
  const { intent, declaration } = await signedIntent({ validUntil: "100000" });
  const result = await guard.authorize(intent, {
    declaration,
    policy: makePolicy([], "pol-vault-a"),
    activePolicyIds: ["pol-vault-a"],
    authorityAtState: "1024",
    simulation: makeSimulation({ blockTimestamp: "200000" }, intent),
    writer: "tests",
    evm: EVM,
  });
  assert.equal(result.decision, "DENY");
});

test("guard.authorize: calldata mutation is BLOCKED", async () => {
  const { intent, declaration } = await signedIntent();
  const result = await guard.authorize(intent, {
    declaration,
    policy: makePolicy([], "pol-vault-a"),
    activePolicyIds: ["pol-vault-a"],
    authorityAtState: "1024",
    simulation: makeSimulation({ selector: "0xdeadbeef" }, intent),
    writer: "tests",
    evm: EVM,
  });
  assert.equal(result.decision, "DENY");
});

test("guard.authorize: execution evidence is rejected in the PRE surface (Q-FW10 seam)", async () => {
  const { intent } = await signedIntent();
  await assert.rejects(
    () =>
      guard.authorize(intent, {
        declaration: { intent },
        policy: makePolicy(),
        activePolicyIds: ["pol-default"],
        authorityAtState: "1024",
        executionBlock: "1",
      }),
    /Q-FW10 seam/
  );
});

test("guard.verify: VERIFIED for the transfer fixture receipt", async () => {
  const intent = await fixture("examples/transfer/intent.json");
  const policy = await fixture("examples/transfer/policy.json");
  const trace = await fixture("examples/transfer/trace.json");
  const receiptDoc = await fixture("examples/transfer/receipt-valid.json");
  const receipt = { receiptId: receiptDoc.receiptId, ...receiptDoc.receipt };

  const result = await guard.verify({ receipt, intent, policy, trace });
  assert.equal(result.verdict, "VERIFIED");
  assert.equal(result.receiptId, receiptDoc.receiptId);
});

test("guard.verify: INVALID when the execution trace is mutated", async () => {
  const intent = await fixture("examples/transfer/intent.json");
  const policy = await fixture("examples/transfer/policy.json");
  const trace = await fixture("examples/transfer/trace.json");
  const receiptDoc = await fixture("examples/transfer/receipt-valid.json");
  const receipt = { receiptId: receiptDoc.receiptId, ...receiptDoc.receipt };

  const attacker = "0x0000000000000000000000000000000000000099";
  const mutated = {
    ...trace,
    txHash: "0x" + "dd".repeat(32),
    calldata: "0xa9059cbb" + attacker.slice(2).padStart(64, "0") + "0000000000000000000000000000000000000000000000000000000005f5e100",
  };

  const result = await guard.verify({ receipt, intent, policy, trace: mutated });
  assert.equal(result.verdict, "INVALID");
});

test("guard.verify: derives + verifies a receipt from an intent/policy/trace", async () => {
  const intent = await fixture("examples/transfer/intent.json");
  const policy = await fixture("examples/transfer/policy.json");
  const trace = await fixture("examples/transfer/trace.json");

  const result = await guard.verify({ chain: "1114", intent, policy, trace });
  assert.equal(result.verdict, "VERIFIED");
  assert.ok(result.receiptId, "derived receiptId present");
  assert.equal(result.verificationLevel, "L2");
});

test("guard.anchor: commitment/proofId match scripts/compute-commitment.mjs", async () => {
  const receiptDoc = await fixture("examples/transfer/receipt-valid.json");
  const receipt = { receiptId: receiptDoc.receiptId, ...receiptDoc.receipt };

  const planned = await guard.anchor(receipt);

  const { receiptId, ...payload } = receipt;
  const computed = await computeReceiptId(payload);
  const commitment = await domainHash("CGEP/1:PROOF", {
    protocol: "CGEP/1",
    chainId: receipt.chainId,
    receiptId: computed,
    evidenceRoot: receipt.evidenceRoot,
  });
  const proofId = await domainHash("CGEP/1:ANCHOR", {
    chainId: receipt.chainId,
    receiptId: computed,
    commitment,
  });

  assert.equal(planned.receiptId, computed);
  assert.equal(planned.commitment, commitment);
  assert.equal(planned.proofId, proofId);
  assert.equal(planned.status, "PLAN");
});

test("guard.anchor: refuses a tampered receipt", async () => {
  const receiptDoc = await fixture("examples/transfer/receipt-valid.json");
  const receipt = { receiptId: receiptDoc.receiptId, ...receiptDoc.receipt };
  const tampered = { ...receipt, result: "INVALID" };
  await assert.rejects(() => guard.anchor(tampered), /does not recompute/);
});