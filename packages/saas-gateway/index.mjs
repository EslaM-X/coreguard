/**
 * packages/saas-gateway/index.mjs
 * CoreGuard SaaS Gateway — SAAS-GW/1
 *
 * Payment gateway for CoreGuard SaaS using x402 micropayments.
 * Supports subscription plans, pay-per-use, and enterprise billing.
 */

import { buildChallenge, createX402Harness } from "../x402/index.mjs";

export const SAAS_GW_VERSION = "SAAS-GW/1";

export const PLANS = Object.freeze({
  free: { name: "Free", price: 0, verifications: 100, badges: 3, support: "community" },
  starter: { name: "Starter", price: 9900, verifications: 1000, badges: 5, support: "email" },
  professional: { name: "Professional", price: 49900, verifications: 10000, badges: -1, support: "priority" },
  enterprise: { name: "Enterprise", price: null, verifications: -1, badges: -1, support: "dedicated" },
});

export function createSubscription({ plan, customerId, network = "core-testnet2" }) {
  const p = PLANS[plan];
  if (!p) return { ok: false, error: `unknown plan: ${plan}` };
  if (!customerId) return { ok: false, error: "customerId required" };

  const subId = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (p.price === null) {
    return {
      ok: true,
      subscriptionId: subId,
      plan,
      customerId,
      status: "PENDING_QUOTE",
      note: "Enterprise pricing requires custom quote. Contact sales.",
      contact: "inquire@coredao.org",
    };
  }

  const challenge = buildChallenge({
    resource: `/saas/subscribe/${plan}`,
    amountCents: p.price,
    reason: `coreguard-saas-${plan}`,
    payTo: customerId,
  });

  return {
    ok: true,
    subscriptionId: subId,
    plan,
    customerId,
    price: p.price,
    priceDisplay: `$${(p.price / 100).toFixed(2)}/month`,
    verifications: p.verifications === -1 ? "unlimited" : p.verifications,
    badges: p.badges === -1 ? "unlimited" : p.badges,
    support: p.support,
    challenge,
    status: "PENDING_PAYMENT",
    paymentPlan: {
      method: "x402.challenge",
      args: { challenge },
      submit: false,
      mode: "DRY_RUN",
    },
  };
}

export function payPerUse({ customerId, verifications, network = "core-testnet2" }) {
  if (!customerId) return { ok: false, error: "customerId required" };
  if (!verifications || verifications <= 0) return { ok: false, error: "verifications must be positive" };

  const costCents = verifications * 1; // $0.01 per verification
  const challenge = buildChallenge({
    resource: "/saas/verify",
    amountCents: costCents,
    reason: "coreguard-verify-pay-per-use",
    payTo: customerId,
  });

  return {
    ok: true,
    customerId,
    verifications,
    costCents,
    costDisplay: `$${(costCents / 100).toFixed(2)}`,
    challenge,
    status: "PENDING_PAYMENT",
  };
}

export function badgeService({ customerId, badges, network = "core-testnet2" }) {
  if (!customerId) return { ok: false, error: "customerId required" };
  if (!badges || badges <= 0) return { ok: false, error: "badges must be positive" };

  const costCents = badges * 4900; // $49/badge/month

  return {
    ok: true,
    customerId,
    badges,
    costCents,
    costDisplay: `$${(costCents / 100).toFixed(2)}/month`,
    status: "PENDING_PAYMENT",
  };
}

export function saasStatus() {
  return {
    version: SAAS_GW_VERSION,
    runMode: "DRY_RUN",
    plans: Object.keys(PLANS),
    paymentMethods: ["card", "crypto", "x402"],
    currencies: ["USD", "USDC", "USDT", "BTC", "ETH", "PI"],
    networks: ["core-dao", "stellar", "pi-network"],
  };
}

export default {
  SAAS_GW_VERSION,
  PLANS,
  createSubscription,
  payPerUse,
  badgeService,
  saasStatus,
};