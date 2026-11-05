import test from "node:test";
import assert from "node:assert/strict";
import { gateSwap, gatePathPayment, gateProvideLiquidity, checkConformance, GATE_VERDICTS } from "../../packages/stellar/dex-gating.mjs";

test("DEX-GATE: valid swap passes", () => {
  const result = gateSwap({
    source: "GABC",
    destination: "GDEF",
    amount: 100,
    minAmount: 95,
    policy: { maxSlippage: 0.05 },
  });
  assert.equal(result.verdict, GATE_VERDICTS.VERIFIED);
  assert.equal(result.allowed, true);
});

test("DEX-GATE: swap with excessive slippage rejected", () => {
  const result = gateSwap({
    source: "GABC",
    destination: "GDEF",
    amount: 100,
    minAmount: 90,
    policy: { maxSlippage: 0.05 },
  });
  assert.equal(result.verdict, GATE_VERDICTS.REJECTED);
  assert.equal(result.allowed, false);
});

test("DEX-GATE: swap with denied destination rejected", () => {
  const result = gateSwap({
    source: "GABC",
    destination: "GDEF",
    amount: 100,
    policy: { rules: [{ type: "deny_destination", value: "GDEF" }] },
  });
  assert.equal(result.verdict, GATE_VERDICTS.REJECTED);
  assert.equal(result.allowed, false);
});

test("DEX-GATE: swap with max amount exceeded rejected", () => {
  const result = gateSwap({
    source: "GABC",
    destination: "GDEF",
    amount: 200,
    policy: { rules: [{ type: "max_amount", value: 100 }] },
  });
  assert.equal(result.verdict, GATE_VERDICTS.REJECTED);
  assert.equal(result.allowed, false);
});

test("DEX-GATE: missing source held", () => {
  const result = gateSwap({ destination: "GDEF", amount: 100 });
  assert.equal(result.verdict, GATE_VERDICTS.HELD);
  assert.equal(result.allowed, false);
});

test("DEX-GATE: conformance check detects mismatch", () => {
  const result = checkConformance({
    intent: { source: "GABC", destination: "GDEF", amount: "100", asset: "XLM" },
    execution: { source: "GABC", destination: "GXYZ", amount: "100", asset: "XLM" },
  });
  assert.equal(result.verdict, GATE_VERDICTS.REJECTED);
  assert.equal(result.mismatches.length, 1);
  assert.equal(result.mismatches[0].field, "destination");
});

test("DEX-GATE: conformance check passes when matching", () => {
  const result = checkConformance({
    intent: { source: "GABC", destination: "GDEF", amount: "100", asset: "XLM" },
    execution: { source: "GABC", destination: "GDEF", amount: "100", asset: "XLM" },
  });
  assert.equal(result.verdict, GATE_VERDICTS.VERIFIED);
  assert.equal(result.allowed, true);
});

test("DEX-GATE: path payment valid", () => {
  const result = gatePathPayment({
    source: "GABC",
    destination: "GDEF",
    sendAmount: 100,
    policy: { maxSlippage: 0.05 },
  });
  assert.equal(result.verdict, GATE_VERDICTS.VERIFIED);
  assert.equal(result.allowed, true);
});

test("DEX-GATE: liquidity provision valid", () => {
  const result = gateProvideLiquidity({
    source: "GABC",
    pool: "POOL1",
    amountA: 100,
    amountB: 200,
  });
  assert.equal(result.verdict, GATE_VERDICTS.VERIFIED);
  assert.equal(result.allowed, true);
});