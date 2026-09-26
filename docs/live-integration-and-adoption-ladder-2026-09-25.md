# Live Integration & Adoption Ladder — CoreGuard (2026-09-25)

This is the operating architecture for how CoreGuard moves from an open,
offline, reproducible evidence layer toward a court-neutral, partner-ready
integration infrastructure — **without ever claiming a live step that did not
happen**. Every status on this page is backed by a machine-measured surface;
the honest position is not a weakness, it is the product.

## 1. The two axes

- **Per-integration state** (`scripts/ladder/states.mjs`) — what one adapter
  has provably reached.
- **Platform level** (`L0–L8`, same file) — what the network as a whole has
  provably reached. Current level: **L0 — PUBLIC / REPRODUCIBLE / OFFLINE**.

The state space (13 states, in order):

`NOT_STARTED → DESIGNED → DRY_RUN → SANDBOX_READY → SANDBOX_AUTHORIZED → LIVE_PREPARED → WEBHOOK_CONNECTED → CONFORMANCE_TESTING → CONFORMANT → PRODUCTION`, with `SUSPENDED`, `REVOKED`, `DEPRECATED` as the non-operational outcomes.

A state means what its entry in `STATE_MEANING` says. Advisory authority is
mirrored in `STATE_AUTHORITY`: nothing past `DRY_RUN` is real until the
transition guards below are satisfied by recorded records.

## 2. The guarded transition machine

`scripts/ladder/state-machine.mjs` is a pure, deterministic transition table.
Every edge into a live step carries requirements that a repository alone can
never fabricate:

| Step | Requires |
|---|---|
| `SANDBOX_READY → SANDBOX_AUTHORIZED` (L1) | `namedIntegrator` + `ownerApproval` + `environmentSandboxOnly` + `noRealFunds` |
| `SANDBOX_AUTHORIZED → LIVE_PREPARED` (L2) | + `adjudicationSurfaceConfirmed` + `noSettlementAuthority` |
| `LIVE_PREPARED → WEBHOOK_CONNECTED` (L3) | + `webhookSecurity` + `policyBoundaryActive` |
| `CONFORMANCE_TESTING → CONFORMANT` | `conformanceSuitePass` |
| `CONFORMANT → PRODUCTION` | + `securityCheckPass` + `evidenceContractPass` + `partnerApproval` + `deploymentScopeDefined` |

The red line is enforced twice: in prose and in code. The machine refuses every
live transition whose records are absent — you can ask it directly:

`node scripts/ladder/evidence-passport.mjs` and `node scripts/ladder/cli.mjs`
(for humans), and any caller can prove WHY a step is blocked by reading
`evaluateTransition(from, to, conditions).missing`.

## 3. Platform levels L0–L8

- **L0 — PUBLIC / REPRODUCIBLE / OFFLINE**: evidence generation, deterministic
  verification, replay, tamper detection, fail-closed semantics, dry-run
  adapters — all reproducible from a fresh clone. **(this is where we are)**
- **L1 — AUTHORIZED SANDBOX**: an integrator holds a limited sandbox credential
  (scoped, audited, revocable; no real funds, no settlement).
- **L2 — LIVE ADJUDICATION PREPARATION**: a prepared `adjudication.prepare()`
  packet is accepted by a real external platform; still no automatic
  settlement.
- **L3 — LIVE WEBHOOK INTEGRATION**: live adjudication results stream into the
  verifier through an audited webhook (auth, replay protection, event ids,
  idempotency, dead-letter).
- **L4 — PRODUCTION CONFORMANCE**: the production integration still passes the
  CoreGuard Conformance Suite on every release.
- **L5 — MULTI-PARTNER INTEROPERABILITY**: CoreGuard is the neutral evidence
  layer between multiple adjudicators; no single one is load-bearing.
- **L6 — VERIFIABLE INFRASTRUCTURE**: versioned receipts, verification
  registry, integration attestations, compatibility matrix, machine-readable
  status.
- **L7 — COMMERCIAL INFRASTRUCTURE**: verification service, conformance,
  evidence gateways — the MIT protocol stays open; the value is services.
- **L8 — PARTNER NETWORK**: partner program, adapter marketplace, ecosystem
  listings — we build the system that makes it easy for others to come to us.

No level is claimed by intent; a level is reached only when an adapter's state
floor and every listed prerequisite are recorded and visible in the registry.

## 4. CoreGuard Conformance Suite

`scripts/ladder/conformance.mjs` defines the fixed, versioned suite
(`CG-CS/1`) with six criteria: evidence contract, determinism, replay, tamper
detection, security, compatibility. A verdict is computed ONLY from the
evidence object you pass in — nothing is assumed.

**"CoreGuard Verified Integration"** (the badge) means exactly and only:
this integration passed the CoreGuard Conformance Suite for the pinned
version. It is **not** an endorsement: not of the counterparty, its funds, its
adjudication, or its project; and it grants no live authority by itself.

## 5. Evidence Passport

`scripts/ladder/evidence-passport.mjs --write` produces
`docs/integration-registry.json` — a deterministic, machine-readable passport
for every adapter with `integrationStatus NOT_BUILT`, `networkCall
NOT_PERFORMED`, a true state, an environment, capabilities, and limitations.
Human passports print via `--print`. The generated file is regenerated only
from the registry source (`scripts/ladder/adapters.mjs`); never hand-edited.

## 6. Adoption Dashboard

