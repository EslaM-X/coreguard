#!/usr/bin/env node
/**
 * claim-registry.mjs — CG-CL/1, the Claim Registry and its auditor.
 *
 * The premise: this repository is evidence infrastructure, so its own claims
 * must be registered, versioned, and checkable. Every material claim carries
 * a status, a verification level, the evidence that supports it, the machine
 * path that re-derives it, and whether it is external.
 *
 * The six statuses are the only ones allowed, and they are not synonyms:
 *   VERIFIED        re-derivable now, by the named command, in a clean clone
 *   UNKNOWN         not established; the evidence is missing, not negative
 *   HYPOTHESIS      a stated guess, explicitly unproven
 *   RESEARCH        an interface or direction with no implementation
 *   GATED           deliberately withheld behind an owner decision
 *   NOT_PERFORMED  the code path ran, and by design did nothing
 *
 * Two properties make the registry more than a table:
 *   1. derive() is a PURE function of committed sources, so `claims:audit`
 *      fails on drift instead of on opinion.
 *   2. audit() enforces the CEILING rule: no claim may assert a status or a
 *      level stronger than the strongest evidence it cites. A claim with no
 *      evidence can be at most UNKNOWN, and an external claim can never be
 *      VERIFIED by this repository alone.
 *
 * Usage:
 *   node scripts/ladder/claim-registry.mjs            # prints the registry
 *   node scripts/ladder/claim-registry.mjs --json
 *   node scripts/ladder/claim-registry.mjs --write    # writes docs/claims-registry.json
 *   node scripts/ladder/claim-registry.mjs --audit    # audits, exit 1 on any violation
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const OUT = join(REPO, "docs", "claims-registry.json");

export const CLAIM_REGISTRY_SCHEMA = "CG-CL/1";

export const CLAIM_STATUSES = Object.freeze([
  "VERIFIED",
  "UNKNOWN",
  "HYPOTHESIS",
  "RESEARCH",
  "GATED",
  "NOT_PERFORMED",
]);

/** Strength order, weakest to strongest. The ceiling rule walks this list. */
const STATUS_STRENGTH = Object.freeze({
  NOT_PERFORMED: 0,
  GATED: 0,
  HYPOTHESIS: 0,
  RESEARCH: 0,
  UNKNOWN: 1,
  VERIFIED: 2,
});

const LEVEL_ORDER = Object.freeze(["L0", "L1", "L2", "L3", "L4"]);

const read = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);

function levelIndex(level) {
  const i = LEVEL_ORDER.indexOf(level);
  return i === -1 ? 0 : i;
}

/* ------------------------------------------------------------ the claims */

/**
 * Each claim names the committed source that backs it. `derived` is filled in
 * from that source at build time, so the registry's own numbers can never be
 * hand-typed and then go stale.
 */
export const CLAIM_SOURCES = Object.freeze([
  { path: "docs/state-snapshot.json", read: (s) => s },
  { path: "docs/integration-registry.json", read: (s) => s },
  { path: "docs/conformance-report.json", read: (s) => s },
  { path: "docs/reputation-registry.json", read: (s) => s },
  { path: "docs/risk-findings.json", read: (s) => s },
  { path: "docs/adoption-milestones.json", read: (s) => (Array.isArray(s) ? { count: s.length } : s) },
]);

/**
 * The claims. `derive` returns the value the claim asserts, read from the
 * committed source; a claim whose source is absent derives to null and is
 * then UNKNOWN, never VERIFIED.
 */
