import test from "node:test";
import assert from "node:assert/strict";

import {
  STELLAR_AGENT_VERSION,
  AGENT_STATES,
  verifyAgentPayment,
  submitAgentPayment,
  status,
  selfCheck,
} from "../../packages/stellar-agent/index.mjs";

const RULES = [{ id: "VALUE_LIMIT" }, { id: "RECIPIENT_ALLOWLIST" }];

test("STELLAR-AGENT/1 exports version + states", () => {
  assert.equal(STELLAR_AGENT_VERSION, "STELLAR-AGENT/1");
  assert.ok(Array.isArray(AGENT_STATES));
  assert.ok(AGENT_STATES.includes("VERIFIED"));
  assert.ok(AGENT_STATES.includes("HELD"));
});

test("status() is honest DRY_RUN / NOT_BUILT", () => {
  const s = status();
  assert.equal(s.runMode, "DRY_RUN");
  assert.equal(s.integrationStatus, "NOT_BUILT");
  assert.equal(s.hasCredentials, false);
  assert.equal(s.authorized, false);
  assert.equal(s.executed, false);
});

test("selfCheck() passes", () => {
  assert.equal(selfCheck().ok, true);
});

test("verifyAgentPayment gates on missing agentId", () => {
  const r = verifyAgentPayment({ payment: { destination: "G", amount: "10" }, policy: {}, rules: RULES });
  assert.equal(r.verdict, "HELD");
  assert.ok(r.reason.includes("agentId"));
});

test("verifyAgentPayment gates on missing payment", () => {
  const r = verifyAgentPayment({ agentId: "agent-1", policy: {}, rules: RULES });
  assert.equal(r.verdict, "HELD");
});

test("verifyAgentPayment gates on missing destination/amount", () => {
  const r = verifyAgentPayment({ agentId: "agent-1", payment: { destination: "G" }, policy: {}, rules: RULES });
  assert.equal(r.verdict, "HELD");
});

test("verifyAgentPayment gates on missing policy", () => {
  const r = verifyAgentPayment({ agentId: "agent-1", payment: { destination: "G", amount: "10" }, rules: RULES });
  assert.equal(r.verdict, "HELD");
});

test("verifyAgentPayment gates on missing rules", () => {
  const r = verifyAgentPayment({ agentId: "agent-1", payment: { destination: "G", amount: "10" }, policy: {} });
  assert.equal(r.verdict, "HELD");
});

test("verifyAgentPayment rejects over-limit payment", () => {
  const r = verifyAgentPayment({
    agentId: "agent-1",
    payment: { destination: "G", amount: "1000", source: "S" },
    policy: { maxAmount: 100 },
    rules: RULES,
  });
  assert.equal(r.verdict, "REJECTED");
  assert.ok(r.reason.includes("exceeds max"));
});

test("verifyAgentPayment rejects disallowed recipient", () => {
  const r = verifyAgentPayment({
    agentId: "agent-1",
    payment: { destination: "G_BAD", amount: "10", source: "S" },
    policy: { allowedRecipients: ["G_GOOD"] },
    rules: RULES,
  });
  assert.equal(r.verdict, "REJECTED");
  assert.ok(r.reason.includes("not in allowlist"));
});

test("verifyAgentPayment rejects expired deadline", () => {
  const r = verifyAgentPayment({
    agentId: "agent-1",
    payment: { destination: "G", amount: "10", source: "S" },
    policy: { deadline: "2020-01-01T00:00:00Z" },
    rules: RULES,
  });
  assert.equal(r.verdict, "REJECTED");
  assert.ok(r.reason.includes("deadline"));
});

test("verifyAgentPayment VERIFIED on valid payment", () => {
  const r = verifyAgentPayment({
    agentId: "agent-1",
    payment: { destination: "G_GOOD", amount: "10", source: "S", asset: "XLM" },
    policy: { maxAmount: 100, allowedRecipients: ["G_GOOD"], allowedAssets: ["XLM"] },
    rules: RULES,
  });
  assert.equal(r.verdict, "VERIFIED");
  assert.ok(r.commitment);
  assert.ok(r.replayHash);
});

test("verifyAgentPayment commitment is deterministic", () => {
  const input = {
    agentId: "agent-1",
    payment: { destination: "G_GOOD", amount: "10", source: "S", asset: "XLM" },
    policy: { maxAmount: 100, allowedRecipients: ["G_GOOD"], allowedAssets: ["XLM"] },
    rules: RULES,
  };
  const a = verifyAgentPayment(input);
  const b = verifyAgentPayment(input);
  assert.equal(a.commitment, b.commitment);
  assert.equal(a.replayHash, b.replayHash);
});

test("submitAgentPayment returns NOT_PERFORMED in DRY_RUN", async () => {
  const verified = verifyAgentPayment({
    agentId: "agent-1",
    payment: { destination: "G_GOOD", amount: "10", source: "S", asset: "XLM" },
    policy: { maxAmount: 100, allowedRecipients: ["G_GOOD"], allowedAssets: ["XLM"] },
    rules: RULES,
  });
  const r = await submitAgentPayment({ verified });
  assert.equal(r.state, "NOT_PERFORMED");
});

test("submitAgentPayment holds on unverified", async () => {
  const r = await submitAgentPayment({ verified: { verdict: "REJECTED" } });
  assert.equal(r.state, "HELD");
});