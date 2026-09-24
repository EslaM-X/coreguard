# Media release — evidence harness + Execution Kit (2026-09-24)

Refreshed posting bundle that folds the new shipped evidence (live-submission
harness, evidence dossier, Execution Kit, phase-3 plan) into the launch
messaging. Supersedes the message bodies in
`docs/x-thread-coreguard-v0.6.0-2026-09.md` and
`docs/linkedin-post-coreguard-v0.6.0-2026-09.md` (those files stay for the
record; this file is the current copy-to-post text).

**Release reference (the ONLY link used, never invent another):**
https://github.com/EsLaM-X/coreguard/releases/tag/v0.6.0

## CTA (unchanged core — do not rewrite)

> Clone it. Run it. Try to break the evidence model.
>
> We're looking for independent technical verification, not endorsement.
>
> If you find an ambiguity, false assumption, or fail-open path, open an issue
> or send us the reproduction.

Every post ends with that block or a compressed form of it. No post adds a
claim about adjudication, settlement, live integration, endorsement, or
funding.

## X thread — "CoreGuard: the evidence is now one command away" (8 posts)

Each post ≤ 280 chars; X counts the URL as 23 chars (t.co).

**1 (hook)**
> AI agents can execute.
>
> But execution is not consent.
> Consent is not adjudication.
> Adjudication is not settlement.
>
> We built CoreGuard to make those boundaries machine-verifiable.

**2 (what's new)**
> Today: a test-account-ready harness. It builds and pins the
> adjudication.prepare() packet (deterministic idempotencyKey), then replays a
> recorded webhook stream — eventId dedup + sequence cursor.
>
> One command. Offline. Fail-closed.

**3 (one reproducible path)**
> The v0.6.0 release has one reproducible path:
>
> execution evidence → consent state → ADAL/1 dispute package → tamper
> detection → tribunal simulation → interoperability boundary.
>
> One run. Real repository verifiers.

**4 (consent stays honest)**
> The consent test is deliberately simple: identical execution + delivery
> evidence, FULL modeled assent vs PARTIAL.
>
> Missing party-B assent remains UNKNOWN.
>
> The verifier does not turn incomplete evidence into bilateral consent.

**5 (tamper, fail-closed)**
> Then we tamper. A byte changes. SHA-256 verification fails.
>
> The demo expects that failure — if the expected fail-closed behavior doesn't
> happen, the demo exits non-zero.
>
> Fail-open is a bug, and we test for that bug.

**6 (what we won't claim)**
> awardSlot.status = UNKNOWN. escrowRef.deployed = false.
> networkCall = NOT_PERFORMED.
>
> Every surface stays DRY-RUN until a recorded confirmation exists. The
> evidence layer never invents an award, settlement, or integration.

**7 (the Execution Kit)**
> We shipped the thing that makes the live step one signature away: an
> Execution Kit + Evidence Dossier — exactly what a credential-holding
> integrator runs for L1–L3, and what we will (and won't) claim after each.
>
> Planning only until a step is recorded.

**8 (the test)**
> CoreGuard v0.6.0 is public. The test isn't stars.
>
> It's whether someone outside the project can take the repo, run the same
> path, inspect the evidence, and independently verify the result.
>
> Verification before trust.
>
> https://github.com/EsLaM-X/coreguard/releases/tag/v0.6.0

## LinkedIn post (English; Arabic translation on request)

> Execution is not consent. Consent is not adjudication. Adjudication is not
> settlement.
>
> CoreGuard v0.6.0 is a deterministic, fail-closed verification layer between
> agent execution evidence and adjudication — MIT open source, and everything
> below is reproducible by anyone who clones the repo.
>
> What's in this release:
>
> - a conformance + delivery suite (hundreds of passing tests, zero failures
>   locally and on CI, Node 18/20/22)
> - SHA-256 tamper detection that fails closed: one flipped byte is refused,
>   and the demo exits non-zero if the refusal doesn't happen
> - honest tri-state consent — FULL / PARTIAL / UNKNOWN, never converted
> - a test-account-ready live-submission harness: builds and pins the x402
>   adjudication.prepare() packet and replays a recorded webhook stream
>   (eventId dedup + sequence cursor), offline, no credential embedded
> - an Evidence Dossier + Execution Kit describing exactly what a
>   credential-holding integrator would run (L1–L3) and what we will and won't
>   claim after each step
>
> What we do not claim:
>
> - no live integration with People's Court or anyone — surfaces are DRY-RUN
> - no settlement authority, no Mainnet broadcast, no escrow — CONDITIONAL
>   NO-GO, deployed:false
> - no endorsement, partnership, or funding claims
>
> The release is built around one question: can an independent person take the
> repository, run the verification path, and inspect the result without
> trusting the author?
>
> Clone it. Run it. Try to break the evidence model. We're looking for
> independent technical verification, not endorsement.
>
> https://github.com/EsLaM-X/coreguard/releases/tag/v0.6.0
>
> #AgenticDisputes #BitcoinDeFi #Verification #CoreDAO #Web3

## Medium teaser (short, points to the technical article)

> Execution is not consent. Consent is not adjudication. Adjudication is not
> settlement. We built the missing verification layer between them — and this
> week it ships with a test-account-ready live-submission harness.
>
> The full technical article lives in this repository (see the release notes).
> The repo is deterministic and fail-closed: a one-byte tamper is refused and
> the demo exits non-zero if it isn't.
>
> Clone it. Run it. Try to break the evidence model.
>
> https://github.com/EsLaM-X/coreguard/releases/tag/v0.6.0

## Channel checklist (post in this order)

1. **X** — above thread (publish via the author's account).
2. **LinkedIn** — above post.
3. **Medium** — teaser linked to the technical article
   (`docs/article-missing-link-ai-tribunals-publish-pack-2026-09-24.md` holds
   the full publish pack with metadata).
4. **GitHub Discussions / release notes** — link the Evidence Dossier
   (`docs/evidence-dossier-2026-09.md`) and Execution Kit
   (`docs/execution-kit-integrator-2026-09.md`).
5. **Wave-1 external-verifier campaign** — use the per-segment draft messages
   in `docs/external-verifier-campaign-v0.6.0-wave1-tracker.md`; personalize
   only the opening paragraph, always end with the CTA, always use the ONE
   release link.

## Honesty block (binding, unchanged)

No post may say People's Court has run CoreGuard's verifier, responded, or
approved anything. No post may convert `DRY-RUN`, `UNKNOWN`, or a plan into a
claim of adoption, funding, or revenue. Every status is re-derivable from
`npm test` and `npm run peoples-court:harness`.