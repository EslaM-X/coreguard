/**
 * A9 — REVIEW-WRITER / REVIEW-AUTHORITY substitution (design §6, Q-FW9a).
 *
 * FAMILY ORACLE: the DECISION stage never lets the writer shape the verdict
 * (unmodelable ⇒ REQUIRE_REVIEW regardless of writer). The review-RESOLUTION
 * stage anchors the writer to the review-path authority list; a DENY parent
 * can never be flipped to ALLOW through resolution.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { decideFirewall, resolveReview } from "../../../packages/firewall/index.js";
import { attackCheck, allowedInputs } from "./helpers.js";
import { makeAddress, makeSimulation } from "../helpers.js";

const r = (name, fn) => test(`A9.${name}`, fn);

async function reviewBase() {
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

r("1 decision-stage verdict never depends on the writer identity", async () => {
  const { base, reviewPath } = await reviewBase();
  const unmodelableSim = () => ({ target: base.intent.target, selector: base.intent.selector, recipient: base.intent.recipient });
  for (const writer of [makeAddress(0x99), undefined, "0xdeaf"]) {
    await attackCheck({
      id: `A9.1[writer=${String(writer).slice(0, 12)}]`,
      attempt: async () => decideFirewall({ ...base, reviewPath, simulation: unmodelableSim(), writer }),
      oracle: ({ decision, record, _thrown }) => {
        if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
        if (decision !== "REQUIRE_REVIEW") return { verdict: "DEFEATED", reason: `writer must not change verdict, got ${decision}` };
        return { verdict: "HELD" };
      },
    });
  }
});

r("2 resolveReview rejects a writer outside the review-path authority list (Q-FW9a)", async () => {
  const { base, reviewPath, parent } = await reviewBase();
  await attackCheck({
    id: "A9.2",
    attempt: async () =>
      resolveReview({ parentRecord: parent.record, writer: makeAddress(0x99), reviewPath, resolvedSimulation: makeSimulation({}, base.intent), reason: "attacker click", inputs: base }),
    oracle: ({ admitted, error, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (admitted === true) return { verdict: "DEFEATED", reason: "unauthorized writer admitted the review" };
      if (admitted === false && /not authorized by the review path/.test(error || "")) return { verdict: "HELD" };
      return { verdict: "DEFEATED", reason: `expected rejection, got ${JSON.stringify({ admitted, error })}` };
    },
  });
});

r("3 resolveReview requires a frozen REQUIRE_REVIEW parent; DENY parent never flips", async () => {
  const { base, reviewPath } = await reviewBase();
  const unfrozen = { ...(await decideFirewall(base)).record };
  await attackCheck({
    id: "A9.3[unfrozen]",
    attempt: async () => resolveReview({ parentRecord: unfrozen, writer: base.writer, reviewPath, resolvedSimulation: makeSimulation({}, base.intent), inputs: base }),
    oracle: ({ admitted, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (admitted === true) return { verdict: "DEFEATED", reason: "unfrozen parent admitted" };
      return { verdict: "HELD" };
    },
  });

  const denyBase = await allowedInputs({ rules: [{ ruleId: "v", type: "VALUE_LIMIT", severity: "HIGH", params: { max: "1" } }] });
  const denyParent = (await decideFirewall(denyBase)).record;
  await attackCheck({
    id: "A9.3[deny-parent]",
    attempt: async () => resolveReview({ parentRecord: denyParent, writer: base.writer, reviewPath, resolvedSimulation: makeSimulation({}, base.intent), inputs: base }),
    oracle: ({ admitted, error, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (admitted === true) return { verdict: "DEFEATED", reason: "DENY parent flipped to ALLOW — forbidden" };
      if (admitted === false && /DENY → ALLOW is forbidden/.test(error || "")) return { verdict: "HELD" };
      return { verdict: "DEFEATED", reason: `expected DENY→ALLOW rejection, got ${JSON.stringify({ admitted, error })}` };
    },
  });
});

r("4 positive control: authorized writer + resolved term admits ALLOW (and re-checks binding)", async () => {
  const { base, reviewPath, parent } = await reviewBase();
  await attackCheck({
    id: "A9.4",
    attempt: async () => resolveReview({ parentRecord: parent.record, writer: base.writer, reviewPath, resolvedSimulation: makeSimulation({}, base.intent), reason: "review completed", inputs: base }),
    oracle: ({ admitted, decision, resolution, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (admitted === true && decision === "ALLOW" && resolution && resolution.ref === parent.record.decisionRef) return { verdict: "HELD" };
      return { verdict: "DEFEATED", reason: "authorized resolution must admit ALLOW anchored to the parent ref" };
    },
  });
});

r("5 resolution re-decision on a DIFFERENT intent cannot ride the parent binding (Q-FW9a anchor)", async () => {
  const { base, reviewPath, parent } = await reviewBase();
  const other = await allowedInputs({ intent: { recipient: makeAddress(0xee) } });
  await attackCheck({
    id: "A9.5",
    attempt: async () => resolveReview({ parentRecord: parent.record, writer: base.writer, reviewPath, resolvedSimulation: makeSimulation({}, other.intent), inputs: other }),
    oracle: ({ admitted, error, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (admitted === true) return { verdict: "DEFEATED", reason: "resolution concluded against a different intent (Q-FW9a breach)" };
      if (admitted === false && /does not match the parent record binding/.test(error || "")) return { verdict: "HELD" };
      return { verdict: "DEFEATED", reason: `expected binding-anchor rejection, got ${JSON.stringify({ admitted, error })}` };
    },
  });
});