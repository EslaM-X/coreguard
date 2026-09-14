/**
 * A13 — CANONICAL DETERMINISM (design §6).
 *
 * FAMILY ORAclEs are EXPLICITLY separated (design requirement):
 *   (1) SAME canonical input          → same decision + same record + same decisionRef
 *   (2) DISTINCT canonical record     → distinct decisionRef
 * These are two independent assertions. The helper does NOT fold objects;
 * equivalence is decided by `canonicalize`, never by object identity.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { decideFirewall } from "../../../packages/firewall/index.js";
import { decisionRecordRef } from "../../../packages/firewall/decision-record.js";
import { canonicalize } from "../../../packages/canonical/index.js";
import { attackCheck, allowedInputs } from "./helpers.js";

const r = (name, fn) => test(`A13.${name}`, fn);

function reversedKeys(obj) {
  const out = {};
  for (const key of Object.keys(obj).reverse()) out[key] = obj[key];
  assert.deepEqual(Object.keys(out).sort(), Object.keys(obj).sort());
  return out;
}

r("1a SAME canonical input ⇒ same decision + same record + same decisionRef", async () => {
  const base = await allowedInputs({});
  await attackCheck({
    id: "A13.1a",
    attempt: async () => {
      const a = await decideFirewall(base);
      const b = await decideFirewall({ ...base, intent: { ...base.intent }, simulation: { ...base.simulation } });
      return { a, b };
    },
    oracle: ({ a, b, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (a.decision !== b.decision) return { verdict: "DEFEATED", reason: `decisions diverged: ${a.decision} vs ${b.decision}` };
      if (canonicalize(a.record) !== canonicalize(b.record)) return { verdict: "DEFEATED", reason: "records diverged on identical canonical input" };
      if (a.record.decisionRef !== b.record.decisionRef) return { verdict: "DEFEATED", reason: "decisionRef diverged on identical canonical input" };
      return { verdict: "HELD" };
    },
  });
});

r("1b representation-equivalent variants (key order / 0x casing) are the SAME canonical input", async () => {
  const original = await allowedInputs({});
  await attackCheck({
    id: "A13.1b",
    attempt: async () => {
      const a = await decideFirewall(original);
      const variant = await allowedInputs({});
      const b = await decideFirewall({
        ...variant,
        intent: reversedKeys(variant.intent),
        declaration: reversedKeys(variant.declaration),
        policy: reversedKeys(variant.policy),
        simulation: reversedKeys(variant.simulation),
      });
      return { a, b };
    },
    oracle: ({ a, b, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (canonicalize(a.record) !== canonicalize(b.record)) return { verdict: "DEFEATED", reason: "key-order variants folded to same canonical input must yield equal records" };
      if (a.record.decisionRef !== b.record.decisionRef) return { verdict: "DEFEATED", reason: "reference diverged across representation-equivalent variants" };
      return { verdict: "HELD" };
    },
  });

  // 0x-casing: both lowercase-0x => canonicalize folds the hex digits.
  const low = await allowedInputs({ intent: { selector: "0xAbCdEf01", amount: "0xAbC" } });
  const up = await allowedInputs({ intent: { selector: "0xabcdef01", amount: "0xabc" } });
  const ra = await decideFirewall(low);
  const rb = await decideFirewall(up);
  assert.equal(await decisionRecordRef(rb.record), await decisionRecordRef(ra.record));
  assert.equal(rb.record.decisionRef, ra.record.decisionRef);
});

r("2 DISTINCT canonical record ⇒ distinct decisionRef (never folded)", async () => {
  const base = await allowedInputs({});
  const baseline = await decideFirewall(base);
  const different = await allowedInputs({ intent: { amount: "0x100" } });
  const other = await decideFirewall(different);
  await attackCheck({
    id: "A13.2",
    attempt: async () => ({ baseline, other }),
    oracle: ({ baseline, other, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (canonicalize(baseline.record) === canonicalize(other.record)) return { verdict: "DEFEATED", reason: "distinct canonical records collapsed" };
      if (baseline.record.decisionRef === other.record.decisionRef) return { verdict: "DEFEATED", reason: "distinct canonical records produced the SAME decisionRef (collision)" };
      return { verdict: "HELD" };
    },
  });
});

r("3 same canonical review path produces a deterministic review record", async () => {
  const base = await allowedInputs({});
  const unmodelable = { target: base.intent.target, selector: base.intent.selector, recipient: base.intent.recipient };
  const a = await decideFirewall({ ...base, reviewPath: { configured: true, writers: [base.writer] }, simulation: unmodelable });
  const b = await decideFirewall({ ...base, reviewPath: reversedKeys({ configured: true, writers: [base.writer] }), simulation: reversedKeys(unmodelable) });
  assert.equal(a.decision, b.decision);
  assert.equal(canonicalize(a.record), canonicalize(b.record));
});