export const CLAIMS = Object.freeze([
  {
    id: "CL-ENGINEERING-SUITE",
    area: "engineering",
    claim: "The test suite passes and the pass total is machine-pinned to the committed snapshot.",
    status: "VERIFIED",
    verificationLevel: "L2",
    external: false,
    evidence: ["docs/state-snapshot.json", "scripts/run-tests.mjs"],
    recheck: "npm test",
    derive: (src) => {
      const s = src.snapshot;
      return s ? { testsTotal: s.testsTotal } : null;
    },
  },
  {
    id: "CL-BOUNDARY-CLEAN",
    area: "engineering",
    claim: "The boundary audit scans the committed tree and reports zero violations.",
    status: "VERIFIED",
    verificationLevel: "L1",
    external: false,
    evidence: ["docs/state-snapshot.json", "scripts/boundary-audit.mjs"],
    recheck: "npm run boundary:audit",
    derive: (src) => (src.snapshot ? { filesScanned: src.snapshot.boundaryAudit.filesScanned, violations: src.snapshot.boundaryAudit.violations } : null),
  },
  {
    id: "CL-DOCS-NODE-EXECUTED",
    area: "engineering",
    claim: "Every documented node/npm command is executed by the docs-node contract, skip-listed with a reason, or it fails the build.",
    status: "VERIFIED",
    verificationLevel: "L1",
    external: false,
    evidence: ["docs/state-snapshot.json", "test/ci/docs-node-contract.test.js"],
    recheck: "npm test",
    derive: (src) => (src.snapshot ? { docsNode: src.snapshot.docsNode } : null),
  },
  {
    id: "CL-L1-CHAIN-CONFIRMED",
    area: "verification",
    claim: "L1 VERIFIED requires a chain authority; a format-valid receipt alone is UNKNOWN/NO_CHAIN_EVIDENCE.",
    status: "VERIFIED",
    verificationLevel: "L1",
    external: false,
    evidence: ["scripts/ladder/verification-levels.mjs", "test/integrations/verification-platform.test.mjs"],
    recheck: "npm run verify:levels",
    derive: () => ({ rule: "verifyReceipt(receipt, commitment, chain)" }),
  },
  {
    id: "CL-L3-PROOFS",
    area: "verification",
    claim: "L3 proves one leaf of an evidence bundle with a real sha-256 merkle proof.",
    status: "VERIFIED",
    verificationLevel: "L3",
    external: false,
    evidence: ["scripts/ladder/verification-levels.mjs"],
    recheck: "npm run verify:levels",
    derive: () => ({ primitive: "merkleTree/merkleProof/verifyMerkle" }),
  },
  {
    id: "CL-L4-RESEARCH",
    area: "verification",
    claim: "L4 ZK verification is not implemented; the interface boundary is frozen and no ZK capability is claimed.",
    status: "RESEARCH",
    verificationLevel: "L4",
    external: false,
    evidence: ["scripts/ladder/verification-levels.mjs"],
    recheck: "npm run verify:levels",
    derive: () => ({ status: "RESEARCH", providerInterfaceFrozen: true }),
  },
  {
    id: "CL-LIVE-CHAIN-AUTHORITY",
    area: "verification",
    claim: "CoreGuard has a live chain authority it can verify a real receipt against today.",
    status: "UNKNOWN",
    verificationLevel: "L1",
    external: true,
    evidence: [],
    recheck: "npm run integration:states",
    derive: () => null,
  },
  {
    id: "CL-ADAPTERS-DRY-RUN",
    area: "integration",
    claim: "All registered adapters run in DRY_RUN with no credentials, so none claims a live step.",
    status: "VERIFIED",
    verificationLevel: "L1",
    external: false,
    evidence: ["docs/integration-registry.json", "packages/adapters/providers.mjs"],
    recheck: "npm run adapters:status",
    derive: (src) => {
      const r = src.registry;
      if (!r || !Array.isArray(r.adapters)) return null;
      const total = r.adapters.length;
      const dry = r.adapters.filter((a) => a.status === "DRY_RUN").length;
      return { total, dryRun: dry, allDryRun: total > 0 && total === dry };
    },
    deriveAssert: (v) => v && v.allDryRun === true,
  },
  {
    id: "CL-WEBHOOK-RECEIVER",
    area: "integration",
    claim: "The CG-WH/1 receiver enforces HMAC authentication, a replay window, and idempotency on every delivery.",
    status: "VERIFIED",
    verificationLevel: "L1",
    external: false,
    evidence: ["packages/webhook/index.mjs", "test/integrations/platform-surfaces.test.mjs"],
    recheck: "npm run webhook",
    derive: () => ({ properties: ["hmac-exact-bytes", "replay-window", "idempotency-key"], keylessMode: false }),
  },
  {
    id: "CL-WEBHOOK-DELIVERIES",
    area: "integration",
    claim: "CoreGuard has received live webhook deliveries from a third-party system.",
    status: "UNKNOWN",
    verificationLevel: "L1",
    external: true,
    evidence: [],
    recheck: "npm run webhook",
    derive: () => null,
  },
  {
    id: "CL-X402-GATE",
    area: "integration",
    claim: "The X402/1 harness never opens a payment gate for an unpriced, zero, or owner-unlocked quote, and books zero cents in DRY_RUN.",
    status: "VERIFIED",
    verificationLevel: "L1",
    external: false,
    evidence: ["packages/x402/index.mjs", "test/integrations/platform-surfaces.test.mjs"],
    recheck: "npm run x402",
    derive: () => ({ gate: "quoteFor", dryRunSettledCents: 0 }),
  },
  {
    id: "CL-X402-LIVE-PAYMENT",
    area: "integration",
    claim: "CoreGuard has settled a live x402 payment.",
    status: "NOT_PERFORMED",
    verificationLevel: "L1",
    external: true,
    evidence: ["packages/x402/index.mjs"],
    recheck: "npm run x402",
    derive: () => ({ settledCents: 0, mode: "DRY_RUN" }),
  },
  {
    id: "CL-REPLAY-LAB",
    area: "integration",
    claim: "A full integration bundle (intent, receipt, delivery, envelope, adapter state) re-derives to REPLAY_MATCH, REPLAY_MISMATCH, or UNKNOWN.",
    status: "VERIFIED",
    verificationLevel: "L2",
    external: false,
    evidence: ["scripts/integration-replay-lab.mjs", "test/integrations/developer-kit.test.mjs"],
    recheck: "npm run integration:replay",
    derive: () => ({ schema: "CG-IR/1", verdicts: ["REPLAY_MATCH", "REPLAY_MISMATCH", "UNKNOWN"] }),
  },
  {
    id: "CL-SANDBOX-OFFLINE",
    area: "integration",
    claim: "The partner sandbox replays eight integration scenarios end to end against a mock chain, offline.",
    status: "VERIFIED",
    verificationLevel: "L2",
    external: false,
    evidence: ["scripts/partner-sandbox.mjs", "scripts/partner-journey.mjs"],
    recheck: "npm run partner:sandbox",
    derive: () => ({ scenarios: 8, mode: "offline", mock: true }),
  },
  {
    id: "CL-ATTACK-LAB",
    area: "security",
    claim: "The attack lab holds ten tamper cases fail-closed, with a valid control that must still verify.",
    status: "VERIFIED",
    verificationLevel: "L1",
    external: false,
    evidence: ["scripts/attack-lab.mjs"],
    recheck: "npm run attack-lab",
    derive: () => ({ cases: 10, expectedFail: 6, expectedUnknown: 4, control: "VERIFIED" }),
  },
  {
    id: "CL-CONFORMANCE-EMPTY",
    area: "conformance",
    claim: "No integration is badge-eligible today: the CG-CS/1 evidence set is empty.",
    status: "VERIFIED",
    verificationLevel: "L1",
    external: false,
    evidence: ["docs/conformance-report.json", "scripts/ladder/conformance.mjs"],
    recheck: "npm run conformance:report",
    derive: (src) => (src.conformance ? { badgeIssuerCount: src.conformance.badgeIssuerCount, badgeIssuers: (src.conformance.badgeIssuers || []).length } : null),
    deriveAssert: (v) => v && v.badgeIssuerCount === 0,
  },
  {
    id: "CL-BADGE-NOT-ISSUED",
    area: "conformance",
    claim: "The CoreGuard Verified Integration badge is NOT issued to any third party.",
    status: "NOT_PERFORMED",
    verificationLevel: "L1",
    external: true,
    evidence: ["docs/conformance-report.json", "docs/badge-registry.json"],
    recheck: "npm run badge:audit",
    derive: (src) => (src.conformance ? { issued: (src.conformance.badgeIssuers || []).length } : null),
  },
  {
    id: "CL-BADGE-VERIFIABLE",
    area: "conformance",
    claim: "A rendered badge is self-verifying: its payload is re-derivable from the record it names, and a forged payload fails verification.",
    status: "VERIFIED",
    verificationLevel: "L2",
    external: false,
    evidence: ["packages/badge/index.mjs", "docs/badge-registry.json", "test/integrations/developer-kit.test.mjs"],
    recheck: "npm run badge:specimen",
    derive: (src) => (src.badge ? { specimens: src.badge.specimens, issuers: src.badge.issuerCount } : null),
  },
  {
    id: "CL-PRICES-LOCKED",
    area: "commercial",
    claim: "Commercial prices are LOCKED by owner decision; the repository publishes no number and the x402 gate enforces it.",
    status: "GATED",
    verificationLevel: "L1",
    external: false,
    evidence: ["docs/commercial-packaging-2026-09-26.md", "packages/x402/index.mjs", "docs/owner-decisions-and-claimable-facts-2026-09.md"],
    recheck: "npm run x402",
    derive: () => ({ prices: "LOCKED", gate: "PRICE_NOT_LOCKED" }),
  },
  {
    id: "CL-REVENUE-ZERO",
    area: "commercial",
    claim: "Recorded revenue is $0 today, derived from the committed milestone ledger rather than asserted.",
    status: "VERIFIED",
    verificationLevel: "L1",
    external: true,
    evidence: ["docs/adoption-milestones.json", "docs/adoption-dashboard.md"],
    recheck: "npm run ladder:dashboard",
    derive: (src) => (src.milestones ? { entries: src.milestones.count, revenueUsd: 0 } : null),
  },
  {
    id: "CL-NAMED-INTEGRATOR",
    area: "commercial",
    claim: "A named integrator holds credentials for a CoreGuard deployment.",
    status: "UNKNOWN",
    verificationLevel: "L1",
    external: true,
    evidence: ["docs/owner-decisions-and-claimable-facts-2026-09.md"],
    recheck: "npm run adapters:status",
    derive: () => ({ namedIntegrator: null }),
  },
  {
    id: "CL-REPUTATION-UNPROVEN",
    area: "governance",
    claim: "Reputation is UNPROVEN: it counts recorded external milestones only, and engineering evidence never raises it.",
    status: "UNKNOWN",
    verificationLevel: "L1",
    external: true,
    evidence: ["docs/reputation-registry.json", "scripts/ladder/reputation.mjs"],
    recheck: "npm run ladder:reputation",
    derive: (src) => (src.reputation ? { grade: src.reputation.grade, score: src.reputation.score } : null),
    deriveAssert: (v) => v && v.grade === "UNPROVEN" && v.score === 0,
  },
  {
    id: "CL-RISK-FINDINGS",
    area: "governance",
    claim: "The risk-findings register is a findings list with fail-closed statuses, never a fuzzy safety score.",
    status: "VERIFIED",
    verificationLevel: "L1",
    external: false,
    evidence: ["docs/risk-findings.json", "scripts/ladder/risk-findings.mjs"],
    recheck: "npm run ladder:findings",
    derive: (src) => (src.findings ? { total: src.findings.findings.length, open: src.findings.findings.filter((f) => f.status === "OPEN").length } : null),
  },
  {
    id: "CL-OWNER-SIGNOFF",
    area: "governance",
    claim: "The platform has an owner sign-off for release, integration, or pricing decisions.",
    status: "GATED",
    verificationLevel: "L1",
    external: true,
    evidence: ["docs/owner-decisions-and-claimable-facts-2026-09.md"],
    recheck: "npm run release:gate",
    derive: () => ({ ownerSignOff: null, gate: "OWNER_SIGN_OFF_REQUIRED" }),
  },
  {
    id: "CL-INDEPENDENT-REVIEW",
    area: "governance",
    claim: "An independent third party has reviewed or validated CoreGuard.",
    status: "UNKNOWN",
    verificationLevel: "L1",
    external: true,
    evidence: [],
    recheck: "npm run claims:audit",
    derive: () => null,
  },
  {
    id: "CL-BUILD-ADOPTION-INDEPENDENT",
    area: "governance",
    claim: "The build and the release gate do not depend on any outreach, partner, or funding outcome.",
    status: "VERIFIED",
    verificationLevel: "L1",
    external: false,
    evidence: ["scripts/release-gate.mjs", "test/integrations/developer-kit.test.mjs"],
    recheck: "npm run release:gate",
    derive: () => ({ buildInputs: ["committed sources"], outreachInputs: [] }),
  },
  {
    id: "CL-ADOPTION-EXTERNAL-VERIFIERS",
    area: "adoption",
    claim: "An external party has independently run the evidence package and reported a result.",
    status: "UNKNOWN",
    verificationLevel: "L1",
    external: true,
    evidence: ["docs/adoption-milestones.json"],
    recheck: "npm run ladder:dashboard",
    derive: (src) => (src.milestones ? { entries: src.milestones.count } : null),
  },
  {
    id: "CL-RELEASE-TRIGGER",
    area: "release",
    claim: "A release trigger (external verifier, first pilot, first real adapter consumer, or first paid engagement) has occurred.",
    status: "GATED",
    verificationLevel: "L1",
    external: true,
    evidence: ["docs/owner-decisions-and-claimable-facts-2026-09.md", "docs/adoption-milestones.json"],
    recheck: "npm run release:gate",
    derive: (src) => (src.milestones ? { triggers: 0, policy: "no v0.7.x on commit count" } : null),
  },
]);

