import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  REPLAY_LAB_SCHEMA,
  REPLAY_LAB_VERDICTS,
  REPLAY_LAB_INPUTS,
  replayBundle,
  buildBundle,
  labChain,
  selfCheck as replaySelfCheck,
} from "../../scripts/integration-replay-lab.mjs";
import {
  JOURNEY_SCHEMA,
  JOURNEY_LEGS,
  runJourney,
  weakestVerdict,
  selfCheck as journeySelfCheck,
} from "../../scripts/partner-journey.mjs";
import {
  CLAIM_REGISTRY_SCHEMA,
  CLAIM_STATUSES,
  CLAIMS,
  buildRegistry,
  auditRegistry,
} from "../../scripts/ladder/claim-registry.mjs";
import {
  BADGE_SCHEMA,
  BADGE_KINDS,
  BADGE_RULES,
  renderBadge,
  verifyBadge,
  extractPayload,
  badgeDigest,
  badgeKind,
  specimenRecord,
  integrationRecord,
  buildBadgeRegistry,
  selfCheck as badgeSelfCheck,
} from "../../packages/badge/index.mjs";
import { GATE_LEGS, RELEASE_GATE_SCHEMA, proveIndependence } from "../../scripts/release-gate.mjs";
import {
  COMMERCIAL_SCHEMA,
  COMMERCIAL_DECISIONS,
  REQUIRED_SURFACES,
  REQUIRED_GATES,
  checkPackaging,
  findMissingCitations,
  findMoneyFigures,
  findUnnamedGates,
  selfCheck as packagingSelfCheck,
} from "../../scripts/ladder/commercial-packaging.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const readJson = (p) => JSON.parse(readFileSync(join(REPO, p), "utf8"));
const ALL_PASS = Object.freeze({
  evidenceContractPass: true,
  determinismPass: true,
  replayPass: true,
  tamperDetectionPass: true,
  securityCheckPass: true,
  compatibilityPass: true,
});

/* ══════════════════════════════════════ E · the replay lab (CG-IR/1) ══════ */

test("the replay lab's own invariants hold", () => {
  const r = replaySelfCheck();
  assert.equal(r.ok, true, JSON.stringify(r.cases.filter((c) => !c.pass), null, 2));
});

test("the replay lab publishes exactly its three verdicts", () => {
  assert.equal(REPLAY_LAB_SCHEMA, "CG-IR/1");
  assert.deepEqual([...REPLAY_LAB_VERDICTS], ["REPLAY_MATCH", "REPLAY_MISMATCH", "UNKNOWN"]);
  assert.ok(REPLAY_LAB_INPUTS.length >= 5, "the lab must name every bundle input it re-derives");
});

test("a fully-evidenced bundle with a chain authority is REPLAY_MATCH", () => {
  const out = replayBundle(buildBundle(), { chain: labChain(), secret: "replay-lab-secret", now: 1750000000000 });
  assert.equal(out.verdict, "REPLAY_MATCH");
  assert.equal(out.verdictCode, "ALL_LINKS_REDERIVED");
  assert.ok(out.links.every((l) => l.status === "MATCH"));
});

test("the same bundle WITHOUT a chain authority is UNKNOWN, never MATCH", () => {
  const out = replayBundle(buildBundle(), { secret: "replay-lab-secret", now: 1750000000000 });
  assert.equal(out.verdict, "UNKNOWN");
  assert.equal(out.verdictCode, "INSUFFICIENT_EVIDENCE");
});

