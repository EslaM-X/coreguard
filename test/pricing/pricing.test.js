/**
 * Pricing plans — must stay HYPOTHESIS-only while the Decision Gate is locked.
 *
 * Rules enforced here (binding, docs/adoption/README.md):
 *   - never bills, never meters, never gates a feature on a plan;
 *   - every machine view is stamped hypothesis: true + gated: true;
 *   - free tier has a defined weekly limit; Pro is unlimited; unknown plan
 *     fails closed (never silently defaults to a paid tier).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  planFor,
  usageGateUnsafe,
  pricingLine,
  pricingTable,
  FREE_TIER,
  PAID_TIER,
  ENTERPRISE_TIER,
  PLANS,
} from "../../packages/pricing/pricing.js";

test("free tier is zero, weekly limit 10, labeled", () => {
  assert.equal(FREE_TIER.priceWei, 0);
  assert.equal(FREE_TIER.weekLimit, 10);
  assert.equal(FREE_TIER.currency, "CORE");
  assert.match(FREE_TIER.labels.ar, /مجاني/);
});

test("pro tier is subscription (hypothesis) + unlimited anchors", () => {
  assert.equal(PAID_TIER.subscriptionWei, 10n ** 18n);
  assert.equal(PAID_TIER.weekLimit, null);
  assert.equal(PAID_TIER.currency, "CORE");
  assert.match(PAID_TIER.labels.en, /hypothesis/);
});

test("enterprise is custom, never auto-priced", () => {
  assert.equal(ENTERPRISE_TIER.custom, true);
  assert.equal(planFor(PLANS.ENTERPRISE).custom, true);
});

test("usageGateUnsafe: free tier allows <= 10 weekly, rejects above (hypothesis only)", () => {
  assert.equal(usageGateUnsafe({ plan: "STARTER", weeklyAnchors: 10 }).allowed, true);
  const over = usageGateUnsafe({ plan: "STARTER", weeklyAnchors: 11 });
  assert.equal(over.allowed, false);
  assert.match(over.reason, /exceeded/);
  assert.equal(over.hypothesis, true);
});

test("usageGateUnsafe: pro is unlimited", () => {
  assert.equal(usageGateUnsafe({ plan: "PRO", weeklyAnchors: 10_000 }).allowed, true);
});

test("unknown plan fails closed — never silent default to paid", () => {
  const r = usageGateUnsafe({ plan: "MEGA-PLATINUM", weeklyAnchors: 5 });
  assert.equal(r.allowed, false);
  assert.match(r.reason, /unknown plan/);
  assert.equal(planFor("MEGA-PLATINUM"), null);
});

test("pricingTable is always stamped gated + hypothesis", () => {
  const t = pricingTable();
  assert.equal(t.gated, true);
  assert.equal(t.version, "1-hypothesis");
  assert.match(t.gateNote, /Decision Gate/);
  assert.equal(t.plans.length, 3);
});

test("pricingLine renders bilingual, free marked FREE", () => {
  assert.match(pricingLine("STARTER", "en"), /FREE/);
  assert.match(pricingLine("PRO", "ar"), /فرضية/);
  assert.match(pricingLine("ENTERPRISE", "en"), /custom/);
});

test("module never references billing/enforcement tokens", () => {
  const src = readFileSync(new URL("../../packages/pricing/pricing.js", import.meta.url), "utf8").toLowerCase();
  for (const token of ["charge", "collectpayment", "card", "invoice", "stripe", "metered"]) {
    assert.ok(!src.includes(token), `pricing module must not contain "${token}" while gated`);
  }
});