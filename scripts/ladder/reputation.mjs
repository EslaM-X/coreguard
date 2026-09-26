#!/usr/bin/env node
/**
 * reputation.mjs — the honest reputation surface (CG-RP/1).
 *
 * Reputation equals ONLY the recorded external milestones in the append-only
 * ledger (docs/adoption-milestones.json). Nothing else in this repository
 * raises it: an engineering number is evidence, not reputation. Each milestone
 * entry contributes exactly one point, regardless of any amount field — the
 * ledger records that SOMETHING happened, it never multiplies value upward.
 *
 * Deterministic on purpose: no timestamps, no commit refs, fixed key order —
 * the committed docs/reputation-registry.json must hash-stable across runs on
 * the same tree. With an empty ledger the grade is UNPROVEN and every counter
 * is exposed at zero; the surface never hides a zero and never invents upward.
 *
 * Usage:
 *   node scripts/ladder/reputation.mjs          # prints JSON
 *   node scripts/ladder/reputation.mjs --write  # writes docs/reputation-registry.json
 *   node scripts/ladder/reputation.mjs --print  # human lines
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const MILESTONES = join(REPO, "docs", "adoption-milestones.json");
const OUT = join(REPO, "docs", "reputation-registry.json");

export const REPUTATION_VERSION = "CG-RP/1";
export const REPUTATION_COUNTERS = Object.freeze([
  "externalVerifiers",
  "integrations",
  "conformantPartners",
  "productionDeployments",
  "paidEngagements",
  "funding",
  "sandboxIntegrations",
  "liveReceipts",
  "multiPartners",
  "commercialUsage",
]);

/**
 * Milestone-kind taxonomy. `class` "external" means a recorded event raised by
 * a real external counterparty (may raise reputation); "internal" means an
 * engineering/evidence signal that is RECORDED but never raises reputation —
 * engineering numbers are evidence, not reputation.
 */
export const MILESTONE_KINDS = Object.freeze({
  TESTS_PASSING: { klass: "internal", raisesReputation: false, counter: null },
  CONFORMANCE_PASS: { klass: "internal", raisesReputation: false, counter: null },
  REPLAY_VERIFIED: { klass: "internal", raisesReputation: false, counter: null },
  EXTERNAL_VERIFIER: { klass: "external", raisesReputation: true, counter: "externalVerifiers" },
  SANDBOX_INTEGRATION: { klass: "external", raisesReputation: true, counter: "sandboxIntegrations" },
  LIVE_RECEIPT: { klass: "external", raisesReputation: true, counter: "liveReceipts" },
  PRODUCTION_INTEGRATION: { klass: "external", raisesReputation: true, counter: "productionDeployments" },
  MULTI_PARTNER: { klass: "external", raisesReputation: true, counter: "multiPartners" },
  COMMERCIAL_USAGE: { klass: "external", raisesReputation: true, counter: "commercialUsage" },
});

export const MILESTONE_RULE =
  "Milestones escalate the ledger surface; only external-class events raise reputation. Engineering numbers (tests, conformance, replay passes) are recorded evidence, never reputation.";
export const GRADE_BANDS = Object.freeze([
  { min: 0, grade: "UNPROVEN", label: "no recorded external milestone — credibility rests on engineering truth alone" },
  { min: 1, grade: "EARLY-EVIDENCE", label: "at least one recorded external milestone" },
  { min: 5, grade: "VERIFIED-START", label: "five or more recorded external milestones" },
]);
export const REPUTATION_RULE =
  "Reputation equals only the recorded external milestones; nothing else in this repository raises it. An engineering number is evidence, not reputation.";

/**
 * @param {Object} inputs { milestones, snapshot }
 * @returns {{version, grade, gradeLabel, score, rule, basis, counters}}
 */
export function buildReputation(inputs = {}) {
  const milestones = inputs.milestones || [];
  const counters = Object.fromEntries(REPUTATION_COUNTERS.map((c) => [c, 0]));
  let recognized = 0;
  const internalRecorded = [];
  for (const m of milestones) {
    const kind = MILESTONE_KINDS[m.kind || m.counter];
    if (kind && kind.klass === "external" && counters[kind.counter] !== undefined) {
      counters[kind.counter] += 1;
      recognized += 1;
    } else if (kind && kind.klass === "internal") {
      internalRecorded.push({ kind: m.kind, note: m.note || null });
    } else if (!kind && counters[m.counter] !== undefined) {
      counters[m.counter] += 1;
      recognized += 1;
    }
  }
  const score = recognized;
  const band = [...GRADE_BANDS].reverse().find((b) => score >= b.min);
  return {
    version: REPUTATION_VERSION,
    grade: band.grade,
    gradeLabel: band.label,
    score,
    rule: REPUTATION_RULE,
    basis: {
      ledger: "docs/adoption-milestones.json",
      counters: REPUTATION_COUNTERS,
      kinds: MILESTONE_KINDS,
      milestoneRule: MILESTONE_RULE,
    },
    counters,
    internalRecorded,
  };
}

export function build(inputs = {}) {
  const milestones = inputs.milestones || (existsSync(MILESTONES) ? JSON.parse(readFileSync(MILESTONES, "utf8")) : []);
  return buildReputation({ milestones });
}

export function reputationText(rep) {
  const lines = [];
  lines.push(`COREGUARD REPUTATION — ${rep.version}`);
  lines.push(`grade: ${rep.grade}  score: ${rep.score}`);
  lines.push(`  ${rep.gradeLabel}`);
  lines.push("");
  lines.push("counters (recorded external milestones only):");
  for (const [k, v] of Object.entries(rep.counters)) lines.push(`  ${k.padEnd(22)} ${v}`);
  lines.push("");
  lines.push(rep.rule);
  return lines.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const rep = build();
  if (args.includes("--write")) {
    writeFileSync(OUT, JSON.stringify(rep, null, 2) + "\n", "utf8");
    console.log(`LADDER-REPUTATION: wrote ${OUT}`);
    process.exit(0);
  }
  if (args.includes("--print")) {
    console.log(reputationText(rep));
    return;
  }
  console.log(JSON.stringify(rep, null, 2));
}

if (process.argv[1] && process.argv[1].endsWith("reputation.mjs")) main();