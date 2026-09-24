# X thread — "CoreGuard v0.6.0 — Verification before trust"

Publish-ready 8-post thread. Author's account required to publish; the repo
only produces the draft. Each post ≤ 280 chars. Release reference (the ONLY
link used, never invent another): https://github.com/EslaM-X/coreguard/releases/tag/v0.6.0

---

**Post 1 (hook)**

> AI agents can execute transactions.
>
> But execution is not consent.
> Consent is not adjudication.
> Adjudication is not settlement.
>
> We built CoreGuard to make those boundaries machine-verifiable.

**Post 2 (positioning)**

> CoreGuard turns agent execution evidence into deterministic, fail-closed
> dispute packages.
>
> The goal isn't to make the evidence layer a court.
>
> The goal is to make evidence portable, inspectable, and difficult to
> silently reinterpret.

**Post 3 (one reproducible path)**

> The new v0.6.0 release has one reproducible 90-second path:
>
> execution evidence → consent state → ADAL/1 dispute package → tamper
> detection → tribunal simulation → interoperability boundary.
>
> One run. Real repository verifiers.

**Post 4 (the consent test)**

> The consent test is deliberately simple:
>
> Two cases have identical execution + delivery evidence.
> A = FULL modeled assent.
> B = PARTIAL modeled assent.
>
> Missing party-B assent remains UNKNOWN.
>
> The verifier does not turn incomplete evidence into bilateral consent.

**Post 5 (tamper, fail-closed)**

> Then we tamper with the package.
>
> A byte changes in a temporary copy.
>
> SHA-256 verification fails.
>
> The demo expects that failure.
>
> If the expected fail-closed behavior doesn't happen, the demo exits non-zero.

**Post 6 (the boundaries apply everywhere)**

> The same boundary applies to adjudication and settlement:
>
> awardSlot.status = UNKNOWN
>
> escrowRef.deployed = false
>
> adapter.integrationStatus = NOT_BUILT
>
> CoreGuard does not invent an award, payment, authority, or integration that
> isn't evidenced.

**Post 7 (interoperability is structural)**

> Interoperability is demonstrated through a structural People's Court adapter:
>
> offline / dry-run
> network: NOT_PERFORMED
>
> It is an interoperability surface, not a claim of live integration or
> endorsement.

**Post 8 (the test)**

> CoreGuard v0.6.0 is now public.
>
> The test isn't how many stars it gets.
>
> The test is whether someone outside the project can take it, run it, inspect
> the evidence, and independently verify the result.
>
> Verification before trust.
>
> https://github.com/EslaM-X/coreguard/releases/tag/v0.6.0

*Char-check note: raw text is 302 chars; X counts the URL as a 23-char t.co
link, so the live post is 273/280 and fits. Do not shorten the wording.*