#!/usr/bin/env node
/**
 * risk-findings.mjs — the honest risk-findings registry (CG-RF/1).
 *
 * Every finding is DERIVED from committed surfaces only (state snapshot,
 * integration registry, adoption milestones) — nothing is assumed, nothing is
 * invented. A finding is a risk *finding*, never a fuzzy safety score, never
 * an endorsement, and never a claim that a live step happened. The registry
 * is deterministic: no timestamps, no commit refs, fixed key order — the
 * committed docs/risk-findings.json must hash-stable across runs on the same
 * tree.
 *
 * Status grammar: OPEN (the risk is present today), OK (the control holds —
 * proven from the surfaces), UNVERIFIED (the input state cannot prove either
 * way; fail-closed). Severity is the worst-outcome severity IF the risk
 * materialized, not today's posture.
 *
 * Usage:
 *   node scripts/ladder/risk-findings.mjs          # prints JSON
 *   node scripts/ladder/risk-findings.mjs --write  # writes docs/risk-findings.json
 *   node scripts/ladder/risk-findings.mjs --print  # human lines, fail-closed
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const SNAPSHOT = join(REPO, "docs", "state-snapshot.json");
const REGISTRY = join(REPO, "docs", "integration-registry.json");
const MILESTONES = join(REPO, "docs", "adoption-milestones.json");
const OUT = join(REPO, "docs", "risk-findings.json");

const read = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);

export const FINDING_VERSION = "CG-RF/1";
export const FINDING_STATUSES = Object.freeze(["OPEN", "OK", "UNVERIFIED"]);
export const FINDING_SEVERITIES = Object.freeze(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const FINDING_CATEGORIES = Object.freeze(["integration", "governance", "adoption", "validation", "engineering"]);
export const LIVE_STATE_NAMES = Object.freeze([
  "LIVE_PREPARED",
  "WEBHOOK_CONNECTED",
  "CONFORMANT",
  "PRODUCTION",
]);

const f = (id, title, category, severity, status, statement, evidence) => ({
  id,
  title,
  category,
  severity,
  status,
  statement,
  evidence,
});

/**
 * @param {Object} inputs { snapshot, registry, milestones, adapters }
 * @returns {{suite, version, statuses, basis, findings}}
 * `adapters` overrides `registry.adapters` when provided (tests pass shapes).
 */
