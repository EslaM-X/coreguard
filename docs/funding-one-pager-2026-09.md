# CoreGuard — Investor / Incubator one-pager (2026-09)

**CoreGuard is a deterministic, fail-closed verification layer between agent
execution evidence and adjudication** — the part every agent-payments stack is
missing. MIT open source. Everything below is reproducible from the committed
tree in one command.

Contact: open an issue or PR on the repo.
Only external link used:
https://github.com/EsLaM-X/coreguard/releases/tag/v0.6.0

---

## 1. The problem

- AI agents execute transactions; a receipt proves *execution*, but nothing
  proves the consent state around it, or the boundary before settlement.
- Dispute resolution wants machine-verifiable evidence; today the handoff into
  a tribunal is a dark matter of unverifiable logs.
- Security teams demand fail-closed: a single flipped byte must be *refused*,
  not *re-wrapped* — but most evidence pipelines silently re-wrap.
- **The newest surface — agent-incident reviews** — shows the cost of that
  gap in public: runaway-agent incidents are announced in hours, while their
  reviews are announced in *months*, because the investigating party gathers
  its own evidence and no outside party can replay the verdicts on the same
  bytes. Months of review time are spent rebuilding ad-hoc tooling before the
  investigation even starts.

## 1a. The AIE-1 story — months of review collapse to one cold-clone replay

CoreGuard ships the review surface the industry is missing, packaged as
**AIE-1** (`docs/agent-incident-evidence.md`): **one endpoint, one evidence
bundle, one report schema** — replayable from a cold clone by any reviewing
party, internal or external.

The mechanism, in four sentences:

1. The reviewer stands up the same fail-closed gate from two documented
   one-liners (pinned endpoint + bundle assembly — both executed by CI).
2. The engine re-computes every sha256 pin **from the artifact bytes on every
   run**; identity comes from the socket, never from forwarded headers.
3. Deterministic replay is contract-tested: same bytes in → **byte-identical
   verdict out** — so the reviewer's verdict *is* the investigator's verdict.
4. Tamper fails closed and **names the exact flipped byte**
   (`logo.svg: recorded 0x4323… != actual 0xc323…`) — no vague failures, and
   a false predicate is never even consulted on a rejected bundle.

The collapse, concretely: evidence assembly (days→seconds — the bundle is one
documented command), tooling trust (weeks→zero — the reviewer inherits a
CI-verified surface instead of building one), verdict acceptance (the longest
phase→mechanical — byte-identical replay leaves nothing to negotiate).
What remains is the actual investigation — the part that always needed humans.

Try it in one click, no server, no clone — the live review page runs the real
embedded engine: <https://eslam-x.github.io/coreguard/AIE-1-REVIEW.html>
(paste a bundle or click honest / tamper / structural-refusal). Spec with
counts: `docs/aie1-adoption-map.md`; full protocol:
`docs/mcit-aic-briefing-ar.md` (AR) / the spec itself
(`docs/agent-incident-evidence.md`).

> **Honesty flag:** the surface exists and is CI-verified (TRUE). Any named
> party using it for a real incident review is **GATED** — none has been
> contacted yet. The story above is about the mechanism, not customers.

## 2. The product and the proof (all real, all in-repo)

```
execution evidence → consent state → ADAL/1 dispute package → tribunal adapter → external award → authorized settlement
```

- **Deterministic + fail-closed:** SHA-256 pin-checked; a one-byte tamper is
  refused and the demo *exits non-zero if the refusal doesn't happen*.
- **Honest tri-state consent:** `FULL / PARTIAL / UNKNOWN`; incomplete evidence
  is never converted into bilateral consent.
- **1176 tests, CI-enforced** against a committed snapshot on Node 18/20/22 (a
  stale number in any doc is a failing build); ethical discipline is tested too
  — the suite asserts the project never overclaims.
- **L1 `VERIFIED` pilot on Core Mainnet:** real transfer, tx
  `0xe67c61fd…6891a9b8`, block `38712625` — independently re-derived
  (`RECEIPT_INTEGRITY`) against a pre-declared EIP-712 authorization; record in
  `submission/06-mainnet-proof.md` + frozen `scripts/verify-live.json` (live
  re-derivation: `npm run demo:90s:live`; tx/block regression-asserted in
  `test/delivery/fixture.test.js`; the anchoring registrar is cross-RPC-verified
  at `rpc.coredao.org` + `rpc.ankr.com`). Read-only — no L2/trace claim,
  `VERIFIED ≠ SAFE`.