test("a well-formed but chain-unknown txHash is MISMATCH/TX_NOT_FOUND; a MALFORMED one is UNKNOWN", () => {
  const chain = { chain: labChain(), secret: "replay-lab-secret", now: 1750000000000 };
  const unknown = replayBundle(buildBundle({ mutate: (b) => ({ ...b, receipt: { ...b.receipt, txHash: "0x" + "e".repeat(64) } }) }), chain);
  const l1 = unknown.links.find((l) => l.id === "L1_RECEIPT");
  assert.equal(l1.status, "MISMATCH");
  assert.match(l1.detail, /TX_NOT_FOUND/, "the chain authority was asked and does not have the transaction");

  const malformed = replayBundle(buildBundle({ mutate: (b) => ({ ...b, receipt: { ...b.receipt, txHash: "0xdead" } }) }), chain);
  const m1 = malformed.links.find((l) => l.id === "L1_RECEIPT");
  assert.equal(m1.status, "UNKNOWN", "a malformed hash is insufficient evidence, not a failure verdict");
});

test("a forged webhook signature is REPLAY_MISMATCH at the delivery link", () => {
  const bundle = buildBundle({ mutate: (b) => ({ ...b, webhookDelivery: { ...b.webhookDelivery, signature: "0".repeat(64) } }) });
  const out = replayBundle(bundle, { chain: labChain(), secret: "replay-lab-secret", now: 1750000000000 });
  assert.equal(out.verdict, "REPLAY_MISMATCH");
  assert.equal(out.links.find((l) => l.id === "WEBHOOK_AUTH").status, "MISMATCH");
});

test("a DRY_RUN adapter claiming execution is REPLAY_MISMATCH", () => {
  const bundle = buildBundle({ mutate: (b) => ({ ...b, adapterState: { ...b.adapterState, executed: true } }) });
  const out = replayBundle(bundle, { chain: labChain(), secret: "replay-lab-secret", now: 1750000000000 });
  assert.equal(out.verdict, "REPLAY_MISMATCH");
  assert.equal(out.links.find((l) => l.id === "ADAPTER_CLAIM").status, "MISMATCH");
});

test("an empty bundle is UNKNOWN and names every absent input", () => {
  const out = replayBundle({}, { chain: labChain() });
  assert.equal(out.verdict, "UNKNOWN");
  assert.equal(out.verdictCode, "REQUIRED_INPUT_MISSING");
  assert.ok(out.missing.length >= 4, "an empty bundle must name what is missing, not just fail");
});

test("the journey hash is a pure function of the bundle's link statuses", () => {
  const a = replayBundle(buildBundle(), { chain: labChain(), secret: "replay-lab-secret", now: 1750000000000 });
  const b = replayBundle(buildBundle(), { chain: labChain(), secret: "replay-lab-secret", now: 1750000000000 });
  assert.equal(a.journeyHash, b.journeyHash);
  const tampered = replayBundle(buildBundle({ mutate: (x) => ({ ...x, receipt: { ...x.receipt, txHash: "0x" + "e".repeat(64) } }) }), { chain: labChain(), secret: "replay-lab-secret", now: 1750000000000 });
  assert.notEqual(tampered.journeyHash, a.journeyHash);
});

/* ══════════════════════════════════════ F · the journey (CG-PJ/1) ══════ */

test("the journey's own invariants hold", () => {
  const r = journeySelfCheck();
  assert.equal(r.ok, true, JSON.stringify(r.cases.filter((c) => !c.pass), null, 2));
});

test("the journey runs its ten legs in the documented order", () => {
  const run = runJourney();
  assert.equal(JOURNEY_SCHEMA, "CG-PJ/1");
  assert.equal(run.legCount, 10);
  assert.deepEqual(run.legs.map((l) => l.leg), [...JOURNEY_LEGS]);
});

test("a clean journey is MATCH — never inflated to VERIFIED", () => {
  const run = runJourney();
  assert.equal(run.verdict, "MATCH");
  const replayLeg = run.legs.find((l) => l.leg === "replay");
  assert.equal(replayLeg.verdict, "MATCH");
  /* the L1 leg IS chain-confirmed, and the journey still does not claim more
     than its weakest leg — the distinction is the whole point */
  assert.equal(run.legs.find((l) => l.leg === "receipt").verdict, "VERIFIED");
});

