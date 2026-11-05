/**
 * packages/stellar/dex-gating.mjs
 * CoreGuard Stellar DEX Gating — DEX-GATE/1
 *
 * Real DEX gating for Stellar Soroban DEX.
 * Verifies swaps, path payments, and liquidity provision before execution.
 * Fail-closed: UNKNOWN → HELD (never silently pass).
 */

export const DEX_GATE_VERSION = "DEX-GATE/1";

export const GATE_VERDICTS = Object.freeze({
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
  HELD: "HELD",
  UNKNOWN: "UNKNOWN",
});

/**
 * Gate a Soroban DEX swap
 * Verifies: source, destination, amount, minAmount, path, policy
 */
export function gateSwap({ source, destination, amount, minAmount, path = [], policy = {}, network = "testnet" } = {}) {
  // Fail-closed: required fields
  if (!source) return { verdict: GATE_VERDICTS.HELD, reason: "source required", allowed: false };
  if (!destination) return { verdict: GATE_VERDICTS.HELD, reason: "destination required", allowed: false };
  if (!amount || amount <= 0) return { verdict: GATE_VERDICTS.HELD, reason: "amount must be positive", allowed: false };
  if (minAmount && minAmount > amount) return { verdict: GATE_VERDICTS.REJECTED, reason: "minAmount exceeds amount", allowed: false };

  // Policy checks
  const rules = policy.rules || [];
  for (const rule of rules) {
    if (rule.type === "max_amount" && amount > rule.value) {
      return { verdict: GATE_VERDICTS.REJECTED, reason: `amount ${amount} exceeds max ${rule.value}`, allowed: false };
    }
    if (rule.type === "deny_destination" && rule.value === destination) {
      return { verdict: GATE_VERDICTS.REJECTED, reason: `destination ${destination} is denied`, allowed: false };
    }
    if (rule.type === "deny_source" && rule.value === source) {
      return { verdict: GATE_VERDICTS.REJECTED, reason: `source ${source} is denied`, allowed: false };
    }
  }

  // Slippage check
  if (minAmount && amount > 0) {
    const slippage = (amount - minAmount) / amount;
    const maxSlippage = policy.maxSlippage || 0.05;
    if (slippage > maxSlippage) {
      return { verdict: GATE_VERDICTS.REJECTED, reason: `slippage ${slippage.toFixed(4)} exceeds max ${maxSlippage}`, allowed: false };
    }
  }

  // Path validation
  if (path && path.length > 0) {
    for (const hop of path) {
      if (!hop || typeof hop !== "string") {
        return { verdict: GATE_VERDICTS.HELD, reason: "invalid path hop", allowed: false };
      }
    }
  }

  const swapId = `swap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    verdict: GATE_VERDICTS.VERIFIED,
    reason: "swap verified",
    allowed: true,
    swapId,
    source,
    destination,
    amount,
    minAmount: minAmount || amount,
    path,
    network,
    policy: policy.rules || [],
    txPlan: {
      method: "swap",
      args: { source, destination, amount, minAmount, path },
      submit: false,
      mode: "PLAN_ONLY",
      note: "Verification passed. Execute with Soroban RPC + Freighter.",
    },
  };
}

/**
 * Gate a path payment
 */
export function gatePathPayment({ source, destination, sendAsset, destAsset, sendAmount, destMin, path = [], policy = {}, network = "testnet" } = {}) {
  if (!source) return { verdict: GATE_VERDICTS.HELD, reason: "source required", allowed: false };
  if (!destination) return { verdict: GATE_VERDICTS.HELD, reason: "destination required", allowed: false };
  if (!sendAmount || sendAmount <= 0) return { verdict: GATE_VERDICTS.HELD, reason: "sendAmount must be positive", allowed: false };

  const rules = policy.rules || [];
  for (const rule of rules) {
    if (rule.type === "max_amount" && sendAmount > rule.value) {
      return { verdict: GATE_VERDICTS.REJECTED, reason: `sendAmount ${sendAmount} exceeds max ${rule.value}`, allowed: false };
    }
    if (rule.type === "deny_destination" && rule.value === destination) {
      return { verdict: GATE_VERDICTS.REJECTED, reason: `destination ${destination} is denied`, allowed: false };
    }
  }

  const paymentId = `pathpay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    verdict: GATE_VERDICTS.VERIFIED,
    reason: "path payment verified",
    allowed: true,
    paymentId,
    source,
    destination,
    sendAsset,
    destAsset,
    sendAmount,
    destMin,
    path,
    network,
    txPlan: {
      method: "path_payment_strict_send",
      args: { source, destination, sendAsset, destAsset, sendAmount, destMin, path },
      submit: false,
      mode: "PLAN_ONLY",
    },
  };
}