- **Test-account-ready live-submission harness:** builds and pins the x402
  `adjudication.prepare()` packet (deterministic idempotencyKey) and replays a
  recorded webhook stream (eventId dedup + sequence cursor) — one command,
  offline, `networkCall: NOT_PERFORMED`.
- **Structural adapter + reference tribunal:** offline dry-run mapping toward
  external dispute surfaces; award slot stays `UNKNOWN`; escrow stays
  reference-only (`deployed:false`).
- **v0.3 governance first-pass shipped (2026-09-25):** a machine-readable
  **Evidence Passport**, **Reputation (CG-RP/1 = recorded external milestones
  only; today 0)** and **risk findings (CG-RF/1 = findings only, never a fuzzy
  safety score)** over the live-integration ladder — `npm run ladder:*`
  (status · passport · dashboard · reputation · findings), all reading the
  committed snapshot.

## 3. Market and revenue path

Who pays: **AI/automation platforms** with agent liability; **custodians and
treasury operators** needing audit-grade proof; **auditors/oracles** reselling
execution attestations (CoreGuard as attestation primitive).

Monetizable services — the protocol stays MIT/open (that's the trust surface):

1. **Verification runs** — paid, reproducible verification of a delivery
   against pinned acceptance criteria → ADAL/1 dispute-ready record. $2k–$10k
   per engagement (range, not a quote); ~95% built.
2. **Dry-run adapter maintenance** — monthly retainer keeping an external
   surface mapping current (schema updates, webhook consumer, packet
   integrity pre-checks).
3. **Reference-tribunal tooling** — license the fail-closed simulator as a
   conformance reference.
4. **AIE-1 incident-review subscriptions** — an org under a runaway-agent
   incident licenses the review surface: reviewers inherit one endpoint + one
   bundle schema + one verdict language, and replay instead of rebuilding.
   The same rail serves internal audits and external oversight; the protocol
   stays open, the engagement is the service.
4. **Settlement-boundary SDK (v0.2+)** — refuses to execute a settlement
   without a verifying award signature + authority-bound credential; execution
   gated by governance, never holds keys.

12-month signal chain: first paid verification engagement → first external
verifier run → first third-party live submission (credential-holding
integrator) → first external integration.

## 4. The ask (milestone-gated, Core-native)

1. **M1 — close the live-slice steps (L1–L3).** A credential-holding
   integrator records a platform-confirmed live authority grant, an accepted
   `adjudication.prepare()`, and a replayed webhook stream. Funding covers
   engineering + the integrator engagement.
1a. **M1a — one AIE-1 review engagement.** A single org (agent platform,
    exchange, or public body) adopts the incident-review surface for one real
    or tabletop review — the first external replay of a verdict from a cold
    clone. The surface is already shipped; the engagement proves the market.
2. **M2 — generic tribunal signing interface** (adapter-agnostic award
   ingestion + signature verification contract).
3. **M3 — settlement-boundary SDK** for wallet/Firewall layers (mock execution
   in conformance; real execution remains governance-gated).

## 5. Why us

- **We already built it** — not a deck: a deterministic, adversarially tested
  engine with reproducible evidence back to chain reads.
- **Auditor-honest** — `VERIFIED ≠ SAFE` is in the README baseline; we will
  not sell "prevents all exploits".
- **Scope-disciplined** — no dashboard theater, no fake metrics, no
  unfalsifiable security claims; every status is re-derivable from `npm test`.

## 6. What we will not claim

- No live integration with People's Court or anyone exists — surfaces are
  **DRY-RUN** until a recorded confirmation exists (L1–L3), and no credential
  of any party is ever held in-repo.
- No settlement authority, no Mainnet broadcast authority, no escrow — binding
  `CONDITIONAL NO-GO`, `deployed:false`.
- No "security guarantees", fake adoption, partnership, or funding metrics.

## 7. Honest status flags (as of 2026-09-25)

- Revenue: **$0**; external adoption: **unproven** — those are the honest
  numbers this page preserves; the snapshot-anchored dashboard
  (`docs/adoption-dashboard.md`) shows the same zeros.
- OCV Catalyst: the Summer 2026 v2 window **closed (deadline 2026-06-28)**;
  **no next window is announced** (verified against OCV handbook + Greenhouse,
  2026-09-24). The roadmap re-verifies before any plan is built on it.
- Every checkpoint keeps its `UNKNOWN` until the named event actually occurs.