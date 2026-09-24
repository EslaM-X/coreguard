# Case study — separating execution from consent in agent-payment evidence

**Title (for publication):** *Separating Execution from Consent: A Reproducible
Evidence Package for Agent Payments*

**Date:** 2026-09-23 · **Author:** CoreGuard (EslaM-X) · **Status:** draft for
publication (Medium / LinkedIn / X), facts only.

---

## TL;DR

When an AI agent moves money, two different questions get mixed:

1. **Did the transaction happen the way it was authorized?** — provable, on
   chain, by any third party.
2. **Did the work satisfy the deal, or did both sides actually consent?** — a
   semantic, contractual question that a chain receipt cannot answer.

In an open technical thread with People's Court / Epistemic Labs (elizaOS
discussion #21788), we stress-tested a fixture that separates these layers. The
reviewer confirmed the structural shape, then pushed on **two labeling
ambiguities** that would have been footguns in a reusable schema. We corrected
both, and the corrections are committed, tested, and CI-green. This post is the
reproducible story.

> Honesty note: the exchange was a **read-only technical critique** of a
> synthetic fixture. It was explicitly **not** an endorsement, integration,
> pilot, or adjudication. Nothing here claims real-world authority, payment of
> the modeled compensation, or a merits outcome. All artifacts below are
> reproducible from the public repo.

---

## The problem

Executions are verifiable; consent is not (by comparison). A signature proves
who authorized a transfer. A chain proves what settled. Escrow holds funds.
None of those facts, by themselves, resolve a dispute over scope, acceptance,
partial performance, or remedy.

So a useful evidence layer has to record the technical facts **without
accidentally turning technical verification into a legal conclusion**. That is
a labeling problem as much as an engineering one.

## The fixture we built

A paired synthetic fixture (`assent-pair-v1.0.0`, committed at `1c7223f`):

- **A** — `ASSENT_PRESENT`: both modeled principals assent to a pinned
  agreement version.
- **B** — `ASSENT_MISSING`: party-B assent is absent / scoped to another
  action, recorded `UNKNOWN`.
- Execution + delivery records are **byte-identical** in A and B (single shared
  objects, verifier-invariant).
- A real Core Mainnet transaction is used identically in both as the
  **execution anchor only** — a 0.001 CORE execution coupon, not settlement of
  the modeled 0.25 CORE obligation.
- `expected-field-map.json` labels every field with source and **who is
  permitted to attest it**; `pair-hashes.json` pins every byte.
- A fail-closed verifier (now 11 invariants) checks the whole package.

## The two labeling footguns the reviewer caught

**1. A boolean aggregate that misread as bilateral consent.**
B's `consent.modeledAssent: true` coexisted with `principalB.assent: UNKNOWN`.
A consumer reading the aggregate could treat bilateral assent as established.

**Fix:** the aggregate is now a **derived tri-state string**
(`FULL | PARTIAL | MISSING | UNKNOWN`), A=`FULL`, B=`PARTIAL`, with the
derivation (`modeledAssentDerivedFrom`) and the party fields declared
authoritative. An aggregate can never be read as a bilateral-assent boolean,
and `UNKNOWN` stays `UNKNOWN` — never filled in from the receipt.

**2. "NOT_SETTLED" read as a verified nonpayment finding.**
The field map said the modeled compensation was not settled while also
listening it as unknown. Absence of evidence supports **"not evidenced as
settled"**, never a verified nonpayment finding.

**Fix:** `compensationSettlement` now separates the two:
`evidenceStatus = NOT_EVIDENCED_AS_SETTLED` + `actualStatus = UNKNOWN`. Both
stay in the record; neither overclaims.

Both corrections shipped at `1e75fba`, with two regression tests and the
verifier extended from 10 to 11 invariants (`ASSENT_PAIR OK`), CI green.

## Why this matters for agent payments

The same separation generalizes:

- A payment gateway can **prove** the execution coupon moved on Core.
- It cannot **declare** the merchant happy, the deliverable conformant, or the
  dispute resolved.
- An evidence package that labels those layers separately — and preserves
  unknowns — is auditable without being a judge.

That is the layer we are building: post-execution provenance that is
re-derivable by any third party, with consent, obligation, and adjudication
kept as separate semantic layers.

## Reproduce it

```bash
git clone https://github.com/EslaM-X/coreguard.git
cd coreguard && npm install
npm run evidence-package -- --out my-package   # one-command evidence package, 11/11 → EVP_OK
node examples/delivery-fixture/pairs/assent-pair/verify-assent-pair.mjs   # from any pair dir
```

Standard + rules: `docs/evidence-package-standard.md` (in repo).

## Boundaries

- Both cases are synthetic; the on-chain anchor is real but anchors only the
  execution layer.
- No EIP-712 signatures exist in the pair; modeled assent is declared data, not
  a portable signature.
- The read-only review binds no third party to an endorsement, integration,
  pilot, or adjudication.
- Reproducibility over narrative: every claim above is a repo file or a CI
  result, not a testimony.

---

## X thread draft (≤ 280 chars where noted)

1. When an agent pays on-chain, "did the tx match the authorization?" is
   provable. "Did the work satisfy the deal?" is not. Mixing them is the
   footgun. (271)
2. An open review caught two label bugs in our public fixture: a consent
   aggregate that could read as bilateral assent, and a "not settled" that
   read like a verified nonpayment. Corrected, tested, committed at
   @EslaM-X/coreguard 1e75fba. (…)
3. Rules we now enforce in every evidence package: consent is per-party first,
   aggregates are derived tri-states; evidence status ≠ actual status; unknowns
   stay unknown; hashes pin every byte. (…)
4. One command reproduces it:
   `npm run evidence-package -- --out pkg` → 11/11 → EVP_OK.
   Synthetic fixture, real execution anchor, no overclaims. (…)
5. Standard is public: docs/evidence-package-standard.md. Built by
   @EslaM-X/coreguard — post-execution provenance that never plays judge. (…)

## LinkedIn draft

**Separating execution from consent: the agent-payment evidence layer**

Title says payment ability; the unsolved part is what happens after: can a
third party prove the on-chain transaction matched the authorization, without
the verifier silently becoming a judge of the deal?

In a public thread with People's Court / Epistemic Labs we published a paired
synthetic fixture — identical execution + delivery, differing modeled consent —
and iterated on a read-only critique of its labels. Two fixes shipped:
consent aggregates are now derived tri-states, never bilateral booleans; and
settlement records evidence status separately from actual status, so absence of
evidence never reads as a verified nonpayment finding.

The result is a one-command, pinned, fail-closed evidence package
(11/11 verifier, CI green). Full reproducible write-up in my pinned post.