`scripts/ladder/adoption-dashboard.mjs --write` produces
`docs/adoption-dashboard.md` — one board reading five committed sources
(snapshot, registry, milestones, risk findings, reputation), with a governance
block summarizing CG-RF/1 (8 findings, 4 open) and CG-RP/1 (grade UNPROVEN,
score 0). Engineering numbers are the measured truth; external milestone
counters are 0 until an authorized step appends to
`docs/adoption-milestones.json`. The board never invents a number upward and
never hides a zero.

## 7. Funding ladder (targets, never promises)

- Stage A — technical evidence: **done** (suite + boundary + snapshot).
- Stage B — first external verifier: next milestone to chase.
- Stage C — first integration (DRY-RUN → sanctioned sandbox).
- Stage D — multiple conformant integrations.
- Stage E — first paid engagement (verification/conformance/infrastructure).
- Stage F — recurring revenue.
- Stage G — partner ecosystem.

None of these is a claim; each is a doorway. As the owner's binding policy
says, no v0.7.x on commit count — a release requires one of the four external
triggers (external verifier ran the package / first integration pilot / first
real adapter consumer / first paid engagement), and funding outcomes are never
promised in advance.

## 8. Owner decisions on the live ladder (2026-09-25, binding)

- **Decision A (scope)**: live steps L1–L3 are authorized only when a **named
  integrator** exists with a concrete use case and a **recorded owner
  approval** per step; L1 as a sandbox authorization, L2/L3 pilot-only, never
  standing. **Automatic settlement is never authorized.** Current ceiling
  today: L0.
- **Decision B (identity)**: the credential-holding integrator is **nobody for
  now** — the credential is defined only when a real partner/integrator
  appears and the use case is concrete. Until then every surface stays
  DRY-RUN and `integrationStatus` stays `NOT_BUILT`.

These decisions recorded in the decisions instrument
(`docs/owner-decisions-and-claimable-facts-2026-09.md` §4/§8). They are the
answer to the Phase 3 questions, not the opening of any live step.

## 9. Verification of this page

Everything here is machine-checked by `test/integrations/ladder.test.mjs` and
`test/integrations/ladder-v03.test.mjs`:
state space integrity, transition guards (including the refusal of live steps
without records), registry honesty (NOT_BUILT / NOT_PERFORMED, no invented
state), passport determinism, conformance verdicts, dashboard buildability,
and the v0.3 reputation/findings determinism + fail-closed contracts.
`npm run ladder:status` prints the same truths directly.

## 10. Risk findings & reputation (v0.3 first-pass, 2026-09-25)

`scripts/ladder/risk-findings.mjs` (CG-RF/1) and
`scripts/ladder/reputation.mjs` (CG-RP/1) make the v0.3 surface enforced,
deterministic code reading committed sources only — never a fuzzy safety score.

- **Risk findings (`docs/risk-findings.json`, generated)**: 8 findings
  (RF-001..RF-008) with statuses OPEN / OK / UNVERIFIED over categories
  integration · governance · adoption · validation · engineering. The file is
  derived-status-only: statuses change with the sources, numbers never embed,
  so the artifact stays hash-stable across test-count changes. It fails
  closed — the moment any registered adapter reports a live status, RF-003
  (settlement authority) goes OPEN and RF-001 (live call) goes UNVERIFIED.
- **Reputation (`docs/reputation-registry.json`, generated)**: reputation
  equals ONLY recorded external milestones — 1 point per recorded entry,
  never the amount. Today: score 0, grade UNPROVEN, all six external counters
  0. Unknown counters are ignored, never invented.
- Regenerate with `npm run ladder:findings:write` + `npm run ladder:reputation:write`
  any time the snapshot moves; the dashboard governance block
  (§6) reads the same two files.

## 11. Verification & Integration Platform (v0.3.1, 2026-09-26)

The platform that makes this ladder runnable offline is specified in
`docs/verification-and-integration-platform-2026-09-26.md` and enforced by
`test/integrations/verification-platform.test.mjs`:

- **L0–L4 machine** (`npm run verify:levels`): deterministic commitment; L1
  requires a chain authority — a format-valid receipt with no confirmation is
  UNKNOWN/NO_CHAIN_EVIDENCE and a contradicting chain is MISMATCH; L2 replay
  never upgrades a partial pass; L3 merkle proofs available; L4 interface
  frozen, RESEARCH.
- **Integration machine** (`npm run integration:states`): the 13 doorway states
  of §3 each carry entry/exit criteria, required evidence, a verification
  command, a failure state, an UNKNOWN state and an audit record; an
  unauthorized jump is REJECTED, never a silent pass.
- **Adapter contract** (`npm run adapters:status`): one six-method surface;
  execute() in DRY_RUN returns NOT_PERFORMED; status() without credentials is
  UNKNOWN / NOT_BUILT.
- **Partner Sandbox** (`npm run partner:sandbox`): 8 offline scenarios on a
  mock chain — happy VERIFIED, tampered MISMATCH, missing/partial/unknown
  UNKNOWN, expired/duplicate REJECTED.
- **Attack Lab** (`npm run attack-lab`): 10 tamper cases — tampered FAIL,
  unknown UNKNOWN, valid VERIFIED, exit 1 on any miss.
- **Evidence Passport v2** (`npm run passport:v2`): one deterministic
  portable object (`docs/evidence-passport-v2.json`).
- **Control Plane**: the dashboard's derived verification / integration /
  commercial block, with `$0` / 0 / 0 shown as-is and no invented percentage.