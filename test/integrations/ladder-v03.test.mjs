import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  FINDING_VERSION,
  FINDING_STATUSES,
  FINDING_SEVERITIES,
  FINDING_CATEGORIES,
  LIVE_STATE_NAMES,
  deriveFindings,
  build as buildFindings,
  findingsText,
} from "../../scripts/ladder/risk-findings.mjs";
import {
  REPUTATION_VERSION,
  REPUTATION_COUNTERS,
  GRADE_BANDS,
  REPUTATION_RULE,
  buildReputation,
  build as reputationBuild,
  reputationText,
} from "../../scripts/ladder/reputation.mjs";
import { ADAPTER_REGISTRY } from "../../scripts/ladder/adapters.mjs";
import { buildBoard, boardText } from "../../scripts/ladder/adoption-dashboard.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const SNAPSHOT = JSON.parse(readFileSync(join(REPO, "docs", "state-snapshot.json"), "utf8"));
const REGISTRY = JSON.parse(readFileSync(join(REPO, "docs", "integration-registry.json"), "utf8"));

const snapshot = () => SNAPSHOT;
const registry = () => REGISTRY;
const liveAdapter = { status: "LIVE_PREPARED", integrationStatus: "NOT_BUILT" };

test("risk findings: deterministic and schema-complete", () => {
  const a = deriveFindings({ snapshot: snapshot(), registry: registry(), milestones: [] });
  const b = deriveFindings({ snapshot: snapshot(), registry: registry(), milestones: [] });
  assert.equal(JSON.stringify(a), JSON.stringify(b), "risk findings must be deterministic");
  assert.equal(a.version, FINDING_VERSION);
  assert.equal(a.suite, "CoreGuard Risk Findings");
  assert.equal(a.findings.length, 8);
  const ids = a.findings.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, "finding ids must be unique");
  for (const x of a.findings) {
    assert.match(x.id, /^RF-\d{3}$/);
    assert.ok(x.title.length >= 10, `${x.id} needs a real title`);
    assert.ok(FINDING_CATEGORIES.includes(x.category), `${x.id} category must be enum`);
    assert.ok(FINDING_SEVERITIES.includes(x.severity), `${x.id} severity must be enum`);
    assert.ok(FINDING_STATUSES.includes(x.status), `${x.id} status must be enum`);
    assert.ok(x.statement.length >= 20, `${x.id} needs a real statement`);
    assert.ok(Array.isArray(x.evidence) && x.evidence.length >= 1, `${x.id} needs evidence refs`);
  }
});

test("risk findings: today's committed state derives the honest statuses", () => {
  const reg = deriveFindings({ snapshot: snapshot(), registry: registry(), milestones: [] });
  const byId = Object.fromEntries(reg.findings.map((x) => [x.id, x]));
  assert.equal(byId["RF-001"].status, "OPEN", "no live integration is an open risk");
  assert.equal(byId["RF-002"].status, "OPEN", "no named integrator is an open risk");
  assert.equal(byId["RF-003"].status, "OK", "no settlement authority is a holding control");
  assert.equal(byId["RF-004"].status, "OPEN", "zero external milestones is an open risk");
  assert.equal(byId["RF-005"].status, "OPEN", "synthetic-fixtures-only is an open risk");
  assert.equal(byId["RF-006"].status, "OK", "boundary audit must be clean today");
  assert.equal(byId["RF-007"].status, "OK", "suite pin must hold today");
  assert.equal(byId["RF-008"].status, "OK", "docs-node + harness must be green today");
});

test("risk findings: a live-status adapter flips fail-closed (RF-001, RF-003, RF-005)", () => {
  const reg = deriveFindings({
    snapshot: snapshot(),
    registry: registry(),
    milestones: [],
    adapters: [...ADAPTER_REGISTRY.map((a) => ({ status: a.state, integrationStatus: a.integrationStatus })), liveAdapter],
  });
  const byId = Object.fromEntries(reg.findings.map((x) => [x.id, x]));
  assert.equal(byId["RF-001"].status, "UNVERIFIED", "a live-status adapter makes 'no live integration' unprovable (fail-closed)");
  assert.equal(byId["RF-003"].status, "OPEN", "any surface claiming live authority flips the settlement finding to OPEN");
  assert.equal(byId["RF-005"].status, "UNVERIFIED", "a non-DRY_RUN adapter makes fixture provenance unverifiable");
  assert.ok(LIVE_STATE_NAMES.includes("LIVE_PREPARED"));
});

