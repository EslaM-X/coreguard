# CoreGuard → People's Court / Epistemic Labs — Fixture Submission Package

**Status:** ready for counterparty review (draft for submission) · **Date:** 2026-09-23 ·
**Fixture:** `examples/delivery-fixture/` · **Boundary doc:** `docs/delivery-dispute-boundary.md` ·
**One-page public summary:** `INTEGRATION.md` (repo root)

> **Scope of this record (facts-only).** This document packages the DDE/1
> synthetic bilateral-dispute fixture for the exploratory review the People's
> Court / Epistemic Labs account offered on elizaOS thread #21788
> (reply of 2026-09-19). It asserts no commitment, agreement, pricing, or
> funding (all still LOCKED). It asserts no endorsement by People's Court /
> Epistemic Labs. It presents the fixture **exactly as built**, including the
> parts that are synthetic. Nothing in this record touches any frozen file
> (`docs/counterparty-*`, `docs/ws-5.md`, `scripts/verify-live.json`,
> `packages/verifier-c/*`, `submission/*`, `examples/pilot/proof-artifact-1.json`).

---

## 0. Honesty block (read first)

| Layer | Origin | Meaning |
|---|---|---|
| Execution anchor | **REAL** | public Pilot-1 Core Mainnet tx `0xe67c61fda81200bf026faee31c23a7b7e7f56ed24f06ffe24f071fa06891a9b8` (status `0x1`, block `38712625`, chainId `1116`); receipt re-verified live from `rpc.coredao.org` at fixture generation |
| Signatures | **REAL crypto** | genuine deterministic EIP-712 replays (authorized intent `0xe6843e56…c8463`, plus both redaction-consent grants) over test-derived keys — evidence of nothing beyond this fixture |
| Parties, delivery, dispute | **SYNTHETIC** | modeled scenario; `realDisputeExists: false` is structural, declared per record and at the manifest level |

This fixture is **not a real bilateral failure with reachable parties**. It is
the schema exercise + real-anchor proof requested in the thread's "include
whether the fixture is synthetic or from a real paid transaction; if real, the
permitted scope" clause. Submitting it as anything else would break the
evidence model this repo exists to protect.

## 1. Mapping: their freeze list → CoreGuard records

Response of 2026-09-19, itemized, each mapped to the record that carries it:

| Required item (their wording, compressed) | CoreGuard record | Live verification |
|---|---|---|
| Synthetic or real + permitted disclosure scope | `examples/delivery-fixture/hashes.json` (manifest `origin: "SYNTHETIC"`) + `consent-and-disclosure.json` (full disclosure block) | `fixtureOrigin: "SYNTHETIC"` in every run |
| Exact agreement and acceptance-criteria version | `agreement.json` (v1.0.0) + `acceptance-criteria.json` (4 criteria, fixed pre-delivery) | `ACCEPTANCE_CRITERIA → 4 criteria` |
| Agent and principal/operator identities and authority | `parties.json` (both sides, agents + principals, deterministic addresses) | consent grants replay |
| Declared intent, policy constraints, signer, transaction, execution attestation | `authorization.json` (EIP-712 intent `0xe6843e…c8463`) + `execution-attestation.json` (REAL anchor) | `AUTHORIZATION → 0xe6843e…` · `EXECUTION → 0xe67c61…` |
| Delivery artifact references and hashes | `delivery-manifest.json` (3 artifacts, exact-byte SHA-256 pins) | `E3 DELIVERY_INTEGRITY_REPLAY · checked: 3 · mismatches: 0` |
| Acceptance or rejection record | `acceptance-record.json` — `REJECTED` solely on criterion `C-QUALITY` (2 color tokens < required 3) | `B1 PAYMENT_INFERENCE_FORBIDDEN PASS` |
| Each side's position and requested remedy | `dispute-record.json` — closed remedy vocabulary (`A=NONE / B=REWORK`), no engine verdict | `B3 NO_ENGINE_ADJUDICATION PASS` |
| Explicit permission from both sides for the redacted review | `consent-and-disclosure.json` — 2 signed EIP-712 grants over one `fixtureRef` | `E5 CONSENT_BINDING PASS` |
| Retention and privacy limits | `retention-policy.json` (window ends `2027-09-19T00:00:00Z`, purge commitment) | mapped `RETENTION` |

## 2. Current live state (verified this date)

