/**
 * CoreGuard AgentProof — Actor Identity Card (CGEP/1:AGENT-PROVENANCE §4 + §6).
 *
 * Product-facing "Who executed this?" card. It is a DISPLAY layer: it never
 * invents a bucket, never guesses persona, never fabricates a model. It reads
 * two already-computed inputs and combines them:
 *
 *   1. the declared executor type + declared identity (manufacturer/model/
 *      modelVersion) — via `classifyActor` (self-claim, provenance: declared);
 *   2. the verifier's honest badge state (`DECLARED` / `ATTESTED` / `VERIFIED` /
 *      `NOT_PROVEN`) — with the truth-table rule that a HUMAN is never
 *      VERIFIED (personality is never inferred; trust comes only from an
 *      attestation or a signer-bound declaration).
 *
 * Honesty boundary (spec §6 + trust-levels doc):
 *   - HUMAN-ness renders DECLARED or ATTESTED at most — never VERIFIED.
 *   - AUTOMATION/ROBOT, BOT, AGENT may reach VERIFIED when the signer binding
 *     + manifest proof are verified and no attestation contradicts.
 *   - manufacturer / model / modelVersion are self-declared → `declared`
 *     provenance; they are displayed, never asserted as verified fact.
 *
 * The card is deterministic, zero-IO, and safe to render in UI/CLI/DApp.
 */

import { classifyActor, ACTOR_BUCKETS } from "./actor-card.js";
import { normalizeExecutorType } from "./taxonomy.js";

/**
 * Combine the verifier verdict map with an Actor Card.
 *
 * @param {object} card  output of `classifyActor(manifest)`
 * @param {object} out   output of `verifyProvenance(...)` ({ verdicts, summary, errors })
 * @returns {object} identityCard
 */
export function composeIdentityCard(card, out) {
  const verdicts = (out && out.verdicts) || {};
  const executor = verdicts.EXECUTOR_TYPE || {};
  const executorType = normalizeExecutorType(executor.executorType);
  const bucket = card && card.bucket ? card.bucket : "OTHER";

  const attested = (verdicts.ATTESTATION_RECOGNITION || {}).status === "OK";
  const verified =
    Boolean(out && out.summary) && String(out.summary).startsWith("MANIFEST_ID_PROVEN");
  const invalid = String(out && out.summary).startsWith("FAIL_CLOSED");

  // Truth table: human-ness is declared/attested at most; never VERIFIED.
  let trust;
  if (invalid) {
    trust = "NOT_PROVEN";
  } else if (executorType === "HUMAN") {
    trust = attested ? "ATTESTED" : verified ? "DECLARED" : "NOT_PROVEN";
  } else {
    trust = attested ? "ATTESTED" : verified ? "VERIFIED" : "NOT_PROVEN";
  }

  const persona = {
    HUMAN: { ar: "إنسان", en: "Human" },
    AGENT: { ar: "وكيل ذكي", en: "AI agent" },
    BOT: { ar: "بوت آلي", en: "Bot" },
    ROBOT: { ar: "روبوت / أتمتة", en: "Robot / automation" },
    COMPANY: { ar: "شركة / منظمة", en: "Company / organization" },
    OTHER: { ar: "أخرى / غير معلنة", en: "Other / undeclared" },
  }[bucket] || { ar: "غير معلنة", en: "Undeclared" };

  const trustLabel = {
    VERIFIED: { ar: "موثَّق (مُثبَت)", en: "Verified (proven)" },
    ATTESTED: { ar: "مُصدَّق من جهة موثوقة", en: "Attested by a trusted issuer" },
    DECLARED: { ar: "مُعلَن ذاتيًّا", en: "Declared (self-claim)" },
    NOT_PROVEN: { ar: "غير مُثبَت", en: "Not proven (fail-closed)" },
  }[trust];

  const model = card && card.model ? card.model : { maker: null, model: null, modelVersion: null };

  return {
    bucket,
    persona,
    trust,
    trustLabel,
    executorType,
    model,
    modelLabel:
      (card && card.modelLabel) ||
      [model.maker, model.model].filter(Boolean).join(" / ") ||
      null,
    provenance: "declared",
    honest: true,
    note:
      "persona and model are self-declared; CoreGuard never detects the true nature of an actor. Human-ness is never shown as verified.",
  };
}

/**
 * Single-call helper: build an Actor Identity Card from a manifest + verify result.
 *
 * @param {object} manifest  validated untrusted manifest (envelope + declared)
 * @param {object} out       output of `verifyProvenance(...)`
 * @returns {object} identityCard
 */
export function identityCardFor(manifest, out) {
  return composeIdentityCard(classifyActor(manifest), out);
}

/**
 * Render a ready-to-print bilingual one-liner for the card.
 * `lang` = "ar" | "en".
 */
export function identityCardLine(card, lang = "en") {
  const persona = card.persona ? card.persona[lang] : card.persona_EN || card.bucket;
  const trust = card.trustLabel ? card.trustLabel[lang] : card.trust;
  const head = `${persona} — ${trust}`;
  if (card.modelLabel) return `${head} · ${card.modelLabel}`;
  return head;
}

export { ACTOR_BUCKETS };