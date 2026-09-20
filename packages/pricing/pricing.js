/**
 * CoreGuard Pricing Plans — honest, hypothesis-marked, code-shaped.
 *
 * GOVERNANCE RULE (binding, docs/adoption/README.md + economics.md):
 * pricing decisions stay LOCKED until Counterparty #1 (ElizaOS) is recorded
 * and the Decision Gate runs. This module therefore renders a HYPOTHESIS
 * pricing table, labeled as such in every output, and provides ZERO
 * enforcement — it never bills and never gates a feature on a plan.
 * `usageGateUnsafe` returns an advisory flag only, never a lock. It exists
 * so the product surface (CLI/DApp/docs) can show the proposed structure
 * consistently while the gate is closed.
 *
 * The API is pure/read-only: given a plan key + a usage count it computes the
 * hypothesis cost/limits. When the gate opens, this module is the single
 * place to flip the real numbers — nothing else in the repo reads prices.
 */

export const PRICING_VERSION = "1-hypothesis";

export const PLANS = Object.freeze({
  STARTER: "STARTER",
  PRO: "PRO",
  ENTERPRISE: "ENTERPRISE",
});

export const FREE_TIER = Object.freeze({
  id: "STARTER",
  currency: "CORE",
  priceWei: 0,
  period: "weekly",
  weekLimit: 10,
  labels: {
    ar: "Starter — مجاني (beta محدودة)",
    en: "Starter — free (limited beta)",
  },
});

export const PAID_TIER = Object.freeze({
  id: "PRO",
  currency: "CORE",
  subscriptionWei: 10n ** 18n, // 1 CORE / month (hypothesis — gated)
  perAnchorWei: 0n, // flat commission handled by on-chain feeWei (DApp)
  weekLimit: null, // unlimited
  labels: {
    ar: "Pro — اشتراك شهري (فرضية)",
    en: "Pro — monthly subscription (hypothesis)",
  },
});

export const ENTERPRISE_TIER = Object.freeze({
  id: "ENTERPRISE",
  currency: "CORE",
  custom: true,
  labels: {
    ar: "Enterprise / فريق Core — مخصص (فرضية)",
    en: "Enterprise / Core team — custom (hypothesis)",
  },
});

/** Plan lookup by key; unknown key → null (fail-closed, no silent default). */
export function planFor(key) {
  const k = String(key || "").toUpperCase();
  if (k === PLANS.STARTER) return { ...FREE_TIER };
  if (k === PLANS.PRO) return { ...PAID_TIER };
  if (k === PLANS.ENTERPRISE) return { ...ENTERPRISE_TIER };
  return null;
}

/**
 * Hypothesis gate result for a usage count.
 *
 * @param {object} opts { plan, weeklyAnchors }
 * @returns {{ allowed: boolean, reason: string, hypothesis: true }}
 */
export function usageGateUnsafe({ plan, weeklyAnchors = 0 }) {
  const p = planFor(plan);
  if (!p) return { allowed: false, reason: "unknown plan (fail-closed)", hypothesis: true };
  if (p.custom) return { allowed: true, reason: `custom plan — ${p.labels.en}`, hypothesis: true };
  const limit = p.weekLimit;
  if (limit === null) return { allowed: true, reason: "unlimited", hypothesis: true };
  const allowed = weeklyAnchors <= limit;
  return {
    allowed,
    reason: allowed ? `within free tier (${weeklyAnchors}<=${limit} weekly)` : `free tier exceeded: ${weeklyAnchors}>${limit} weekly`,
    hypothesis: true,
  };
}

/**
 * Render a single bilingual pricing line (label + price + note).
 */
export function pricingLine(key, lang = "en") {
  const p = planFor(key);
  if (!p) return `[unknown plan: ${key}]`;
  const label = (p.labels && p.labels[lang]) || p.labels.en;
  const price =
    p.custom ? "(custom)" :
    p.priceWei === 0 ? "FREE" :
    `${Number(p.priceWei) / 10 ** 18} CORE/${p.period} (hypothesis)`;
  return `${label} — ${price}`;
}

/**
 * Machine-readable, always-hypothesis-marked view of all plans.
 */
export function pricingTable() {
  return {
    version: PRICING_VERSION,
    gated: true,
    gateNote:
      "Prices are HYPOTHESES; the Decision Gate (after ElizaOS / Counterparty #1) is the only path to committed pricing.",
    plans: [FREE_TIER, PAID_TIER, ENTERPRISE_TIER],
  };
}