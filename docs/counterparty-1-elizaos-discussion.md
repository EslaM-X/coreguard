# Counterparty #1 — ElizaOS Discussion Comment

Status: **POSTED** (posted by EslaM-X under the locked text via `addDiscussionComment`;
not treated as archived until the owner confirms receipt/no-edits).

URL: https://github.com/elizaOS/eliza/discussions/21788#discussioncomment-18444447
Target discussion: [What's the most annoying unsolved thing about giving agents
real payment ability right now?](https://github.com/orgs/elizaOS/discussions/21788)
(#21788, Q&A, unanswered at time of post)

**Relationship to `d777c29`:** separate claim surface. The email outreach
(`d777c29`, **PENDING SEND**) and this discussion comment are independent
artifacts; neither changes the other. No repo changes, no Issue, no PR, no
plugin, no code contribution to ElizaOS.

## The comment (verbatim, to be posted under an existing relevant discussion)

> Once an agent has scoped authority and signs an intended action, what is your
> preferred way to independently prove after execution that the on-chain
> transaction actually matched that authorization?
>
> We recently tested this boundary on Core Mainnet with a real agent
> transaction:
>
> - pre-declared EIP-712 authorization → recovered signer → target/value/policy
>   conformance → L1-verified execution attestation.
>
> Happy to share the reproducible proof artifact if useful.

## Targeting rationale (context for placement — NOT claims about ElizaOS)

ElizaOS's public material indicates the community is already discussing
scoped authority, delegation, spend limits, signed proof of authorization for
wallet-holding agents, plus an Agent Certification Framework and community
plugins around transaction firewalls/attestations. Those signals only tell us
**the question we carry is worth asking in their space**; they are not used to
assert that ElizaOS "has the problem" or that CoreGuard "solves it" — and no
such assertion appears in this comment.

## Why this wording (locked with the owner)

- Question first, pitch never.
- No claim ElizaOS has a problem; no claim CoreGuard solves it.
- No customers, adoption, or funding mentioned.
- No promotional link.
- Every proof sentence is confined to what Proof Artifact #1 actually records
  (Pilot-1: pre-declared EIP-712 → recovered signer → target/value/policy
  conformance → L1 VERIFIED receipt-level attestation).
- "if useful" leaves the choice to the reader instead of pushing engagement.

## Post log

| Item | Value |
| --- | --- |
| Posted by | EslaM-X (CoreGuard repo owner) |
| Target discussion | elizaOS/eliza #21788 (Q&A — payment ability) |
| Comment URL | https://github.com/elizaOS/eliza/discussions/21788#discussioncomment-18444447 |
| Posted at (UTC) | 2026-09-15 05:44:00Z |
| Text | verbatim from `8a141e2` (frozen below) |

## Boundaries

Engineering: NONE · npm publish: NO-GO · v0.4.0/verify-live.json/verifier-c:
untouched · `9d3c70f` (brief): immutable · `d777c29` (email): unchanged ·
no claim of market validation.