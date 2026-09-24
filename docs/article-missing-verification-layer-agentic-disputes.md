# The Missing Verification Layer for Agentic Disputes

**From Core Mainnet Execution to a Deterministic, Tribunal-Ready Evidence Record**

*CoreGuard — protocol documentation. Publish-ready draft. Last updated 2026-09-24.*

---

## Preface (honesty note)

This piece describes a protocol and its reproducibility, not a partnership.
CoreGuard's record of an early technical exchange on the elizaOS discussion
forum is a *public read-only critique*: the reviewer reviewed documentation and
did not run CoreGuard's verifier or check the chain. Nothing here claims
otherwise. People's Court already publishes a Partner API (v2) and an x402
dispute extension — this protocol maps its outputs *against those documented
integration boundaries*. Live submission remains credential-gated and is out of
scope for this paper.

---

## 1. Agents can execute

On Core Mainnet (EVM-compatible Bitcoin DeFi chain, chainId `1116`), an agent
can move value. That is the easy part — it has been true since the first
transaction. The harder problem is what happens *after* the execution: did it
happen, to whom, against what promise, and under whose authority?

CoreGuard starts from a single public Mainnet receipt. In the pilot
transaction, `0xe67c…9a9b8` sent `0.001 CORE` between two addresses, status
`0x1 (success)`, and every field — block, gas, value — is independently
re-verifiable against the chain (RPC method `eth_getTransactionReceipt`). This
is the execution-fact layer: **what happened on-chain is pinned** with a
SHA-256 over the exact bytes.

Execution facts can be verified. Everything else in a dispute — consent,
acceptance, adjudication, settlement authority — is a *different layer*.

## 2. Execution ≠ consent

A transfer receipt proves a transfer. It does not prove that the parties agreed
to the obligation the transfer was meant to satisfy. CoreGuard's evidence
protocol (EVP/1) therefore keeps consent as **modeled, labeled, tri-state**:

- `FULL` — every modeled principal assented (as recorded)
- `PARTIAL` — at least one assented, at least one other status
- `MISSING` — none assented
- `UNKNOWN` — no per-party assent data

These are never booleans and never silently derived from the receipt. The
conformance suite tests that an `UNKNOWN` party **stays `UNKNOWN`** — it is not
"filled in" from the fact that a transaction exists. The label set is the load-bearing
discipline: absence of evidence is recorded as *not evidenced*, never as *found
absent*.

## 3. Consent ≠ adjudication

Evidence labels describe state. They do not resolve who is right. An ADAL/1
dispute package layers the consented-evidence record over the execution receipt:
positions, closure window, an **award slot that CoreGuard never pre-fills**, and
remediation/unknown lists. The package is a *frozen, verifiable record* for an
external adjudicator — not a verdict.

Three structural facts follow:

1. **The award slot is `UNKNOWN` by design.** CoreGuard refuses to produce the
   line "dispute resolved by CoreGuard". A genuine award is a *signed reason*
   from an external adjudicator over the package's bytes.
2. **Escrow is reference-only until authorized.** In CoreGuard's own records the
   escrow interface is never `deployed:true` outside a specific owner decision.
3. **Adapters start `NOT_BUILT`.** The integration-status field is honest
   metadata: read-only review of docs ≠ built adapter.

## 4. Adjudication ≠ settlement authority

This is the line most agent protocols blur. An award, even a good one, does not
move money. People's Court's own public documentation makes the point
precisely: **"decision served" never triggers execution without a separately
scoped settlement-adapter credential**, and an Award does not by itself effect
settlement. CoreGuard's mapping keeps the same boundary: a settlement binding
must name allowed actions *and* an authority corpus, and execution is a separate,
credential-scoped step.

The reference-tribunal simulator in this repository exists to prove the
semantics fail-closed: it will happily produce a *synthetic* award signature and
a settlement instruction — but the instruction contains no executable action for
the mock escrow unless (a) the award signature verifies against the record
bytes, and (b) every action is authority-bound. Anything else is refused, and
refusal is permanent for that instruction.

## 5. The layered model

```
EVP/1   execution evidence (pinned receipt + label discipline)
  └→ ADAL/1  dispute package (positions, closure, award slot, unknowns)
       └→ Adapter  structural mapping to a tribunal's documented surface
```

Each layer consumes the previous one's *pinned output and never rewrites it*.
The dispute-package generator re-verifies the evidence tree; the adapter
re-verifies the dispute package before emitting a dry-run submission template;
the reference tribunal refuses anything that fails at verify. Determinism is a
CI-tested property: no `Date.now()`, no randomness, no network — identical bytes
in, identical bytes out.

The result is a deterministic, tribunal-ready evidence record: the inputs an
external adjudicator actually needs (pinned execution, labeled consent, frozen
positions) without any organization (including this one) having to be the
adjudicator.

## 6. Why map against a documented boundary instead of building a court

Building another dispute platform would be a category error. The infrastructure
exists: People's Court already publishes a **Partner API v2** — authority grants
and consents under `/api/v2/authorizations/…`, an `evidenceExporter` role with a
canonical (RFC 8785) manifest, settlement bindings, and at-least-once webhooks
with `eventId` dedup — plus an **x402 dispute extension**
(`@peoples-court/x402-disputes`) covering consent-aware dispute declaration,
evidence packets, and `adjudication.prepare()` with idempotency keys and
authority/consent references. These are real surfaces, publicly documented.

The correct move for a verification layer is therefore **conformance, not
competition**: produce records shaped to those documented interfaces, prove the
mapping in an offline dry-run, and let a credential-holding integrator make the
live call. That is what CoreGuard's adapter does — and the honest network-call
label on every output is `NOT_PERFORMED`.

---

## Reproducibility

All software referenced here is in the public repository (MIT). The evidence
package, dispute package, adapter, reference tribunal, and conformance tests
run offline with a single command and are part of the CI suite. Numbers cited
(transaction hash, chainId 1116, label semantics, test counts) are pinned in the
repository's status records.

*This document is protocol documentation, not legal advice.*