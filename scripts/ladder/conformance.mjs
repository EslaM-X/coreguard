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
 */

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

function main() {
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
  console.log(out.join("\n"));
}

if (process.argv[1] && process.argv[1].endsWith("conformance.mjs")) main();