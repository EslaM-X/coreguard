/**
 * CoreGuard Policy Rule Registry
 *
 * v0.1 ship includes six deterministic rule types. ORACLE_BOUND is available
 * as a guardrail rule beyond the minimal set (used by Oracle Bound benchmarks).
 * P1 adds the four remaining deterministic negative-space rules
 * (TARGET_DENYLIST, RECIPIENT_DENYLIST, SELECTOR_DENYLIST) plus MAX_GAS, so
 * the rule vocabulary fully matches the intent ConstraintType vocabulary.
 * All evaluation is deterministic — no heuristics in verification.
 */

export const RULE_TYPES = {
  VALUE_LIMIT: "VALUE_LIMIT",
  TARGET_ALLOWLIST: "TARGET_ALLOWLIST",
  TARGET_DENYLIST: "TARGET_DENYLIST",
  RECIPIENT_ALLOWLIST: "RECIPIENT_ALLOWLIST",
  RECIPIENT_DENYLIST: "RECIPIENT_DENYLIST",
  SELECTOR_ALLOWLIST: "SELECTOR_ALLOWLIST",
  SELECTOR_DENYLIST: "SELECTOR_DENYLIST",
  DEADLINE: "DEADLINE",
  SLIPPAGE_BPS: "SLIPPAGE_BPS",
  MAX_GAS: "MAX_GAS",
  ORACLE_BOUND: "ORACLE_BOUND",
};

export const RULE_DESCRIPTIONS = {
  VALUE_LIMIT: "Bounds the transferred value between optional min and max",
  TARGET_ALLOWLIST: "Restricts the destination contract to a fixed set",
  TARGET_DENYLIST: "Rejects the destination contract if it appears in a set",
  RECIPIENT_ALLOWLIST: "Restricts the recipient address to a fixed set",
  RECIPIENT_DENYLIST: "Rejects the recipient address if it appears in a set",
  SELECTOR_ALLOWLIST: "Restricts the function selector to a fixed set",
  SELECTOR_DENYLIST: "Rejects the function selector if it appears in a set",
  DEADLINE: "Rejects execution mined after a committed timestamp",
  SLIPPAGE_BPS: "Rejects effective slippage exceeding a committed basis-point bound",
  MAX_GAS: "Rejects execution whose gasUsed exceeds a committed ceiling",
  ORACLE_BOUND: "Guardrail: rejects execution price below a committed floor (beyond minimal six)",
};

export const V01_RULES = [
  RULE_TYPES.VALUE_LIMIT,
  RULE_TYPES.TARGET_ALLOWLIST,
  RULE_TYPES.TARGET_DENYLIST,
  RULE_TYPES.RECIPIENT_ALLOWLIST,
  RULE_TYPES.RECIPIENT_DENYLIST,
  RULE_TYPES.SELECTOR_ALLOWLIST,
  RULE_TYPES.SELECTOR_DENYLIST,
  RULE_TYPES.DEADLINE,
  RULE_TYPES.SLIPPAGE_BPS,
  RULE_TYPES.MAX_GAS,
];

export function isV01Rule(type) {
  return V01_RULES.includes(type);
}