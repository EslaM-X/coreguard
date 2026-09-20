# Delivery & Dispute Evidence — Integration Boundary (DDE/1)

**Status:** draft for counterparty review · **Version:** DDE/1 · **Date:** 2026-09-19
**Engine:** `packages/delivery/index.js` (zero dependencies) · **Fixture:** `examples/delivery-fixture/` · **Verify:** `node examples/delivery-fixture/verify-fixture.mjs`

> **The boundary in one sentence.** Execution verification does not decide
> delivery conformity. Acceptance or rejection of the delivered work is a
> separate determination recorded by the parties — never derived from
> on-chain facts.

---

## 1. What CoreGuard proves, and what it does not

| Layer | Domain | What it establishes | What it can never establish |
|---|---|---|---|
| Authorization | provenance (CoreGuard) | who signed which declared intent, under which constraints | whether the delivered work matched the deal |
| Execution | provenance (CoreGuard) | that the authorized transaction ran and settled | whether the delivered work matched the deal |
| Delivery | **DDE/1** | what was delivered, when, pinned by SHA-256 | whether it was *acceptable* |
| Acceptance / Dispute | **DDE/1** (records only) | both parties' verdicts, positions, remedies | a winner — structurally |

A signature proves who authorized a transfer. A chain proves what settled.
**Neither is evidence that the brief was satisfied.** DDE/1 enforces this in
code, not in prose.

## 2. The evidence lifecycle

```
agreement + acceptance criteria
        ↓  (party records, sha256-pinned)
authorized intent (EIP-712, replayable)
        ↓  (provenance layer)
execution proof (on-chain receipt — REAL anchor in the fixture)
        ↓  (payment settles)
delivery evidence (artifacts + hashes)
        ↓  (party act, citing criteria)
acceptance / rejection record
        ↓  (if rejected)
dispute record — both positions, closed remedy vocabulary, no engine verdict
        ↓
closed record → neutral claim/evidence/readiness mapping (projection only)
```

## 3. The fail-closed checks

| ID | Check | Enforces |
|---|---|---|
| F0 | REQUIRED_RECORDS | all ten records present |
| F1 | EXECUTION_ACCEPTANCE_SEPARATION | acceptance cites criteria, is signed by a party, and never grounds itself in execution facts ("payment settled", "receipt proves", derivedFrom: execution) |
| F2 | CRITERIA_CLOSURE | every criterion evaluated, every evaluation cites a real criterion — no silent skips, no invented passes |
| F3 | LIFECYCLE_CONSISTENCY | the declared state matches what records establish |
| E3 | DELIVERY_INTEGRITY_REPLAY | every artifact re-hashes to its pin — one flipped byte fails |
| E4 | AUTHORIZATION_BINDING | delivery descends from the signed agreement, execution, and declared intent |
| E5 | CONSENT_BINDING | both parties' redaction-consent signatures replay (EIP-712); without an adapter: NOT_RUN, never fabricated |
| B1 | PAYMENT_INFERENCE_FORBIDDEN | `basis=[PAYMENT_SETTLED]` can never be the acceptance basis; ACCEPTED requires CRITERIA_EVALUATION |
| B2 | EXECUTION_DOES_NOT_DECIDE_CONFORMITY | ACCEPTED/REJECTED with zero evaluations is impossible |
| B3 | NO_ENGINE_ADJUDICATION | both positions + remedies from a closed vocabulary; the engine names no winner |

Every report carries the boundary banner verbatim; DDE output cannot be
quoted without it.

## 4. Determinism and honesty model of the fixture

- **`origin: "SYNTHETIC"`** at the manifest level and per record; the
  disclosure block states `realDisputeExists: false` in plain language.
- **The execution anchor is REAL**: the public Pilot-1 transaction on Core
  Mainnet (`0xe67c61fd…91a9b8`, status `0x1`, block `38712625`), receipt
  re-verified live from `rpc.coredao.org` at generation time.
- **Signatures are cryptographically real** (EIP-712, deterministic RFC-6979
  over counter-derived test keys) — genuine replays that evidence nothing
  beyond the fixture itself.
- **Fully deterministic**: fixed timestamps, counter keys, canonical
  hashing; two runs are byte-identical (test-enforced).

## 5. Interface with a neutral dispute procedure

`mapToPeoplesCourt(fixture)` is a **pure projection**: it classifies the
fixture's evidence into nine classes (agreement, criteria, authorization,
execution, delivery, acceptance record, dispute record, consent, retention)
and reports `READY_FOR_CLAIM_MAPPING` or names its gaps. It performs no
custody transfer, no judgment, no merit finding, and asserts no
relationship with any specific provider — inclusion of the mapping implies
no endorsement by People's Court / Epistemic Labs.

The intended handoff: a verified DDE fixture gives a neutral procedure a
closed, hash-pinned, dual-signed record — so the procedure can frame the
conformity question without payment settlement or a valid signature
silently deciding it.

## 6. What this design deliberately does not do

- It does not judge who is right. Both positions survive verbatim.
- It does not let payment settle = acceptance, structurally.
- It does not treat a real signature as a real party.
- It does not decide remedies; it constrains them to a closed vocabulary.
- It does not replace escrow, arbitration, or law — it makes the record
  they would consume verifiable and complete.
