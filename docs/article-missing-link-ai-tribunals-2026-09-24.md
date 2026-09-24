# The Missing Link in AI Tribunals: Why On-Chain Execution Can't Solve Smart Contract Disputes

**And why the answer is a deterministic boundary record — not a bigger court**

*CoreGuard — protocol essay. Publish-ready draft. Last updated 2026-09-24.*

---

## Preface (honesty note)

This is an architecture essay with a working, open implementation, not a
partnership announcement. CoreGuard maps its outputs against *publicly
documented* integration boundaries; no live tribunal submission, no live
credential, and no settlement execution exist or are claimed. The reference
tribunal in the repository is a named synthetic stand-in, and the People's
Court structural adapter is explicitly offline/dry-run. You can clone, run,
and verify every claim below yourself.

---

## 1. The problem nobody has solved with code

Two agents transact. The transaction lands on-chain: a receipt that proves *a
transfer happened*. That is the last moment the system tells the truth on its
own.

Everything after it — *did both sides consent? what did each side claim? who
adjudicates? what happens to the money?* — lives outside any deterministic
record. Today, "AI tribunals" paper over the gap: they present a dispute, an
LLM reasons about it, and a human or a hot-wallet thread executes something.
Each hop is a fresh trust boundary where ambiguity can be silently resolved in
one side's favor.

The industry's instinct has been to build a *bigger court*. That is a category
error. The missing piece is not another adjudicator — it is a **deterministic,
pinned, authority-aware boundary record** between execution, consent,
adjudication, and settlement.

## 2. Why on-chain execution can't solve disputes

A smart contract can hold funds and release them when a condition fires. The
temptation is to make the condition "an AI said so." That fails for four
structural reasons:

1. **Execution ≠ consent.** A transfer proves a transfer. It does not prove both
   parties agreed to the obligation the transfer was meant to satisfy. Modeled
   assent is tri-state (FULL / PARTIAL / MISSING / UNKNOWN) — and an UNKNOWN
   party must *stay* UNKNOWN, never be "filled in" because money moved.
2. **Consent ≠ adjudication.** The evidence has to freeze *what each side
   claimed and asked for*, not just what transacted. That is a dispute package,
   not a verdict.
3. **Adjudication ≠ settlement.** An award, even a good one, does not move money.
   The tribunal's own documented rule states it: *decision served never
   triggers execution without a separately scoped settlement-adapter
   credential.* An award that auto-settles is a system that ignores
   credentials, jursidiction, and appeals — a honeypot.
4. **Determinism is a property, not a vibe.** An adjudicator can reason; the
   *record* it acts on must be byte-stable, timestamp-free, network-free, and
   re-verifiable by anyone. If two runs of the same input differ any byte, you
   cannot audit the outcome.

## 3. The layered model CoreGuard ships

```
CGEP/1   execution receipt (pinned on-chain evidence)
  └→ EVP/1   execution evidence + consent labels (tri-state, UNKNOWN preserved)
       └→ ADAL/1  dispute package (positions, closure, award slot UNKNOWN)
            └→ AEA/1  escrow + arbitration boundary record   ← the missing link
                 └→ adapter  structural mapping to a tribunal's documented surface
```

Each layer consumes the previous one's **pinned output and never rewrites it**.
The killer property is the *boundary vocabulary*: every record ships honest
`NOT` flags instead of hopeful claims.

## 4. The boundary record (AEA/1)

AEA/1 is the layer that lets an external engineer — or a future integrator —
build the bridge without inheriting a lie. It ties a *verified dispute
package* to:

- the **escrow-contract reference interface** a future deployment could
  implement (`escrow-interface.json`), with the settlement gate reading *Award
  ≠ execution*;
- the **tribunal submission surface** a credential-holding integrator could
  send against (`adapter` template), with `networkCall: NOT_PERFORMED`;
- **pins over every emitted byte** (`aea1-hashes.json`), then re-verifies
  itself before exiting 0.

The flags are the product:

| | |
|---|---|
| `escrow.deployed` | `false` — no contract is deployed |
| `award.status` | `UNKNOWN` — CoreGuard never fills the award slot |
| `settlement.authorizationStatus` | `NOT_AUTHORIZED` — no settlement authority |
| `adapter.integrationStatus` | `NOT_BUILT` — structural mapping only |
| `adapter.networkCall` | `NOT_PERFORMED` — no live call, ever, by this repo |

A tampered package is refused before any output. A dishonest flip of any flag
fails the self-verify. Determinism is test-enforced: two runs are
byte-identical.

This is the honest shape of the "cryptographic dispute package → automatic
enforcement" story: the *record* is cryptographic and deterministic now; the
*execution* remains exactly as authority-bound and credential-gated as the
tribunal's own rules demand.

## 5. Why an open standard, not another platform

The infrastructure exists. A candidate tribunal platform already publishes a
Partner API (v2) — authority grants, consents, evidence-exporter role, at-least-
once webhooks — plus an x402 dispute extension covering consent-aware dispute
declaration and adjudication preparation. The winning move is **conformance,
not competition**: produce records shaped to those documented interfaces, prove
the mapping offline, and leave the live, credential-gated call to the
integrator who holds the credential.

An open standard means the tribunal, the escrow author, and the auditor all
read the same bytes. It means the next "AI tribunal" doesn't have to rebuild
the evidence spine. And it means CoreGuard is *the layer they integrate
against* — the infrastructure, not a note in someone's thread.

## 6. The invite

Clone it. Run it. Try to break the evidence model.

- `npm run demo:90s:killer` — the 90-second end-to-end path
- `npm run aea1:prepare` — emit and self-verify an AEA/1 boundary record
- `npm test` — the conformance suite (green on Node 18/20/22, CI and locally)

The code is MIT in a public repository. We are looking for independent
technical verification, not endorsement: if you find an ambiguity, a false
assumption, or a fail-open path, open an issue or send us the reproduction.

The argument is not that we built the court. It is that the courtroom already
exists — and the deterministic, auditable chain between evidence and execution
did not. That chain is now open, and it is the load-bearing part.

---

## Reproducibility

Everything referenced here is in the public repository (MIT) and runs offline.
Numbers (test counts, layer semantics, boundary flags) are pinned in the
repository's status records. This essay is protocol documentation, not legal
advice.