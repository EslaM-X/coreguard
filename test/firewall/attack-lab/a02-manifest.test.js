/**
 * A2 — MANIFEST-ID re-derivation (design §6).
 *
 * FAMILY ORACLE: the engine recomputes the manifestId locally from
 * declarationCore — never trusts the declared value. Any tamper with the
 * declared manifestId (or the declaration content that feeds it) must land on
 * DENY with DECLARATION_BOUND false.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { decideFirewall } from "../../../packages/firewall/index.js";
import { computeDeclarationId } from "../../../packages/firewall/binding.js";
import { attackCheck, allowedInputs } from "./helpers.js";
import { makeAddress } from "../helpers.js";

const r = (name, fn) => test(`A2.${name}`, fn);

const manifestOracle = ({ decision, predicate, _thrown }) => {
  if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
  if (decision === "ALLOW") return { verdict: "DEFEATED", reason: "tampered manifest survived to ALLOW" };
  if (decision === "DENY" && predicate?.DECLARATION_BOUND === false) return { verdict: "HELD" };
  return { verdict: "DEFEATED", reason: `expected fail-closed DENY, got ${decision}` };
};

r("1 recompute path: freshly-signed declaration binds and manifestId re-derives", async () => {
  const base = await allowedInputs({});
  const recomputed = await computeDeclarationId(base.declaration);
  assert.equal(recomputed, base.declaration.manifestId, "harness sanity: manifestId must be recomputable identically");
  await attackCheck({
    id: "A2.1",
    attempt: async () => decideFirewall(base),
    oracle: ({ decision, record, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (decision !== "ALLOW") return { verdict: "DEFEATED", reason: `baseline must ALLOW, got ${decision}` };
      assert.equal(record.binding.manifestId, recomputed, "record must carry the recomputed manifestId");
      return { verdict: "HELD" };
    },
  });
});

r("2 tampered declared manifestId (content changes) is re-derived ⇒ DENY", async () => {
  const base = await allowedInputs({});
  await attackCheck({
    id: "A2.2",
    attempt: async () => {
      const d = JSON.parse(JSON.stringify(base.declaration));
      const other = await allowedInputs({ intent: { nonce: "777" } });
      d.manifestId = other.declaration.manifestId; // foreign, correct-format manifestId
      return decideFirewall({ ...base, declaration: d });
    },
    oracle: manifestOracle,
  });
});

r("3 foreign-chain manifestId cannot ride across chains", async () => {
  const base = await allowedInputs({});
  await attackCheck({
    id: "A2.3",
    attempt: async () => {
      const d = JSON.parse(JSON.stringify(base.declaration));
      d.manifestId = "0x" + "ab".repeat(32);
      return decideFirewall({ ...base, declaration: d });
    },
    oracle: manifestOracle,
  });
});

r("4 manifestId present but signature removed ⇒ still re-derived (recompute wins)", async () => {
  const base = await allowedInputs({});
  await attackCheck({
    id: "A2.4",
    attempt: async () => {
      const d = JSON.parse(JSON.stringify(base.declaration));
      d.signature = undefined;
      return decideFirewall({ ...base, declaration: d });
    },
    oracle: manifestOracle,
  });
});

r("5 same declaration replayed ⇒ deterministic same manifestId + same binding", async () => {
  const base = await allowedInputs({});
  await attackCheck({
    id: "A2.5",
    attempt: async () => {
      const a = await decideFirewall(base);
      const b = await decideFirewall(base);
      return { decision: a.decision, record: { binding: { manifestId: a.record.binding.manifestId } }, sameRef: a.record.decisionRef === b.record.decisionRef };
    },
    oracle: ({ record, sameRef, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      return sameRef && record.binding.manifestId === base.declaration.manifestId ? { verdict: "HELD" } : { verdict: "DEFEATED", reason: "manifest binding not deterministic" };
    },
  });
});

r("6 lower/upper-case manifestId hex is folded (representation) not distinct", async () => {
  const base = await allowedInputs({});
  const upper = "0x" + base.declaration.manifestId.slice(2).toUpperCase();
  await attackCheck({
    id: "A2.6",
    attempt: async () => {
      const d = JSON.parse(JSON.stringify(base.declaration));
      d.manifestId = upper;
      // canonicalize folds 0x-hex case, so recomputed == supplied ⇒ binding holds.
      return decideFirewall({ ...base, declaration: d });
    },
    oracle: ({ decision, record, _thrown }) => {
      if (_thrown) return { verdict: "DEFEATED", reason: `unexpected throw: ${_thrown.message}` };
      if (decision === "ALLOW" && record.binding.manifestId === base.declaration.manifestId) return { verdict: "HELD" };
      return { verdict: "DEFEATED", reason: `case-only manifestId must fold, got ${decision}` };
    },
  });
});