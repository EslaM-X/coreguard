# Final Integration-Hook Pitch — copy-paste script

Sibling of `docs/external-verifier-campaign-v0.6.0-wave1-tracker.md` (that file
is the verifier wave; this one is the *integration hook* — the conversation
that moves toward a credential-holding integrator building the bridge).

Release reference (the ONLY link used anywhere, never invent another):
https://github.com/EsLaM-X/coreguard/releases/tag/v0.6.0

---

## When this script is used

Send to a tribunal platform, an escrow team, an agent-payments operator, or an
integration engineer — targeted, one at a time, through the channel they
actually read. Not a mass message. The person holding (or able to apply for)
the execution credential is the receiver.

## Block A — the opening (pick the appropriate one, no more than one)

**A1 (tribunal platform):**

> Hi {name} — you publish the Partner API (v2) boundaries: authority grants,
> consents, the evidence-exporter role, at-least-once webhooks. What we're
> missing is the deterministic layer *between* a verified dispute package and
> that pipeline — the record that makes the handoff auditable before anything
> is executed.

**A2 (escrow/custody reviewer):**

> Hi {name} — the escrow reference interface in your stack is where the
> "Award = execution" assumption usually hides. We've shipped an open standard
> where the settlement gate reads *Award ≠ execution* — response times and
> dispute re-hearing intervenes before money moves.

**A3 (agent-payments operator):**

> Hi {name} — you integrate agent payments at the rail. CoreGuard is the
> evidence spine that rides in front of it: consent is tri-state, the award
> slot stays UNKNOWN, and nothing is modified by the adapter. The reason
> neither we nor you should bridge that gap in one step shows in the demo.

## Block B — the pitch (word-for-word, copy it)

> CoreGuard v0.6.0 (MIT, open source) ships a 90-second reproducible
> path:
>
> - execution evidence (CGEP/1) with honest tri-state consent (FULL / PARTIAL /
>   UNKNOWN) — UNKNOWN is preserved, never "filled in" because money moved;
> - a frozen ADAL/1 dispute package (positions, closure window, award slot
>   UNKNOWN, SHA-256 pinned) that fails closed on a one-byte tamper;
> - an AEA/1 boundary record tying the verified package to an
>   escrow-contract *reference interface* and a *tribunal submission surface*
>   — with `deployed: false`, `award.status: UNKNOWN`,
>   `settlement.authorizationStatus: NOT_AUTHORIZED`, `funds: NONE_MOVED`,
>   `adapter.integrationStatus: NOT_BUILT`, `networkCall: NOT_PERFORMED`;
> - the boundary record self-verifies before exiting 0, and two runs are
>   byte-identical by test.
>
> It deliberately refuses to invent an award, a settlement, or an integration
> that isn't evidenced. That refusal is the design.
>
> The bridge to a live credential — the real, credential-gated execution call
> — is a separate, normatively scoped step, and it belongs to the integrator
> that holds the credential. We keep the evidence deterministic; you keep the
> authority.

**B-lead (optional preamble for a senior engineer):** lead with the honest
one-liner, not the feature list:

> We didn't build the court. We built the deterministic, auditable chain
> between evidence and execution — the brittle part — and we're looking for
> someone to prove it wrong before bridging it to a live credential.

## Block C — the ask (choose one)

**C1 (technical review):**

> Could you review the boundary record and the settlement gate? If you find an
> ambiguity, a false assumption, or a fail-open path, open an issue or send
> us the reproduction — the issue tracker is the right channel, issues are
> public and triaged honestly.

**C2 (integration conversation):**

> If the shape fits your infrastructure, I'd like to walk through a structural
> mapping against your documented Partner API — offline, no credential needed,
> just the reference interfaces and the adapter template. The credential-gated
> live call stays with your side.

**C3 (escrow-specific):**

> Specifically for your escrow review: `escrow.deployed` is `false` and the
> contract field is the reference interface — we ship nothing that changes
> custody. A deployment of the real interface is a separate decision with a
> separate scope, and it wouldn't be CoreGuard's call.

## Block D — CTA (unchanged core — do not rewrite)

> Clone it. Run it. Try to break the evidence model.
>
> We're looking for independent technical verification, not endorsement.
>
> If you find an ambiguity, false assumption, or fail-open path, open an issue
> or send us the reproduction.
>
> https://github.com/EsLaM-X/coreguard/releases/tag/v0.6.0

## Assembly rules

- Open with exactly one A block. Follow with B (or B-lead then B). Choose one
  C. Always end with D.
- Never personalize the CTA. Never claim a live integration, an award, a
  settlement, or an endorsement.
- If asked "is this live/integrated?": the honest answer is "not yet, and not
  by us — the credential-gated live step is the integrator's, separately
  scoped; the repo never holds a credential."