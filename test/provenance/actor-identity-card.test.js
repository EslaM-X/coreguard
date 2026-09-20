/**
 * Actor Identity Card (CGEP/1 §4 + §6 display layer).
 *
 * Combines the declared actor classification with the verifier's honest trust
 * state. Pins the truth table: HUMAN is never VERIFIED; BOT/AGENT/ROBOT may be
 * VERIFIED when signer binding is proven; model stays declared provenance.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  composeIdentityCard,
  identityCardFor,
  identityCardLine,
} from "../../packages/provenance/actor-identity-card.js";
import { classifyActor } from "../../packages/provenance/actor-card.js";

function cardFor({ executorType, summary, attested, identity }) {
  const manifest = {
    version: "CGEP/1",
    manifestKind: "STAMP",
    declared: {
      signerBinding: { address: "0x" + "11".repeat(20) },
      executorType,
      ...(identity ? { identity } : {}),
    },
    signature: { scheme: "EIP-712", signer: "0x" + "11".repeat(20) },
  };
  const out = {
    summary,
    verdicts: {
      EXECUTOR_TYPE: { executorType, status: "DECLARED", strongest: "DECLARED", advisory: true },
      ATTESTATION_RECOGNITION: attested ? { status: "OK" } : { status: "NOT_PROVEN", label: "NONE" },
    },
    errors: [],
  };
  return { manifest, out };
}

test("HUMAN is DECLARED when signer verified but not attested — never VERIFIED", () => {
  const { manifest, out } = cardFor({ executorType: "HUMAN", summary: "MANIFEST_ID_PROVEN" });
  const card = identityCardFor(manifest, out);
  assert.equal(card.bucket, "HUMAN");
  assert.equal(card.trust, "DECLARED");
  assert.equal(card.persona.ar, "إنسان");
  assert.notEqual(card.trust, "VERIFIED");
});

test("HUMAN + attestation => ATTESTED (not VERIFIED)", () => {
  const { manifest, out } = cardFor({ executorType: "HUMAN", summary: "MANIFEST_ID_PROVEN", attested: true });
  const card = identityCardFor(manifest, out);
  assert.equal(card.trust, "ATTESTED");
  assert.match(card.trustLabel.en, /Attested/);
});

test("BOT reaches VERIFIED when signer binding proven", () => {
  const { manifest, out } = cardFor({ executorType: "BOT", summary: "MANIFEST_ID_PROVEN" });
  const card = identityCardFor(manifest, out);
  assert.equal(card.bucket, "BOT");
  assert.equal(card.trust, "VERIFIED");
  assert.equal(card.persona.ar, "بوت آلي");
});

test("AUTOMATION/ROBOT + identity model => modelLabel present, declared provenance", () => {
  const { manifest, out } = cardFor({
    executorType: "AUTOMATION",
    summary: "MANIFEST_ID_PROVEN",
    identity: { manufacturer: "core-robotics", model: "arm-x1", modelVersion: "1.2" },
  });
  const card = identityCardFor(manifest, out);
  assert.equal(card.bucket, "ROBOT");
  assert.equal(card.trust, "VERIFIED");
  assert.equal(card.modelLabel, "core-robotics / arm-x1");
  assert.equal(card.model.maker, "core-robotics");
  assert.equal(card.provenance, "declared");
  assert.match(identityCardLine(card, "ar"), /روبوت/);
  assert.match(identityCardLine(card, "en"), /Robot/);
});

test("COMPANY bucket for ORGANIZATION executor", () => {
  const { manifest, out } = cardFor({ executorType: "ORGANIZATION", summary: "MANIFEST_ID_PROVEN" });
  const card = identityCardFor(manifest, out);
  assert.equal(card.bucket, "COMPANY");
  assert.equal(card.persona.en, "Company / organization");
});

test("FAIL_CLOSED summary => NOT_PROVEN trust even for verified-looking types", () => {
  const { manifest, out } = cardFor({ executorType: "AI_AGENT", summary: "FAIL_CLOSED: schema invalid" });
  const card = identityCardFor(manifest, out);
  assert.equal(card.trust, "NOT_PROVEN");
});

test("composeIdentityCard honors explicit verdicts map (no manifest needed)", () => {
  const card = composeIdentityCard(classifyActor({
    version: "CGEP/1",
    manifestKind: "STAMP",
    declared: { signerBinding: { address: "0x" + "22".repeat(20) }, executorType: "AI_AGENT" },
    signature: { scheme: "EIP-712", signer: "0x" + "22".repeat(20) },
  }), {
    summary: "MANIFEST_ID_PROVEN",
    verdicts: {
      EXECUTOR_TYPE: { executorType: "AI_AGENT" },
      ATTESTATION_RECOGNITION: { status: "NOT_PROVEN", label: "NONE" },
    },
    errors: [],
  });
  assert.equal(card.bucket, "AGENT");
  assert.equal(card.trust, "VERIFIED");
  assert.equal(card.honest, true);
  assert.match(card.note, /never detects/);
});

test("identityCardLine renders bilingual persona + trust + model", () => {
  const { manifest, out } = cardFor({
    executorType: "BOT",
    summary: "MANIFEST_ID_PROVEN",
    identity: { manufacturer: "acme", model: "trader", modelVersion: "3" },
  });
  const card = identityCardFor(manifest, out);
  assert.match(identityCardLine(card, "ar"), /بوت آلي — موثَّق/);
  assert.match(identityCardLine(card, "ar"), /acme \/ trader/);
  assert.match(identityCardLine(card, "en"), /Bot — Verified/);
});