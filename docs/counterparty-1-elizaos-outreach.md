# Counterparty #1 — ElizaOS Outreach Draft (recorded before send)

Status: **PENDING SEND** — validated and locked by owner; to be sent by the
owner verbatim. This record is the exact claim set exposed to the counterparty
(no other claims exist).

## Decision trail

| | |
| --- | --- |
| Counterparty #1 | **ElizaOS** (open-source AI agent framework; agents hold EVM keypairs and execute on-chain) |
| Fallback (only if no opening) | Coinbase CDP AgentKit |
| Segment | B1 — AI & automation |
| Brief | `docs/counterparty-brief.md` (locked at `9d3c70f`) |
| Proof basis | `docs/ws-5.md` + `examples/pilot/proof-artifact-1.json` (Pilot-1, L1 VERIFIED) |
| Engineering | NONE |
| Forbidden artifacts | untouched (v0.4.0 / verify-live.json / verifier-c / npm publish NO-GO) |

Candidate rationale (context for us only — **not** additional factual claims
about ElizaOS): the framework's agents hold wallet keys and transact on-chain,
which mirrors the Pilot-1 scenario (automated agent EOA). Its existing trust
layer addresses content attribution, not on-chain execution accountability. Any
such description that ends up in outreach must be independently verified and
kept out of the message unless confirmed.

## Outreach message (verbatim, to be sent by the owner)

**Subject:** Verifiable execution provenance for on-chain AI agents

> Hi ElizaOS team —
>
> I'm working on CoreGuard, an open verifier for declared execution provenance on Core.
>
> We recently ran a real Core Mainnet pilot where an automated agent:
>
> - pre-declared and signed an EIP-712 authorization,
> - executed a real transaction,
> - had its signer independently recovered,
> - was checked against the declared target, value, and policy,
> - and produced an L1-VERIFIED execution attestation.
>
> The question we're trying to validate is not whether the demo works, but whether this solves a real operational problem for agent platforms:
>
> When an agent executes on-chain, is there a concrete audit, forensics, incident, or accountability cost associated with proving that it executed what it was authorized to do?
>
> If yes, we'd value a 20-minute conversation with whoever owns security, infrastructure, or agent accountability.
>
> Specifically, we'd like to understand:
>
> - X: what kind of incident/review creates the problem?
> - Y: what does it currently cost in engineering time, forensics, audit work, loss exposure, or another measurable budget?
>
> We can show the actual proof artifact rather than a slideware claim.
>
> — CoreGuard

## Meeting gate (run in the conversation)

| Gate | Evidence to capture |
| --- | --- |
| Problem confirmed? | Name the concrete execution/accountability pain |
| X identified? | Incident/review type |
| Y identified? | Actual cost/loss/rework |
| Direct reduction? | Why the attestation would reduce X/Y |
| Budget signal? | Trial, champion, budget line, or explicit willingness |

**Exit:** YES → Counterparty #2 + pricing experiment · **NO** → revise value
hypothesis (never "market validated").

## Honesty constraints carried into the conversation

This is a validation interview, not a sales pitch. We do not claim: customers,
revenue, validated market, trace-level proof, firewall/decision-gate provenance,
immunity to "all" agent failures. We show the artifact: recovered signer +
target/value/policy conformance + L1 VERIFIED (RECEIPT_INTEGRITY) on a real Core
Mainnet transaction, with the honest NOT_RUN boundaries documented.