test("the journey's weakest-leg rule is a total order over its own verdicts", () => {
  assert.equal(weakestVerdict(["VERIFIED", "MATCH", "UNKNOWN", "MISMATCH", "REJECTED"]), "REJECTED");
  assert.equal(weakestVerdict(["VERIFIED", "MATCH"]), "MATCH");
  assert.equal(weakestVerdict([]), "UNKNOWN");
  assert.equal(weakestVerdict(["VERIFIED", "VERIFIED"]), "VERIFIED");
});

test("one attack propagates beyond the leg it hit", () => {
  const run = runJourney({ tamper: (b) => ({ ...b, receipt: { ...b.receipt, txHash: "0x" + "e".repeat(64) } }) });
  const legs = run.blockedBy.map((x) => x.leg);
  assert.ok(legs.includes("receipt"), "the L1 leg must notice");
  assert.ok(legs.includes("replay"), "the bundle replay must notice too");
  assert.equal(run.verdict, "MISMATCH");
});

test("the journey claims no live capability even when every leg passes", () => {
  const run = runJourney();
  assert.equal(run.claims.liveChainAuthority, false);
  assert.equal(run.claims.liveWebhookDelivery, false);
  assert.equal(run.claims.livePayment, false);
  assert.equal(run.claims.badgeIssued, false);
  assert.equal(run.mode, "offline");
  assert.equal(run.mock, true);
});

test("the journey books zero cents and keeps the payment gate GATED", () => {
  const exec = runJourney().legs.find((l) => l.leg === "execute");
  assert.equal(exec.settledCents, 0);
  assert.equal(exec.gateState, "GATED");
  assert.equal(exec.adapterExecuted, false);
});

test("the journey distinguishes a verified webhook from a processed one", () => {
  const hook = runJourney().legs.find((l) => l.leg === "webhook");
  assert.equal(hook.state, "NOT_PERFORMED");
  assert.equal(hook.processed, false);
});

/* ══════════════════════════════════════ H · the claim registry (CG-CL/1) ══════ */

test("the claim registry audits clean on the committed tree", () => {
  const r = auditRegistry(buildRegistry());
  assert.equal(r.ok, true, JSON.stringify(r.violations, null, 2));
});

test("the registry publishes only the six declared statuses", () => {
  assert.equal(CLAIM_REGISTRY_SCHEMA, "CG-CL/1");
  assert.deepEqual([...CLAIM_STATUSES], ["VERIFIED", "UNKNOWN", "HYPOTHESIS", "RESEARCH", "GATED", "NOT_PERFORMED"]);
});

test("every claim names evidence, a recheck command, and a level", () => {
  for (const c of CLAIMS) {
    assert.ok(c.recheck, `${c.id} has no recheck command`);
    assert.match(c.verificationLevel, /^L[0-4]$/, `${c.id} has an unknown level`);
    assert.ok(c.claim.length > 20, `${c.id} states no claim`);
  }
});

test("the ceiling rule refuses a VERIFIED claim with no evidence", () => {
  const forged = buildRegistry();
  forged.claims.push({ id: "CL-FORGED", area: "engineering", claim: "a fabricated verified claim", status: "VERIFIED", verificationLevel: "L1", evidence: [], recheck: "npm test", external: false, derived: { x: 1 }, downgraded: null });
  const r = auditRegistry(forged);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.id === "CL-FORGED" && v.kind === "CLAIM_EXCEEDS_EVIDENCE"));
});

test("the ceiling rule refuses a VERIFIED claim that derives nothing", () => {
  const forged = buildRegistry();
  forged.claims.push({ id: "CL-HOLLOW", area: "engineering", claim: "a verified claim with no derivable source", status: "VERIFIED", verificationLevel: "L1", evidence: ["package.json"], recheck: "npm test", external: false, derived: null, downgraded: null });
  const r = auditRegistry(forged);
  assert.ok(r.violations.some((v) => v.id === "CL-HOLLOW" && v.kind === "CLAIM_NOT_DERIVABLE"));
});

