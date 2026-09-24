# A/B assent pair — synthetic fixture

Identical execution and delivery receipts in **A** and **B**; the modeled
**consent** is the only intended difference. Built for the next-test request in
[elizaOS #21788](https://github.com/orgs/elizaOS/discussions/21788)
(2026-09-23) from People's Court / Epistemic Labs: a bounded, read-only critique
of the evidence labels.

| | A — `ASSENT_PRESENT` | B — `ASSENT_MISSING` |
|---|---|---|
| execution (real public anchor) | identical | identical |
| delivery manifest (synthetic artifacts) | identical | identical |
| party-A modeled assent | `ASSENTED` | `ASSENTED` |
| party-B modeled assent | `ASSENTED` | `UNKNOWN` — absent / scoped to ACTION-9, never filled from the receipt |
| aggregate `modeledAssent` | `FULL` (derived tri-state) | `PARTIAL` (derived tri-state) — never a boolean; never read as bilateral assent |
| settlement | `evidenceStatus = NOT_EVIDENCED_AS_SETTLED` · `actualStatus = UNKNOWN` | identical |
| unknowns | explicit | explicit, plus `principalBAssentForThisObligation` |

## Files

- `make-assent-pair.mjs` — deterministic generator (fixed timestamps, no network).
- `verify-assent-pair.mjs` — fail-closed checker (exit 0/1/2).
- `assent-a.json`, `assent-b.json` — the two cases.
- `expected-field-map.json` — labels execution facts identically; shows B lacks
  modeled assent, and who may attest each field.
- `pair-hashes.json` — SHA-256 pins over the exact bytes of every emitted file.

## Repro

```
node make-assent-pair.mjs               # regenerate in-place
node make-assent-pair.mjs --out <dir>   # or into another dir
node verify-assent-pair.mjs             # run from a pair directory
```

## The mapping the pair is meant to test

Execution facts are attesting-worthy and label identically in A and B.
Modeled consent is separate: in **B** the missing party-B assent exists as an
explicit `UNKNOWN` and must never be derived from the execution receipt or the
delivery manifest. The aggregate `consent.modeledAssent` is a derived
tri-state label (`FULL`/`PARTIAL`), never a boolean, and never a read for
bilateral assent — the party-level fields stay authoritative. Settlement is
recorded as `evidenceStatus = NOT_EVIDENCED_AS_SETTLED` with
`actualStatus = UNKNOWN`, keeping the evidence status separate from any actual
settlement finding. Version and hashes are pinned; field-level attestation
permissions are listed in `expected-field-map.json`.

## Boundaries

- Both cases are **synthetic**. The execution layer is a REAL public Core
  Mainnet anchor (`0xe67c…9b8`) used identically in A and B; that anchors the
  execution layer only, never delivery conformity.
- No EIP-712 signatures exist in this pair. Modeled assent is declared fixture
  data, not a cryptographic/portable signature.
- Neither case establishes real-world party authority, payment of the modeled
  compensation (0.25 CORE; `compensationSettlement.evidenceStatus =
  NOT_EVIDENCED_AS_SETTLED` · `actualStatus = UNKNOWN` in both), or a merits
  outcome. Absence of settlement evidence is recorded as not-evidenced, never
  as a verified nonpayment finding.
- The offered critique is bounded and read-only — not an integration, pilot,
  ongoing review, or adjudication.