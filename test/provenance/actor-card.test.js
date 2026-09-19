/**
 * Actor Classification Card — display layer over the closed executorType enum.
 *
 * The card is a declared (self-claim) projection: it NEVER detects or verifies
 * the true nature of an actor. These tests pin the mapping + honesty bounds.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyActor,
  bucketForExecutorType,
  actorCardLine,
  ACTOR_BUCKETS,
  BUCKET_LABELS,
} from "../../packages/provenance/actor-card.js";
import { normalizeExecutorType } from "../../packages/provenance/taxonomy.js";

function stampManifest({ executorType, identity = null }) {
  const declared = { signerBinding: { address: "0x" + "11".repeat(20) }, executorType };
  if (identity) declared.identity = identity;
  return {
    version: "CGEP/1",
    manifestKind: "STAMP",
    declared,
    signature: { scheme: "EIP-712", signer: declared.signerBinding.address },
  };
}

test("actor-card: HUMAN → HUMAN bucket, declared provenance, honest flag", () => {
  const card = classifyActor(stampManifest({ executorType: "HUMAN" }));
  assert.equal(card.bucket, "HUMAN");
  assert.equal(card.declaredType, "HUMAN");
  assert.equal(card.provenance, "declared");
  assert.equal(card.honest, true);
  assert.ok(card.note.includes("never detects"));
});

test("actor-card: AI_AGENT → AGENT bucket", () => {
  assert.equal(bucketForExecutorType("AI_AGENT"), "AGENT");
  assert.equal(classifyActor(stampManifest({ executorType: "AI_AGENT" })).bucket, "AGENT");
});

test("actor-card: BOT → BOT bucket", () => {
  assert.equal(bucketForExecutorType("BOT"), "BOT");
});

test("actor-card: AUTOMATION → ROBOT bucket (display mapping)", () => {
  assert.equal(bucketForExecutorType("AUTOMATION"), "ROBOT");
});

test("actor-card: ORGANIZATION / CUSTODIAN → COMPANY bucket", () => {
  assert.equal(bucketForExecutorType("ORGANIZATION"), "COMPANY");
  assert.equal(bucketForExecutorType("CUSTODIAN"), "COMPANY");
});

test("actor-card: UNKNOWN / SMART_CONTRACT / PROTOCOL → OTHER bucket", () => {
  assert.equal(bucketForExecutorType("UNKNOWN"), "OTHER");
  assert.equal(bucketForExecutorType("SMART_CONTRACT"), "OTHER");
  assert.equal(bucketForExecutorType("PROTOCOL"), "OTHER");
  assert.equal(bucketForExecutorType("banana-ish"), "OTHER");
});

test("actor-card: model card carries maker/model/modelVersion only when declared", () => {
  const card = classifyActor(
    stampManifest({
      executorType: "AI_AGENT",
      identity: { manufacturer: "core-labs", model: "guardian", modelVersion: "2.1.0" },
    }),
  );
  assert.deepEqual(card.model, { maker: "core-labs", model: "guardian", modelVersion: "2.1.0" });
  assert.equal(card.modelLabel, "core-labs / guardian");
});

test("actor-card: missing identity → null slots (never fabricated make)", () => {
  const card = classifyActor(stampManifest({ executorType: "BOT" }));
  assert.deepEqual(card.model, { maker: null, model: null, modelVersion: null });
  assert.equal(card.modelLabel, null);
  assert.equal(actorCardLine(card, "en"), "Bot");
  assert.equal(actorCardLine(card, "ar"), "بوت");
});

test("actor-card: identity with only target null-fields stays declared", () => {
  const card = classifyActor(
    stampManifest({ executorType: "HUMAN", identity: { manufacturer: null, model: null, modelVersion: null } }),
  );
  assert.equal(card.bucket, "HUMAN");
  assert.equal(card.model.maker, null);
});

test("actor-card: closed enum NOT mutated — normalizeExecutorType unchanged", () => {
  // Ensures this additive layer did not widen the spec enumeration.
  assert.equal(normalizeExecutorType("ROBOT"), "UNKNOWN");
  assert.deepEqual(ACTOR_BUCKETS, ["HUMAN", "AGENT", "BOT", "ROBOT", "COMPANY", "OTHER"]);
});

test("actor-card: bucket labels are bilingual, Arabic is source of truth", () => {
  assert.equal(BUCKET_LABELS.HUMAN.ar, "إنسان");
  assert.equal(BUCKET_LABELS.HUMAN.en, "Human");
  assert.equal(BUCKET_LABELS.BOT.ar, "بوت");
  assert.equal(BUCKET_LABELS.AGENT.ar, "وكيل ذكي");
});

test("actor-card: line renders bilingual make/model", () => {
  const card = classifyActor(
    stampManifest({
      executorType: "AUTOMATION",
      identity: { manufacturer: "core-machines", model: "loader-x", modelVersion: "0.9" },
    }),
  );
  assert.equal(actorCardLine(card, "ar"), "روبوت / أتمتة (core-machines / loader-x)");
  assert.equal(actorCardLine(card, "en"), "Robot / Automation (core-machines / loader-x)");
});