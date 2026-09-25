# Current-State Audit of main — 2026-09-25

Owner-directive: before any external campaign, the truth of `main` is measured,
pinned in the canonical surfaces, and made reproducible in CI. This document is
that audit. Every number below is machine-measured on the committed tree and
mirrored in the canonical machine source `docs/state-snapshot.json` (regenerate
it with `node scripts/current-state.mjs --write --tests <full-suite pass count>`
after a green `npm test`; it is enforced by `scripts/run-tests.mjs` — drift is
red — and by `test/ci/current-state.test.js`).

Two hard constraints shape every verdict: **(1)** the People's Court / Epistemic
Labs engagement is an *external technical signal* (public read-only review, two
label ambiguities found, corrections shipped, regression tests added, protocol
artifacts derived) — it is **never** an endorsement, partnership, or verifier
run by them; **(2)** outcomes beyond verification (funding, pilots, prizes,
trends) are external results that nobody can promise.

## Measured state (this tree, this day)

| Metric | Value | Reproduction | Machine pin |
|---|---|---|---|
| Full test suite | **1033/1033 pass** | `npm test` | `run-tests.mjs` enforces pass total == `state-snapshot.json`.testsTotal (drift = red) |
| Boundary audit | **PASS — 780 files scanned (committed-tree scope), 0 violations** | `npm run boundary:audit` | `current-state.mjs --check` re-measures vs the snapshot |
| People's-Court harness | **PEOPLES_COURT_HARNESS_READY** (recorded feed; webhooks ×402 DRY-RUN; no live call, no credential) | `npm run peoples-court:harness -- --case examples/delivery-fixture/pairs/dispute-package/reference-A` | `current-state.mjs --check` |
| Docs-node contract | **70 executed · 53 skip-listed · 18 docs covered** | `node --test --test-concurrency=1 test/ci/docs-node-contract.test.js` | `current-state.mjs --check` |
| Git | `main`, **77 commits ahead** of `v0.6.0` (informational only — in flux with every push; canonical value lives in the snapshot) | `git rev-list v0.6.0..HEAD --count` | recorded in the snapshot as metadata |

The measured snapshot lives at `docs/state-snapshot.json` (committed, valid JSON,
anchored on a reachable commit). Numbers cited anywhere must match it; the
**970-era figures are retired** — the only current test number is the one the
snapshot enforces.

## The nine buckets

### 1. production-ready
What is production-strength *engine* work: the offline integrity core (`CGEP/1`
evidence packages, `verify`/`verify-provenance` EXIT-CODE discipline, hash-pinned
fixtures, deterministic verification, adversarial corpus 73/73, mutation lab
1000/1000 refused, 10k benchmark FA 0 / FR 0), fail-closed contract suites, and a
byte-deterministic evidence pipeline that runs identically everywhere.
Scope it honestly: there is **no deployed service, no SLA, no live network
integration**, and the on-chain anchor + `EvidenceRegistryV2` remain
owner-declared, not third-party-assessed.

### 2. demo-ready
The flagship pages (`docs/index.html` gauge, api/sdk reference pages — all under
the [C21][C24][C25] browser-boot + wire contracts), `demo:90s`, vault demo,
adversarial runner, and the two documented `startDeliveryEndpoint` lines that
were wire-proven verbatim (C25). These are what a skeptic can click today on an
ephemeral local server — no accounts, no credentials.

### 3. integration-ready
`@coreguard/sdk` + CLI + `@coreguard/agentic-escrow-arbitration`, the one-command
generators (`npm run evidence-package`, `npm run dispute-package`, `npm run
aea1:prepare`), the `peoples-court-adapter` attestation adapter, the
`reference-tribunal` synthetic adjudicator, and `docs/integration-surface-map`
(structural mapping to public tribunal surfaces, always "never another court").
Honest scope: the adapter's `integrationStatus` is **NOT_BUILT** — the surfaces
are ready to be *wired*, no wiring has happened.

### 4. structural-offline
Everything in this repo runs with zero live accounts: webhooks and ×402 are
DRY-RUN, feeds are recorded fixtures, and the boundary audit **refuses any file
that claims a performed network call** (`networkCall ≠ NOT_PERFORMED` is a
violation). Offline closure is the product property, and it is machine-enforced.

### 5. sellable now
What could be offered today without over-promising: the offline evidence-package
→ dispute-package → SDK/CLI toolchain as a **protocol artifact / library** an
integrating party can adopt into its own agentic dispute flow. Cannot be sold as
"a tribunal" or "an arbitrator" — the adjudication remains the consumer's, CoreGuard
supplies the verifiable evidence + escrow-arbitration boundary record (`AEA/1`).

### 6. pilotable
A bounded pilot is executable *only with a real integrator who holds the account
credential* (the owner's integrator decision — not yet made). The
evidence-package → dispute-package → adapter → harness pipeline is ready for
that pilot; execution always stays on the integrator's account; CoreGuard never
signs, broadcasts, or holds funds (governance binding).

### 7. pitchable to courts / dispute systems
The pitch is the evidence layer: a court-neutral, protocol-level
*verification-and-conformance infrastructure* (evidence packages with pinned
hash labels, tri-state modeled assent, evidenceStatus/actualStatus split,
unknowns preserved) that courts and tribunals can inspect, critique, and adopt
read-only — exactly the shape the People's Court read-only review exercised
two rounds of. Say: external read-only critique → two label ambiguities →
corrected → regression-tested → standardized (`EVP/1`, `ADAL/1`, `AEA/1`).
Never say: endorsement, partnership, "their verifier passed ours", "they run it".

### 8. pitchable to investors / grants
The investable story is the *market-verified gap*: agentic commerce has no
shared evidence rail, the Bespoke identity gap is the current friction (B) and
CoreGuard's rail is the missing link (C), with a public social-proof aperture
(your thread walked three rounds live). The material deliverables exist, are
commit-anchored, and are CI-enforced. Honest boundaries: no revenue, pricing
LOCKED, no deployed service, no legal review, no traction beyond the public
review rounds — none of that is ever claimed.

### 9. must-NOT-claim
The refuse list (each with the mechanical guard that makes the refusal true):
- *People's Court endorsement / partnership / verifier run* — their own words:
  "no endorsement, no independent chain verification, no verifier run,
  synthetic mapping, no pilot/integration commitment" (reconciled into
  `docs/elizaos-thread-replies-record` + `STATUS.md`).
- *Live integration / live network call* — boundary audit refuses it (B1).
- *Stored credentials* — audit + the git-tracking guard test refuse it (B6).
- *L3/L4 verification claimability* — the engine itself says INCONCLUSIVE /
  REQUIRED_BY_LEVEL for those levels.
- *External human review / legal review* — owner-declared release, explicitly
  never claimed.
- *Revenue / pricing / "court that CoreGuard runs"* — pricing LOCKED; the
  adjudicator is the consumer's, never "ours".
- *Old test numbers (970-era)* — the suite is 1033 and any stale citation is a
  drift bug, mechanically caught by the snapshot enforcement.

## How to refresh this audit
1. `npm test` → green, read the pass total.
2. `node scripts/current-state.mjs --write --tests <pass>` → new
   `docs/state-snapshot.json`.
3. If the snapshot's fast fields changed (audit files, harness, docs-node
   counts), update every doc that cites them (STATUS, this audit, claimable
   facts) so numbers match the snapshot.
4. `npm test` again → the enforcement must be green. Commit, rebase onto
   origin, `npm run prepush`, push, watch CI.