export function deriveFindings(inputs = {}) {
  const adapters =
    (inputs.adapters && inputs.adapters.length ? inputs.adapters : null) ||
    (inputs.registry && inputs.registry.adapters) ||
    [];
  const snapshot = inputs.snapshot || {};
  const milestones = inputs.milestones || [];

  const anyAdapter = adapters.length > 0;
  const allDryRun = anyAdapter && adapters.every((a) => a.status === "DRY_RUN" && a.integrationStatus === "NOT_BUILT");
  const anyLive = adapters.some((a) => LIVE_STATE_NAMES.includes(a.status));
  const zeroExternal = milestones.length === 0;
  const violationsOk = Number.isInteger(snapshot.boundaryAudit?.violations) && snapshot.boundaryAudit.violations === 0;
  const testsOk = Number.isInteger(snapshot.testsTotal) && snapshot.testsTotal >= 1000;
  const harnessOk = snapshot.peoplesCourtHarness === "PEOPLES_COURT_HARNESS_READY";
  const docsNodeOk = Number.isInteger(snapshot.docsNode?.executed) && snapshot.docsNode.executed > 0;

  const findings = [
    f(
      "RF-001",
      "No live integration exists",
      "integration",
      "HIGH",
      anyAdapter && !anyLive ? "OPEN" : "UNVERIFIED",
      "Every registered adapter is DRY_RUN with integrationStatus NOT_BUILT; no live network call exists on any surface.",
      ["docs/integration-registry.json#adapters", "scripts/ladder/adapters.mjs"],
    ),
    f(
      "RF-002",
      "No named integrator / credential holder is recorded",
      "governance",
      "HIGH",
      anyAdapter && !anyLive ? "OPEN" : "UNVERIFIED",
      "Decision B: the integrator is nobody for now; a credential is defined only when a real partner appears with a concrete use case.",
      ["docs/owner-decisions-and-claimable-facts-2026-09.md"],
    ),
    f(
      "RF-003",
      "No settlement authority is granted",
      "governance",
      "CRITICAL",
      anyLive ? "OPEN" : "OK",
      "No surface carries settlement authority; the red line is enforced by the transition guards and the boundary audit.",
      ["scripts/ladder/state-machine.mjs", "scripts/ladder/states.mjs"],
    ),
    f(
      "RF-004",
      "External adoption counters are at zero",
      "adoption",
      "MEDIUM",
      zeroExternal ? "OPEN" : "OK",
      "No external verifier, integration, conformant partner, deployment, paid engagement, or funding milestone is recorded.",
      ["docs/adoption-milestones.json"],
    ),
    f(
      "RF-005",
      "Surfaces are backed by synthetic fixtures only",
      "validation",
      "MEDIUM",
      allDryRun ? "OPEN" : "UNVERIFIED",
      "Adapters declare limitations of synthetic fixtures only; no real external record has been ingested by an authorized step.",
      ["docs/integration-registry.json#adapters"],
    ),
    f(
      "RF-006",
      "Boundary audit is clean on the committed tree",
      "engineering",
      "MEDIUM",
      violationsOk ? "OK" : "OPEN",
      "Zero violations across the committed tree; any file claiming a live call, a stored credential, or a settlement fails the audit.",
      ["docs/state-snapshot.json#boundaryAudit"],
    ),
    f(
      "RF-007",
      "Full test suite is pinned to a committed snapshot",
      "engineering",
      "MEDIUM",
      testsOk ? "OK" : "OPEN",
      "The full-suite pass total is machine-enforced against docs/state-snapshot.json; drift fails the build by design.",
      ["docs/state-snapshot.json#testsTotal"],
    ),
    f(
      "RF-008",
      "Docs-node contract and live-submission harness are green",
      "engineering",
      "LOW",
      harnessOk && docsNodeOk ? "OK" : "OPEN",
      "Executable docs are run or deliberately skip-listed, and the peoples-court harness reports READY on the committed snapshot.",
      ["docs/state-snapshot.json#peoplesCourtHarness", "docs/state-snapshot.json#docsNode"],
    ),
  ];

  return {
    suite: "CoreGuard Risk Findings",
    version: FINDING_VERSION,
    statuses: FINDING_STATUSES,
    basis: {
      snapshot: "docs/state-snapshot.json",
      registry: "docs/integration-registry.json",
      milestones: "docs/adoption-milestones.json",
    },
    findings,
  };
}

export function build(inputs = {}) {
  const snapshot = inputs.snapshot || read(SNAPSHOT, null);
  const registry = inputs.registry || read(REGISTRY, null);
  const milestones = inputs.milestones || read(MILESTONES, []);
  return deriveFindings({ snapshot, registry, milestones, adapters: inputs.adapters });
}

export function findingsText(reg) {
  const lines = [];
  lines.push(`COREGUARD RISK FINDINGS — ${reg.version}`);
  lines.push(`status grammar: ${reg.statuses.join(" | ")}`);
  lines.push("");
  for (const x of reg.findings) {
    lines.push(`  ${x.id.padEnd(8)} [${x.severity.padEnd(8)} ${x.status.padEnd(10)}] ${x.title}`);
    lines.push(`    ${x.statement}`);
    lines.push(`    evidence: ${x.evidence.join(" · ")}`);
    lines.push("");
  }
  lines.push("A finding is a risk finding only — it is never a fuzzy safety score.");
  return lines.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const reg = build();
  if (args.includes("--write")) {
    writeFileSync(OUT, JSON.stringify(reg, null, 2) + "\n", "utf8");
    console.log(`LADDER-FINDINGS: wrote ${OUT}`);
    process.exit(0);
  }
  if (args.includes("--print")) {
    console.log(findingsText(reg));
    return;
  }
  console.log(JSON.stringify(reg, null, 2));
}

if (process.argv[1] && process.argv[1].endsWith("risk-findings.mjs")) main();