/**
 * Gate liquidity provision
 */
export function gateProvideLiquidity({ source, pool, amountA, amountB, minA, minB, policy = {}, network = "testnet" } = {}) {
  if (!source) return { verdict: GATE_VERDICTS.HELD, reason: "source required", allowed: false };
  if (!pool) return { verdict: GATE_VERDICTS.HELD, reason: "pool required", allowed: false };
  if (!amountA || amountA <= 0) return { verdict: GATE_VERDICTS.HELD, reason: "amountA must be positive", allowed: false };
  if (!amountB || amountB <= 0) return { verdict: GATE_VERDICTS.HELD, reason: "amountB must be positive", allowed: false };

  const rules = policy.rules || [];
  for (const rule of rules) {
    if (rule.type === "max_amount" && (amountA > rule.value || amountB > rule.value)) {
      return { verdict: GATE_VERDICTS.REJECTED, reason: `amount exceeds max ${rule.value}`, allowed: false };
    }
  }

  const lpId = `lp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    verdict: GATE_VERDICTS.VERIFIED,
    reason: "liquidity provision verified",
    allowed: true,
    lpId,
    source,
    pool,
    amountA,
    amountB,
    minA,
    minB,
    network,
    txPlan: {
      method: "provide_liquidity",
      args: { source, pool, amountA, amountB, minA, minB },
      submit: false,
      mode: "PLAN_ONLY",
    },
  };
}

/**
 * Intent-to-Execution conformance check
 * Compares authorized intent with actual execution
 */
export function checkConformance({ intent, execution } = {}) {
  if (!intent) return { verdict: GATE_VERDICTS.HELD, reason: "intent required", allowed: false };
  if (!execution) return { verdict: GATE_VERDICTS.HELD, reason: "execution required", allowed: false };

  const mismatches = [];

  // Check source
  if (intent.source && execution.source && intent.source !== execution.source) {
    mismatches.push({ field: "source", expected: intent.source, actual: execution.source });
  }

  // Check destination
  if (intent.destination && execution.destination && intent.destination !== execution.destination) {
    mismatches.push({ field: "destination", expected: intent.destination, actual: execution.destination });
  }

  // Check amount
  if (intent.amount && execution.amount && parseFloat(intent.amount) !== parseFloat(execution.amount)) {
    mismatches.push({ field: "amount", expected: intent.amount, actual: execution.amount });
  }

  // Check asset
  if (intent.asset && execution.asset && intent.asset !== execution.asset) {
    mismatches.push({ field: "asset", expected: intent.asset, actual: execution.asset });
  }

  if (mismatches.length > 0) {
    return {
      verdict: GATE_VERDICTS.REJECTED,
      reason: `conformance failed: ${mismatches.length} mismatch(es)`,
      allowed: false,
      mismatches,
    };
  }

  return {
    verdict: GATE_VERDICTS.VERIFIED,
    reason: "execution conforms to intent",
    allowed: true,
    mismatches: [],
  };
}

/**
 * Status
 */
export function status() {
  return {
    version: DEX_GATE_VERSION,
    runMode: "PLAN_ONLY",
    features: ["swap", "path_payment", "provide_liquidity", "conformance_check"],
    note: "Plan only. Requires Soroban RPC + Freighter to execute.",
  };
}

export default {
  DEX_GATE_VERSION,
  GATE_VERDICTS,
  gateSwap,
  gatePathPayment,
  gateProvideLiquidity,
  checkConformance,
  status,
};