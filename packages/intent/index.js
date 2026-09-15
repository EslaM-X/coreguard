/**
 * CoreGuard Intent Model
 *
 * Canonical representation of user intent.
 */

import { canonicalize, hashIntent } from "@coreguard/canonical";

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
 */
export function createIntent({
  chainId,
  signer,
  nonce = "0",
  validAfter = 0,
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
    chainId: String(chainId),
    signer: signer.toLowerCase(),
    nonce: String(nonce),
    validAfter: String(validAfter),
    validUntil: String(validUntil),
    action,
    target: target.toLowerCase(),
    selector: selector.toLowerCase(),
    asset: asset.toLowerCase(),
    amount: String(amount),
    recipient: recipient.toLowerCase(),
    constraints: constraints.map((c) => ({
      type: c.type,
      value: c.value ? String(c.value) : undefined,
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
