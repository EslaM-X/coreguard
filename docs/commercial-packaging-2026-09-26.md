# Commercial Packaging — CoreGuard Verification Platform (2026-09-26)

Status: **tiers defined, prices LOCKED, revenue $0.** This document packages what exists
mechanically today and names, per tier, exactly what is delivered versus what is gated. It
publishes no price, promises no revenue, and claims no customer, partner, or adoption. Every
line below is either a committed file you can run or an explicit "not yet".

Pricing is not a decision this repository can make. `packages/pricing` is a
`1-hypothesis` version by design, and the x402 harness refuses to open a payment gate on any
price that the owner has not locked (`PRICE_NOT_LOCKED`, `priceStatus: HYPOTHESIS`). A tier
whose price is LOCKED is a packaging decision waiting on a commercial decision — not a
for-sale product.

## The tiers

### Open Core — the verifier (what is committed today)

- The L0–L4 verification protocol with L1 chain-confirmed receipts: `scripts/ladder/verification-levels.mjs`
- The 13-state integration machine with guard-checked transitions: `scripts/ladder/integration-states.mjs`
- The six-method adapter contract and the four provider stubs: `packages/adapters/`
- The conformance suite CG-CS/1 and its badge contract: `scripts/ladder/conformance.mjs`
- Evidence Passport v2: `scripts/passport-v2.mjs`
- The CG-WH/1 webhook receiver (HMAC, replay window, idempotency): `packages/webhook/index.mjs`
- The X402/1 request harness, gated on an owner-locked price: `packages/x402/index.mjs`
- The CG-IR/1 integration replay lab: `scripts/integration-replay-lab.mjs`
- The CG-PJ/1 ten-leg integration journey: `scripts/partner-journey.mjs`
- The CG-CL/1 claim registry and its ceiling auditor: `scripts/ladder/claim-registry.mjs`
- The CG-BDG/1 self-verifying badge system: `packages/badge/index.mjs`
- Reputation and risk machines (CG-RP/1, CG-RF/1), both deriving from committed milestones only
- Price: **LOCKED (owner decision)**

### Developer — the integration path

Everything in Open Core, plus:

- The Partner Sandbox: eight integration scenarios, offline, against a mock chain that knows one honest transaction (`scripts/partner-sandbox.mjs`)
- The Attack Lab: ten tamper cases that must fail closed, with a valid control (`scripts/attack-lab.mjs`)
- Local observability: ten typed events with correlation identity (`scripts/observability.mjs`)
- The three-verb quickstart: `examples/platform-quickstart/`
- Documented start lines that CI executes: `test/ci/docs-node-contract.test.js`
- Price: **LOCKED (owner decision)**

### Enterprise — a single deployment (NOT YET BUILT)

Would be: your deployment, your credentials, your chain, your data boundary, an SLA.

**Enterprise Integration is available as tooling, not as a partnership.** Everything an
integrator needs in order to deploy is in this repository and runs today; what does not exist
is a named party on either side of the contract. The named integrator is **NONE**, and the
owner decision is to keep it that way until a real counterparty exists who owns the key
material and the uptime. No company name appears on this tier, and none may be implied by
reusing the tooling.

Blocked on, and honest about, each prerequisite:

| Prerequisite | State | Why it is not a checkbox |
| --- | --- | --- |
| A named integrator | **NONE** (owner decision, 2026-09-26) | Every adapter is `DRY_RUN`; a deployment needs a party who owns the key material and the uptime |
| Live chain authority | absent | L1 `VERIFIED` requires a real `getReceipt`; there is no live path in this repository |
| Per-step owner approval | required | Decision A/B (2026-09-25) forbids execution or authorization without it |
| Security review | not performed | No third-party review has been done or may be claimed |
| Pricing | LOCKED | No commercial terms exist |

Gate: `OWNER_SIGN_OFF_REQUIRED`. Price: **LOCKED, and the tier does not exist as a deliverable
today.**

### Professional Services

Would be: integration work, evidence engineering, conformance runs.

Not sold, not scoped, no engagement exists. The only defensible statement today is the
self-service Developer path above.

