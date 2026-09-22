# First-Parties Outreach — ready-to-send message

The intake kit's front door: a ready-to-send message for the **first real
bilateral fixture**. Send the letter below to an organization that could be
the **client side** of a real paid agent transaction (an agent marketplace,
an escrow or settlement platform, an agent operator, a payments provider).
They invite their counterparty with the short forward block — one consent
conversation on each side, then the kit does the rest.

> **Honesty rules baked into this letter** (same rules as the kit):
> no endorsement is implied, nothing is pre-agreed, the review is
> exploratory and can stop at any step, and the synthetic fixture is
> labeled synthetic everywhere it appears. The letter never claims
> People's Court participation — only that the public intake path they
> documented is where a real case would go.

---

## The message (copy from START to END)

**Subject options** — pick one:

- `Verifiable delivery evidence for agent payments — a joint evidence pilot (no commitment)`
- `Execution proof ≠ delivery acceptance: testing the boundary with a real transaction`

**START**

Hi [NAME],

I'm [YOUR NAME], working on CoreGuard — an open-source evidence layer for
agent transactions on Core DAO
(https://github.com/EslaM-X/coreguard). We've been discussing this boundary
publicly with People's Court / Epistemic Labs in the elizaOS agent-track
discussion (https://github.com/orgs/elizaOS/discussions/21788), and their
framing matches ours: **execution proof establishes what was authorized and
run; it does not decide whether the delivered work satisfied the deal.**

What we're building makes that boundary *operable* rather than aspirational:

- a pre-declared EIP-712 authorization → recovered signer → policy
  conformance → execution attestation chain (already proven on Core
  Mainnet — Pilot-1, publicly documented);
- a delivery & dispute evidence layer (DDE/1) with **ten fail-closed
  checks**, structurally preventing a settled payment or a valid signature
  from silently becoming "delivery accepted";
- a payment gate platforms can embed today: hold a payout until the
  evidence record is admissible **and** a signed acceptance record rests on
  the agreed criteria
  (https://github.com/EslaM-X/coreguard/blob/main/INTEGRATION.md — every
  command on that page executes in CI).

**What we're asking for** — one real transaction, with both parties
reachable and willing, to exercise the intake path end to end. Not a
pilot commitment, not a purchase, not an integration agreement: a single
evidence exercise, fully reversible at every step:

1. You run (or observe) one real paid agent delivery between your agent
   and a counterparty — the next ordinary transaction you would have run
   anyway.
2. Both sides sign a bilateral consent with a **named disclosure scope**
   (what reviewers may see, what is withheld, duration, revocation).
   Template: https://github.com/EslaM-X/coreguard/blob/main/examples/real-fixture-intake/consent-template.json
3. The evidence is packaged by a fail-closed gate — secrets and personal
   data removed, machine-checked, both parties' consent cryptographically
   replayed. Gate: https://github.com/EslaM-X/coreguard/blob/main/examples/real-fixture-intake/prelude.mjs
4. The result is a redacted fixture anyone can re-verify with one command
   — and, if both parties want, it goes through the neutral review intake
   People's Court documented (https://peoplescourt.ai/request-demo).
   We submit nothing without your explicit sign-off.

What's in it for you: the first public, referenceable demonstration that
your platform can hold payments against **verifiable delivery evidence**
— evidence your counterparties can audit, not just your own logs. You
keep full control of the disclosure scope and can withdraw at any point
before publication.

If useful, a 5-minute look before any reply:

- live bilingual demo of the evidence layer:
  https://eslam-x.github.io/coreguard/DELIVERY-DISPUTE-DEMO.html
- the 10-check engine and what each check kills:
  https://github.com/EslaM-X/coreguard/blob/main/docs/delivery-dispute-boundary.md
- the full intake kit (consent template, checklist, gate, converter):
  https://github.com/EslaM-X/coreguard/tree/main/examples/real-fixture-intake

To be explicit about scope: this message is an invitation to evaluate, not
an offer, and it implies no endorsement, partnership, or integration
commitment by you or by anyone reviewing the result. The fixture we
produce from a real case is labeled REAL; our current public fixture is
synthetic and labeled synthetic everywhere — we keep those two things
strictly separate.

Happy to jump on a call or answer questions in writing.

[YOUR NAME]
[AFFILIATION / CONTACT]

**END**

---

## The counterparty forward block (for the client side to invite their agent/counterparty)

**Subject:** `One transaction + a signed disclosure scope = a public, verifiable delivery record`

**START**

We're planning our next agent transaction with [PLATFORM/AGENT NAME] to
double as a public evidence exercise: the delivery will produce a
verifiable record (what was agreed, what was authorized, what ran, what
was delivered, and each side's acceptance position) that anyone —
including you — can re-verify independently. Both of us sign a short
disclosure scope first: what reviewers may see, what stays withheld, how
long, and how to revoke. Redaction is machine-gated, not hand-waved:
https://github.com/EslaM-X/coreguard/blob/main/examples/real-fixture-intake/prelude.mjs

Nothing about the commercial deal changes, and nothing is published
without both signatures. The one-page boundary (why a settled payment
doesn't decide acceptance): https://github.com/EslaM-X/coreguard/blob/main/INTEGRATION.md

**END**

---

## Link table (what each link proves — all verified live, 200 OK)

| Link | What the recipient sees |
|---|---|
| https://github.com/EslaM-X/coreguard/blob/main/INTEGRATION.md | One-page integration; every command executes in CI (badge-backed) |
| https://eslam-x.github.io/coreguard/DELIVERY-DISPUTE-DEMO.html | Live bilingual demo: real execution anchor, criteria, dispute views |
| https://github.com/EslaM-X/coreguard/blob/main/docs/delivery-dispute-boundary.md | The integration boundary document (the "second deliverable") |
| https://github.com/EslaM-X/coreguard/tree/main/examples/real-fixture-intake | The intake kit itself: consent, checklist, gate, converter |
| https://github.com/EslaM-X/coreguard/blob/main/examples/real-fixture-intake/consent-template.json | The bilateral consent template with the named disclosure scope |
| https://github.com/EslaM-X/coreguard/blob/main/examples/real-fixture-intake/prelude.mjs | The fail-closed pre-publication gate (source, not a claim) |
| https://github.com/EslaM-X/coreguard/blob/main/examples/real-fixture-intake/convert-to-fixture.mjs | The one-command converter: green candidate → engine-verified fixture |
| https://eslam-x.github.io/coreguard/DDE-API-REFERENCE.html | The wire API a platform would embed (status codes, live examples) |
| https://peoplescourt.ai/request-demo | The neutral procedure's own intake path — used only with both parties' consent |

## What happens after a "yes" — the five steps (from the kit's README)

1. **Eligibility** — real paid transaction, both parties reachable and willing.
2. **Freeze the evidence** off-platform; both sides hash-agree.
3. **Consent + disclosure scope** signed over one `fixtureRef` (EIP-712 grants).
4. **Removal gate** — the prelude must go green: secrets, personal data,
   origin truth, consent replay, pin integrity.
5. **Convert + submit** — `convert-to-fixture.mjs` turns the green
   candidate into the ten records, re-pinned and engine-verified, in one
   command. Submission happens only where both parties agree.

## Do not say (claim discipline)

- Do **not** name People's Court / Epistemic Labs as partners, reviewers,
  or endorsers — cite only the public discussion and their public intake
  path.
- Do **not** describe the synthetic fixture as a demo of a real dispute.
- Do **not** promise publication, a pilot, funding, or an integration —
  every step after consent is separate and mutual.
- Do **not** send any candidate data before the gate is green and both
  parties have signed the disclosure scope.

## Short version (one paragraph, for DMs)

> We built an open-source evidence layer for agent payments on Core DAO:
> pre-declared authorization → execution attestation → delivery evidence
> with ten fail-closed checks — so a settled payment can never silently
> become "delivery accepted" (one-page boundary: every command executes in
> CI — https://github.com/EslaM-X/coreguard/blob/main/INTEGRATION.md).
> Looking for one real transaction, both parties reachable and consenting,
> to exercise the intake path: signed disclosure scope, machine-gated
> redaction, one-command re-verification, publication only with both
> signatures (kit: https://github.com/EslaM-X/coreguard/tree/main/examples/real-fixture-intake).
> No commitment implied — a 5-minute demo first, if useful:
> https://eslam-x.github.io/coreguard/DELIVERY-DISPUTE-DEMO.html
