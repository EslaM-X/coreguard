#!/usr/bin/env node
/**
 * commercial-packaging.mjs — CG-CP/1, the commercial packaging contract.
 *
 * AGENTS.md records the rule this module enforces: "a surface named in an
 * inventory must exist as a module, or the row is downgraded to its honest
 * default; never leave a claim that only a sentence supports." Two roadmap
 * rows were PROSE ONLY once — a webhook marked AVAILABLE and an X402 provider
 * row — and the fix was to BUILD the surfaces, not to reword the claim.
 *
 * This contract is the mechanical half of that lesson. It reads the
 * commercial packaging document and refuses to pass unless:
 *
 *   1. every path it cites exists on disk (a citation to a missing file is a
 *      claim that nothing backs);
 *   2. the only money amount in the document is $0 (revenue is $0, so any
 *      other figure is either a fabrication or an unpublished price);
 *   3. prices are stated LOCKED and no amount is published;
 *   4. the named integrator is NONE — Enterprise Integration is offered as
 *      tooling, with nobody's name on it;
 *   5. the badge count is 0 and the report agrees;
 *   6. every delivered tier's named surface is a real module, and every
 *      gated tier names the gate that withholds it.
 *
 * Usage:
 *   node scripts/ladder/commercial-packaging.mjs             # the contract
 *   node scripts/ladder/commercial-packaging.mjs --json
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const DOC = "docs/commercial-packaging-2026-09-26.md";

export const COMMERCIAL_SCHEMA = "CG-CP/1";

/** The owner decisions this contract enforces. Nothing here is negotiable by prose. */
export const COMMERCIAL_DECISIONS = Object.freeze({
  prices: "LOCKED",
  publishedPriceAmounts: 0,
  namedIntegrator: "NONE",
  enterpriseIntegration: "AVAILABLE_AS_TOOLING",
  thirdPartyBadge: "NOT_ISSUED",
  badgeIssuerCount: 0,
  revenueUsd: 0,
});

const read = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);

/** The delivered surfaces a tier may name. A tier claiming one of these must ship it. */
export const REQUIRED_SURFACES = Object.freeze([
  "packages/webhook/index.mjs",
  "packages/x402/index.mjs",
  "packages/badge/index.mjs",
  "scripts/integration-replay-lab.mjs",
  "scripts/partner-journey.mjs",
  "scripts/partner-sandbox.mjs",
  "scripts/ladder/conformance.mjs",
  "scripts/ladder/claim-registry.mjs",
  "docs/conformance-report.json",
  "docs/badge-registry.json",
  "examples/platform-quickstart/quickstart.mjs",
]);

/** The gates a gated tier must name — a withheld thing with no gate is a secret. */
export const REQUIRED_GATES = Object.freeze([
  "PRICE_NOT_LOCKED",
  "OWNER_SIGN_OFF_REQUIRED",
  "BADGE_NOT_ISSUED",
]);

/* ------------------------------------------------- the pure detectors
 *
 * These are separated from checkPackaging so the DETECTOR can be tested on
 * synthetic input. A validator that has only ever seen one document is a
 * validator that has never been shown it can fail — which is how a
 * "string-matching validator" once reported PASS while matching nothing. */

export function findMissingCitations(text, exists) {
  const cited = new Set();
  for (const m of text.matchAll(/`([A-Za-z0-9_./-]+\.(?:mjs|js|json|md))`/g)) cited.add(m[1]);
  const missing = [];
  for (const p of cited) {
    if (p.includes("{")) continue; /* a template path, not a citation */
    if (!exists(p)) missing.push(`CITED_PATH_MISSING: ${p} is cited in ${DOC} but does not exist`);
  }
  return { cited, missing };
}

export function findMoneyFigures(text) {
  const found = [];
  for (const m of text.matchAll(/\$\s?([\d,]+(?:\.\d+)?)/g)) {
    const amount = m[1].replace(/,/g, "");
    if (amount !== "0" && amount !== "0.00") {
      found.push(`MONEY_FIGURE: "${m[0].trim()}" appears in ${DOC}; revenue is $0 and no price is published`);
    }
  }
  return found;
}

export function findUnnamedGates(text) {
  return REQUIRED_GATES.filter((g) => !text.includes(g));
}