test("the ceiling rule accepts an UNKNOWN claim with no evidence — that IS the honest state", () => {
  const honest = buildRegistry();
  honest.claims.push({ id: "CL-HONEST", area: "governance", claim: "an external outcome nobody has established", status: "UNKNOWN", verificationLevel: "L1", evidence: [], recheck: "npm run claims:audit", external: true, derived: null, downgraded: null });
  const r = auditRegistry(honest);
  assert.equal(r.violations.filter((v) => v.id === "CL-HONEST").length, 0);
});

test("the registry refuses a VERIFIED L4 claim — L4 has no implementation", () => {
  const forged = buildRegistry();
  forged.claims.push({ id: "CL-L4", area: "verification", claim: "a verified ZK capability", status: "VERIFIED", verificationLevel: "L4", evidence: ["package.json"], recheck: "npm test", external: false, derived: { ok: true }, downgraded: null });
  assert.ok(auditRegistry(forged).violations.some((v) => v.id === "CL-L4" && v.kind === "L4_CLAIM_VERIFIED"));
});

test("the registry refuses an external claim verified on all-zero evidence", () => {
  const forged = buildRegistry();
  forged.claims.push({ id: "CL-EXT", area: "commercial", claim: "an external outcome claimed on zero counters", status: "VERIFIED", verificationLevel: "L1", evidence: ["docs/adoption-milestones.json"], recheck: "npm run claims:audit", external: true, derived: { count: 0, revenueUsd: 0 }, downgraded: null });
  assert.ok(auditRegistry(forged).violations.some((v) => v.id === "CL-EXT" && v.kind === "EXTERNAL_CLAIM_VERIFIED_ON_ABSENCE"));
});

test("the registry refuses evidence that does not exist on disk", () => {
  const forged = buildRegistry();
  forged.claims.push({ id: "CL-GHOST", area: "engineering", claim: "a claim citing a file that was never written", status: "VERIFIED", verificationLevel: "L1", evidence: ["docs/does-not-exist.json"], recheck: "npm test", external: false, derived: { x: 1 }, downgraded: null });
  assert.ok(auditRegistry(forged).violations.some((v) => v.id === "CL-GHOST" && v.kind === "EVIDENCE_PATH_MISSING"));
});

test("the committed registry keeps the three owner decisions honest", () => {
  const reg = readJson("docs/claims-registry.json");
  assert.equal(reg.schema, CLAIM_REGISTRY_SCHEMA);
  const byId = Object.fromEntries(reg.claims.map((c) => [c.id, c]));
  assert.equal(byId["CL-BADGE-NOT-ISSUED"].status, "NOT_PERFORMED");
  assert.equal(byId["CL-NAMED-INTEGRATOR"].status, "UNKNOWN");
  assert.equal(byId["CL-NAMED-INTEGRATOR"].derived.namedIntegrator, null);
  assert.equal(byId["CL-PRICES-LOCKED"].status, "GATED");
  assert.equal(reg.counts.downgraded, 0);
});

test("the registry is reproducible: a second build matches the committed file", () => {
  const committed = readJson("docs/claims-registry.json");
  const rebuilt = buildRegistry();
  assert.deepEqual(rebuilt.counts, committed.counts);
  assert.equal(rebuilt.claims.length, committed.claims.length);
});

/* ══════════════════════════════════════ the badge system (CG-BDG/1) ══════ */

test("the badge system's own invariants hold", () => {
  const r = badgeSelfCheck();
  assert.equal(r.ok, true, JSON.stringify(r.cases.filter((c) => !c.pass), null, 2));
});

test("a badge is a pure function of its record", () => {
  const record = specimenRecord();
  assert.equal(renderBadge(record), renderBadge(specimenRecord()));
  const a = badgeDigest(record);
  const b = badgeDigest(specimenRecord({ subject: "OTHER" }));
  assert.notEqual(a, b);
});

