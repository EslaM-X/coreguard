# Counterparty #1 — One-Page Brief (B1: AI / Automation Platform)

**Segment:** B1 — AI/automation platforms (agent frameworks, trading bots, SaaS
that moves user funds on-chain).

**Source material:** `docs/ws-5.md` + `examples/pilot/proof-artifact-1.json`
(the proof, not a brochure) + `docs/value-hypothesis.md` (the buyer logic).

**Goal of the first meeting:** learn whether a *named loss/bill* exists that
this artifact directly reduces, and whether it maps to a budget line. Not to
close a sale, not to claim traction.

---

## What we can show (and only this)

A real, executed Core Mainnet transaction whose *who / what / did-it-match* are
each independently recomputable:

```
Automated agent (EOA)
   ↓  pre-declared intent, signed EIP-712 (the agent's own authorization)
   ↓  real Core Mainnet execution  tx 0xe67c61fda81…1a9b8 · block 38712625 · status 1
   ↓  genuine preflight (pinned block) + WS-4 evidence + WS-1 RECOVERED_SIGNER
   ↓  target / value / policy conformance
   ↓  L1 VERIFIED (RECEIPT_INTEGRITY) + intact Execution Attestation
```

One number that frames it: the executing EOA *recovered to* the pre-declared
signer; the on-chain target, value, and re-evaluated policy all matched the
intent; the verifier is a deterministic artifact in this repo — anyone can
re-derive the record from public chain reads alone.

Artifact: `docs/ws-5.md` (hashes/refs/checks) · snapshot
`examples/pilot/proof-artifact-1.json` (machine-readable).

## The commercial question (central)

> "Does this proof reduce a specific loss, an audit/forensics cost, or a risk
> you already carry, enough to allocate a budget line?"

If the answer cannot name a concrete cost in the room, we have not validated the
hypothesis — that is a useful outcome too (it says where to change the pitch).

## What we are NOT claiming (explicit boundaries)

- No customers, no revenue, no "validated market".
- No trace-level execution proof (mainnet public RPC gives RECEIPT_LEVEL only).
- No Firewall/decision-gate provenance (Pilot-1 was a direct EOA transfer).
- No defense against "all" agent failures — only: an executed tx can be bound
  to its pre-declared authorization and verified (target/value/policy) to
  L1 VERIFIED.
- The 0.001 CORE amount is a demonstration scale; claims scale-independent.

## Conversation gate (run in the meeting)

| | |
| --- | --- |
| Problem confirmed? | is *"who/what/did-it-match"* a real, nameable pain for their users/ops? |
| Current cost/loss identified? | an actual bill/loss they can describe (forensics, insurance, blame disputes, auditor rework)? |
| Does CoreGuard directly reduce it? | does L1-attestation replace or shrink that cost? |
| Would they pay / allocate budget? | explicit signal: a number, a trial, a champion. |

**Close of gate:** YES → Counterparty #2 + pricing experiment · NO → revise the
value hypothesis with what was learned.

## Ask to enter

A 20-minute attendance with their ops/compliance or security lead, and a
commitment to tell us the *current* cost of "unprovable agent execution"
(1–3 line answers). That answer is the artifact's input to the pricing
experiment, not a promise to buy.