```json
{
  "status": "VERIFIED",
  "decision": "EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE",
  "checks": { "total": 10, "pass": 10, "fail": 0 },
  "hashesManifest": "PASS — all 10 records byte-exact vs hashes.json",
  "peoplesCourt": {
    "mappable": true,
    "gaps": [],
    "readiness": "READY_FOR_CLAIM_MAPPING — evidence classes complete; conformity question framed, not decided"
  },
  "anchor": { "txHash": "0xe67c61fda81200bf026faee31c23a7b7e7f56ed24f06ffe24f071fa06891a9b8" }
}
```

## 3. Repro commands (Node only, no install)

```bash
# 1 — the gate holds, 10/10
node examples/delivery-fixture/verify-fixture.mjs --json

# 2 — one flipped artifact byte fails closed (exit 1, E3 names both hashes)
node examples/delivery-fixture/verify-fixture.mjs --tamper logo.svg

# 3 — every check catches its own mutation; stacked defects never blind each other
node examples/delivery-fixture/adversarial-runner.mjs           # 13·13·0 · compound 5·5·0
node examples/delivery-fixture/adversarial-runner.mjs --fuzz 50 # seed-deterministic stacks

# 4 — the same gate over HTTP, plus the neutral evidence-class projection
node -e "import('./packages/delivery/http.js').then(m => m.startDeliveryEndpoint({ port: 8787 }))"
curl -sS -X POST http://127.0.0.1:8787/peoples-court -H "content-type: application/json" --data-binary @fixture.json
```

Live in-page (no local run needed): https://eslam-x.github.io/coreguard/DDE-API-REFERENCE.html ·
One page: https://github.com/EslaM-X/coreguard/blob/main/INTEGRATION.md

## 4. Cover letter (paste-ready, English, for #21788)

```
Subject: CoreGuard DDE fixture for the exploratory mapping review

Directly answers the "include" list from your 2026-09-19 response.

ANSWER TO Q1 — synthetic or real: this fixture is labeled synthetic at every
level (manifest + per record, realDisputeExists: false), with two REAL layers
underneath: the execution anchor is the public Pilot-1 Core Mainnet tx
0xe67c61fd…91a9b8 (status 0x1, block 38712625, chainId 1116, receipt
re-verified from rpc.coredao.org), and the intended-action signature plus both
redaction grants are genuine EIP-712 replays. There is no real bilateral
failure with reachable parties yet; as soon as one exists with both parties'
signed consent we will use your request-demo intake rather than posting it.

EVIDENCE CLASSES (stacked against your freeze list):
agreement v1.0.0 (agreement.json) · acceptance criteria, 4 fixed pre-delivery
(acceptance-criteria.json) · parties + principals with authority (parties.json)
· authorized intent / signer / policy / transaction / execution attestation
(authorization.json + execution-attestation.json) · delivery artifacts with
SHA-256 pins (delivery-manifest.json, checked 3/3) · rejection record citing
criterion C-QUALITY (acceptance-record.json) · both positions with a closed
remedy vocabulary, A=NONE / B=REWORK (dispute-record.json) · both parties'
signed consent over one fixtureRef (consent-and-disclosure.json) · retention
window to 2027-09-19 + purge commitment (retention-policy.json).

THE SEPARATION, ENFORCED IN CODE NOT PROSE: the gate cannot cite
"payment settled" as an acceptance basis (B1), cannot accept or reject with
zero criterion evaluations (B2), and cannot name a winner (B3). Execution
verification never decides delivery conformity. Live state: VERIFIED (10 PASS)
· EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE ·
READY_FOR_CLAIM_MAPPING, zero gaps.

Repro (Node only): node examples/delivery-fixture/verify-fixture.mjs --json
(exit 0, 10/10); --tamper logo.svg (exit 1, E3 names both hashes);
node examples/delivery-fixture/adversarial-runner.mjs (13/13 caught,
compound 5/5). Wire: POST /verify and /peoples-court (loopback by default).
In-page live engine: https://eslam-x.github.io/coreguard/DDE-API-REFERENCE.html

TWO QUESTIONS:
1. Is the synthetic-with-real-anchor fixture acceptable as the mapping test
   your 2026-09-19 reply describes, or should the mapping wait for a real
   bilateral case?
2. Preferred delivery: post the fixture publicly here, or through
   https://peoplescourt.ai/request-demo for your manual scoping workflow?

No claims beyond what the fixture verifiably is. We preserve the record; the
procedure and its verdicts are yours.
```

## 5. Bound-not-ply disclaimer

Whatever happens after this package: CoreGuard keeps the evidence sealed,
hash-pinned, and adjudication-free. The neutral procedure's claim mapping,
merits, and remedy are People's Court / Epistemic Labs' — not CoreGuard's.
Neither this record nor the thread reply predicts their outcome.