test("risk findings: a recorded external milestone closes RF-004", () => {
  const reg = deriveFindings({
    snapshot: snapshot(),
    registry: registry(),
    milestones: [{ counter: "funding" }],
  });
  const byId = Object.fromEntries(reg.findings.map((x) => [x.id, x]));
  assert.equal(byId["RF-004"].status, "OK", "a real recorded milestone closes the zero-counter finding");
  assert.equal(byId["RF-001"].status, "OPEN", "a funding milestone alone never claims a live integration");
});

test("reputation: deterministic, UNPROVEN today, every counter exposed at zero", () => {
  const a = buildReputation({ milestones: [] });
  const b = buildReputation({ milestones: [] });
  assert.equal(JSON.stringify(a), JSON.stringify(b), "reputation must be deterministic");
  assert.equal(a.version, REPUTATION_VERSION);
  assert.equal(a.grade, "UNPROVEN");
  assert.equal(a.score, 0);
  assert.ok(a.gradeLabel.includes("never") || a.gradeLabel.toLowerCase().includes("engineering truth"));
  for (const c of REPUTATION_COUNTERS) assert.equal(a.counters[c], 0, `${c} must be zero today`);
  assert.equal(GRADE_BANDS[0].grade, "UNPROVEN");
  assert.ok(REPUTATION_RULE.length > 40);
});

test("reputation: each milestone is exactly one point, never the amount", () => {
  const one = buildReputation({ milestones: [{ counter: "funding", amount: 500 }] });
  assert.equal(one.score, 1, "a funding milestone is one point, not its amount");
  assert.equal(one.counters.funding, 1);
  assert.equal(one.grade, "EARLY-EVIDENCE");
  const three = buildReputation({ milestones: [{ counter: "funding" }, { counter: "integrations" }, { counter: "externalVerifiers" }] });
  assert.equal(three.score, 3);
  assert.equal(three.grade, "EARLY-EVIDENCE");
  const five = buildReputation({ milestones: Array.from({ length: 5 }, (_, i) => ({ counter: "integrations", id: i })) });
  assert.equal(five.score, 5);
  assert.equal(five.grade, "VERIFIED-START");
});

test("reputation: unknown counters are ignored, never invented", () => {
  const rep = buildReputation({ milestones: [{ counter: "reputationBoost", amount: 1_000_000 }, { counter: "funding" }] });
  assert.equal(rep.score, 1, "unknown counters must not raise the score");
  assert.equal(rep.counters.funding, 1);
});

test("generated registries match the deterministic build (kept in sync by git)", () => {
  const committedRisk = JSON.parse(readFileSync(join(REPO, "docs", "risk-findings.json"), "utf8"));
  assert.equal(JSON.stringify(committedRisk), JSON.stringify(buildFindings()), "docs/risk-findings.json must equal the deterministic build");
  const committedRep = JSON.parse(readFileSync(join(REPO, "docs", "reputation-registry.json"), "utf8"));
  assert.equal(JSON.stringify(committedRep), JSON.stringify(reputationBuild()), "docs/reputation-registry.json must equal the deterministic build");
  assert.equal(committedRisk.version, FINDING_VERSION);
  assert.equal(committedRep.version, REPUTATION_VERSION);
  assert.equal(committedRep.grade, "UNPROVEN");
});

test("dashboard surfaces risk findings and reputation from committed sources", () => {
  const board = buildBoard();
  assert.ok(board.governance, "board must carry a governance block");
  assert.equal(board.governance.reputationGrade, "UNPROVEN");
  assert.equal(board.governance.reputationScore, 0);
  assert.ok(board.governance.openFindings >= 4, `unproven posture should expose >= 4 open findings, saw ${board.governance.openFindings}`);
  assert.equal(board.governance.riskFindingsVersion, FINDING_VERSION);
  const txt = boardText(board);
  assert.ok(txt.includes("Risk findings"), "board text must name the risk-findings surface");
  assert.ok(txt.includes("UNPROVEN"), "board text must show the honest reputation grade");
});

test("findings/status surfaces print honestly for humans", () => {
  const reg = deriveFindings({ snapshot: snapshot(), registry: registry(), milestones: [] });
  const t = findingsText(reg);
  assert.ok(t.includes("COREGUARD RISK FINDINGS"));
  assert.ok(t.includes("never a fuzzy safety score"));
  for (const x of reg.findings) assert.ok(t.includes(x.id), `text must list ${x.id}`);
  const rep = buildReputation({ milestones: [] });
  const rt = reputationText(rep);
  assert.ok(rt.includes("UNPROVEN"));
  assert.ok(rt.includes(REPUTATION_RULE));
});