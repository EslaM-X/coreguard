/**
 * CoreGuard AgentProof — Executor Taxonomy (CGEP/1:AGENT-PROVENANCE §4)
 *
 * Enumeration, never free-form: unknown/unsupported `executorType` strings
 * normalize to `UNKNOWN` (a first-class value, not an error). A self-declared
 * type resolves at most to `DECLARED` — authentic, not verified.
 */

export const EXECUTOR_TYPES = Object.freeze([
  "UNKNOWN",
  "HUMAN",
  "AI_AGENT",
  "BOT",
  "AUTOMATION",
  "ORGANIZATION",
  "MULTISIG",
  "CUSTODIAN",
  "SMART_CONTRACT",
  "PROTOCOL",
]);

export const EXECUTOR_TYPE_SET = new Set(EXECUTOR_TYPES);

/** Strongest achievable verification state per executor type (advisory only). */
export const EXECUTOR_STRONGEST = Object.freeze({
  UNKNOWN: "NOT_PROVEN",
  HUMAN: "ATTESTED",
  AI_AGENT: "ATTESTED",
  BOT: "ATTESTED",
  AUTOMATION: "ATTESTED",
  ORGANIZATION: "ATTESTED",
  MULTISIG: "VERIFIED",
  CUSTODIAN: "ATTESTED",
  SMART_CONTRACT: "VERIFIED",
  PROTOCOL: "ATTESTED",
});

/**
 * Normalize a declared executor type to the closed enumeration.
 * Unknown/unsupported/absent → `UNKNOWN` (normal, not an error).
 */
export function normalizeExecutorType(value) {
  if (typeof value !== "string") return "UNKNOWN";
  const upper = value.toUpperCase();
  return EXECUTOR_TYPE_SET.has(upper) ? upper : "UNKNOWN";
}

/**
 * Per-spec §4 rule 3: a self-declared (signer-bound but unattested) type can
 * never resolve stronger than DECLARED, regardless of the enum value.
 */
export function strongestForSelfDeclaration(executorType) {
  return "DECLARED";
}