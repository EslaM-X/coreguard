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
- The CG-WH/1 webhook receiver (HMAC, replay window, idempotency): `packages/webhook`
- The X402/1 request harness, gated on an owner-locked price: `packages/x402`
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

Blocked on, and honest about, each prerequisite:

| Prerequisite | State | Why it is not a checkbox |
| --- | --- | --- |
| A named integrator | none | Every adapter is `DRY_RUN`; a deployment needs a party who owns the key material and the uptime |
| Live chain authority | absent | L1 `VERIFIED` requires a real `getReceipt`; there is no live path in this repository |
| Per-step owner approval | required | Decision A/B (2026-09-25) forbids execution or authorization without it |
| Security review | not performed | No third-party review has been done or may be claimed |
| Pricing | LOCKED | No commercial terms exist |

Price: **LOCKED, and the tier does not exist as a deliverable today.**

### Professional Services

Would be: integration work, evidence engineering, conformance runs.

Not sold, not scoped, no engagement exists. The only defensible statement today is the
self-service Developer path above.

### Network — the long game

Would be: many independent implementations passing one pinned conformance suite and holding
one badge that means only "this integration's attestations passed CG-CS/1 for the pinned
version".

Current state, mechanically: `badgeIssuerCount: 0` in `docs/conformance-report.json`, because
no integration has run the suite. The badge's contract (`neverMeans`) forbids reading it as
endorsement of a counterparty, its funds, its adjudication, or any legal outcome.

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

- `node packages/x402/index.mjs`-based self-check: `npm run x402` (no quote → GATED; zero price → GATED; unlocked price → HYPOTHESIS; DRY_RUN settle → NOT_PERFORMED with zero revenue)
- `npm run webhook` (unsigned, tampered, stale, future-dated, duplicate, and missing-key cases)
- `npm run conformance:report` (criteria, badge contract, `badgeIssuerCount: 0`)
- `npm run ladder:dashboard:write` (the commercial counters: $0, 0, 0)
- `npm test` (the suite total, enforced against `docs/state-snapshot.json`)

## Decision needed from the owner

1. Lock or keep locked: the price of each tier (or confirm the hypothesis stays a hypothesis).
2. Name the integrator, or confirm the Enterprise tier stays a document and not a promise.
3. Confirm the badge contract wording before it is ever printed next to a third party's name.
