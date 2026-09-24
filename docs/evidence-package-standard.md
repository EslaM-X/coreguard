# Evidence-Package Labeling Standard (EVP/1)

A one-command reproducible **evidence package** — synthetic cases that separate
verifiable **execution facts** from **consent, obligation, and adjudication**
layers — became the recommended reference for CoreGuard fixture work in
2026-09-23, after iterative read-only review of these labels with People's
Court / Epistemic Labs (public elizaOS discussion #21788). The reviewer raised
two labeling ambiguities and confirmed the corrective schema shape; the
corrections are committed at `1e75fba`. This document codifies the resulting
rules so any future fixture or evidence package follows the same labels.

> Status note: the review was **read-only** and explicitly **not an
> endorsement, integration, pilot, or adjudication**. Nothing in this standard
> claims real-world authority, payment of a modeled compensation, or a merits
> outcome for any package it describes.

## 1. What an evidence package is

A small, deterministic, pinned set of JSON records that exercises one schema
question. The canonical example is the A/B assent pair:

- `examples/delivery-fixture/pairs/assent-pair/` — identical execution +
  delivery receipts in A and B; only modeled consent differs
- `examples/delivery-fixture/` — the full bilateral delivery-dispute fixture

## 2. Labeling rules (mandatory for packages this standard covers)

### 2.1 Consent is per-party first; the aggregate is a derived label

- The authoritative fields live at party level, e.g.
  `consent.parties.principalB.assent`.
- An aggregate such as `consent.modeledAssent` is a **derived tri-state
  string** over the party fields: `FULL | PARTIAL | MISSING | UNKNOWN`, with
  `modeledAssentDerivedFrom` naming the source fields and a note declaring the
  state space.
- The aggregate **must never be a boolean** and **must never be read as
  establishing bilateral assent**; a reader must go to the party fields.
- An unknown (e.g. B's `UNKNOWN`) stays `UNKNOWN` — it is **never derived from
  the execution receipt or the delivery manifest**.

### 2.2 Settlement separates evidence status from actual status

- Absence of settlement evidence supports `"not evidenced as settled"` —
  **never** a verified nonpayment finding.
- The record carries both, separately:
  - `evidenceStatus` — what the evidence supports (e.g. `NOT_EVIDENCED_AS_SETTLED`)
  - `actualStatus` — what is actually known (may be `UNKNOWN`)
- No boolean `status` field that reads as a settled-vs-not finding.

### 2.3 Unknowns are explicit and preserved

- Every package lists its unknowns (e.g. `realWorldAuthority`,
  `modeledCompensationSettlement`, `meritsOutcome`).
- A field that is not knowable from the package's evidence is declared unknown
  in the expected-field map with permitted attester `NONE`.

### 2.4 Field-level attestation permissions

`expected-field-map.json` labels each field with: value in A / value in B,
source, **permitted attester**, and whether it is unknown.

- RPC facts (tx hash, receipt status/block/gas/value) → `INDEPENDENT — public chain`
- Modeled consent → the modeled principal (`CLIENT_PRINCIPAL` / `PROVIDER_PRINCIPAL`)
- Derived labels and absences → `NONE — derived`, never attested from a receipt

### 2.5 Execution facts label identically when they are identical

A package that shares execution/delivery across cases uses **one shared object
per case tree, byte-equal by construction** (verifier invariants V2/V3), and the
expected-field map marks them `SAME_IN_A_B`.

## 3. Pinning and determinism

- Every emitted file is pinned by SHA-256 over its **exact bytes** in a
  `*-hashes.json` manifest that is self-excluded from its own pins.
- Generators are deterministic: fixed timestamps, no `Date.now()`, no network.
  Two runs must produce byte-identical trees (test-enforced).
- Trees whose bytes must match a fresh clone are `-text`-pinned in
  `.gitattributes` (no CRLF↔LF normalization).

## 4. One-command repro

The standard ships a generator + verifier + one-command CLI:

```bash
# full package: generate → pin → verify (11/11) → deliver to <dir>
npm run evidence-package -- --out <dir>
# or, without an npm dependency:
node scripts/make-evidence-package.mjs --out <dir>
```

Contract (exit codes 0/1/2, fail-closed):

- `0`  `EVP_OK` — package generated, pinned, verified
  (`ASSENT_PAIR OK 11/11`), delivered
- `1`  generation or verification failed — **no package delivered**
- `2`  usage error (missing `--out`, or target dir holds foreign files)

## 5. Boundaries (repeated in every package and doc)

- Synthetic fixture / synthetic parties; `synthetic: true` on every case.
- The execution layer may anchor a **REAL public chain transaction** that acts
  only as the execution coupon — it anchors the execution layer only, never
  delivery conformity.
- No package establishes real-world authority, payment of the modeled
  compensation, or a merits outcome.
- Review of this standard was read-only; it binds no third party to anything.

## 6. Files

| File | Role |
|---|---|
| `scripts/make-evidence-package.mjs` | one-command CLI (stage → verify → deliver → re-verify) |
| `examples/delivery-fixture/pairs/assent-pair/make-assent-pair.mjs` | deterministic generator |
| `examples/delivery-fixture/pairs/assent-pair/verify-assent-pair.mjs` | fail-closed verifier (11 invariants) |
| `examples/delivery-fixture/pairs/assent-pair/expected-field-map.json` | field → value → source → attester → unknown |
| `examples/delivery-fixture/pairs/assent-pair/pair-hashes.json` | SHA-256 pins (self-excluded) |
| `test/delivery/evidence-package.test.js` | CLI contract + fail-closed tests |
| `test/delivery/assent-pair.test.js` | pair contract + the two label regression tests |