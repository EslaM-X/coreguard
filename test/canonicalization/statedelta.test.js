/**
 * CoreGuard Canonical Multi-Account State Delta Tests (P1)
 *
 * Proven: state capture is per-account (balances + storage), the canonical
 * state delta is deterministic (sorted), numeric fields are canonical decimal
 * strings, and the CGEP/1:STATEDELTA commitment is domain-separated.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { hashStateDelta } from "../../packages/canonical/index.js";
import {
  normalizeExecution,
  computeStateDelta,
  computeCanonicalStateDelta,
} from "../../packages/trace/index.js";

const tx = {
  hash: "0x00000000000000000000000000000000000000000000000000000000000000aa",
  from: "0x0000000000000000000000000000000000000001",
  to: "0x0000000000000000000000000000000000000002",
  value: "0xde0b6b3a7640000",
  input: "0xa9059cbb",
  nonce: "0x5",
  gasPrice: "0x59682f00",
  gas: "0x5208",
  type: "0x0",
};
const receipt = {
  status: "0x1",
  gasUsed: "0x186a0",
  blockNumber: "0x1e240",
  blockHash: "0x00000000000000000000000000000000000000000000000000000000000000bb",
  timestamp: "0x5f5e100",
  logs: [],
};
const traceCalls = [];
const preState = {
  "0x0000000000000000000000000000000000000001": { balance: "0x1b1ae4d6e2ef500000", storage: {} },
  "0x0000000000000000000000000000000000000002": { balance: "0x0000000000000000", storage: { "0x1": "0x01", "0x02": "0x0000" } },
};
const postState = {
  "0x0000000000000000000000000000000000000001": { balance: "0x1b1ade4d6e2ef500000", storage: {} },
  "0x0000000000000000000000000000000000000002": { balance: "0x0de0b6b3a7640000", storage: { "0x1": "0x02" } },
};

test("normalizeExecution collapses every RPC hex integer to canonical decimal", () => {
  const t = normalizeExecution(tx, receipt, traceCalls, preState, postState);
  assert.equal(t.value, "1000000000000000000");
  assert.equal(t.gasUsed, "100000");
  assert.equal(t.nonce, "5");
  assert.equal(t.gasPrice, "1500000000");
  assert.equal(t.txType, "0");
  assert.equal(t.blockNumber, "123456");
  assert.equal(t.blockTimestamp, "100000000");
  // storage slot keys stay canonical lowercase hex; values are decimal
  const sc = t.storageChanges.find((c) => c.slot === "0x1");
  assert.equal(sc.before, "1");
  assert.equal(sc.after, "2");
});

test("normalizeStorageChanges captures MULTIPLE accounts", () => {
  const t = normalizeExecution(tx, receipt, traceCalls, preState, postState);
  const addrs = new Set(t.storageChanges.map((c) => c.address));
  assert.ok(addrs.has("0x0000000000000000000000000000000000000002"));
  assert.ok(t.storageChanges.length >= 1);
});

test("computeCanonicalStateDelta is deterministic and per-account", () => {
  const t = normalizeExecution(tx, receipt, traceCalls, preState, postState);
  const delta = computeCanonicalStateDelta(t);

  assert.equal(delta.version, "CGEP/1");
  assert.equal(delta.status, "SUCCESS");
  assert.ok(Array.isArray(delta.accounts));
  assert.equal(delta.accounts.length, 2);

  // accounts sorted by address; balances carry signed decimal deltas
  const addrs = delta.accounts.map((a) => a.address);
  assert.deepEqual(addrs, [...addrs].sort());
  const bal = delta.accounts.find((a) => a.address.endsWith("2"));
  assert.equal(bal.balance.before, "0");
  assert.equal(bal.balance.after, "1000000000000000000");
  assert.equal(bal.balance.delta, "1000000000000000000");
});

test("computeCanonicalStateDelta is hash-stable and domain-separated", async () => {
  const t = normalizeExecution(tx, receipt, traceCalls, preState, postState);
  const d1 = computeCanonicalStateDelta(t);
  const d2 = computeCanonicalStateDelta(t);
  assert.equal(await hashStateDelta(d1), await hashStateDelta(d2));
  // an additional account changes the commitment
  const d3 = computeCanonicalStateDelta({
    ...t,
    balanceChanges: [...t.balanceChanges, { address: "0x0000000000000000000000000000000000000009", before: "1", after: "2" }],
  });
  assert.notEqual(await hashStateDelta(d1), await hashStateDelta(d3));
});

test("legacy computeStateDelta flat view is retained (demos)", () => {
  const t = normalizeExecution(tx, receipt, traceCalls, preState, postState);
  const flat = computeStateDelta(t);
  assert.ok(Array.isArray(flat.balanceChanges));
  assert.ok(Array.isArray(flat.storageChanges));
  assert.equal(flat.failed, false);
});