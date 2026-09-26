# CoreGuard Verification & Integration Platform — Continuous Build (2026-09-26)

Owner mandate: never wait for an external milestone. Build and adoption run in
parallel; the engine is the product and adoption is the path. This document is
the map of what now runs locally, what the gates enforce, and what stays
UNKNOWN until a real counterparty provides real evidence.

Measuring surfaces (CI-enforced; do not hand-edit):

- docs/state-snapshot.json — testsTotal 1153 · filesScanned 817 · violations 0 · docsNode 81·53·18
- docs/evidence-passport-v2.json — the portable verification identity
- docs/adoption-dashboard.md — the control plane, derived numbers only
- docs/reputation-registry.json — UNPROVEN / score 0 (zeros are the trust feature)

## 1. Verification ladder (machine-enforced, CGEP/1)

| Level | Machine | Rule | Status |
|---|---|---|---|
| L0 | scripts/ladder/verification-levels.mjs commit() | intent -> canonical -> sha256 -> commitmentId; replayable | AVAILABLE |
| L1 | verifyReceipt(receipt, commitment, chain) | VERIFIED only when every field is present, consistent, AND a chain authority confirms txHash/blockHash | AVAILABLE (chain required) |
| L2 | replay(intent, receipt, rules) | MATCH / MISMATCH / UNKNOWN; a partial pass never upgrades to MATCH | AVAILABLE |
| L3 | merkleTree / merkleProof / verifyMerkle | real sha-256 tree; a third party proves one leaf without the bundle | AVAILABLE |
| L4 | L4_BOUNDARY | RESEARCH; interface frozen (5 provider methods) | RESEARCH |

The L1 chain rule is the honesty hinge added this cycle: a format-valid receipt
is UNKNOWN (NO_CHAIN_EVIDENCE) until a chain confirms it, and a chain that
contradicts it is MISMATCH. Structure alone never yields VERIFIED.

## 2. Integration ladder (13 doorway states, machine records)

scripts/ladder/integration-states.mjs bridges the guarded transition table to
an outcome machine (ACTIVE / FAILED / UNKNOWN / REJECTED). Every state carries
entryCriteria, requiredEvidence, verificationCommand, exitCriteria,
failureState, unknownState, auditRecord. evaluateIntegration() returns a
deterministic record (no timestamps, empty claims until evidence exists).
transitionVerdict() answers REJECTED on any jump that skips authorization —
never a silent pass. fullAuthorizationRecords() lists the 13 named records a
live integration must carry.

## 3. Adapter contract (one shape, honest status)

packages/adapters/contract.mjs — every adapter implements exactly six methods:
prepare / validate / execute / captureReceipt / verify / status.
The honesty contract: execute() in DRY_RUN returns ok:false, status
NOT_PERFORMED; verify() in DRY_RUN is UNKNOWN; status() without credentials is
UNKNOWN / NOT_BUILT / NO_CREDENTIALS. No adapter can claim a live step it did
not perform.

providers.mjs inventories four surfaces (People's Court, Reference Tribunal,
Agentic Escrow, x402) — all DRY_RUN, no credentials, contract-conformant.
Run: npm run adapters:status.

## 4. Partner Sandbox (offline, 8 scenarios)

npm run partner:sandbox — local Agent -> Intent -> Commitment -> Mock chain ->
Receipt -> Replay -> Merkle -> Verdict, fully offline. The mock chain knows one
genuinely mined tx; a swapped tx is TX_NOT_FOUND. Verdicts: happy-path
VERIFIED · tampered-receipt MISMATCH · missing-evidence UNKNOWN ·
partial-consent UNKNOWN · unknown-settlement UNKNOWN · replay-mismatch
MISMATCH · expired-authorization REJECTED · duplicate-execution REJECTED.

## 5. Attack Lab (10 tamper cases, fail-closed)

npm run attack-lab — altered-receipt, altered-intent, hash-mismatch,
stale-proof, wrong-block, replay-mismatch land FAIL (MISMATCH/contradiction);
wrong-chain, wrong-subject, missing-evidence, forged-adapter-status land
UNKNOWN; the untouched valid path lands VERIFIED. Exit code 1 if any attack
does not land on its expected verdict.

## 6. Observability (local, no sensitive data)

scripts/observability.mjs — ten events (commitment_created,
execution_started, receipt_captured, verification_started,
verification_passed, verification_failed, unknown_entered, adapter_called,
webhook_received, passport_generated) with correlationId / caseId /
commitmentId / adapterId / level. Memory by default; a JSONL file only on
explicit request. No network, no collection.

## 7. Evidence Passport v2 (portable identity)

scripts/passport-v2.mjs -> docs/evidence-passport-v2.json — one object:
subject, verificationLevel, commitment, receipts, proofs, riskFindings,
reputationMilestones, integrations, claims, unknowns. Deterministic
(fixed key order, no timestamps) so the committed file is hash-stable. Today:
verificationLevel L0, receipts [], proofs [], reputationScore 0, unknowns
spelled out. L4 stays RESEARCH inside unknowns — 'ZK supported' is never
claimed.

## 8. Control Plane (derived numbers only)

scripts/ladder/adoption-dashboard.mjs gained a controlPlane block: five
verification rows (L0 PASS, L1 RECORDED_ONLY, L2 REPLAY_CAPABLE, L3
AVAILABLE, L4 RESEARCH), four integration rows (sandbox AVAILABLE, webhook
AVAILABLE — CG-WH/1 HMAC + replay window + idempotency, adapters DRY_RUN,
production UNKNOWN), and three commercial rows (revenue $0, customers
0 verified, partners 0 verified). No percentage is printed; every value is
read from a committed source or stays at its honest default.

