/**
 * Attack Laboratory — oracle infrastructure meta-tests (commit 1 / suite wiring).
 *
 * These are NOT attack rows.  They prove that `attackCheck` itself classifies
 * correctly (HELD / DEFEATED / NON-EXPLOITABLE), that it surfaces DEFEATED
 * with reproduction details, and that `assertNoPostExecutionArtifacts` is the
 * explicit primitive for IN1 (used only by A6/A12).  This file is the harness
 * foundation: everything in a01–a16 rides on these contracts.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { attackCheck, assertNoPostExecutionArtifacts, FORBIDDEN_TOKENS, allowedInputs } from "./helpers.js";

const r = (name, fn) => test(`oracle.${name}`, fn);

r("1 attackCheck classifies HELD when the oracle is satisfied", async () => {
  const res = await attackCheck({
    id: "ORACLE-META.1",
    attempt: async () => ({ decision: "DENY", predicate: { DECLARATION_BOUND: false } }),
    oracle: ({ decision, predicate }) => ({
      verdict: decision === "DENY" && predicate.DECLARATION_BOUND === false ? "HELD" : "DEFEATED",
    }),
  });
  assert.equal(res.verdict, "HELD");
});

r("2 attackCheck classifies DEFEATED and throws with reproduction details", async () => {
  await assert.rejects(
    attackCheck({
      id: "ORACLE-META.2",
      attempt: async () => ({ decision: "ALLOW", predicate: {} }),
      oracle: ({ decision, predicate }) => ({
        verdict: decision === "ALLOW" && predicate.IN8_OK ? "HELD" : "DEFEATED",
        reason: "ALLOW without IN8 — global rule",
      }),
    }),
    (e) => e.message.startsWith("DEFEATED [ORACLE-META.2]") && /global rule/.test(e.message)
  );
});

r("3 attackCheck runs an oracle that asserts its own additional checks", async () => {
  const res = await attackCheck({
    id: "ORACLE-META.3",
    attempt: async () => ({
      decision: "DENY",
      record: { decisionRef: "0xabc", frozen: true },
    }),
    oracle: ({ decision, record }) => ({
      verdict: decision === "DENY" && record.frozen && record.decisionRef.startsWith("0x") ? "HELD" : "DEFEATED",
    }),
  });
  assert.equal(res.verdict, "HELD");
});

r("4 attackCheck passes a thrown error through as _thrown (oracle may treat as DEFEATED)", async () => {
  await assert.rejects(
    attackCheck({
      id: "ORACLE-META.4",
      attempt: async () => {
        throw new TypeError("nope");
      },
      oracle: ({ _thrown, decision }) => ({
        verdict: _thrown ? "DEFEATED" : decision === "DENY" ? "HELD" : "DEFEATED",
        reason: _thrown ? `unexpected throw: ${_thrown.message}` : undefined,
      }),
    }),
    /unexpected throw: nope/
  );
});

r("5 an oracle may re-verify record shape (family-specific checks belong to the oracle)", async () => {
  const res = await attackCheck({
    id: "ORACLE-META.5",
    attempt: async () => ({ decision: "DENY", record: { decisionRef: "0x1234" } }),
    oracle: ({ decision, record }) => ({
      verdict: decision === "DENY" && /^0x[0-9a-f]{4,}$/.test(record.decisionRef) ? "HELD" : "DEFEATED",
    }),
  });
  assert.equal(res.verdict, "HELD");
});

r("6 attackCheck supports the NON-EXPLOITABLE verdict (measured, not raised)", async () => {
  const res = await attackCheck({
    id: "ORACLE-META.6",
    attempt: async () => ({ decision: "ALLOW" }),
    oracle: () => ({ verdict: "NON-EXPLOITABLE" }),
  });
  assert.equal(res.verdict, "NON-EXPLOITABLE");
});

r("7 assertNoPostExecutionArtifacts is explicit and detects forbidden tokens", async () => {
  const base = await allowedInputs({});
  const { record } = await (await import("../../../packages/firewall/index.js")).decideFirewall(base);
  assertNoPostExecutionArtifacts(record); // clean
  assertNoPostExecutionArtifacts({ locked: true });

  assert.throws(
    () => assertNoPostExecutionArtifacts({ leaked: "executionRef" }),
    /post-execution artifact/
  );
});

r("8 the primitive is family-agnostic (uses whatever the oracle decides)", async () => {
  const res = await attackCheck({
    id: "ORACLE-META.8",
    attempt: async () => ({ n: 1 }),
    oracle: ({ n }) => ({ verdict: n === 1 ? "HELD" : "DEFEATED" }),
  });
  assert.equal(res.verdict, "HELD");
});

r("9 an INVALID oracle result is a harness error, not a verdict", async () => {
  await assert.rejects(
    attackCheck({ id: "ORACLE-META.9", attempt: async () => ({}), oracle: async () => null }),
    /invalid result/
  );
});

r("10 in throw-through mode the oracle decides on _thrown only when it wants", async () => {
  const res = await attackCheck({
    id: "ORACLE-META.10",
    attempt: async () => {
      throw new Error("boom");
    },
    oracle: ({ _thrown }) => ({ verdict: _thrown ? "NON-EXPLOITABLE" : "DEFEATED" }),
  });
  assert.equal(res.verdict, "NON-EXPLOITABLE");
});