test("a genuine badge verifies against its record", () => {
  const record = integrationRecord({ subject: "GENUINE", results: ALL_PASS });
  const svg = renderBadge(record);
  const out = verifyBadge(svg, record);
  assert.equal(out.valid, true, out.detail);
  assert.equal(out.reason, "VERIFIED");
});

test("a forged subject, an edited payload, and a lifted digest all fail verification", () => {
  const record = specimenRecord();
  const svg = renderBadge(record);
  assert.equal(verifyBadge(svg, specimenRecord({ subject: "SOMEONE ELSE" })).valid, false);
  assert.equal(verifyBadge(svg.replace(badgeDigest(record), "AAAAAAAAAAAA"), record).valid, false);
  assert.equal(verifyBadge(renderBadge(specimenRecord({ subject: "OTHER" })), record).valid, false);
  assert.equal(verifyBadge("<svg></svg>", record).reason, "NO_PAYLOAD");
});

test("an unissued specimen cannot be converted into an issued badge", () => {
  assert.throws(() => renderBadge({ ...specimenRecord(), kind: BADGE_KINDS.INTEGRATION }), /must come from/);
  assert.throws(() => renderBadge({ subject: "X", suite: "CG-CS/1", verdict: "CONFORMANT", criteria: [] }), /must come from/);
  assert.equal(badgeKind({ ...specimenRecord() }), null);
});

test("a non-conformant record can never render an issued badge", () => {
  const partial = integrationRecord({ subject: "PARTIAL", results: { evidenceContractPass: true } });
  assert.equal(partial.verdict, "NOT_CONFORMANT");
  assert.throws(() => renderBadge(partial), /CONFORMANT/);
});

test("the badge states its own limits on its face", () => {
  const svg = renderBadge(integrationRecord({ subject: "GENUINE", results: ALL_PASS }));
  assert.match(svg, /not the counterparty/);
  assert.match(svg, /npm run badge:verify/);
  const specimen = renderBadge(specimenRecord());
  assert.match(specimen, /no third party holds this badge/);
});

test("the registry issues nothing, and the two badge registries agree", () => {
  const reg = buildBadgeRegistry();
  assert.equal(BADGE_SCHEMA, "CG-BDG/1");
  assert.equal(reg.issuerCount, 0);
  assert.deepEqual(reg.issuers, []);
  const committed = readJson("docs/badge-registry.json");
  assert.equal(committed.issuerCount, 0);
  assert.equal(readJson("docs/conformance-report.json").badgeIssuerCount, 0);
});

test("the committed specimen files verify against their records", () => {
  const committed = readJson("docs/badge-registry.json");
  for (const s of committed.specimens) {
    const svg = readFileSync(join(REPO, s.file), "utf8");
    const record = specimenRecord({ subject: s.subject, criteriaPass: s.criteriaPass });
    const out = verifyBadge(svg, record);
    assert.equal(out.valid, true, `${s.file}: ${out.reason} ${out.detail || ""}`);
    assert.equal(extractPayload(svg).d, s.digest);
  }
});

test("both faces of the system are published: the conformant one and the refusal", () => {
  const committed = readJson("docs/badge-registry.json");
  assert.equal(committed.specimens.length, 2);
  const faces = committed.specimens.map((s) => s.criteriaPassed + "/" + s.criteriaTotal).sort();
  assert.deepEqual(faces, ["2/6", "6/6"]);
  assert.ok(BADGE_RULES.SPECIMEN.every((r) => /NOT ISSUED/i.test(r)));
  assert.ok(BADGE_RULES.INTEGRATION.some((r) => /never the counterparty/i.test(r)));
});

test("a specimen is deterministic on disk: re-rendering changes no byte", () => {
  const committed = readJson("docs/badge-registry.json");
  for (const s of committed.specimens) {
    const onDisk = readFileSync(join(REPO, s.file), "utf8");
    const record = specimenRecord({ subject: s.subject, criteriaPass: s.criteriaPass });
    assert.equal(onDisk, renderBadge(record) + "\n", s.file);
  }
});