## 9. Reputation (milestone taxonomy, never a rating)

scripts/ladder/reputation.mjs — MILESTONE_KINDS classifies milestones as
internal (TESTS_PASSING, CONFORMANCE_PASS, REPLAY_VERIFIED — recorded as
evidence, they never raise the score) or external (EXTERNAL_VERIFIER,
SANDBOX_INTEGRATION, LIVE_RECEIPT, PRODUCTION_INTEGRATION, MULTI_PARTNER,
COMMERCIAL_USAGE — these raise the score, one point each, never the amount).
Unknown kinds and unknown counters are ignored, never invented. Today: grade
UNPROVEN, score 0.

## 10. Definition of Done (DoD) — platform + integrations

Every shipped capability carries: CODE + TEST + SCHEMA + CLI + DOCUMENTATION +
FAIL-CLOSED + UNKNOWN + DEMO + CONFORMANCE + OBSERVABILITY. An integration
additionally carries: SANDBOX + ADAPTER + RECEIPT + REPLAY. A live claim
additionally carries: REAL AUTHORITY + CREDENTIAL + RECEIPT + INDEPENDENT
VERIFICATION. This cycle's L0–L3, the integration machine, the adapter
contract, the sandbox, the attack lab, the passport and the control plane each
carry the full first list; the integration list is proven by the sandbox and
attack lab; the live list is honest-UNKNOWN.

## 11. KPI funnel (instrumented, never inflated)

Public Artifact -> Developer Run -> Conformance Pass -> Production Integration
-> Paid Engagement -> Recurring Revenue -> Partner Expansion. The first two
steps are locally provable; every later step stays 0 until a recorded,
authorized external event appends to docs/adoption-milestones.json.

## 12. Commercial surfaces (CG-WH/1, X402/1, CG-CR/1)

Three surfaces the roadmap listed as "AVAILABLE" that had no code behind them.
This cycle built them rather than softening the claim, and each one refuses to
do the thing it cannot honestly do.

- `packages/webhook` — CG-WH/1, the receiver: domain-separated HMAC-SHA256 over
  the exact body bytes plus a sender timestamp (constant-time compare), a
  replay window that rejects stale AND future-dated deliveries, and a
  mandatory Idempotency-Key whose replay returns the FIRST outcome without
  re-running the handler. DRY_RUN authenticates and reports NOT_PERFORMED; a
  handler that throws yields UNKNOWN. There is no keyless mode and no built-in
  side effect. Run: `npm run webhook`.
- `packages/x402` — X402/1, the commercial-request harness: a deterministic
  canonical 402 challenge whose id is a function of the canonical bytes, signed
  with a domain-separated HMAC only when the integrator injects a secret. The
  admission gate is the point: no quote, a zero quote, or a price the owner has
  not locked are all GATED, and an unlocked price is labelled
  `priceStatus: HYPOTHESIS`. `settle()` needs an injected settler; DRY_RUN books
  zero cents and there is no code path that increments revenue. Run:
  `npm run x402`. This is what the X402 provider row in
  `packages/adapters/providers.mjs` always pointed at; the path exists now.
- `docs/conformance-report.json` — CG-CR/1, the machine-readable conformance
  report: the six criteria, the badge contract, and `badgeIssuerCount: 0`,
  because no integration has run CG-CS/1 yet. It carries no timestamp on
  purpose: an artifact that churns every run trains reviewers to ignore diffs.
  Run: `npm run conformance:report`.
- `examples/platform-quickstart/` — the three-verb path (commit, capture,
  verify) that a new integrator actually starts from, offline, with a non-zero
  exit if any honesty line is wrong. Run: `npm run quickstart`.
- `docs/commercial-packaging-2026-09-26.md` — the five tiers with, per tier,
  what is delivered versus what is gated. Prices LOCKED, revenue $0, and a test
  that fails the build if the document ever names a missing file or advertises
  a number other than $0.

## 13. Run everything (one line each)

- npm run verify:levels          # L0–L4 self-check
- npm run integration:states     # 13-state machine self-check
- npm run partner:sandbox        # 8 offline scenarios
- npm run attack-lab             # 10 tamper cases
- npm run passport:v2            # the portable identity
- npm run adapters:status        # four DRY_RUN providers
- npm run observability          # event sink self-check
- npm run webhook                # CG-WH/1 receiver self-check
- npm run x402                   # X402/1 gated harness self-check
- npm run conformance:report     # writes docs/conformance-report.json
- npm run quickstart             # the three-verb integration path
- npm test                       # the suite, CI-enforced against the snapshot

## 14. Binding honesty rules (restated so future work cannot drift)

1. UNKNOWN is insufficient evidence. UNKNOWN is not FAILED and not VERIFIED.
2. A format-valid receipt without a chain confirmation is UNKNOWN.
3. execute() in DRY_RUN never claims execution.
4. L4 is RESEARCH; no 'ZK supported' until a real circuit, prover, verifier,
   benchmark and conformance exist.
5. Reputation counts external milestones only; engineering numbers are
   evidence, not reputation.
6. Revenue, customers and partners stay 0 until a real event is recorded.
7. Every number in any document is machine-measured and CI-enforced; a stale
   number is a failing build.
8. A surface named in an inventory must exist. When a doc or a registry row
   claims "AVAILABLE", the code is either there or the row is downgraded — the
   two CG-WH/1 and X402/1 rows that were prose-only are now real modules, and
   a test asserts the packaging document cites only files that exist.
