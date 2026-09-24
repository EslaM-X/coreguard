# CoreGuard Launch Runbook — technical baseline to external adoption

Execution order, not theory. Each phase is gated on the previous one. The
technical baseline is closed and reproducible (see `docs/STATUS.md`); this
runbook converts that baseline into use.

> Scope note: this runbook produces **no new protocol code**. The repo already
> ships Execution → Evidence → Dispute → Adapter → Tribunal simulation →
> Conformance, and CI proves Node 18/20/22 + Contracts + Demos green on
> `f51f890`. The bottleneck from here is external take-and-run, not internal
> feature count.

---

## Phase 0 — Closed baseline (DONE, keep honest)

| Layer | Status |
|---|---|
| CGEP / 1 execution evidence | closed |
| EVP / 1 evidence protocol | closed |
| ADAL / 1 dispute package | closed |
| People's Court structural adapter | closed (offline, dry-run) |
| Reference Tribunal | closed (synthetic by design) |
| Conformance | closed |
| CI Node 18/20/22 + Contracts + Demos | green on `f51f890` |

**Explicit non-claims (strength, not weakness):**
- live tribunal integration — **NO**
- live settlement — **NO**
- external endorsement — **NO**

Every claim a reviewer inspects is reproducible from the committed tree.

## Phase 1 — Reposition as a public protocol

The message is: **CoreGuard is an open verification layer for agent execution
evidence that can be carried into dispute-resolution systems** — never "we are
trying to get People's Court to adopt us".

People's Court is one interoperability target, not the project's future.

- [ ] Rewrite README hero + positioning around portability (execution →
  dispute → escrow → settlement systems), keeping the existing claims table.
- [ ] Keep ALL existing numbers (STATUS.md is the single source of truth).

## Phase 2 — ADAL/1 launch as a technical event

Title: **The Missing Verification Layer for Agentic Disputes**

Hook:

> AI agents can execute.
> A transaction receipt can prove execution.
> But execution is not consent.
> Consent is not adjudication.
> Adjudication is not settlement authority.
> So we built a deterministic verification layer between them.

Then the pipeline:

```
Core execution → EVP/1 → ADAL/1 → Tribunal adapter → External award → Authorized settlement
```

Then the proof (all already in the repo, all reproducible):

- deterministic generation
- SHA-256 pins
- fail-closed verifier
- paired assent fixture
- tamper tests
- reference tribunal
- adapter dry-run
- CI Node 18/20/22
- Core Mainnet execution evidence

The code is the headline.

## Phase 3 — One killer demo, not twenty

A single 90-second walkthrough: **Core Transaction → Evidence → Dispute →
Tribunal → Settlement Gate** — ending with tampering:

| Tamper | Result |
|---|---|
| execution | FAIL |
| consent | FAIL |
| package hash | FAIL |
| award | FAIL |
| unknown settlement | BLOCKED |

Final cards: `COREGUARD — FAIL-CLOSED`, then:

> No trust in the agent. No silent conversion of unknowns. No adjudication by
> the evidence layer. No settlement without authority.

Shareable beats impressive.

## Phase 4 — Public launch

- [ ] **X thread** (`docs/x-thread-missing-verification-layer-2026-09.md`,
  8 posts, publish-ready)
- [ ] **LinkedIn post** (`docs/linkedin-post-missing-verification-layer-2026-09.md`)
- [ ] **GitHub release** for the protocol-ecosystem commit `d169950`
- [ ] **Technical article**
  (`docs/article-missing-verification-layer-agentic-disputes.md`)

## Phase 5 — Three parallel adoption tracks

**Track A — Tribunal (People's Court + any tribunal).** Message: *we have a
deterministic evidence package + adapter boundary; if you have a test
credential, we can test the same package against your environment.* Never:
"integrate us".

**Track B — Agent commerce.** Target projects with agents / payments / escrow /
marketplaces / autonomous purchasing / x402 / settlement. Message: *if your
agent executed a transaction and entered a dispute, CoreGuard produces a
re-verifiable record.* Larger market than any single platform.

**Track C — Core ecosystem.** CoreGuard is Core-native. Message: *Core isn't
only where the transaction executes; it can also be where independently
verifiable execution evidence originates.*

## Phase 6 — Funding

Start with "we built infrastructure", then: open protocol + working
implementation + live chain evidence + deterministic verifier + interop
adapter + external-use path. Then the funding paths:

- OSS grants
- accelerator applications
- Core ecosystem programs
- strategic angels
- infrastructure funds
- paid pilots
- enterprise integrations

First goal is not "huge wealth" — it is **one person/company paying for real
use**. That single event changes the project's standing.

## Phase 7 — IP, deliberately

No random patent. Sequence: ADAL architecture → claim inventory → prior-art
search → novelty review → patent vs defensive publication. Candidate surfaces
to examine: deterministic evidence packaging, cross-layer evidence binding,
fail-closed dispute pipeline, consent/evidence state separation, signed-award
binding, settlement-authority boundary, interoperability/conformance model.

Do not claim legal novelty before prior-art review.

## Phase 8 — The milestone that matters

Not 1000 stars. The chain is:

```
1 external verifier → 1 external adapter → 1 external integration → 1 real case → 1 paid pilot → 3 integrations
```

- first external verifier = external validation
- first paid pilot = start of a business
- several integrations = protocol effect

## Phase 9 — #21788 stance

Neither blocked nor spammed. No third/fourth/fifth follow-up without cause.

- They reply → fold the reply into the interoperability work.
- They don't → the plan continues regardless.

The line stays: *evidence of technical exchange* while the repo keeps moving.
The difference is "I need them" vs "I am building a standard they can use".

## Phase 10 — Honest uncertainty

No one can guarantee: adoption, funding, salary, acquisition, accelerator
acceptance, partnership, patent grant, or viral trend. Those are external
outcomes. We only raise their probability with: exceptional engineering +
reproducibility + public proof + interop + external users + distribution +
commercial path — never by message volume.

## North Star (from now on)

> Can an outside person take the code, run it, use it, and build on top of it?

---

## Execution checklist

**Done**
- [x] CoreGuard execution layer
- [x] EVP/1
- [x] ADAL/1
- [x] People's Court dry-run adapter
- [x] Reference tribunal
- [x] Conformance
- [x] Node 18/20/22 CI
- [x] Technical article
- [x] README positioning

**Next**
- [ ] 90-second killer demo
- [ ] Public X launch
- [ ] LinkedIn launch
- [ ] GitHub release package
- [ ] External-verifier campaign
- [ ] Tribunal outreach
- [ ] Agent-commerce outreach
- [ ] Core ecosystem outreach
- [ ] Accelerator / grant submissions
- [ ] Paid pilot outreach
- [ ] IP / prior-art work

**Outcomes**
- [ ] first external user
- [ ] first external integration
- [ ] first paid pilot
- [ ] first strategic partner
- [ ] funding