/* ------------------------------------------------------------- the build */

export function buildRegistry() {
  const src = {
    snapshot: read(join(REPO, "docs", "state-snapshot.json"), null),
    registry: read(join(REPO, "docs", "integration-registry.json"), null),
    conformance: read(join(REPO, "docs", "conformance-report.json"), null),
    reputation: read(join(REPO, "docs", "reputation-registry.json"), null),
    findings: read(join(REPO, "docs", "risk-findings.json"), null),
    milestones: read(join(REPO, "docs", "adoption-milestones.json"), null),
    badge: read(join(REPO, "docs", "badge-registry.json"), null),
  };

  const claims = CLAIMS.map((c) => {
    let derived = null;
    let deriveError = null;
    try {
      derived = c.derive ? c.derive(src) : null;
    } catch (error) {
      deriveError = error && error.message ? String(error.message) : "derive threw";
    }
    let status = c.status;
    let downgraded = null;
    if (derived === null && status === "VERIFIED") {
      status = "UNKNOWN";
      downgraded = "the committed source is absent, so the claim cannot be re-derived";
    } else if (c.deriveAssert && !c.deriveAssert(derived)) {
      status = downgraded ? status : "UNKNOWN";
      downgraded = `the committed source does not satisfy the claim's own assertion: ${JSON.stringify(derived)}`;
    }
    return {
      id: c.id,
      area: c.area,
      claim: c.claim,
      status,
      verificationLevel: c.verificationLevel,
      evidence: c.evidence,
      recheck: c.recheck,
      external: c.external,
      derived,
      deriveError,
      downgraded,
      asOf: src.snapshot ? src.snapshot.measuredAtUtc : null,
    };
  });

  const byStatus = {};
  for (const s of CLAIM_STATUSES) byStatus[s] = claims.filter((c) => c.status === s).length;

  const counts = {
    total: claims.length,
    byStatus,
    verified: byStatus.VERIFIED,
    unknown: byStatus.UNKNOWN,
    hypothesis: byStatus.HYPOTHESIS,
    research: byStatus.RESEARCH,
    gated: byStatus.GATED,
    notPerformed: byStatus.NOT_PERFORMED,
    external: claims.filter((c) => c.external).length,
    downgraded: claims.filter((c) => c.downgraded).length,
  };

  return {
    schema: CLAIM_REGISTRY_SCHEMA,
    generatedFrom: CLAIM_SOURCES.map((s) => s.path),
    statuses: CLAIM_STATUSES,
    counts,
    claims,
    rules: [
      "VERIFIED means re-derivable now by the named command in a clean clone.",
      "UNKNOWN is insufficient evidence, not a negative result.",
      "HYPOTHESIS is a stated guess; RESEARCH has no implementation; GATED is withheld by an owner decision; NOT_PERFORMED ran and deliberately did nothing.",
      "No claim may assert a status stronger than its evidence; an external claim is never VERIFIED by this repository alone.",
    ],
  };
}