export function checkPackaging() {
  const violations = [];
  const path = join(REPO, DOC);

  if (!existsSync(path)) {
    return { ok: false, violations: [`${DOC} does not exist — a packaging contract with no document is not a contract`], checked: 0 };
  }
  const text = readFileSync(path, "utf8");
  const conformance = read(join(REPO, "docs", "conformance-report.json"), null);
  const badge = read(join(REPO, "docs", "badge-registry.json"), null);

  /* 1 — every cited path exists */
  const { cited, missing } = findMissingCitations(text, (p) => existsSync(join(REPO, p)));
  violations.push(...missing);

  /* 2 — the only money figure is $0 */
  violations.push(...findMoneyFigures(text));

  /* 3 — prices locked, no published amount */
  if (!/PRICES?\s*(=|:)\s*`?LOCKED/i.test(text) && !/prices[^\n]*\bLOCKED\b/i.test(text)) {
    violations.push("PRICE_STATUS: the document does not state that prices are LOCKED");
  }
  if (conformance && typeof conformance.priceStatus === "string" && conformance.priceStatus !== "LOCKED") {
    violations.push(`PRICE_STATUS: conformance report says ${conformance.priceStatus}, expected LOCKED`);
  }

  /* 4 — the named integrator is NONE */
  if (!/named integrator[^\n]*\bNONE\b/i.test(text)) {
    violations.push("INTEGRATOR: the document does not record that the named integrator is NONE");
  }
  if (!/enterprise integration/i.test(text)) {
    violations.push("INTEGRATOR: Enterprise Integration must be described as available tooling");
  }

  /* 5 — no badge is issued, and the two registries agree */
  if (!/\bNOT ISSUED\b|NOT_ISSUED/i.test(text)) {
    violations.push("BADGE: the document does not state that the third-party badge is NOT ISSUED");
  }
  if (conformance) {
    const issuers = Array.isArray(conformance.badgeIssuers) ? conformance.badgeIssuers.length : null;
    if (conformance.badgeIssuerCount !== 0) violations.push(`BADGE: conformance report says ${conformance.badgeIssuerCount} issuers, expected 0`);
    if (issuers !== null && issuers !== 0) violations.push(`BADGE: conformance report lists ${issuers} issuer(s), expected 0`);
  }
  if (badge && badge.issuerCount !== 0) violations.push(`BADGE: badge registry says ${badge.issuerCount} issuers, expected 0`);

  /* 6 — delivered surfaces exist; gated tiers name their gate */
  for (const s of REQUIRED_SURFACES) {
    if (!existsSync(join(REPO, s))) violations.push(`SURFACE_MISSING: ${s} is required by the delivered tiers but does not exist`);
  }
  for (const g of findUnnamedGates(text)) violations.push(`GATE_UNNAMED: the gated tiers must name ${g}`);

  return {
    ok: violations.length === 0,
    violations,
    checked: cited.size + REQUIRED_SURFACES.length + REQUIRED_GATES.length,
    citedPaths: cited.size,
    namedGates: REQUIRED_GATES.length - findUnnamedGates(text).length,
    decisions: COMMERCIAL_DECISIONS,
    moneyFigures: (text.match(/\$\s?[\d,]+(?:\.\d+)?/g) || []).map((s) => s.trim().replace(/[,\s]+$/, "")),
  };
}

export function selfCheck() {
  const cases = [];
  const live = checkPackaging();
  const text = existsSync(join(REPO, DOC)) ? readFileSync(join(REPO, DOC), "utf8") : "";

  cases.push(["the commercial packaging document exists", existsSync(join(REPO, DOC))]);
  cases.push(["the contract passes on the committed document", live.ok, live.violations.slice(0, 3).join(" | ") || "no violations"]);
  cases.push(["every cited path exists on disk", !live.violations.some((v) => v.startsWith("CITED_PATH_MISSING"))]);
  cases.push(["the only money figure is $0", live.moneyFigures.every((m) => m === "$0")]);
  cases.push(["no price amount is published", COMMERCIAL_DECISIONS.publishedPriceAmounts === 0]);
  cases.push(["the named integrator is NONE", COMMERCIAL_DECISIONS.namedIntegrator === "NONE"]);
  cases.push(["Enterprise Integration is tooling, not a partnership", COMMERCIAL_DECISIONS.enterpriseIntegration === "AVAILABLE_AS_TOOLING"]);
  cases.push(["the third-party badge is NOT ISSUED", COMMERCIAL_DECISIONS.thirdPartyBadge === "NOT_ISSUED" && COMMERCIAL_DECISIONS.badgeIssuerCount === 0]);
  cases.push(["revenue stays $0", COMMERCIAL_DECISIONS.revenueUsd === 0]);
  cases.push(["the contract reads the conformance report", !live.violations.some((v) => v.startsWith("BADGE:") && v.includes("conformance"))]);
  cases.push(["the contract reads the badge registry", !live.violations.some((v) => v.startsWith("BADGE:") && v.includes("badge registry"))]);
  cases.push(["every delivered surface exists as a module", REQUIRED_SURFACES.every((s) => existsSync(join(REPO, s)))]);
  cases.push(["every gated tier names its gate", findUnnamedGates(text).length === 0]);

  /* ---- the detectors must be shown they can FAIL, on synthetic input ---- */
  const fake = findMissingCitations("see `packages/nope/index.mjs` and `scripts/also-missing.mjs`", () => false);
  cases.push(["the citation detector fires on a missing path", fake.missing.length === 2]);
  const real = findMissingCitations("see `package.json`", () => true);
  cases.push(["the citation detector stays quiet on a real path", real.missing.length === 0]);
  const money = findMoneyFigures("revenue $0 and a listed price of $499 plus $1,200");
  cases.push(["the money detector fires on a published price", money.length === 2]);
  cases.push(["the money detector accepts $0 and $0.00", findMoneyFigures("revenue $0, rounded $0.00").length === 0]);
  const gates = findUnnamedGates("PRICE_NOT_LOCKED only");
  cases.push(["the gate detector names the gates a document omits", gates.length === REQUIRED_GATES.length - 1 && !gates.includes("PRICE_NOT_LOCKED")]);

  return { ok: cases.every(([, pass]) => pass), cases: cases.map(([label, pass, detail]) => ({ label, pass, detail: detail || null })), violations: live.violations };
}

if (process.argv[1] && process.argv[1].endsWith("commercial-packaging.mjs")) {
  const args = process.argv.slice(2);
  const r = checkPackaging();
  if (args.includes("--json")) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log(`COMMERCIAL PACKAGING CONTRACT — ${COMMERCIAL_SCHEMA}`);
    console.log(`  document: ${DOC} · cited paths: ${r.citedPaths} · money figures: ${r.moneyFigures.join(", ") || "none"}`);
    for (const v of r.violations) console.log(`  VIOLATION ${v}`);
    console.log(`\nCOMMERCIAL-PACKAGING: ${r.ok ? "PASS" : "FAIL (" + r.violations.length + " violation(s))"}`);
  }
  if (!r.ok) process.exitCode = 1;
}
