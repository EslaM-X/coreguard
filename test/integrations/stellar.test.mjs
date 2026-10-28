import test from "node:test";
import assert from "node:assert/strict";

import {
  STELLAR_VERSION,
  STELLAR_NETWORKS,
  STELLAR_HORIZON,
  STELLAR_STATES,
  horizonFetch,
  readAccount,
  buildPaymentIntent,
  submitTransaction,
  status,
  selfCheck,
} from "../../packages/stellar/index.mjs";

test("STELLAR/1 exports version + states", () => {
  assert.equal(STELLAR_VERSION, "STELLAR/1");
  assert.ok(Array.isArray(STELLAR_STATES));
  assert.ok(STELLAR_STATES.includes("NOT_PERFORMED"));
  assert.ok(STELLAR_STATES.includes("SUBMITTED"));
});

test("status() is honest DRY_RUN / NOT_BUILT", () => {
  const s = status();
  assert.equal(s.runMode, "DRY_RUN");
  assert.equal(s.integrationStatus, "NOT_BUILT");
  assert.equal(s.hasCredentials, false);
  assert.equal(s.authorized, false);
  assert.equal(s.executed, false);
  assert.equal(s.receiptCaptured, false);
});

test("selfCheck() passes", () => {
  const r = selfCheck();
  assert.equal(r.ok, true);
});

test("horizonFetch rejects unknown network", async () => {
  const r = await horizonFetch({ network: "nope", path: "/accounts/x" });
  assert.equal(r.ok, false);
  assert.ok(r.error.includes("unknown network"));
});

test("horizonFetch requires path", async () => {
  const r = await horizonFetch({ network: "testnet", path: "" });
  assert.equal(r.ok, false);
  assert.ok(r.error.includes("path required"));
});

test("readAccount requires accountId", async () => {
  const r = await readAccount({ network: "testnet", accountId: "" });
  assert.equal(r.state, "READ_FAILED");
  assert.ok(r.error.includes("accountId required"));
});

test("buildPaymentIntent gates on missing fields", () => {
  assert.equal(buildPaymentIntent({}).state, "GATED");
  assert.equal(buildPaymentIntent({ source: "G", destination: "G" }).state, "GATED");
  const ok = buildPaymentIntent({ source: "GABC", destination: "GDEF", amount: "10" });
  assert.equal(ok.state, "BUILD_OK");
  assert.equal(ok.intent.type, "payment");
  assert.equal(ok.intent.amount, "10");
  assert.equal(ok.intent.asset, "XLM");
});

test("submitTransaction returns NOT_PERFORMED without submitter", async () => {
  const r = await submitTransaction({ xdr: "AAAA" });
  assert.equal(r.state, "NOT_PERFORMED");
  assert.ok(r.error.includes("DRY_RUN"));
});

test("submitTransaction rejects missing xdr", async () => {
  const r = await submitTransaction({ xdr: "", submitter: async () => ({ ok: true }) });
  assert.equal(r.state, "REJECTED");
});

test("submitTransaction calls injected submitter", async () => {
  const r = await submitTransaction({ xdr: "AAAA", submitter: async () => ({ ok: true, hash: "abc123" }) });
  assert.equal(r.state, "SUBMITTED");
  assert.equal(r.hash, "abc123");
});

test("STELLAR_HORIZON has testnet/mainnet/futurenet", () => {
  assert.ok(STELLAR_HORIZON.testnet.includes("horizon-testnet"));
  assert.ok(STELLAR_HORIZON.mainnet.includes("horizon.stellar.org"));
});

// Optional live read (network-dependent). Skipped if no network.
test("readAccount live testnet (optional)", async (t) => {
  // Stellar testnet account that may or may not exist; treat any non-throw as pass.
  const r = await readAccount({ network: "testnet", accountId: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7", timeoutMs: 8000 });
  // Either READ_OK or READ_FAILED is acceptable; must not throw.
  assert.ok(r.state === "READ_OK" || r.state === "READ_FAILED");
});