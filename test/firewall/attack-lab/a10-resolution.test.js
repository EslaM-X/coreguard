/**
 * A10 — CROSS-INTENT / CROSS-MANIFEST RESOLUTION (design §6, Q-FW9a).
 *
 * FAMILY ORAcle: the resolution integrity anchor recomputes the FULL binding
 * of the parent record and demands intentRef/manifestId/bindingRef identity
 * with the re-decision. A resolution can only ever conclude the SAME bound
 * decision; it is anchored to the parent decisionRef and frozen.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { decideFirewall, resolveReview } from "../../../packages/firewall/index.js";
import { attackCheck, allowedInputs } from "./helpers.js";
import { makeAddress, makeSimulation } from "../helpers.js";

const r = (name, fn) => test(`A10.${name}`, fn);

async function reviewParent() {
  const base = await allowedInputs({});
  const reviewPath = { configured: true, writers: [makeAddress(0x77)] };
  const parent = await decideFirewall({
    ...base,
    reviewPath,
    simulation: { target: base.intent.target, selector: base.intent.selector, recipient: base.intent.recipient },
  });
  assert.equal(parent.decision, "REQUIRE_REVIEW");
  return { base, reviewPath, parent };
}

r("1 resolution record is anchored to the parent decisionRef and frozen", async () => {
  const { base, reviewPath, parent } = await reviewParent();
  await attackCheck({
    id: "A10.1",
    attempt: async () => resolveReview({ parentRecord: parent.record, writer: base.writer, reviewPath, resolvedSimulation: makeSimulation({}, base.intent), inputs: base }),
    oracle: ({ admitted, resolution, resolutionRef, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (!admitted) return { verdict: "DEFEATED", reason: "baseline resolution must admit" };
      if (resolution.ref !== parent.record.decisionRef) return { verdict: "DEFEATED", reason: "child ref must be the parent decisionRef" };
      if (!Object.isFrozen(resolution)) return { verdict: "DEFEATED", reason: "resolution record must be frozen (IN2)" };
      if (!resolutionRef?.startsWith("0x")) return { verdict: "DEFEATED", reason: "resolution must carry a content-derived ref" };
      return { verdict: "HELD" };
    },
  });
});

r("2 a parent bound to a DIFFERENT manifest cannot be concluded by this re-decision", async () => {
  const { base, reviewPath, parent } = await reviewParent();
  const other = await allowedInputs({ intent: { amount: "555" } });
  await attackCheck({
    id: "A10.2",
    attempt: async () => resolveReview({ parentRecord: parent.record, writer: base.writer, reviewPath, resolvedSimulation: makeSimulation({}, other.intent), inputs: other }),
    oracle: ({ admitted, error, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (admitted === true) return { verdict: "DEFEATED", reason: "different-manifest resolution admitted (Q-FW9a breach)" };
      if (admitted === false && /does not match the parent record binding/.test(error || "")) return { verdict: "HELD" };
      return { verdict: "DEFEATED", reason: `expected binding-anchor rejection, got ${JSON.stringify({ admitted, error })}` };
    },
  });
});

r("3 cross-chain replay of the resolved simulation under the same ref is rejected", async () => {
  const { base, reviewPath, parent } = await reviewParent();
  const cross = { ...base, intent: { ...base.intent, chainId: "1114" }, declaration: undefined };
  await attackCheck({
    id: "A10.3",
    attempt: async () => resolveReview({ parentRecord: parent.record, writer: base.writer, reviewPath, resolvedSimulation: makeSimulation({}, cross.intent), inputs: cross }),
    oracle: ({ admitted, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (admitted === true) return { verdict: "DEFEATED", reason: "cross-chain replay admitted under the parent ref" };
      return { verdict: "HELD" };
    },
  });
});

r("4 binding identity is conserved atomically (intentRef/manifestId/bindingRef together)", async () => {
  const { base, reviewPath, parent } = await reviewParent();
  const pb = parent.record.binding;
  assert.ok(pb.intentRef && pb.manifestId && pb.bindingRef, "parent record must carry the full binding triple");
  await attackCheck({
    id: "A10.4",
    attempt: async () => resolveReview({ parentRecord: parent.record, writer: base.writer, reviewPath, resolvedSimulation: makeSimulation({}, base.intent), inputs: base }),
    oracle: ({ admitted, decisionRecord, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (!admitted) return { verdict: "DEFEATED", reason: "baseline resolution must admit" };
      const rb = decisionRecord?.binding;
      if (!rb) return { verdict: "DEFEATED", reason: "re-decided record must carry a binding" };
      if (rb.intentRef !== pb.intentRef || rb.manifestId !== pb.manifestId || rb.bindingRef !== pb.bindingRef) {
        return { verdict: "DEFEATED", reason: "binding triple diverged across resolution" };
      }
      return { verdict: "HELD" };
    },
  });
});

r("5 positive control survives canonical re-derivation of the same bound intent", async () => {
  const { base, reviewPath, parent } = await reviewParent();
  const clone = await allowedInputs({});
  assert.equal(clone.declaration.manifestId, parent.record.binding.manifestId);
  await attackCheck({
    id: "A10.5",
    attempt: async () => resolveReview({ parentRecord: parent.record, writer: base.writer, reviewPath, resolvedSimulation: makeSimulation({}, base.intent), inputs: base }),
    oracle: ({ admitted, decision, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (admitted === true && decision === "ALLOW") return { verdict: "HELD" };
      return { verdict: "DEFEATED", reason: "same-bound-intent resolution must admit ALLOW" };
    },
  });
});