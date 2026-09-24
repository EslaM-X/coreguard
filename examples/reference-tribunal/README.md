# reference-tribunal — local, synthetic adjudication simulator

**NOT People's Court.** This is CoreGuard's named, deterministic, offline
stand-in that exercises the protocol's fail-closed dispute/settlement semantics
end-to-end — so the conformance suite and demos have a complete execution path
without any real adjudicator, credential, or network call.

## Components

| File | Purpose |
|---|---|
| `sim-tribunal.mjs` | synthetic adjudicator (CLI + pure `adjudicate()` API) |
| `mock-escrow.mjs` | fail-closed settlement state machine (refuses anything not authority-bound) |

Both are pure Node, deterministic, and emit clearly-labeled `SYNTHETIC`
artifacts. No funds, no keys, no broadcast. Ever.

## Scenarios (all fail-closed)

| Scenario | Record condition | Tribunal result |
|---|---|---|
| `A` | FULL modeled assent + pins verified | SYNTHETIC award + settlement instruction permitted |
| `B` | PARTIAL modeled assent (B UNKNOWN) | REFUSED — bilateral consent not evidenced |
| `C` | settlement evidence UNKNOWN | BLOCKED — UNKNOWN is never converted to NOT_SETTLED |
| `D` | presented award signature invalid | REJECTED |
| `E` | package hash tampered | REJECTED at the verifier stage |

## Usage

```bash
# produce a synthetic award + settlement instruction (scenario A only)
node examples/reference-tribunal/sim-tribunal.mjs \
  --case examples/delivery-fixture/pairs/dispute-package/reference-A \
  --scenario A --out .tmp-out

# exercise the settlement boundary (only executes a valid, authority-bound instruction)
node examples/reference-tribunal/mock-escrow.mjs \
  --award .tmp-out/tribunal-reference-A-synth-award.json \
  --settlement .tmp-out/tribunal-reference-A-synth-settlement.json
```

## The honesty boundary

- Synthetic signatures (`SYNTHETIC_DEMO_HMAC`) bind the award's own content so
  tampering is detected by the mock escrow — they are transport/integrity
  semantics, NOT a real adjudicator's award.
- A "settlement instruction" from this simulator **cannot execute anything by
  itself**. Real execution requires a separately scoped settlement adapter
  credential within the authority corpus (mirroring the Partner API's
  `decision_served` rule).
- CoreGuard governance stays binding: no Mainnet signing, no broadcast, escrow
  reference-only (`CONDITIONAL NO-GO`).