#!/usr/bin/env node
/**
 * passport-v2.mjs — the unified Evidence Passport (portable verification
 * identity).
 *
 * A single machine-readable object for any agent/company/integration:
 *   subject, verificationLevel, commitment, receipts, proofs, riskFindings,
 *   reputationMilestones, integrations, claims, unknowns.
 *
 * Deterministic on purpose (fixed key order, no timestamps) so the committed
 * docs/evidence-passport-v2.json is hash-stable on the same tree. Every field
 * is derived from committed surfaces; nothing is invented; zeroes are shown.
 *
 * Usage:
 *   node scripts/passport-v2.mjs          # prints JSON
 *   node scripts/passport-v2.mjs --write  # writes docs/evidence-passport-v2.json
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { commit } from "./ladder/verification-levels.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const read = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);

export const PASSPORT_V2_SCHEMA = "CGEP/1-PASSPORT-V2";

export function buildPassportV2() {
  const registry = read(join(REPO, "docs", "integration-registry.json"), null);
  const findings = read(join(REPO, "docs", "risk-findings.json"), null);
  const reputation = read(join(REPO, "docs", "reputation-registry.json"), null);
  const milestones = read(join(REPO, "docs", "adoption-milestones.json"), []);
  const snapshot = read(join(REPO, "docs", "state-snapshot.json"), null);
  /* The engineering block is derived context, never a claim: a missing or
   * partial snapshot (e.g. mid-`current-state --write`) yields nulls, never a
   * crash — a passport must stay derivable from whatever is committed. */
  const audit = snapshot && snapshot.boundaryAudit ? snapshot.boundaryAudit : null;

  const platformCommitment = commit({
    subject: "coreguard-verification-platform",
    chainId: null,
    policy: [{ id: "CG-CS/1" }, { id: "CG-RF/1" }, { id: "CG-RP/1" }],
  });

  return {
    schemaVersion: PASSPORT_V2_SCHEMA,
    subject: "coreguard-verification-platform",
    verificationLevel: (registry && registry.platform && registry.platform.platformLevel) || "L0",
    commitment: {
      commitmentId: platformCommitment.commitmentId,
      intentHash: platformCommitment.intentHash,
      schemaVersion: platformCommitment.schemaVersion,
      timestamp: null,
      subject: platformCommitment.subject,
      policy: platformCommitment.policy,
    },
    receipts: [],
    proofs: [],
    riskFindings: findings
      ? findings.findings.map((f) => ({
          id: f.id,
          status: f.status,
          severity: f.severity || null,
          rule: f.rule || null,
        }))
      : [],
    reputationMilestones: milestones.map((m) => ({
      counter: m.counter,
      recordedAtUtc: m.recordedAtUtc || null,
      kind: m.kind || m.counter,
      note: m.note || null,
    })),
    reputationGrade: reputation ? reputation.grade : null,
    reputationScore: reputation ? reputation.score : null,
    integrations: registry
      ? registry.adapters.map((a) => ({
          id: a.id,
          status: a.status,
          integrationStatus: a.integrationStatus,
          networkCall: a.networkCall,
        }))
      : [],
    claims: [],
    unknowns: [
      "no external integration receipts yet — L1/L2 proofs are recorded only when a conforming external integration produces them",
      "L4 is RESEARCH; 'ZK supported' is never claimed until a real circuit/prover/verifier exists with a benchmark and conformance",
    ],
    engineering: snapshot
      ? {
          testsTotal: snapshot.testsTotal ?? null,
          filesScanned: audit ? (audit.filesScanned ?? null) : null,
          violations: audit ? (audit.violations ?? null) : null,
          docsNode: snapshot.docsNode ?? null,
        }
      : null,
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--write")) {
    const path = join(REPO, "docs", "evidence-passport-v2.json");
    writeFileSync(path, JSON.stringify(buildPassportV2(), null, 2) + "\n", "utf8");
    console.log(`PASSPORT-V2: wrote ${path}`);
    process.exit(0);
  }
  console.log(JSON.stringify(buildPassportV2(), null, 2));
}

if (process.argv[1] && process.argv[1].endsWith("passport-v2.mjs")) main();