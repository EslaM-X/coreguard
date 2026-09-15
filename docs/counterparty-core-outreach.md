# Core Outreach #1 — two-channel routing, one question

**Track:** Core (the intended stakeholder of the original thesis) — first
contact, designed as **two-channel routing inside Core**, not two blasts.
**This is NOT Counterparty #2** (not an opened second counterparty track) and
NOT a pricing experiment.

**Status: PENDING** — drafts ready for dispatch by owner (no mail/SMTP channel
exists in this environment; owner sends from own client, then confirms SENT).
Dispatch metadata (to / from / sent-UTC) filled only from owner-confirmed facts.

**Parallel track:** ElizaOS (Counterparty #1) stays **WAITING FOR RESPONSE** —
separate path, untouched, kept in parallel. We do not serialize on it.

**Strategy rationale (owner decision, 2026-09-15):** tech proof, 90s demo,
13/13 Submission Pack, and WS-5 adoption layer are complete. The remaining step
described in `submission/README.md` is outreach/meeting, not building. We test
**fit/value first** — never assume eligibility or funding.

**Routing (owner refinement, 2026-09-15):**

- **PRIMARY — General contact / partnerships.** Function: does Core see the
  problem and the value? Routes internally if investment/funding fits.
- **SECONDARY — Core Ventures (VC arm).** Function: is this worth an
  ecosystem/investment conversation? Only used if a **distinct official
  address/person** exists. Shorter, thesis-oriented, no direct funding ask.
- We **do not send the same text verbatim to both**, and we do not send at the
  same time as an unprompted double-blast. Start General (primary); trigger
  Ventures (secondary) only once the official, independent channel is known.

---

## Contact state (fills from owner-confirmed facts only)

| Field | Value |
|---|---|
| Status | PENDING → (SENT / NO_RESPONSE / REPLIED) per channel |
| Recipient A (Primary) | General contact / partnerships — exact address TBD (owner) |
| Recipient B (Secondary) | Core Ventures — only if distinct official address/person (owner) |
| Sent by | Owner's mail client (env has no mail channel) |
| Sent date / sent UTC | TBD (owner-confirmed) |
| Delivered / opened | TBD — never assumed, only owner-confirmed |

## Message variant A — General contact / partnerships (primary, kept short)

> We built and verified a real Core Mainnet execution-verification primitive for
> autonomous agents.
>
> It lets an authorized execution be independently checked against its declared
> intent, signer, target, value and policy, with fail-closed outcomes and an
> auditable proof artifact.
>
> We have a reproducible Mainnet proof and a 90-second demo.
>
> We'd like to validate one question with the Core team:
>
> Is independently verifiable execution provenance for autonomous agents a
> problem Core wants solved at the infrastructure/protocol level?
>
> If yes, we'd be happy to show the actual proof rather than a deck.

## Message variant B — Core Ventures (secondary, shorter, thesis-oriented)

> We built and verified a real Core Mainnet execution-verification primitive for
> autonomous agents. We'd like to understand whether independently verifiable
> execution provenance is relevant to Core's infrastructure and ecosystem
> thesis. We can provide the reproducible proof and the 90-second demo.
>
> Who would be the right person, or the right next step, to explore this?

(No "fund us" language. Funding/partnership is a **possible outcome**, never an
assumption.)

(Optional subject line, suggested: "CoreGuard — independently verifiable
execution provenance for autonomous agents on Core Mainnet".)

## Post-send measurement (no engineering in the meantime)

| Question | Reading |
|---|---|
| Did it arrive? (per channel: A / B) | PENDING |
| Who replied? (name/role) | PENDING |
| Did they ask for a meeting? | PENDING |
| Did they ask for the demo/proof? | PENDING |
| Did they express understanding? | PENDING |
| Did they say the problem exists? | PENDING |
| Did they ask for technical details? | PENDING |
| Did they point to a funding/accelerator/partnership path? | PENDING |
| Did they route us internally (General → Ventures / relevant team)? | PENDING |

**None of the above counts as customer, LOI, or revenue.** No numbers are
invented; every reading is owner-confirmed fact.

## Honesty box (boundaries preserved)

- No invented fit, eligibility, or funding status for Core programs.
- No claim that a reply = interest in funding; a reply is data for the
  Decision Gate / thesis refinement only.
- Openning both channels does NOT open pricing, Counterparty #2, or
  customer/revenue/LOI claims — those stay locked.
- ElizaOS track stays independent and untouched by this routing.
- Frozen artifacts (`docs/ws-5.md`, `verify-live.json`, `verifier-c/*`,
  `docs/counterparty-*`), demo, and pack are untouched by this outreach.
- Lineage: proof artifact = Mainnet tx
  `0xe67c61fda81…1a9b8` · block 38712625 · L1 VERIFIED (RECEIPT_INTEGRITY).

## Gate (after any reply)

- Core: problem clear + wants proof → meeting/demo with the actual proof.
- Core: not clear / not a current problem → refine thesis with what was learned.
- Decision Gate for pricing/Counterparty #2 still runs on ElizaOS result when it
  arrives; this outreach does not preempt it.