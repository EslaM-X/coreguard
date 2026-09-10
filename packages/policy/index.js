/**
 * CoreGuard Policy Engine
 *
 * Deterministic policy evaluation. No heuristics in verification.
 */

import { canonicalize, hashPolicy } from "../canonical/index.js";

/**
 * Rule result
 */
export const RuleResult = {
  PASS: "PASS",
  FAIL: "FAIL",
};

/**
 * Rule severity
 */
export const Severity = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
};

/**
 * Evaluate a single rule against execution context
 */
function evaluateRule(rule, context) {
  const { type, params } = rule;

  switch (type) {
    case "VALUE_LIMIT": {
      const value = BigInt(context.value);
      const max = params.max ? BigInt(params.max) : null;
      const min = params.min ? BigInt(params.min) : null;
      if (max !== null && value > max) {
        return {
          ruleId: rule.ruleId,
          result: RuleResult.FAIL,
          severity: rule.severity,
          observed: context.value,
          expected: `<= ${params.max}`,
        };
      }
      if (min !== null && value < min) {
        return {
          ruleId: rule.ruleId,
          result: RuleResult.FAIL,
          severity: rule.severity,
          observed: context.value,
          expected: `>= ${params.min}`,
        };
      }
      return {
        ruleId: rule.ruleId,
        result: RuleResult.PASS,
        severity: rule.severity,
        observed: context.value,
      };
    }

    case "TARGET_ALLOWLIST": {
      const allowed = params.targets.map((t) => t.toLowerCase());
      const target = context.target.toLowerCase();
      if (!allowed.includes(target)) {
        return {
          ruleId: rule.ruleId,
          result: RuleResult.FAIL,
          severity: rule.severity,
          observed: target,
          expected: `one of [${allowed.join(", ")}]`,
        };
      }
      return {
        ruleId: rule.ruleId,
        result: RuleResult.PASS,
        severity: rule.severity,
        observed: target,
      };
    }

    case "RECIPIENT_ALLOWLIST": {
      const allowed = params.addresses.map((a) => a.toLowerCase());
      const recipient = context.recipient.toLowerCase();
      if (!allowed.includes(recipient)) {
        return {
          ruleId: rule.ruleId,
          result: RuleResult.FAIL,
          severity: rule.severity,
          observed: recipient,
          expected: `one of [${allowed.join(", ")}]`,
        };
      }
      return {
        ruleId: rule.ruleId,
        result: RuleResult.PASS,
        severity: rule.severity,
        observed: recipient,
      };
    }

    case "SELECTOR_ALLOWLIST": {
      const allowed = params.selectors.map((s) => s.toLowerCase());
      const selector = context.selector.toLowerCase();
      if (!allowed.includes(selector)) {
        return {
          ruleId: rule.ruleId,
          result: RuleResult.FAIL,
          severity: rule.severity,
          observed: selector,
          expected: `one of [${allowed.join(", ")}]`,
        };
      }
      return {
        ruleId: rule.ruleId,
        result: RuleResult.PASS,
        severity: rule.severity,
        observed: selector,
      };
    }

    case "DEADLINE": {
      const deadline = BigInt(params.deadline);
      const blockTimestamp = BigInt(context.blockTimestamp);
      if (blockTimestamp > deadline) {
        return {
          ruleId: rule.ruleId,
          result: RuleResult.FAIL,
          severity: rule.severity,
          observed: String(blockTimestamp),
          expected: `<= ${params.deadline}`,
        };
      }
      return {
        ruleId: rule.ruleId,
        result: RuleResult.PASS,
        severity: rule.severity,
        observed: String(blockTimestamp),
      };
    }

    case "SLIPPAGE_BPS": {
      const maxSlippage = BigInt(params.bps);
      const actualSlippage = BigInt(context.slippageBps || "0");
      if (actualSlippage > maxSlippage) {
        return {
          ruleId: rule.ruleId,
          result: RuleResult.FAIL,
          severity: rule.severity,
          observed: String(actualSlippage),
          expected: `<= ${params.bps}`,
        };
      }
      return {
        ruleId: rule.ruleId,
        result: RuleResult.PASS,
        severity: rule.severity,
        observed: String(actualSlippage),
      };
    }

    case "ORACLE_BOUND": {
      // Guardrail rule (available beyond the minimal six) — floor bps check
      // on an observed execution price relative to a committed reference.
      const floorBps = params.floorBps ? BigInt(params.floorBps) : null;
      const priceBps = BigInt(context.priceBps || "10000");
      if (floorBps !== null && priceBps < floorBps) {
        return {
          ruleId: rule.ruleId,
          result: RuleResult.FAIL,
          severity: rule.severity,
          observed: String(priceBps),
          expected: `>= ${params.floorBps} (ref ${params.ref || "unknown"})`,
        };
      }
      return {
        ruleId: rule.ruleId,
        result: RuleResult.PASS,
        severity: rule.severity,
        observed: String(priceBps),
        expected: `>= ${params.floorBps} (ref ${params.ref || "unknown"})`,
      };
    }

    default:
      return {
        ruleId: rule.ruleId,
        result: RuleResult.FAIL,
        severity: rule.severity,
        observed: "unknown",
        expected: `known rule type`,
      };
  }
}

/**
 * Evaluate a policy against execution context
 */
export function evaluatePolicy(policy, context) {
  const results = policy.rules.map((rule) => evaluateRule(rule, context));
  const allPassed = results.every((r) => r.result === RuleResult.PASS);

  return {
    policyId: policy.policyId,
    result: allPassed ? "SATISFIED" : "VIOLATED",
    rules: results,
  };
}

/**
 * Create a policy
 */
export function createPolicy({ policyId, name, rules }) {
  return {
    version: "CGEP/1",
    policyId,
    name,
    rules,
  };
}

/**
 * Hash a policy
 */
export async function commitPolicy(policy) {
  const canonical = canonicalize(policy);
  const hash = await hashPolicy(policy);
  return { policy, canonical, hash };
}
