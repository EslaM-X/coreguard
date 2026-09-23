# CoreGuard → People's Court / Epistemic Labs — Fixture Submission Package

**Status:** ready for exploratory review · **Date:** 2026-09-23 ·
**Canonical reply:** §4 below — a short, paste-ready letter for elizaOS #21788.
**Full technical appendix:** §1–§3 + §5 — for the request-demo / manual-scoping path,
**not** for a long public post.

> **Scope of this record (facts-only).** This document packages the DDE/1
> synthetic bilateral-dispute fixture for the exploratory review the People's
> Court / Epistemic Labs account offered on elizaOS thread #21788
> (reply of 2026-09-19). It asserts no commitment, agreement, pricing, or
> funding (all still LOCKED). It asserts no endorsement by People's Court /
> Epistemic Labs. It presents the fixture **exactly as built**, including the
> parts that are synthetic. Nothing in this record touches any frozen file
> (`docs/counterparty-*`, `docs/ws-5.md`, `scripts/verify-live.json`,
> `packages/verifier-c/*`, `submission/*`, `examples/pilot/proof-artifact-1.json`).

> **What the numbers in this record are — and are not.** The `10/10 PASS`,
> `READY_FOR_CLAIM_MAPPING`, and `zero gaps` strings are outputs of
> **CoreGuard's own verifier and evidence-class projection**, produced from the
> committed tree and reproducible with the commands in §3. They are a claim
> about CoreGuard's fixture, not an assessment, endorsement, or acceptance by
> People's Court / Epistemic Labs, and do not constitute proof of a real
> integration. They are assertions of this repository, made verifiable
> (not merely asserted) by the commands that reproduce them.

---

## 4. Canonical reply (paste-ready, for #21788)

```
Thanks. We prepared a dated, redacted fixture submission for exploratory
mapping.

To be explicit, the fixture is synthetic at the party/dispute/delivery level,
while it contains a real execution anchor on Core Mainnet. It is not presented
as a real bilateral paid dispute.

The package maps the agreement and acceptance criteria, parties and authority,
authorization and execution evidence, delivery hashes, acceptance/rejection
record, dispute positions, consent/disclosure scope, and retention limits.

CoreGuard's verifier establishes whether the execution evidence is admissible
and consistent with the declared authorization. It deliberately does not
decide whether delivery satisfied the agreement; that remains a separate
acceptance or dispute-resolution question.

Would you consider this labeled synthetic fixture useful as a technical
mapping test? If so, would you prefer the public thread or the request-demo
path for review?

Repository commit: ea59a88
```

This is the post. The referenced commit is the stable commit the fixture and
its verifier state were reproduced from (the same state holds at later commits
— the fixture tree is unchanged). Nothing longer goes to the thread. The
appendices below are the material that accompanies the same package through
request-demo / manual scoping, or is pointed to when a reviewer asks for the
machine-readable side.

---

## 0. Technical honesty block (read first — appendix)

| Layer | Origin | Meaning |
|---|---|---|
| Execution anchor | **REAL** | public Pilot-1 Core Mainnet tx `0xe67c61fda81200bf026faee31c23a7b7e7f56ed24f06ffe24f071fa06891a9b8` (status `0x1`, block `38712625`, chainId `1116`); receipt re-verified live from `rpc.coredao.org` at fixture generation |
| Signatures | **REAL crypto** | genuine deterministic EIP-712 replays (authorized intent `0xe6843e56…c8463`, plus both redaction-consent grants) over test-derived keys — evidence of nothing beyond this fixture |
| Parties, delivery, dispute | **SYNTHETIC** | modeled scenario; `realDisputeExists: false` is structural, declared per record and at the manifest level |

This fixture is **not a real bilateral failure with reachable parties**. It is
the schema exercise + real-anchor proof the thread's "include whether the
fixture is synthetic or from a real paid transaction" clause asks to label
honestly. A real case, when one exists with both parties' signed consent, goes
to `peoplescourt.ai/request-demo` directly, never through a synthetic fixture.

## 1. Mapping: their freeze list → CoreGuard records (appendix)

| Required item (their wording, compressed) | CoreGuard record | What the verifier emits |
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

## 2. Current verifier state (appendix)

Reproduced at HEAD `ea59a88`, 2026-09-23, from the committed tree:

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

This is CoreGuard's own verifier + projection output (see the scope note at
the top). It is a claim about CoreGuard's fixture, reproducible below — not a
statement about People's Court / Epistemic Labs' view of it.

## 3. Repro commands (appendix; Node only, no install)

All numbers below pinned from a real run at HEAD `ea59a88`, 2026-09-23.

```bash
# 1 — the gate holds: VERIFIED (10 PASS), decision as in §2
node examples/delivery-fixture/verify-fixture.mjs --json

# 2 — one flipped artifact byte fails closed (exit 1, E3 names both hashes)
node examples/delivery-fixture/verify-fixture.mjs --tamper logo.svg

# 3 — every check catches its own mutation; stacked defects never blind each other
node examples/delivery-fixture/adversarial-runner.mjs           # 13 mutations · 13 caught · 0 survived · compound 5 batteries · 5 caught · 0 survived
node examples/delivery-fixture/adversarial-runner.mjs --fuzz 50 --seed 424242  # 50 seed-deterministic stacks · 0 survived

# 4 — the same gate over HTTP, plus the neutral evidence-class projection
node -e "import('./packages/delivery/http.js').then(m => m.startDeliveryEndpoint({ port: 8787 }))"
curl -sS -X POST http://127.0.0.1:8787/peoples-court -H "content-type: application/json" --data-binary @fixture.json
```

Live in-page (no local run needed): https://eslam-x.github.io/coreguard/DDE-API-REFERENCE.html ·
One page: https://github.com/EslaM-X/coreguard/blob/main/INTEGRATION.md

## 5. Bound-not-ply disclaimer (appendix)

CoreGuard keeps the record sealed, hash-pinned, and adjudication-free. The
neutral procedure's claim mapping, merits, and remedy are People's Court /
Epistemic Labs' — not CoreGuard's. Neither this record nor the thread reply
predicts their outcome. The next milestone that matters is their review
decision and the specific feedback it produces — nothing else changes that.