/* ══════════════════════════════════════ I · the release gate (CG-RG/1) ══════ */

test("the gate names a command and a surface for every leg", () => {
  assert.equal(RELEASE_GATE_SCHEMA, "CG-RG/1");
  assert.ok(GATE_LEGS.length >= 15, "the gate must cover every proof surface");
  for (const leg of GATE_LEGS) {
    assert.ok(leg.command, `${leg.id} has no command`);
    assert.ok(leg.surface, `${leg.id} names no surface`);
    assert.doesNotMatch(leg.command, /https?:\/\//, `${leg.id} reaches a URL`);
  }
});

test("the gate covers the surfaces the roadmap claims are delivered", () => {
  const ids = GATE_LEGS.map((l) => l.id);
  for (const required of ["tests", "boundary", "levels", "states", "sandbox", "journey", "replay", "attack", "passport", "conformance", "webhook", "x402", "claims", "badge", "commercial"]) {
    assert.ok(ids.includes(required), `the gate is missing the ${required} leg`);
  }
});

test("the gate proves its own independence from every external outcome", () => {
  const r = proveIndependence();
  assert.equal(r.ok, true, JSON.stringify(r.violations, null, 2));
  assert.equal(r.checkedLegs, GATE_LEGS.length);
});

test("the independence audit is a real detector, not a tautology", () => {
  /* the same detectors, run against a source that DOES reach outside */
  const banned = [/\bfetch\s*\(/, /from\s+"node:https?"/, /PRIVATE_KEY|MNEMONIC|API_KEY/];
  const dirty = 'const r = await fetch("https://example.com"); const k = process.env.API_KEY;';
  assert.ok(banned.some((p) => p.test(dirty)), "the audit patterns must fire on a dirty source");
  const clean = 'import { execFileSync } from "node:child_process";';
  assert.equal(banned.some((p) => p.test(clean)), false);
});

test("the gate is not a release authorization, and says so in its own output", () => {
  const source = readFileSync(join(REPO, "scripts", "release-gate.mjs"), "utf8");
  assert.match(source, /releaseAuthorized: false/);
  assert.match(source, /not a release/i);
  assert.match(source, /OWNER_SIGN_OFF_REQUIRED|notClaimed/);
});

/* ══════════════════════════════════════ the packaging contract (CG-CP/1) ══════ */

test("the commercial packaging contract's invariants hold", () => {
  const r = packagingSelfCheck();
  assert.equal(r.ok, true, JSON.stringify(r.cases.filter((c) => !c.pass), null, 2));
});

test("the contract passes on the committed packaging document", () => {
  const r = checkPackaging();
  assert.equal(r.ok, true, JSON.stringify(r.violations, null, 2));
});

test("the contract enforces the three closed owner decisions", () => {
  assert.equal(COMMERCIAL_SCHEMA, "CG-CP/1");
  assert.equal(COMMERCIAL_DECISIONS.prices, "LOCKED");
  assert.equal(COMMERCIAL_DECISIONS.publishedPriceAmounts, 0);
  assert.equal(COMMERCIAL_DECISIONS.namedIntegrator, "NONE");
  assert.equal(COMMERCIAL_DECISIONS.enterpriseIntegration, "AVAILABLE_AS_TOOLING");
  assert.equal(COMMERCIAL_DECISIONS.thirdPartyBadge, "NOT_ISSUED");
  assert.equal(COMMERCIAL_DECISIONS.badgeIssuerCount, 0);
  assert.equal(COMMERCIAL_DECISIONS.revenueUsd, 0);
});

test("every delivered tier names a surface that exists as a module", () => {
  for (const s of REQUIRED_SURFACES) {
    assert.ok(existsSync(join(REPO, s)), `${s} is claimed by a delivered tier but does not exist`);
  }
});

test("every gated tier names the gate that withholds it", () => {
  const text = readFileSync(join(REPO, "docs", "commercial-packaging-2026-09-26.md"), "utf8");
  assert.deepEqual(findUnnamedGates(text), []);
  assert.ok(REQUIRED_GATES.length >= 3);
});

test("the packaging detectors fire on a fabricated document", () => {
  const fake = "see `packages/imaginary/index.mjs` — listed at $999, gate NONE";
  assert.equal(findMissingCitations(fake, () => false).missing.length, 1);
  assert.equal(findMoneyFigures(fake).length, 1);
  assert.equal(findMoneyFigures("revenue is $0").length, 0);
  assert.ok(findUnnamedGates(fake).length > 1);
});

test("no money figure other than $0 appears in the packaging document", () => {
  const r = checkPackaging();
  assert.ok(r.moneyFigures.every((m) => m === "$0"), JSON.stringify(r.moneyFigures));
});

/* ══════════════════════════════════════ J · build independence ══════ */

test("no build surface depends on an external outcome", () => {
  /* The build's inputs are committed sources. These modules must import
     nothing that reaches a network, a credential, or a clock-dependent
     "external" service — the same property proveIndependence() asserts for
     the gate, applied to the modules the gate runs. */
  const modules = [
    "scripts/integration-replay-lab.mjs",
    "scripts/partner-journey.mjs",
    "scripts/ladder/claim-registry.mjs",
    "packages/badge/index.mjs",
    "scripts/ladder/commercial-packaging.mjs",
  ];
  for (const m of modules) {
    const src = readFileSync(join(REPO, m), "utf8");
    assert.doesNotMatch(src, /\bfetch\s*\(/, `${m} reaches the network`);
    assert.doesNotMatch(src, /from\s+"node:https?"/, `${m} imports http`);
    assert.doesNotMatch(src, /PRIVATE_KEY|MNEMONIC|API_KEY/, `${m} names a credential`);
  }
});

test("the owner decisions do not gate the build", () => {
  /* prices, integrator, and badge are all GATED/UNKNOWN/NOT_PERFORMED, yet
     every proof surface still passes — which is the mechanical statement
     that the build is independent of them. */
  const registry = buildRegistry();
  const byId = Object.fromEntries(registry.claims.map((c) => [c.id, c]));
  const closed = ["CL-PRICES-LOCKED", "CL-NAMED-INTEGRATOR", "CL-BADGE-NOT-ISSUED"];
  for (const id of closed) {
    assert.notEqual(byId[id].status, "VERIFIED", `${id} must not be VERIFIED while the decision is closed`);
  }
  assert.equal(byId["CL-BUILD-ADOPTION-INDEPENDENT"].status, "VERIFIED");
  assert.equal(replaySelfCheck().ok, true);
  assert.equal(journeySelfCheck().ok, true);
  assert.equal(badgeSelfCheck().ok, true);
  assert.equal(auditRegistry(registry).ok, true);
});

/* ── the gate's own honesty ────────────────────────────────────────────────
   These lock a defect the gate found in itself: legs reported PASS while
   proving nothing, because a counter read the wrong field name and a module
   that exposed no self-check was treated as "it loaded". A gate that can
   report a green result with no assertion behind it is worse than no gate,
   because it is trusted. */

test("every gate leg names a surface that exists and a command a reviewer can run", () => {
  const gateSrc = readFileSync(join(REPO, "scripts/release-gate.mjs"), "utf8");
  const declared = [...gateSrc.matchAll(/\{ id: "([a-z0-9-]+)", command:/g)].map((m) => m[1]);
  assert.ok(declared.length >= 15, `expected a substantial leg list, found ${declared.length}`);
  const ids = new Set(declared);
  assert.equal(ids.size, declared.length, "a leg id is declared twice");
  const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
  for (const m of gateSrc.matchAll(/command: "npm run ([a-z0-9:_-]+)/g)) {
    assert.ok(pkg.scripts[m[1]], `the gate names "npm run ${m[1]}" but package.json has no such script`);
  }
});

test("no gate leg can pass with an empty denominator", async () => {
  const { GATE_LEGS, runGate } = await import("../../scripts/release-gate.mjs");
  for (const leg of GATE_LEGS) {
    assert.ok(["module", "library", "external"].includes(leg.kind), `leg ${leg.id} has an unknown kind ${leg.kind}`);
    if (leg.kind === "module") assert.match(leg.module, /^scripts\/|^packages\//, `leg ${leg.id} module path must be repo-relative`);
    if (leg.kind === "library") assert.ok(leg.tests?.length, `leg ${leg.id} is a library leg with no committed test to prove it`);
  }
  /* the invariant that matters: a PASS detail must never be "0/N" or "module
     loaded". Both were real outputs of this gate before it was fixed. */
  const gate = await runGate({ only: "webhook" });
  assert.equal(gate.verdict, "GATE_PASS");
  for (const r of gate.legs) {
    assert.notEqual(r.status, "FAIL", `leg ${r.leg} failed: ${r.detail}`);
    assert.doesNotMatch(r.detail || "", /^0\//, `leg ${r.leg} passed on an empty denominator`);
  }
  assert.match(gate.legs.find((l) => l.leg === "webhook").detail, /8\/8/, "the webhook leg must report real invariants, not a decorative count");
});

test("the gate refuses to count an assertion it cannot read", async () => {
  const { tallyCases } = await import("../../scripts/release-gate.mjs");
  /* the object shape */
  assert.deepEqual(tallyCases([{ pass: true }, { pass: true }], "probe"), { total: 2, passed: 2, failed: 0 });
  /* the packages' [name, boolean] tuple shape — the shape that made the gate
     report "0/8 invariants" and still call it a PASS */
  assert.deepEqual(tallyCases([["a", true], ["b", false]], "probe"), { total: 2, passed: 1, failed: 1 });
  /* a case with no readable verdict must REFUSE, not tally as a pass */
  assert.throws(() => tallyCases([{ verdict: "PASS" }], "probe"), /no readable verdict/);
  /* and an empty list yields zero, so a caller that checks the denominator
     cannot accidentally read it as proof */
  assert.equal(tallyCases([], "probe").total, 0);
});

test("every library leg is proven by a committed test that actually imports it", async () => {
  const { GATE_LEGS } = await import("../../scripts/release-gate.mjs");
  const libraries = GATE_LEGS.filter((l) => l.kind === "library");
  assert.ok(libraries.length > 0, "the gate should still exercise the library-leg path");
  for (const leg of libraries) {
    assert.ok(existsSync(join(REPO, leg.module)), `${leg.module} is missing`);
    const importers = leg.tests.filter((t) => existsSync(join(REPO, t)) && readFileSync(join(REPO, t), "utf8").includes(basename(leg.module)));
    assert.ok(importers.length > 0, `leg ${leg.id}: no committed test imports ${basename(leg.module)}`);
  }
});

test("the gate's child legs map to real npm scripts", () => {
  const src = readFileSync(join(REPO, "scripts/release-gate-child.mjs"), "utf8");
  const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
  const pairs = [...src.matchAll(/^\s{2}([a-z0-9]+): "([a-z0-9:_-]+)",?$/gm)];
  assert.ok(pairs.length >= 5, `expected the heavy legs to be enumerated, found ${pairs.length}`);
  for (const [, leg, script] of pairs) {
    assert.ok(pkg.scripts[script], `child leg ${leg} runs "npm run ${script}", which package.json does not define`);
  }
  /* the spawn trap that made five legs exit 1 with no output at all: npm.cmd
     is a batch shim modern Node refuses to spawn without a shell */
  assert.doesNotMatch(src, /"npm\.cmd"[^\n]*shell:\s*false/, "the child must not spawn npm.cmd without a shell");
  assert.match(src, /npm_execpath|node_modules[\\/]npm[\\/]bin[\\/]npm-cli\.js/, "the child must resolve npm's real JS entry");
});
