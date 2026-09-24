# Revenue path (Phase E)

How a verification layer that refuses fake metrics monetizes honestly. This
document is a *path*, not a promise: no line in it is revenue until a signed
engagement exists.

---

## Product: what is sellable

The protocol itself stays MIT/open — that is the trust surface. What is
sellable is **service and infrastructure around determinism**:

1. **Verification runs.** An auditor or protocol pays for a formally executed,
   reproducible verification run of a delivery against a pinned acceptance
   criteria, producing an ADAL/1 dispute-ready record + evidence package they
   can archive or hand to an adjudicator. This is already 95% built (CLI +
   conformance + fixture pairs).
2. **Dry-run adapter conformance.** A platform (e.g. one with a Partner API +
   x402-style dispute extension) pays us to keep its interface mapping current:
   schema updates, webhook consumer (eventId dedup + sequence cursor), packet
   integrity pre-checks. The mapping is offline; the *maintenance* is the work.
3. **Reference-tribunal tooling.** Organizations building agentic dispute
   infrastructure license the fail-closed simulator/semantics audit as a
   conformance reference (not as a court).
4. **Settlement-boundary SDK (v0.2+).** Wallet/firewall integration that
   refuses to execute a settlement instruction without a verifying award
   signature and an authority-bound credential. Licenseable, execution gated by
   governance — the SDK never holds keys.

---

## Pricing posture

- **Verification runs:** $2,000–$10,000 per engagement depending on depth
  (single-run evidence package → multi-layer conformance suite). Range, not a
  quote.
- **Adapter maintenance:** monthly retainer once a live mapping exists; until
  then, not offerable.
- **SDK:** per-integration license once v0.2 exists; not before.

## Rules that bind revenue work

1. Open evidence stays open: any engagement must keep the produced record
   verifiable by anyone with the repo (`git clone` + one command), matching the
   clean-clone determinism already proven.
2. No paid engagement may fabricate an external validation ("an auditor said…"
   is only true with a signed statement in the repo).
3. Revenue is never the signal for technical direction; the conformance
   discipline is.

## Honesty flags

- Current revenue: **$0**. Downloads/clones are metrics, not money.
- "Demand" is speculative until a named counterparty signs a scope.
- The grant path (Phase D) and service path (this doc) are complementary;
   neither substitutes for external adoption, which is unproven.

## 12-month checkpoints

| Checkpoint | Evidence of traction (only real signals count) |
|---|---|
| Q1 | ≥1 paid verification engagement or OCV application submitted |
| Q2 | first external verifier run (someone else runs our CLI and writes it up) |
| Q3 | first third-party submission via the dry-run template (credential-holding integrator) |
| Q4 | ≥0 external integrations is the honest floor; any number above 0 is real |

Each checkpoint's UNKNOWN stays UNKNOWN until the named event occurs.