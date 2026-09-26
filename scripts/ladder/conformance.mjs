/**
 * conformance.mjs — the CoreGuard Conformance Suite: a fixed, versioned set of
 * criteria an integration must pass to be marked CONFORMANT — and the rules
 * for the "CoreGuard Verified Integration" badge.
 *
 * Ethical rules enforced here and asserted by tests:
 *  - a verdict is ONLY computed from the evidence object you pass in; nothing
 *    is assumed, nothing is invented;
 *  - the badge means ONLY "passed this suite for a pinned version" — it never
 *    endorses the counterparty, its funds, its adjudication, or its project;
 *  - PRODUCTION stays unreachable without partnerApproval + deployment scope
 *    (already enforced by state-machine.mjs).
 *
 * Usage:
 *   node scripts/ladder/conformance.mjs              # human summary
 *   node scripts/ladder/conformance.mjs --json       # summary + machine report
 *   node scripts/ladder/conformance.mjs --write      # writes docs/conformance-report.json
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPORT_PATH = join(HERE, "..", "..", "docs", "conformance-report.json");

export const CONFORMANCE_SUITE_VERSION = "CG-CS/1";
export const CONFORMANCE_SUITE_FIELDS = Object.freeze([
  "evidenceContractPass",
  "determinismPass",
  "replayPass",
  "tamperDetectionPass",
  "securityCheckPass",
  "compatibilityPass",
]);
export const CONFORMANCE_SUITE = Object.freeze(
  CONFORMANCE_SUITE_FIELDS.map((f) => ({
    id: f,
    label: {
      evidenceContractPass: "evidence contract — the integration's attestations honor EVP/1 shape and pins",
      determinismPass: "determinism — identical inputs reproduce identical receipts",
      replayPass: "replay — the verifier re-derives the evidence byte-for-byte",
      tamperDetectionPass: "tamper detection — any byte change flips the verdict fail-closed",
      securityCheckPass: "security — scoped credentials, revocation, no stored secrets in-repo",
      compatibilityPass: "compatibility — the integration's surface matches the documented adapter contract",
    }[f],
  })),
);

/**
 * @param {Object} evidence boolean map covering CONFORMANCE_SUITE_FIELDS
 * @returns {{suite, version, checks, verdict, missing}}
 * verdict is one of CONFORMANT | NOT_CONFORMANT | INCOMPLETE_EVIDENCE.
 */
export function evaluateConformance(evidence = {}) {
  const absent = CONFORMANCE_SUITE_FIELDS.filter((f) => evidence[f] === undefined);
  const failed = CONFORMANCE_SUITE_FIELDS.filter((f) => evidence[f] === false);
  const checks = CONFORMANCE_SUITE_FIELDS.map((f) => ({
    id: f,
    pass: evidence[f] === true,
    fail: evidence[f] === false,
    unknown: evidence[f] === undefined,
  }));
  let verdict;
  if (absent.length > 0) verdict = "INCOMPLETE_EVIDENCE";
  else if (failed.length > 0) verdict = "NOT_CONFORMANT";
  else verdict = "CONFORMANT";
  return {
    suite: "CoreGuard Conformance Suite",
    version: CONFORMANCE_SUITE_VERSION,
    checks,
    verdict,
    missing: absent,
    failed,
  };
}

export function conformanceEligible(results) {
  return evaluateConformance(results).verdict === "CONFORMANT";
}

export const VERIFIED_BADGE = Object.freeze({
  name: "CoreGuard Verified Integration",
  claimTowards: "integration passed the CoreGuard Conformance Suite for the pinned version",
  versionRef: CONFORMANCE_SUITE_VERSION,
  neverMeans: Object.freeze([
    "CoreGuard endorses the counterparty or its project",
    "CoreGuard guarantees the counterparty, its funds, or its adjudication",
    "CoreGuard guarantees any settlement or legal outcome",
    "the integration has any live authority by itself",
  ]),
});

export function badgeStatement(state, suiteResult) {
  if (state !== "CONFORMANT" || suiteResult.verdict !== "CONFORMANT") {
    return null;
  }
  return `${VERIFIED_BADGE.name} — passed the CoreGuard Conformance Suite ${VERIFIED_BADGE.versionRef}. This certifies the integration's attestations only; it is not an endorsement of the counterparty.`;
}

/* ------------------------------------------------------ machine report */

/**
 * buildConformanceReport — a deterministic, serializable view of the suite:
 * the criteria, the badge contract, and the fact that NOTHING is eligible
 * yet. This is the artifact a CI job, a partner page, or an auditor reads;
 * the printed summary is for humans and can never be the authoritative form.
 *
 * The report is a pure function of the suite definition plus the sources it
 * declares. It deliberately carries no timestamp: a timestamp would make the
 * artifact churn on every run and train reviewers to ignore diffs.
 */
export function buildConformanceReport({ eligibleIntegrations = [] } = {}) {
  const empty = evaluateConformance({});
  const hypotheticalPass = evaluateConformance(
    Object.fromEntries(CONFORMANCE_SUITE_FIELDS.map((f) => [f, true])),
  );
  const eligible = eligibleIntegrations
    .filter((e) => e && typeof e.id === "string" && evaluateConformance(e.results || {}).verdict === "CONFORMANT")
    .map((e) => Object.freeze({ id: e.id, suite: CONFORMANCE_SUITE_VERSION, badge: VERIFIED_BADGE.name, statement: badgeStatement("CONFORMANT", hypotheticalPass) }));
  return Object.freeze({
    report: "CG-CR/1",
    suite: CONFORMANCE_SUITE_VERSION,
    criteria: CONFORMANCE_SUITE,
    badge: VERIFIED_BADGE,
    defaultVerdict: empty.verdict,
    badgeIssuers: eligible,
    badgeIssuerCount: eligible.length,
    note:
      eligible.length === 0
        ? "No integration is badge-eligible: CG-CS/1 evidence is collected from real integrations, and none has been run yet. An empty list is the honest state, not a gap to fill with prose."
        : "Badge-eligible integrations are listed with the exact suite version they passed.",
  });
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--write")) {
    const report = JSON.stringify(buildConformanceReport(), null, 2) + "\n";
    writeFileSync(REPORT_PATH, report, "utf8");
    console.log(`CONFORMANCE-REPORT: wrote ${REPORT_PATH}`);
    console.log(`  suite ${report.match(/"suite": "([^"]+)"/)[1]} · badgeIssuers 0 until a real integration runs the suite`);
    process.exit(0);
  }
  const out = [];
  out.push(`COREGUARD CONFORMANCE SUITE — ${CONFORMANCE_SUITE_VERSION}`);
  out.push(`criteria (${CONFORMANCE_SUITE.length}):`);
  for (const c of CONFORMANCE_SUITE) out.push(`  - ${c.id}: ${c.label}`);
  out.push("");
  const empty = evaluateConformance({});
  out.push(`no evidence passed → ${empty.verdict} (missing: ${empty.missing.length})`);
  const all = evaluateConformance(Object.fromEntries(CONFORMANCE_SUITE_FIELDS.map((f) => [f, true])));
  out.push(`all criteria passed → ${all.verdict}`);
  out.push("");
  for (const m of VERIFIED_BADGE.neverMeans) out.push(`badge never means: ${m}`);
  if (process.argv.includes("--json")) {
    out.push("");
    out.push(JSON.stringify(buildConformanceReport(), null, 2));
  }
  console.log(out.join("\n"));
}

if (process.argv[1] && process.argv[1].endsWith("conformance.mjs")) main();