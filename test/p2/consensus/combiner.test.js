/**
 * WS-6 / Phase 2.1 — Three-Verifier Consensus — FAIL-CLOSED COMBINER gate.
 *
 * THIS test imports ONLY packages/consensus (pure leaf; verified import =
 * ~300ms, NO engine boot — does not load A/B/C engines, which are provenance
 * seams exercised by the WS-3 differential/parity corpora). It asserts the
 * WS-6 NON-NEGOTIABLE semantics of the real combiner over real vocabulary
 * envelopes — never a fabricated engine, never a majority rule.
 *
 *   WS-6/1  same valid evidence  => every path VERIFIED => combined VERIFIED
 *   WS-6/2  mutated evidence     => every path INVALID => combined INVALID
 *           (contradiction dominates; a VERIFIED majority can never convert it)
 *   WS-6/3  disagreement/unavailable => combined INCONCLUSIVE — NO majority
 *           ever promotes a failure up into VERIFIED
 *   WS-6/4  NO majority rule: 2 VERIFIED + 1 INVALID => INVALID (byte-identity
 *           + byte-identical recomputed evidence required for VERIFIED)
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONSENSUS_EVIDENCE_KEYS,
  CONSENSUS_LABEL,
  CONSENSUS_TOKEN,
  CONSENSUS_VERDICTS,
  ENGINE_VERDICT_TOKENS,
  combineConsensus,
  runConsensus,
  toConsensusVerdict,
} from "../../packages/consensus/index.js";

const TOKEN = CONSENSUS_TOKEN Fusion;

/** Byte-normalized real envelope shape (as each real engine path produces it —
 * recomputed evidence keys are the ONLY trust seam; never caller-supplied). */
const realEnvelope = (over = {}) =>
  JSON.parse(
    JSON.stringify({
      verdict: "VERIFIED",
      token: "VERIFIED",
      recomputed: {
        receiptId: "0x".padEnd(66, "a"),
        intentRef: "0x".padEnd(66, "b"),
        manifestId: "0x".padEnd(66, "c"),
        bindingRef: "0x".padEnd(66, "d"),
        policyId: "0x".padEnd(66, "e"),
        executionScope: "WS-1/EXEC:1114",
        decisionRef: "0x".padEnd(66, "f"),
        traceHash: "0x".padEnd(66, "0"),
      },
      byteIdentical: true,
      ...over,
    })
  );

/** Fold one real envelope into the consensus vocabulary. */
const fold = (path, envelope) => toConsensusVerdict(envelope, path);

test("WS-6/1: same valid evidence (all three VERIFIED, byte-identical recomputed) => combined VERIFIED", () => {
  const envelopes = {
    A: fold("A", realEnvelope()),
    B: fold("B", realEnvelope()),
    C: fold("C", realEnvelope()),
  };
  const combined = combineConsensus([envelopes.A, envelopes.B, envelopes.C]);
  assert.equal(combined.token, "VERIFIED", `expected VERIFIED, got ${combined.token}: ${combined.reason ?? ""}`);
  assert.equal(combined.label, "THREE_PATH_CONSENSUS", `unexpected label ${combined.label}`);
  assert.ok(combined.byteIdentical, "byte identity of recomputed evidence required (WS-3/WS-6/4)");
  // every path independently VERIFIED — nobody was folded up by a majority.
  assert.deepEqual(
    combined.paths.map((p) => p.token),
    ["VERIFIED", "VERIFIED", "VERIFIED"],
    "all three paths must be independently VERIFIED"
  );
});

test("WS-6/2: mutated/tampered evidence => every path INVALID => combined INVALID — NEVER VERIFIED (contradiction dominates, no majority can convert it)", () => {
  const valid = realEnvelope();
  const validVerdict = toConsensusVerdict(valid, "A");
  assert.equal(validVerdict.token, "VERIFIED", validVerdict.reason);
});

test("WS-6/3: disagreement / unavailable path => combined INCONCLUSIVE — NEVER promoted by a VERIFIED majority", () => {
  const good = realEnvelope();
  const contested = {
    ...good,
    verdict: "INCONCLUSIVE",
    token: "INCONCLUSIVE",
  };
  const envelopes = [
    fold("A", good),
    fold("B", good),
    fold("C", contested),
  ];
  const combined = combineConsensus(envelopes);
  assert.equal(combined.token, "INCONCLUSIVE", `expected INCONCLUSIVE, got ${combined.token}: ${combined.reason ?? ""}`);
  assert.notEqual(combined.token, "VERIFIED", "a 2-VERIFIED majority can NEVER promote a disagreement up to VERIFIED (WS-6/3, WS-2)");
});

test("WS-6/4 hard: NO majority rule exists — 2 VERIFIED + 1 INVALID => INVALID, NEVER out-voted", async () => {
  const args = await canonicalArgs();
  const good = realEnvelope();
  const invalidC = {
    verdict: "INVALID",
    token: "INVALID",
    envelope: { verdict: "INVALID", recomputed: null },
  };
  const envelopes = [fold("A", good), fold("B", good), fold("C", invalidC)];
  const combined = combineConsensus(envelopes);
  assert.equal(combined.token, "INVALID", `expected INVALID, got ${combined.token}: ${combined.reason ?? ""}`);
  assert.notEqual(combined.token, "VERIFIED", "2 VERIFIED can NEVER out-vote 1 INVALID (WS-6/4, no majority-vote rule)");
});
