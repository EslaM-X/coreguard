# CoreGuard DDE — Integration (one page)

[![Docs Wire Contract](https://github.com/EslaM-X/coreguard/actions/workflows/docs-contract.yml/badge.svg)](https://github.com/EslaM-X/coreguard/actions/workflows/docs-contract.yml) · **every command on this page is executed against a live endpoint on every push**

> **Execution verification does not decide delivery conformity.**
> Acceptance or rejection of the delivered work is a separate determination
> recorded by the parties, not derived from on-chain facts.
>
> Every CoreGuard DDE report carries this statement (`DDE-BOUNDARY`). Quote a
> report, you quote the boundary with it.

CoreGuard's Delivery & Dispute Evidence layer (DDE/1) lets any platform —
agent platform, escrow, settlement tooling — hold a payout until delivery
evidence **and** an explicit party acceptance say otherwise, while
structurally preventing execution proof from silently deciding conformity.

## What the engine enforces
Ten fail-closed checks, semantics fixed in `packages/delivery` (zero
dependencies, Node ≥ 18):

| # | Check | What it kills |
|---|---|---|
| F0 | REQUIRED_RECORDS | a "fixture" missing any of the ten evidence records |
| F1 | EXECUTION_ACCEPTANCE_SEPARATION | acceptance grounds quoting execution facts (`"payment settled"`, `"receipt proves"`, …) |
| F2 | CRITERIA_CLOSURE | skipped criteria, invented passes |
| F3 | LIFECYCLE_CONSISTENCY | a declared state the records do not establish |
| E3 | DELIVERY_INTEGRITY_REPLAY | a flipped byte in a delivered artifact (SHA-256 replay) |
| E4 | AUTHORIZATION_BINDING | delivery not descending from the signed intent/agreement/execution |
| E5 | CONSENT_BINDING | fabricated consent — NOT_RUN without an EVM adapter, never guessed |
| B1 | PAYMENT_INFERENCE_FORBIDDEN | `basis=["PAYMENT_SETTLED"]` alone producing ACCEPTED |
| B2 | EXECUTION_DOES_NOT_DECIDE_CONFORMITY | verdicts resting on zero criterion evaluations |
| B3 | NO_ENGINE_ADJUDICATION | the engine naming a winner; remedies outside the closed vocabulary |

The honest success shape is `VERIFIED` +
`EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE`:
the evidence is admissible, and **the engine has not judged the delivery**.

## Run the reference fixture

```bash
# 1. clone and enter the repo (every later fence assumes this cwd):
git clone --depth 1 https://github.com/EslaM-X/coreguard && cd coreguard
node examples/delivery-fixture/verify-fixture.mjs
```

```bash
# 2. the tamper gate — fail-closed in memory, exit 1, no files touched:
node examples/delivery-fixture/verify-fixture.mjs --tamper logo.svg
```

## Generate a ready payment-gate scaffold for your own project

```bash
# 3. the one-command DDE scaffold (same repo cwd, your own directory):
node scripts/create-integration.mjs my-escrow-dapp --dde
cd my-escrow-dapp && node verify-dde.mjs && node --test
```

## Verify over HTTP (acceptance API)

```bash
# 4. back at the repo root: start the endpoint and probe health
node --input-type=module -e "import { startDeliveryEndpoint } from './packages/delivery/http.js'; const server = await startDeliveryEndpoint({ port: 8787 }); console.log('DDE endpoint on :8787 —', server.address());"
curl -sS http://127.0.0.1:8787/health
```

| Code | Meaning |
|---|---|
| `200` | `VERIFIED` · `EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE` |
| `422` | `FIXTURE_REJECTED` — E3 names the flipped byte and both hashes |
| `400` | malformed JSON — rejected, never a 5xx |
| `413` | body over 1 MiB — declared + streamed gates |
| `429` | per-IP fixed window with `retry-after` |
| `403` | address allowlist (third guard) — even `/health` is withheld |
| `404` | wrong path/method — boundary header on every response |

## Two-line SDK gate (the release law)

```bash
# 5. the release law against the reference fixture (repo root cwd):
node --input-type=module -e "import { verifyFixture, releaseWhen } from './packages/delivery/sdk.js'; const report = await verifyFixture({ fixtureDir: './examples/delivery-fixture' }); const gate = releaseWhen(report, () => false); console.log(report.status, '·', report.decision); console.log('release:', gate.release, '—', gate.reasons[0]);"
```

A settled transaction satisfies neither half of the gate alone: release
requires a `VERIFIED` report **and** a party-signed acceptance record resting
on criterion evaluations. Signatures, receipts and settlement are admissible
evidence — never a verdict.

## People's Court intake projection

```bash
# 6. the C1–C6 intake projection (repo root cwd):
node --input-type=module -e "import { loadFixtureFromDir, verifyFixture } from './packages/delivery/sdk.js'; const { fixture } = loadFixtureFromDir('./examples/delivery-fixture'); const report = await verifyFixture({ fixture, peoplesCourt: true }); console.log('readiness:', report.peoplesCourt.readiness, '· mappable:', report.peoplesCourt.mappable);"
```

`mapToPeoplesCourt()` projects the ten records into the C1–C6 evidence
classes and returns `READY_FOR_CLAIM_MAPPING` or the named gaps — a pure
projection: no persistence, no judgment, no endorsement by People's Court /
Epistemic Labs.

## Links

- Review a converted fixture in <10 minutes: <https://github.com/EslaM-X/coreguard/blob/main/REVIEW-GUIDE.md>
- Live API reference (the engine runs in the page): <https://eslam-x.github.io/coreguard/DDE-API-REFERENCE.html>
- Live bilateral-dispute demo: <https://eslam-x.github.io/coreguard/DELIVERY-DISPUTE-DEMO.html>
- Boundary document: <https://github.com/EslaM-X/coreguard/blob/main/docs/delivery-dispute-boundary.md>
- Evidence fixture: <https://github.com/EslaM-X/coreguard/tree/main/examples/delivery-fixture>
- elizaOS discussion thread: <https://github.com/orgs/elizaOS/discussions/21788>
- Real bilateral failure fixture (both parties willing): <https://peoplescourt.ai/request-demo>

## Share-ready short version

```text
CoreGuard DDE: execution proof never decides delivery conformity. 10 fail-closed checks; a flipped artifact byte fails closed; payout opens only on a signed party acceptance over explicit criteria — never on a receipt. One-page integration: https://github.com/EslaM-X/coreguard/blob/main/INTEGRATION.md — reviewer path through a fixture: https://github.com/EslaM-X/coreguard/blob/main/REVIEW-GUIDE.md
```
