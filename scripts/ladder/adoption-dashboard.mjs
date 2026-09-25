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