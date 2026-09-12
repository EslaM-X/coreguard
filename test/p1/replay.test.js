/**
 * P1-6: Deterministic replay (L2 tier) — structural impossibility proof.
 *
 * A commitment chain makes claims about an execution. The replay plan re-derives
 * the rule book the chain MUST have followed if those frames executed; a trace
 * that contradicts itself (illegal call tree, root/identity split, gas or
 * integer incoherence) is not credible evidence at any level.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { planTraceReplay, replayPlanDigest } from "../../packages/replay/index.js";

const A = "0x" + "aa".repeat(20);
const B = "0x" + "bb".repeat(20);
const C = "0x" + "cc".repeat(20);
const D = "0x" + "dd".repeat(20);

function makeTrace(overrides = {}) {
  return {
    from: A,
    to: B,
    calldata: "0x23b872dd" + "10".repeat(4),
    gasUsed: "90000",
    gasLimit: "300000",
    calls: [
      {
        depth: 0,
        from: A,
        to: B,
        calldata: "0x23b872dd" + "10".repeat(4),
        value: "1000",
        gasUsed: "90000",
        status: "SUCCESS",
      },
    ],
    ...overrides,
  };
}

function makeNested() {
  const t = makeTrace();
  t.calls = [
    { depth: 0, from: A, to: B, calldata: "0x23b872dd" + "10".repeat(4), value: "1000", gasUsed: "90000", status: "SUCCESS" },
    { depth: 1, from: B, to: C, calldata: "0x095ea7b3" + "20".repeat(4), value: "0", gasUsed: "40000", status: "SUCCESS" },
    { depth: 1, from: B, to: D, calldata: "0xa9059cbb" + "30".repeat(4), value: "200", gasUsed: "42000", status: "SUCCESS" },
  ];
  return t;
}

test("replay: well-formed single-frame trace is valid and deterministic", async () => {
  const p1 = await planTraceReplay(makeTrace());
  const p2 = await planTraceReplay(makeTrace());
  assert.equal(p1.valid, true);
  assert.deepEqual(p1.errors, []);
  assert.equal(p1.digestHex, p2.digestHex, "same evidence must re-derive same digest");
  assert.match(p1.digestHex, /^0x[0-9a-f]{64}$/);
  assert.equal(p1.root.to, B);
});

test("replay: nested DFS tree (parent + 2 children) is valid", async () => {
  const p = await planTraceReplay(makeNested());
  assert.equal(p.valid, true);
  assert.equal(p.frames, 3);
  assert.equal(p.digestHex, await replayPlanDigest(makeNested()));
});

test("replay: depth jump (frame at depth 2 under depth 0) is INVALID", async () => {
  const t = makeNested();
  t.calls = [
    t.calls[0],
    { depth: 2, from: B, to: C, value: "0", gasUsed: "40000", status: "SUCCESS" },
  ];
  const p = await planTraceReplay(t);
  assert.equal(p.valid, false);
  assert.match(p.errors[0], /depth jump/);
});

test("replay: root frame identity split (frame.to != trace.to) is INVALID", async () => {
  const t = makeTrace();
  t.calls[0].to = "0x" + "00".repeat(20);
  const p = await planTraceReplay(t);
  assert.equal(p.valid, false);
  assert.match(p.errors[0], /root frame to/);
});

test("replay: root selector split (frame != trace calldata) is INVALID", async () => {
  const t = makeTrace();
  t.calls[0].calldata = "0x12345678" + "00".repeat(4);
  const p = await planTraceReplay(t);
  assert.equal(p.valid, false);
  assert.match(p.errors[0], /selector/);
});

test("replay: frame gasUsed above tx gasUsed is INVALID", async () => {
  const t = makeTrace();
  t.calls[0].gasUsed = "999999999";
  const p = await planTraceReplay(t);
  assert.equal(p.valid, false);
  assert.match(p.errors[0], /exceeds tx gasUsed/);
});

test("replay: tx gasUsed above committed gasLimit is INVALID", async () => {
  const t = makeTrace({ gasUsed: "400000", gasLimit: "300000" });
  const p = await planTraceReplay(t);
  assert.equal(p.valid, false);
  assert.match(p.errors[0], /gasLimit/);
});

test("replay: malformed integers in evidence are INVALID (fail-closed)", async () => {
  const t = makeTrace();
  t.calls[0].value = "0x0z"; // not a uint in any accepted form
  const p = await planTraceReplay(t);
  assert.equal(p.valid, false);
  assert.match(p.errors[0], /non-canonical value/);
});

test("replay: RPC-style hex value is accepted and canonicalized (hex↔decimal collapse)", async () => {
  const t = makeTrace();
  t.calls[0].value = "0x1f";
  const p = await planTraceReplay(t);
  assert.equal(p.valid, true);
  assert.equal(p.root.value, "31");
});

test("replay: negative inner value is INVALID", async () => {
  const t = makeNested();
  t.calls[1].value = "-5";
  const p = await planTraceReplay(t);
  assert.equal(p.valid, false);
  assert.match(p.errors[0], /non-canonical value/);
});

test("replay: trace with zero frames is valid (bare transfer evidence)", async () => {
  const p = await planTraceReplay(makeTrace({ calls: [] }));
  assert.equal(p.valid, true);
  assert.equal(p.frames, 0);
});

test("replay: digest is a commitment — changing a frame value changes the digest", async () => {
  const a = await replayPlanDigest(makeNested());
  const t = makeNested();
  t.calls[1].value = "1";
  const b = await replayPlanDigest(t);
  assert.notEqual(a, b);
  assert.equal(a.length, 66);
});