### Network — the long game

Would be: many independent implementations passing one pinned conformance suite and holding
one badge that means only "this integration's attestations passed CG-CS/1 for the pinned
version".

Current state, mechanically: `badgeIssuerCount: 0` in `docs/conformance-report.json` and
`issuerCount: 0` in `docs/badge-registry.json`, because no integration has run the suite. The
badge's contract (`neverMeans`) forbids reading it as endorsement of a counterparty, its funds,
its adjudication, or any legal outcome.

**Owner decision (2026-09-26): the third-party badge is NOT ISSUED.** The badge system itself
is built and provable — `packages/badge/index.mjs` renders deterministic SVG whose embedded
payload is re-derivable from the record it names, and a forged or edited badge fails
verification — but the specimens in `docs/badges/` are labelled `SPECIMEN · NOT ISSUED` and
name no third party. Gate: `BADGE_NOT_ISSUED`. An issuance requires a CG-CS/1 record whose six
criteria all pass, plus an owner decision; neither exists.

Price: **LOCKED, and there is no network to price.**

## What no tier includes, at any price

- No guarantee of a counterparty, its funds, or its adjudication
- No guarantee of a settlement or legal outcome
- No ZK / L4 support claim: L4 is `RESEARCH` until a real circuit, prover, verifier, and benchmark exist
- No endorsement, partnership, or adoption of any third party
- No revenue: `docs/adoption-dashboard.md` reports `$0`, customers 0, partners 0, and stays that way until a real milestone is appended to `docs/adoption-milestones.json`

## Why the prices are locked rather than guessed

A published price is a claim a customer can hold you to. This repository's whole thesis is
that claims must be mechanically checkable, so publishing a number here would be the one
unverifiable claim in the system. The gate that enforces it is code, not intent: the x402
harness answers `GATED / PRICE_NOT_LOCKED` for every price that has not been locked by the
owner, and `settle()` in `DRY_RUN` books zero cents. Turning on prices is a one-line owner
decision plus a commit — and when it happens, the dashboard number changes in the same push,
like every other number in this repo.

## How to verify this document

- `npm run commercial:packaging` — the CG-CP/1 contract: every cited path exists, the only
  money figure is `$0`, prices are LOCKED, the named integrator is NONE, the badge count is 0,
  and every gated tier names its gate
- `npm run x402` (no quote → GATED; zero price → GATED; unlocked price → HYPOTHESIS; DRY_RUN settle → NOT_PERFORMED with zero revenue)
- `npm run webhook` (unsigned, tampered, stale, future-dated, duplicate, and missing-key cases)
- `npm run conformance:report` (criteria, badge contract, `badgeIssuerCount: 0`)
- `npm run badge:verify` (re-derives each specimen's digest from its record; a forged payload fails)
- `npm run claims:audit` (CG-CL/1: no claim may assert more than its evidence)
- `npm run partner:journey -- --self-check` (the ten-leg integration journey)
- `npm run release:gate` (every proof surface in one process, plus the gate's own independence audit)
- `npm run ladder:dashboard:write` (the commercial counters: `$0`, 0, 0)
- `npm test` (the suite total, enforced against `docs/state-snapshot.json`)

## Owner decisions — CLOSED 2026-09-26

These were open questions; the owner has now answered all three, and the answers are enforced
by code rather than by prose:

1. **Prices: LOCKED.** No amount is published, and the x402 gate answers `PRICE_NOT_LOCKED`
   for every price the owner has not locked. `packages/pricing` stays a `1-hypothesis`
   version. Turning prices on is a one-line owner decision plus a commit — and the dashboard
   number changes in the same push, like every other number here.
2. **Named integrator: NONE.** The Enterprise tier stays a document, not a promise.
   Enterprise Integration remains available as tooling that anyone may run; no party's name is
   attached to it, and the repository may not imply one.
3. **Badge: NOT ISSUED.** The badge contract wording is accepted as written. No third-party
   badge exists until a real CG-CS/1 pass and a separate owner decision.

Gate: `OWNER_SIGN_OFF_REQUIRED` for anything beyond this document.
