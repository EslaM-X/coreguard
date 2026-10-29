import test from "node:test";
import assert from "node:assert/strict";
import {
  STELLAR_KILLER_VERSION,
  KILLER_FEATURES,
  intentToEvidenceBinding,
  aiAgentPaymentGate,
  sorobanCommitmentAnchor,
  universalDappShield,
  oneLineIntegration,
  killerReference,
  killerCustomer,
  stellarEcosystemMap,
  status,
  selfCheck,
} from "../../packages/stellar-killer/index.mjs";

const RULES = [{ id: "VALUE_LIMIT" }, { id: "RECIPIENT_ALLOWLIST" }];

test("STELLAR-KILLER/1 exports", () => {
  assert.equal(STELLAR_KILLER_VERSION, "STELLAR-KILLER/1");
  assert.equal(KILLER_FEATURES.length, 5);
  assert.ok(KILLER_FEATURES.includes("AI_AGENT_PAYMENT_GATE"));
});

test("status honest", () => {
  const s = status();
  assert.equal(s.runMode, "DRY_RUN");
  assert.equal(s.integrationStatus, "NOT_BUILT");
  assert.equal(selfCheck().ok, true);
});

test("intentToEvidenceBinding binds valid intent", () => {
  const r = intentToEvidenceBinding({
    intent: { network: "testnet", hash: "abc123" },
    policy: { rules: RULES },
    evidence: { ok: true },
  });
  assert.equal(r.ok, true);
  assert.equal(r.status, "BOUND");
  assert.ok(r.bindingId);
  assert.ok(r.replayHash);
});

test("intentToEvidenceBinding holds on missing", () => {
  const r = intentToEvidenceBinding({ intent: {}, policy: {} });
  assert.equal(r.ok, false);
  assert.equal(r.status, "HELD");
});

test("aiAgentPaymentGate allows VERIFIED", () => {
  const g = aiAgentPaymentGate({
    agentId: "agent-1",
    payment: { destination: "G_GOOD", amount: "10", source: "S" },
    policy: { maxAmount: 100, allowedRecipients: ["G_GOOD"] },
    rules: RULES,
  });
  assert.equal(g.allowed, true);
  assert.equal(g.verdict, "VERIFIED");
  assert.equal(g.action, "SUBMIT");
});

test("aiAgentPaymentGate blocks rejected", () => {
  const g = aiAgentPaymentGate({
    agentId: "agent-1",
    payment: { destination: "BAD", amount: "10", source: "S" },
    policy: { allowedRecipients: ["GOOD"] },
    rules: RULES,
  });
  assert.equal(g.allowed, false);
  assert.equal(g.action, "BLOCK");
});

test("sorobanCommitmentAnchor plans only", () => {
  const a = sorobanCommitmentAnchor({ commitmentId: "0xabc" });
  assert.equal(a.ok, true);
  assert.equal(a.adapter, "SOROBAN-ANCHOR/1");
  assert.equal(a.txPlan.submit, false);
  assert.equal(a.txPlan.mode, "DRY_RUN");
});

test("universalDappShield allows valid", () => {
  const s = universalDappShield({
    action: "swap",
    intent: { hash: "h1" },
    policy: { rules: RULES },
    rules: RULES,
  });
  assert.equal(s.verdict, "ALLOW");
  assert.equal(s.shield, "UDS/1");
});

test("oneLineIntegration returns snippet", () => {
  const o = oneLineIntegration({ framework: "js" });
  assert.ok(o.import.includes("aiAgentPaymentGate"));
  assert.ok(o.usage.includes("gate.allowed"));
});

test("killerReference has differentiators", () => {
  const r = killerReference();
  assert.equal(r.schema, "COREGUARD-STELLAR-KILLER/1");
  assert.ok(r.differentiators.includes("FAIL-CLOSED: UNKNOWN -> HELD, never auto-pay"));
});

test("killerCustomer has segments", () => {
  const c = killerCustomer();
  assert.equal(c.schema, "COREGUARD-STELLAR-CUSTOMER/1");
  assert.ok(c.segments.length >= 6);
});

test("stellarEcosystemMap covers ecosystem", () => {
  const m = stellarEcosystemMap();
  assert.equal(m.schema, "COREGUARD-STELLAR-ECOSYSTEM/1");
  assert.ok(Array.isArray(m.categories.wallets));
  assert.ok(m.categories.wallets.includes("Freighter"));
});
