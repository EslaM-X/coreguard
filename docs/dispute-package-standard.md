# Agentic Dispute & Attestation Layer Protocol (ADAL/1)

A single-file, deterministic, pinned **dispute package** that connects the
CoreGuard evidence layer (execution attestation + consent/delivery records) to
an external adjudication step — without ever letting the verified technical
facts be read as a legal conclusion.

ADAL/1 builds on the EVP/1 evidence-package rules (`docs/evidence-package-standard.md`)
and the A/B assent pair (`examples/delivery-fixture/pairs/assent-pair/`). It
adds the layers People's Court / Epistemic Labs described as the disputed-record
shape in the public elizaOS #21788 thread: an offer/agreement, identity/consent,
delivery + payment proof, each side's position and requested remedy, and a point
at which the record closes.

> Status note: this is a **protocol design and reference implementation inside
> this repo**. It is **not** an integration with, endorsement by, or commitment
> from any tribunal platform. No escrow contract is deployed or signed; no live
> adapter is connected to any API. See `tribunal-adapter` and `escrow-ref`
> below for the explicit `NOT_BUILT` / reference-only labels.

## 1. Why a dispute package in addition to an evidence package

An evidence package proves **execution facts and their labels** (EVP/1). A
dispute package additionally records what the parties **each claimed** about the
delivery, what remedy each **requested**, and the point at which the record
**closes** — the inputs an external adjudicator needs — while keeping the
adjudication itself out of the package. CoreGuard never fills the award slot
and never declares a winner.

The single-file shape means one command produces the whole record, and any
tribunal adapter can ingest one deterministic document (or refuse it) instead of
gluing many files together.

## 2. Layers (all inside `dispute-package.json`)

| Layer | Contents | Who may set it |
|---|---|---|
| `agreement` | pinned agreement version ref + acceptance-test ref | agreement parties |
| `evidence` | execution attestation + delivery + consent from the A/B case, EVP/1 labels intact | EVP/1 owners / public chain |
| `positions` | each principal's position + requested remedy | the parties (modeled) |
| `closure` | point at which the record closes + retention policy | package creator |
| `awardSlot` | external adjudicator's signed reasoned award — **`UNKNOWN` in this package** | ONLY an external adjudicator, never CoreGuard |
| `escrowRef` | reference interface for controlled settlement handoff | **reference only: `deployed: false`** |
| `adapter` | transport contract a tribunal API could implement | **reference only: `integrationStatus: NOT_BUILT`** |

## 3. Mandatory rules (verified fail-closed)

1. **Protocol identity.** `protocolVersion` is `ADAL/1`; `packageVersion` is
   declared; the generator is deterministic (fixed timestamps, no network, no
   `Date.now()`).
2. **EVP/1 labels inside `evidence`.** Consent aggregate stays a derived
   tri-state string (never a boolean); settlement separates `evidenceStatus`
   from `actualStatus`; unknowns stay `UNKNOWN` and are never filled from the
   receipt; execution/delivery facts keep their `INDEPENDENT — public chain`
   attestation where applicable.
3. **Award slot is never prefilled.** `awardSlot.status` is `UNKNOWN` in a
   package CoreGuard generates, and `adjudicator` is `NONE`. A genuine award
   must be a signed record from an external adjudicator verifier over the
   package's own bytes — CoreGuard has no award-issuing path.
4. **Escrow is a reference interface.** `escrowRef.deployed` must be `false`
   and `escrowRef.chain` must be `"none"`. The lifecycle is described so a
   future **owner-authorized** deployment has a contract to aim at; this repo
   does not sign or broadcast on its own initiative (binding governance state).
5. **No live adapter is claimed.** `adapter.integrationStatus` must be
   `NOT_BUILT`. The transport contract documents what an external tribunal
   **could** implement; there is no connected API and no partner claim.
6. **Positions are party records, not adjudication.** Each position is labeled
   as a claimed record, never as a finding.
7. **Boundaries repeat everywhere.** `synthetic: true` on the package; no
   real-world authority, no payment claim, no merits outcome.

## 4. Pinning and determinism

- `dispute-package.json` is pinned by SHA-256 over its exact bytes in
  `dispute-hashes.json` (self-excluded).
- Two generator runs produce byte-identical output (test-enforced).
- The embedded `evidence` record is re-read from the committed A/B pair and
  re-serialized deterministically (`JSON.stringify(x, null, 2) + "\n"`), so the
  evidence layer is byte-comparable to the committed assent record.

## 5. One-command usage

```bash
npm run dispute-package -- --case A --out <dir>   # or B
# or directly:
node scripts/make-dispute-package.mjs --case A --out <dir>
```

Contract (exit codes 0/1/2, fail-closed):

- `0`  `DP_OK` — dispute package generated, pinned, verified
  (`DISPUTE_PACKAGE OK`, invariants), delivered
- `1`  generation or verification failed — **no package delivered**
- `2`  usage error (missing `--case`/`--out`, invalid case, or target dir
  holds foreign files)

## 6. What CoreGuard does NOT do (binding)

- Does **not** play adjudicator: `awardSlot` stays `UNKNOWN`; no reasoned award
  is ever manufactured here.
- Does **not** claim any live tribunal/API integration.
- Does **not** deploy or sign an escrow contract. The `escrowRef` lifecycle is a
  reference design only; any real deployment requires the owner's separate
  explicit sign-off (CONDITIONAL NO-GO governance is unchanged).

## 7. Files

| File | Role |
|---|---|
| `docs/dispute-package-standard.md` | this protocol spec (ADAL/1) |
| `examples/delivery-fixture/pairs/dispute-package/make-dispute-package.mjs` | deterministic generator (input: committed A/B pair) |
| `examples/delivery-fixture/pairs/dispute-package/verify-dispute-package.mjs` | fail-closed verifier (invariants, incl. no-overclaim) |
| `scripts/make-dispute-package.mjs` | one-command CLI wrapper (stage → verify → deliver → re-verify) |
| `test/delivery/dispute-package.test.js` | determinism + byte-parity + fail-closed tamper + exit-code contract |