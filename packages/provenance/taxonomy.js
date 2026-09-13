/**
 * CoreGuard AgentProof — Executor Taxonomy (CGEP/1:AGENT-PROVENANCE §4)
 *
 * Enumeration, never free-form: unknown/unsupported `executorType` strings
 * normalize to `UNKNOWN` (a first-class value, not an error). A self-declared
 * type resolves at most to `DECLARED` — authentic, not verified.
 *
 * EOA BOUNDARY (Q10, 2026-09-13): Phase A verifies EOA signer binding only
 * (secp256k1 EIP-712 recovery → declared signer → tx.from). Executor types
 * whose authorization lives in a smart contract (MULTISIG, SMART_CONTRACT)
 * are NOT verifiable by an EOA signature of an associated party; they require
 * an explicit authorization path (e.g. EIP-1271) in a later phase. Their
 * advisory `EXECUTOR_STRONGEST` is therefore NOT_PROVEN in Phase A — never a
 * claimed VERIFIED from mere EOA cryptography.
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

/**
 * Strongest achievable verification state per executor type — Phase A scope
 * (advisory only). MULTISIG / SMART_CONTRACT are NOT_PROVEN: in this phase no
 * ECDSA path can prove a smart-contract authorization (EIP-1271 = Phase B).
 */
export const EXECUTOR_STRONGEST = Object.freeze({
  UNKNOWN: "NOT_PROVEN",
  HUMAN: "ATTESTED",
  AI_AGENT: "ATTESTED",
  BOT: "ATTESTED",
  AUTOMATION: "ATTESTED",
  ORGANIZATION: "ATTESTED",
  MULTISIG: "NOT_PROVEN",
  CUSTODIAN: "ATTESTED",
  SMART_CONTRACT: "NOT_PROVEN",
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