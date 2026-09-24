# X thread — "The Missing Verification Layer for Agentic Disputes"

Publish-ready 8-post thread draft. Author's accounts/credentials required to
publish; the repository only produces the draft. Each post ≤ 280 chars.

---

**Post 1 (hook)**

> Agents can move money on Core Mainnet. That was never the hard part.

> The hard part is the record: did it happen, against what promise, under whose
> authority? Chain receipts prove execution — they prove nothing else.

> We built the verification layer for everything that comes after the tx.

**Post 2 (execution ≠ consent)**

> A transfer receipt proves a transfer. It does not prove agreement.

> CoreGuard's evidence protocol treats consent as labeled tri-state:
> FULL / PARTIAL / UNKNOWN — never as a boolean inferred from the receipt.

> An UNKNOWN party stays UNKNOWN. Absence of evidence is recorded as "not
> evidenced", never as "found absent".

**Post 3 (consent ≠ adjudication)**

> Evidence labels describe state. They don't resolve who's right.

> The dispute package layers positions + a closure window + an award slot that
> is UNKNOWN by design, over the pinned execution record.

> CoreGuard never produces the line "dispute resolved by CoreGuard".

**Post 4 (adjudication ≠ settlement)**

> An award does not move money — not even a good one.

> "decision served" never triggers execution without a separately scoped
> settlement credential. A settlement binding names allowed actions + an
> authority corpus, and that's where the money step begins.

**Post 5 (the layered model)**

> The stack:

> EVP/1 execution evidence (pinned tx + label discipline)
> → ADAL/1 dispute package (positions, closure, award slot, unknowns)
> → Adapter mapping a tribunal's documented surface

> Every layer re-verifies the one below it and never rewrites it. Determinism is
> in CI: same bytes in, same bytes out.

**Post 6 (why not build a court)**

> Building another dispute platform would be a category error.

> People's Court already publishes a Partner API v2 (authority grants, consents,
> evidenceExporter, settlement bindings, at-least-once webhooks) and an x402
> dispute extension. These are real, public surfaces.

> Conformance, not competition.

**Post 7 (the boundary — honesty)**

> Our adapter maps CoreGuard records to those documented interfaces and runs
> fully offline — the dry-run never makes a live call.

> Important: People's Court reviewed our docs read-only. They didn't run our
> verifier or check the chain. Live submission is credential-gated and
> NOT_PERFORMED in every artifact we ship.

**Post 8 (call to action)**

> What we ship is a deterministic, fail-closed evidence record shaped for the
> tribunal layer — plus a local reference-tribunal simulator that exercises the
> semantics end-to-end.

> MIT repo, one command, offline. If you're building agentic dispute
> infrastructure, the verification layer is the missing piece.

> https://github.com/EslaM-X/coreguard