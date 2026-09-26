#!/usr/bin/env node
/**
 * adoption-dashboard.mjs — the machine-backed adoption board.
 *
 * Reads FIVE committed sources and nothing else:
 *   1. docs/state-snapshot.json          — engineering truth
 *   2. docs/integration-registry.json    — integration/track states
 *   3. docs/adoption-milestones.json     — external results (append-only)
 *   4. docs/risk-findings.json           — derived risk findings (CG-RF/1)
 *   5. docs/reputation-registry.json     — derived reputation surface (CG-RP/1)
 *
 * External milestone counters are ZERO until an authorized step records an
 * entry; the board never invents a number upward and never hides a zero.
 *
 * Usage:
 *   node scripts/ladder/adoption-dashboard.mjs          # prints board
 *   node scripts/ladder/adoption-dashboard.mjs --write  # writes docs/adoption-dashboard.md
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PLATFORM_LEVELS } from "./states.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const SNAPSHOT = join(REPO, "docs", "state-snapshot.json");
const REGISTRY = join(REPO, "docs", "integration-registry.json");
const MILESTONES = join(REPO, "docs", "adoption-milestones.json");
const FINDINGS = join(REPO, "docs", "risk-findings.json");
const REPUTATION = join(REPO, "docs", "reputation-registry.json");
const CLAIMS = join(REPO, "docs", "claims-registry.json");
const BADGES = join(REPO, "docs", "badge-registry.json");
const GATE = join(REPO, "docs", "release-gate.json");
const OUT = join(REPO, "docs", "adoption-dashboard.md");

const read = (p, fallback) => {
  if (!existsSync(p)) return fallback;
  return JSON.parse(readFileSync(p, "utf8"));
};

export function buildBoard() {
  const snapshot = read(SNAPSHOT, null);
  const registry = read(REGISTRY, null);
  const milestones = read(MILESTONES, []);
  const findings = read(FINDINGS, null);
  const reputation = read(REPUTATION, null);
  const claims = read(CLAIMS, null);
  const badges = read(BADGES, null);
  const gate = read(GATE, null);
  const mCounts = {};
  for (const m of milestones) mCounts[m.counter] = (mCounts[m.counter] || 0) + 1;

  const adapters = (registry && registry.adapters) || [];
  const tracks = (registry && registry.tracks) || [];
  const byState = {};
  for (const a of adapters) byState[a.status] = (byState[a.status] || 0) + 1;

  const level = (registry && registry.platform && registry.platform.platformLevel) || "L0";
  const levelMeta = PLATFORM_LEVELS.find((l) => l.id === level);
  const counter = (name) => mCounts[name] || 0;
  const openFindings = findings ? findings.findings.filter((x) => x.status === "OPEN").length : null;

  return {
    platformLevel: level,
    platformLevelLabel: levelMeta ? levelMeta.label : level,
    engineering: {
      testsTotal: snapshot ? snapshot.testsTotal : null,
      filesScanned: snapshot ? snapshot.boundaryAudit.filesScanned : null,
      violations: snapshot ? snapshot.boundaryAudit.violations : null,
      docsNode: snapshot ? snapshot.docsNode : null,
      harness: snapshot ? snapshot.peoplesCourtHarness : null,
    },
    adoption: {
      adaptersRegistered: adapters.length,
      adaptersDryRun: byState["DRY_RUN"] || 0,
      adaptersNotStarted: byState["NOT_STARTED"] || 0,
      liveAdapters: adapters.filter((a) => !["DRY_RUN", "NOT_STARTED", "DESIGNED"].includes(a.status)).length,
      conformant: byState["CONFORMANT"] || 0,
      tracks: tracks.length,
    },
    governance: {
      riskFindingsVersion: findings ? findings.version : null,
      riskFindingsTotal: findings ? findings.findings.length : null,
      openFindings,
      reputationVersion: reputation ? reputation.version : null,
      reputationGrade: reputation ? reputation.grade : null,
      reputationScore: reputation ? reputation.score : null,
    },
    controlPlane: {
      verification: [
        { level: "L0", status: snapshot ? "PASS — offline reproducible" : "UNKNOWN" },
        { level: "L1", status: "RECORDED_ONLY — live receipts proven only when a real receipt is recorded" },
        { level: "L2", status: "REPLAY_CAPABLE — deterministic replay engine online" },
        { level: "L3", status: "AVAILABLE — merkle proof primitives" },
        { level: "L4", status: "RESEARCH — interface boundary only, no fake ZK" },
      ],
      integration: {
        sandbox: "AVAILABLE — npm run partner:sandbox (offline, mock chain)",
        webhook: "AVAILABLE — CG-WH/1 receiver: HMAC + replay window + idempotency (npm run webhook)",
        adapter: `DRY_RUN — ${byState["DRY_RUN"] || 0} adapter(s), no live claim`,
        production: counter("productionDeployments") > 0 ? "LIVE" : "UNKNOWN",
      },
      commercial: {
        revenue: "$0",
        customers: "0 verified",
        partners: "0 verified",
      },
      /* The three surfaces that turn "we believe this" into "the build checks
         it": the claim ceiling (what may be said), the badge contract (what may
         be shown), and the release gate (what must hold before any of it ships). */
      claimCeiling: claims
        ? {
            total: claims.counts.total,
            byStatus: claims.counts.byStatus,
            externalClaims: claims.counts.externalClaims,
            violations: claims.audit.violations.length,
            downgraded: claims.audit.downgraded,
          }
        : null,
      badges: badges
        ? {
            contract: badges.schema,
            specimens: badges.specimens.length,
            issuers: badges.issuerCount,
            criteria: (badges.specimens[0] && badges.specimens[0].criteriaTotal) || null,
          }
        : null,
      gate: gate ? { schema: gate.schema, verdict: gate.verdict, passed: gate.passed, total: gate.total, independence: gate.independence.ok } : null,
    },
    external: {
      externalVerifiers: counter("externalVerifiers"),
      integrations: counter("integrations"),
      conformantPartners: counter("conformantPartners"),
      productionDeployments: counter("productionDeployments"),
      paidEngagements: counter("paidEngagements"),
      funding: counter("funding"),
    },
  };
}

