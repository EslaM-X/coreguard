# The Missing Link in AI Tribunals — Publish Pack (Medium · LinkedIn)

Sibling of `docs/article-missing-link-ai-tribunals-2026-09-24.md`. This file is
the paste-and-publish surface: title, subtitle, description, tags, and a ready
body per platform. Nothing here adds a claim that evidence doesn't support —
the honesty note is part of the product, keep it.

Release reference (the ONLY link used anywhere, never invent another):
https://github.com/EsLaM-X/coreguard/releases/tag/v0.6.0

---

## Metadata (both platforms)

- **Title:** The Missing Link in AI Tribunals: Why On-Chain Execution Can't Solve Smart Contract Disputes
- **Subtitle:** And why the answer is a deterministic boundary record — not a bigger court.
- **Description (social share):** Deterministic, pinned, authority-aware boundary records between execution, consent, adjudication, and settlement — open (MIT), runnable, verifiable. No live tribunal claim, no credential claim, no settlement claim.
- **Tags:** #AGI #AI #blockchain #computerscience #softwareengineering

## LinkedIn body (short-form, ready to paste)

Deterministic, pinned, authority-aware boundary records between execution,
consent, adjudication, and settlement — open (MIT), runnable, verifiable.

**Title:** The Missing Link in AI Tribunals: Why On-Chain Execution Can't Solve
Smart Contract Disputes

**Subtitle:** And why the answer is a deterministic boundary record — not a bigger
court.

A smart contract can hold funds and release them when a condition fires. The
temptation is to make the condition "an AI said so." It fails for four
structural reasons:

1. Execution does not prove consent. A transfer proves a transfer.
2. Consent does not prove adjudication. The evidence must freeze what each side
   *claimed and asked for*.
3. Adjudication does not prove settlement. An award does not move money — the
   tribunal's own documented rule keeps execution behind a separately scoped
   credential.
4. Determinism is a property, not a vibe. If two runs of the same input differ
   by any byte, you cannot audit the outcome.

The industry's instinct has been to build a bigger court. That is a category
error. The missing piece is a **boundary record** between execution, consent,
adjudication, and settlement, with honest `NOT` flags instead of hopeful claims.

CoreGuard just shipped the layer as an open standard (AEA/1): a verified
dispute package tied to an escrow-contract reference interface and a tribunal
submission surface — **deployed: false, award: UNKNOWN, NOT_AUTHORIZED,
NOT_BUILT, NOT_PERFORMED**, byte-identical across runs, SHA-256 pinned,
self-verifying. A tampered package is refused before any output.

This is the honest shape of the "dispute package → automatic enforcement"
story: the *record* is deterministic now; the *execution* stays exactly as
credential-gated as the tribunal's own rules demand.

**Proof is open:**
- `npm run demo:90s:killer` — 90-second end-to-end path
- `npm run aea1:prepare` — emit and self-verify a boundary record
- `npm test` — conformance suite (green on Node 18/20/22, CI and locally)

Clone it. Run it. Try to break the evidence model.

We're looking for independent technical verification, not endorsement. If you
find an ambiguity, false assumption, or fail-open path, open an issue or send
us the reproduction.

https://github.com/EsLaM-X/coreguard/releases/tag/v0.6.0

## Medium body (full-length, ready to paste)

Same title, subtitle, description, and tags as above.

### Preface (honesty note)

This is an architecture essay with a working, open implementation, not a
partnership announcement. CoreGuard maps its outputs against *publicly
documented* integration boundaries; no live tribunal submission, no live
credential, and no settlement execution exist or are claimed. You can clone,
run, and verify every claim below yourself.

### 1. The problem nobody has solved with code

Two agents transact. The transaction lands on-chain: a receipt that proves *a
transfer happened*. That is the last moment the system tells the truth on its
own.

Everything after it — *did both sides consent? what did each side claim? who
adjudicates? what happens to the money?* — lives outside any deterministic
record. Today, "AI tribunals" paper over the gap: they present a dispute, an
LLM reasons about it, and a human or a hot-wallet thread executes something.
Each hop is a fresh trust boundary where ambiguity can be silently resolved in
one side's favor.

### 2. Why on-chain execution can't solve disputes

The four structural reasons are in the LinkedIn body above. In short:
execution ≠ consent, consent ≠ adjudication, adjudication ≠ settlement, and
determinism is a property, not a vibe — every record the system relies on must
be byte-stable, timestamp-free, network-free, and re-verifiable by anyone.

### 3. The layered model

CGEP/1 (execution receipt) → EVP/1 (execution evidence + consent labels) →
ADAL/1 (dispute package) → **AEA/1 (escrow + arbitration boundary record)** →
adapter (structural mapping to a tribunal's documented surface).

Each layer consumes the previous one's pinned output and never rewrites it.
The business-facing inventory of this algorithm is in the **v0.6.0 release
notes**: a 60-second narrative of the whole stack with byte-level proof.

https://github.com/EsLaM-X/coreguard/releases/tag/v0.6.0

### 4. How it could adapt to the sector

The infrastructure exists. A candidate tribunal platform already publishes a
Partner API (v2) — authority grants, consents, evidence-exporter role,
at-least-once webhooks — plus an x402 dispute extension. The winning move is
conformance, not competition: produce records shaped to those documented
interfaces, prove the mapping offline, and leave the live, credential-gated
call to the integrator who holds the credential. An open standard means the
tribunal, the escrow author, and the auditor all read the same bytes.

### 5. The invite

The code is MIT in a public repository. We are looking for independent
technical verification, not endorsement: if you find an ambiguity, a false
assumption, or a fail-open path, open an issue or send us the reproduction. The
argument is not that we built the court — it is that the courtroom already
exists, and the deterministic, auditable chain between evidence and execution
did not. That chain is now open, and it is the load-bearing part.

Same commands and CTA as the LinkedIn body.