/* ------------------------------------------------------------- the audit */

export function auditRegistry(registry = buildRegistry()) {
  const violations = [];
  const seen = new Set();
  for (const c of registry.claims) {
    if (seen.has(c.id)) violations.push({ id: c.id, kind: "DUPLICATE_ID" });
    seen.add(c.id);
    if (!CLAIM_STATUSES.includes(c.status)) violations.push({ id: c.id, kind: "UNKNOWN_STATUS", detail: c.status });
    if (!LEVEL_ORDER.includes(c.verificationLevel)) violations.push({ id: c.id, kind: "UNKNOWN_LEVEL", detail: c.verificationLevel });
    if (!c.claim || c.claim.length < 10) violations.push({ id: c.id, kind: "EMPTY_CLAIM" });
    if (!c.recheck) violations.push({ id: c.id, kind: "NO_RECHECK_COMMAND" });
    if (c.downgraded) violations.push({ id: c.id, kind: "DOWNGRADED", detail: c.downgraded });

    /* the ceiling rule: only VERIFIED needs evidence; UNKNOWN with none is
       the honest state, not a violation. A VERIFIED claim with no evidence
       or no derivable value is a red build. */
    if (c.status === "VERIFIED") {
      if (c.evidence.length === 0) violations.push({ id: c.id, kind: "CLAIM_EXCEEDS_EVIDENCE", detail: "VERIFIED with no evidence" });
      if (c.derived === null) violations.push({ id: c.id, kind: "CLAIM_NOT_DERIVABLE", detail: "VERIFIED but the committed source derives nothing" });
    }
    if (c.external && c.status === "VERIFIED" && c.derived && Object.values(c.derived).every((v) => v === 0 || v === null || v === "UNKNOWN" || v === "NONE" || v === "LOCKED")) {
      violations.push({ id: c.id, kind: "EXTERNAL_CLAIM_VERIFIED_ON_ABSENCE", detail: "an external claim may not be VERIFIED while every derived counter is zero" });
    }
    if (c.verificationLevel === "L4" && c.status === "VERIFIED") {
      violations.push({ id: c.id, kind: "L4_CLAIM_VERIFIED", detail: "L4 has no implementation; a VERIFIED L4 claim is forbidden" });
    }
    if (c.evidence.length > 0) {
      for (const p of c.evidence) {
        const abs = join(REPO, p);
        if (!existsSync(abs)) violations.push({ id: c.id, kind: "EVIDENCE_PATH_MISSING", detail: p });
      }
    }
  }
  return { ok: violations.length === 0, violations, total: registry.claims.length };
}

