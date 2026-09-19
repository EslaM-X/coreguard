/**
 * CoreGuard AgentProof — Actor Classification Card (CGEP/1:AGENT-PROVENANCE §4).
 *
 * ADDITIVE display layer (never a verdict): the closed `executorType`
 * enumeration and every verification verdict stay untouched. This module maps
 * a normalized executor type onto a marketing-facing bucket
 * (HUMAN / AGENT / BOT / ROBOT / COMPANY / OTHER) + the declared identity
 * `manufacturer` / `model` / `modelVersion`, and labels the result as DECLARED
 * (self-claim) with NO detection claim: a bucket is derived from the declared
 * enum value and is `provenance: "declared"` in every case — this module never
 * invents, infers, or verifies an actor's true nature.
 *
 * PURPOSE (product): CoreGuard transactions are signed by agents, bots, and
 * programs, not only humans. The Actor Card is the user-visible answer to
 * "who signed this?" — WHAT IS DECLARED, with its confidence ceiling honest.
 */

import { normalizeExecutorType } from "./taxonomy.js";
import { IDENTITY_FIELDS } from "./identity.js";

/** Marketing buckets in the ORDER Web3 users expect them on the card. */
export const ACTOR_BUCKETS = Object.freeze(["HUMAN", "AGENT", "BOT", "ROBOT", "COMPANY", "OTHER"]);

export const ACTOR_BUCKET_SET = new Set(ACTOR_BUCKETS);

/**
 * Declared executor type → marketing bucket (pure display mapping).
 *
 *   HUMAN        → HUMAN
 *   AI_AGENT     → AGENT
 *   BOT          → BOT
 *   AUTOMATION   → ROBOT          (physical/RPA-style automation)
 *   ORGANIZATION → COMPANY
 *   CUSTODIAN    → COMPANY        (institutional custody = an org actor)
 *   everything else (UNKNOWN,
 *   MULTISIG, SMART_CONTRACT,
 *   PROTOCOL)    → OTHER
 */
export function bucketForExecutorType(value) {
  const normalized = normalizeExecutorType(value);
  switch (normalized) {
    case "HUMAN":
      return "HUMAN";
    case "AI_AGENT":
      return "AGENT";
    case "BOT":
      return "BOT";
    case "AUTOMATION":
      return "ROBOT";
    case "ORGANIZATION":
    case "CUSTODIAN":
      return "COMPANY";
    default:
      return "OTHER";
  }
}

/**
 * Human-safe display labels (bilingual — Arabic is the source of truth per
 * repo convention; EN mirrors it).
 */
export const BUCKET_LABELS = Object.freeze({
  HUMAN: Object.freeze({ ar: "إنسان", en: "Human" }),
  AGENT: Object.freeze({ ar: "وكيل ذكي", en: "Agent" }),
  BOT: Object.freeze({ ar: "بوت", en: "Bot" }),
  ROBOT: Object.freeze({ ar: "روبوت / أتمتة", en: "Robot / Automation" }),
  COMPANY: Object.freeze({ ar: "شركة / منظمة", en: "Company / Organization" }),
  OTHER: Object.freeze({ ar: "أخرى (عقد ذكي، بروتوكول…)", en: "Other (smart contract, protocol…)" }),
});

/** Model card slot names (mirrors IDENTITY_PATHS but display-oriented). */
export const MODEL_SLOTS = Object.freeze({
  MAKE: "maker",
  MODEL: "model",
  MODEL_VERSION: "modelVersion",
});

function stringOrNull(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Classify ONE manifest's declared actor + identity into a display card.
 *
 * @param {object} manifest  validated untrusted manifest (envelope + declared)
 * @returns {object} card
 */
export function classifyActor(manifest) {
  const declared = (manifest && manifest.declared) || {};
  const executorType = normalizeExecutorType(declared.executorType);
  const bucket = bucketForExecutorType(executorType);

  const identity = (declared && declared.identity) || {};
  const manufacturer = stringOrNull(identity.manufacturer);
  const model = stringOrNull(identity.model);
  const modelVersion = stringOrNull(identity.modelVersion);

  return {
    bucket,
    bucketLabels: BUCKET_LABELS[bucket],
    declaredType: executorType,
    model: {
      [MODEL_SLOTS.MAKE]: manufacturer,
      [MODEL_SLOTS.MODEL]: model,
      [MODEL_SLOTS.MODEL_VERSION]: modelVersion,
    },
    modelLabel: [manufacturer, model].filter(Boolean).join(" / ") || null,
    provenance: "declared",
    honest: true,
    note: "bucket and model are SELF-DECLARED; CoreGuard never detects or verifies the true nature of an actor.",
  };
}

/** Render a ready-to-print Arabic/EN one-liner for the card. */
export function actorCardLine(card, lang = "en") {
  const label = (lang === "ar" ? card.bucketLabels.ar : card.bucketLabels.en);
  if (card.modelLabel) return `${label} (${card.modelLabel})`;
  return label;
}