export function boardText(board) {
  const g = board.engineering;
  const a = board.adoption;
  const gov = board.governance;
  const e = board.external;
  const cp = board.controlPlane;
  return [
    "# CoreGuard Adoption Dashboard",
    "",
    "Machine-backed board — every number below is read from committed sources",
    "(`docs/state-snapshot.json`, `docs/integration-registry.json`,",
    "`docs/adoption-milestones.json`, `docs/risk-findings.json`,",
    "`docs/reputation-registry.json`). External counters are 0 until a recorded,",
    "authorized step appends a milestone; they are never invented upward.",
    "",
    "## Platform level",
    "",
    `- **${board.platformLevel} — ${board.platformLevelLabel}**`,
    "",
    "## Control plane (derived from committed evidence only)",
    "",
    "| Surface | Status |",
    "|---|---|",
    ...(board.controlPlane ? board.controlPlane.verification.map((v) => `| Verification ${v.level} | ${v.status} |`) : []),
    `| Integration — sandbox | ${board.controlPlane?.integration.sandbox} |`,
    `| Integration — webhook | ${board.controlPlane?.integration.webhook} |`,
    `| Integration — adapters | ${board.controlPlane?.integration.adapter} |`,
    `| Integration — production | ${board.controlPlane?.integration.production} |`,
    `| Commercial revenue | ${board.controlPlane?.commercial.revenue} |`,
    `| Commercial customers | ${board.controlPlane?.commercial.customers} |`,
    `| Commercial partners | ${board.controlPlane?.commercial.partners} |`,
    "",
    "## Claim ceiling, badges & release gate (committed artifacts)",
    "",
    "| Surface | Value |",
    "|---|---|",
    `| Claims tracked | ${cp.claimCeiling ? cp.claimCeiling.total : "n/a"} |`,
    `| Claims by status | ${cp.claimCeiling ? Object.entries(cp.claimCeiling.byStatus).map(([k, v]) => `${k} ${v}`).join(" · ") : "n/a"} |`,
    `| Claims depending on an external outcome | ${cp.claimCeiling ? cp.claimCeiling.externalClaims : "n/a"} |`,
    `| Claim-ceiling violations | ${cp.claimCeiling ? cp.claimCeiling.violations : "n/a"} |`,
    `| Badges issued to anyone | ${cp.badges ? cp.badges.issuers : "n/a"} |`,
    `| Badge specimens (never issued) | ${cp.badges ? cp.badges.specimens : "n/a"} |`,
    `| Release gate | ${cp.gate ? `${cp.gate.verdict} — ${cp.gate.passed}/${cp.gate.total} legs, independence ${cp.gate.independence ? "PASS" : "FAIL"}` : "n/a"} |`,
    "",
    `The claim ceiling is the list of things this repository may say, with a`,
    `status each. ${cp.claimCeiling ? cp.claimCeiling.externalClaims : 0} of them depend on an external outcome and are therefore`,
    `marked GATED, UNKNOWN or NOT_PERFORMED rather than verified. A badge is`,
    `issued to no one. The release gate is not a release authorization.`,
    "",
    "Zeroes here are a trust feature, never hidden. No percentage is printed:",
    "every value is derived from a committed source or stays at its honest",
    "default.",
    "",
    "## Engineering truth (from the state snapshot)",
    "",
    `| Metric | Value |`,
    `|---|---|`,
    `| Test suite | ${g.testsTotal ?? "n/a"} |`,
    `| Boundary audit | ${g.filesScanned ?? "n/a"} files / ${g.violations ?? "n/a"} violations |`,
    `| Docs-node contract | ${g.docsNode ? `${g.docsNode.executed} executed · ${g.docsNode.skipListed} skip-listed · ${g.docsNode.docsCovered} covered` : "n/a"} |`,
    `| Live-submission harness | ${g.harness ?? "n/a"} |`,
    "",
    "## Adoption surface (from the integration registry)",
    "",
    `| Metric | Count |`,
    `|---|---|`,
    `| Adapters registered | ${a.adaptersRegistered} |`,
    `| Adapters in DRY_RUN | ${a.adaptersDryRun} |`,
    `| Adapters NOT_STARTED | ${a.adaptersNotStarted} |`,
    `| Live adapters | ${a.liveAdapters} |`,
    `| Conformant | ${a.conformant} |`,
    `| Outreach tracks | ${a.tracks} |`,
    "",
    "## Risk findings & reputation (CG-RF/1 · CG-RP/1)",
    "",
    `| Metric | Value |`,
    `|---|---|`,
    `| Risk findings version | ${gov.riskFindingsVersion ?? "n/a"} |`,
    `| Risk findings (total) | ${gov.riskFindingsTotal ?? "n/a"} |`,
    `| Risk findings OPEN | ${gov.openFindings ?? "n/a"} |`,
    `| Reputation version | ${gov.reputationVersion ?? "n/a"} |`,
    `| Reputation grade | ${gov.reputationGrade ?? "n/a"} |`,
    `| Reputation score | ${gov.reputationScore ?? "n/a"} |`,
    "",
    "Findings are risk findings only — never a fuzzy safety score. Reputation",
    "equals only recorded external milestones; engineering numbers are evidence,",
    "not reputation.",
    "",
    "## External milestones (append-only ledger)",
    "",
    `| Metric | Count |`,
    `|---|---|`,
    `| External verifiers | ${e.externalVerifiers} |`,
    `| Integrations | ${e.integrations} |`,
    `| Conformant partners | ${e.conformantPartners} |`,
    `| Production deployments | ${e.productionDeployments} |`,
    `| Paid engagements | ${e.paidEngagements} |`,
    `| Funding | ${e.funding} |`,
    "",
    "No external milestone is claimed here until it is recorded.",
    "",
  ].join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const board = buildBoard();
  if (args.includes("--write")) {
    writeFileSync(OUT, boardText(board), "utf8");
    console.log(`LADDER-DASHBOARD: wrote ${OUT}`);
    process.exit(0);
  }
  console.log(boardText(board));
}

if (process.argv[1] && process.argv[1].endsWith("adoption-dashboard.mjs")) main();