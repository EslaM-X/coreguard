/**
 * CoreGuard Intent Model
 *
 * Canonical representation of user intent.
 */

import { canonicalize, hashIntent, securityUint } from "@coreguard/canonical";

/**
 * Intent action types
 */
export const ActionType = {
  TRANSFER: "TRANSFER",
  SWAP: "SWAP",
  DEPOSIT: "DEPOSIT",
  WITHDRAW: "WITHDRAW",
  BORROW: "BORROW",
  REPAY: "REPAY",
  STAKE: "STAKE",
  UNSTAKE: "UNSTAKE",
  CUSTOM: "CUSTOM",
};

/**
 * Constraint types
 */
export const ConstraintType = {
  MAX_VALUE: "MAX_VALUE",
  MIN_VALUE: "MIN_VALUE",
  TARGET_ALLOWLIST: "TARGET_ALLOWLIST",
  TARGET_DENYLIST: "TARGET_DENYLIST",
  RECIPIENT_ALLOWLIST: "RECIPIENT_ALLOWLIST",
  RECIPIENT_DENYLIST: "RECIPIENT_DENYLIST",
  SELECTOR_ALLOWLIST: "SELECTOR_ALLOWLIST",
  SELECTOR_DENYLIST: "SELECTOR_DENYLIST",
  DEADLINE: "DEADLINE",
  SLIPPAGE_BPS: "SLIPPAGE_BPS",
  MAX_GAS: "MAX_GAS",
  CUSTOM: "CUSTOM",
};

/**
 * Create a canonical intent
 *
 * Security-critical integers (chainId, nonce, validAfter, validUntil, amount)
 * are guarded by securityUint: JS Numbers are rejected outright (silent 2^53
 * rounding hazard); canonical decimal strings and bigints are accepted and
 * normalized. constraint.value shares the same rule where present.
 */
export function createIntent({
  chainId,
  signer,
  nonce = "0",
  validAfter = "0",
  validUntil,
  action,
  target,
  selector,
  asset,
  amount,
  recipient,
  constraints = [],
}) {
  return {
    version: "CGEP/1",
    chainId: securityUint("chainId", chainId),
    signer: signer.toLowerCase(),
    nonce: securityUint("nonce", nonce),
    validAfter: securityUint("validAfter", validAfter),
    validUntil: validUntil === undefined || validUntil === null ? undefined : securityUint("validUntil", validUntil),
    action,
    target: target.toLowerCase(),
    selector: selector.toLowerCase(),
    asset: asset.toLowerCase(),
    amount: securityUint("amount", amount),
    recipient: recipient.toLowerCase(),
    constraints: constraints.map((c) => ({
      type: c.type,
      value: c.value === undefined || c.value === null ? undefined : securityUint("constraint.value", c.value),
      addresses: c.addresses
        ? c.addresses.map((a) => a.toLowerCase())
        : undefined,
    })),
  };
}

/**
 * Hash an intent
 */
export async function commitIntent(intent) {
  const canonical = canonicalize(intent);
  const hash = await hashIntent(intent);
  return { intent, canonical, hash };
}