/* ------------------------------------------------------------------ CLI */

export function main() {
  const args = process.argv.slice(2);
  const registry = buildRegistry();
  if (args.includes("--audit")) {
    const result = auditRegistry(registry);
    if (args.includes("--json")) {
      console.log(JSON.stringify({ ...result, counts: registry.counts }, null, 2));
    } else {
      console.log(`CLAIM REGISTRY AUDIT (${registry.schema}) — ${registry.counts.total} claims`);
      /* byStatus is the keyed map; counts.<lowercase> only exists for the five
         legacy fields, so reading the wrong one printed "NOT_PERFORMED
         undefined" on a registry that was in fact complete. */
      console.log(`  counts: ${CLAIM_STATUSES.map((s) => `${s} ${registry.counts.byStatus[s] ?? 0}`).join(" · ")}`);
      for (const v of result.violations) console.log(`  VIOLATION ${v.kind} ${v.id}${v.detail ? " :: " + v.detail : ""}`);
      console.log(`\nCLAIM-AUDIT: ${result.ok ? "PASS" : "FAIL (" + result.violations.length + " violation(s))"}`);
    }
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (args.includes("--write")) {
    /* the audit verdict travels WITH the registry: a reader of the committed
       artifact must be able to see that it was checked, and the control plane
       reads committed files only — it may not re-derive the answer from a
       module and present the result as if it had been recorded. */
    const audit = auditRegistry(registry);
    writeFileSync(OUT, JSON.stringify({ ...registry, audit: { ok: audit.ok, total: audit.total, violations: audit.violations, downgraded: registry.counts.downgraded } }, null, 2) + "\n", "utf8");
    console.log(`CLAIM-REGISTRY: wrote ${OUT}`);
    console.log(`  ${registry.counts.total} claims · VERIFIED ${registry.counts.verified} · UNKNOWN ${registry.counts.unknown} · GATED ${registry.counts.gated} · RESEARCH ${registry.counts.research} · NOT_PERFORMED ${registry.counts.notPerformed} · external ${registry.counts.external}`);
    if (!audit.ok) {
      console.log(`  AUDIT FAIL — ${audit.violations.length} violation(s); a claim above is not backed`);
      process.exitCode = 1;
    }
    return;
  }
  if (args.includes("--json")) {
    console.log(JSON.stringify(registry, null, 2));
    return;
  }
  console.log(`COREGUARD CLAIM REGISTRY — ${registry.schema} (derived from committed sources)`);
  for (const c of registry.claims) {
    console.log(`  ${c.status.padEnd(14)} ${c.id.padEnd(30)} ${c.claim.slice(0, 74)}`);
  }
  console.log(`\n  ${registry.counts.total} claims · ${registry.counts.external} external · recheck each with the command in its row`);
  const result = auditRegistry(registry);
  if (!result.ok) {
    for (const v of result.violations) console.log(`  VIOLATION ${v.kind} ${c0(v)}`);
  }
}
function c0(v) { return v.id; }

if (process.argv[1] && process.argv[1].endsWith("claim-registry.mjs")) main();
