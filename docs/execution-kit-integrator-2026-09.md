# Execution Kit — Integrator brief (Phase 3 + 4, ready to run)

Status: **PLANNING ONLY on CoreGuard's side** — CoreGuard executes nothing live
and holds no credential. This kit is **explicitly executable by a Party that
holds a People's Court test-account credential**. Everything is staged so the
three live steps are one signed scope-of-work away.

Companion documents: `docs/phase3-credential-acquisition-plan-2026-09.md`
(planning + owner checklist), `docs/evidence-dossier-2026-09.md` (verified
DRY-RUN matrix + L1–L3), `docs/integration-surface-map-2026-09.md` (surfaces).

The ONLY external link used anywhere:
https://github.com/EsLaM-X/coreguard/releases/tag/v0.6.0

---

## 1. What this is (a two-minute framing for the integrator)

CoreGuard is a deterministic, fail-closed verification layer between *agent
execution evidence* and *adjudication*:

```
execution evidence → consent state → ADAL/1 dispute package → tribunal adapter → external award → authorized settlement
```

Every step runs offline and byte-pinned. A single flipped byte is refused by
SHA-256 pin checks; a consent gap stays UNKNOWN; the evidence layer never
invents an award, a settlement, or an integration. It ships a
**test-account-ready live-submission harness** that builds and pins the
transport packet and replays a recorded webhook stream in one command:

    npm run peoples-court:harness -- --case examples/delivery-fixture/pairs/dispute-package/reference-A

## 2. What we need from the integrator

1. **Holder of a People's Court Partner API v2 test-account credential**
   (for L1 + L2) and **a public webhook endpoint** (for L3).
2. **Explicit scope sign-off per step** — the project owner signs this kit's
   scope; the integrator signs the same scope. No standing authorization.
3. **Consent to record only what the platform publicly returns** — the
   confirmation binding, the accepted packet, the received stream — as a repo
   fixture with a source pointer and capture hash.

## 3. The three steps (each small, each one command away)

### L1 — live authority grant

| | |
|---|---|
| Who acts | integrator credential posts one grant at the Partner API v2 authority-grants surface |
| What comes back | platform confirmation binding (`actorId` / `principalId` + digest-bound statement) |
| CoreGuard's role | compare its `DERIVED` candidate mapping against the confirmation digest; record the public confirmation (source URL + capture hash) — CoreGuard never "self-confirms" |
| Acceptance | confirmation returned + digest structurally matches our mapping + recorded as a fixture |

### L2 — live `adjudication.prepare()`

| | |
|---|---|
| Input (ready offline) | `npm run peoples-court:harness ...` emits `x402-prepare-packet.json` + `x402-packet-digest.json` — deterministic `idempotencyKey` from the pinned package revision |
| Who acts | the same credential sends the built packet at the x402 dispute surface |
| Acceptance | the live surface returns the accepted packet; the digest we pinned survives transport byte-for-byte |

### L3 — live webhook receive

| | |
|---|---|
| Who acts | integrator's endpoint receives the at-least-once webhook stream (`eventId` payloads) |
| CoreGuard tool | `webhook-consumer.mjs` replays the recorded stream — `eventId` dedup + sequence cursor + out-of-order hold |
| Acceptance | replay report shows applied / duplicate / out-of-order counts + cursor, identical to the offline suite's invariants |

## 4. What we will claim, step by step (honest wording)

| Step | Honest claim after success | What we will NOT claim |
|---|---|---|
| L1 | "one live, platform-confirmed authority grant was recorded (source + hash)" | not: platform approval, endorsement, partnership, or settlement authority |
| L2 | "the transport packet we pinned was accepted by the live x402 surface" | not: that adjudication ran, or that an award exists |
| L3 | "a recorded webhook stream was replayed with dedup + cursor invariants" | not: that any settlement or escrow occurred |

The status vocabulary moves from **DRY-RUN** to *recorded live slice, step by
step*. Nothing broader.

## 5. What will NOT happen (binding, unchanged)

- No settlement, no Mainnet broadcast, no escrow deployment — governance
  `CONDITIONAL NO-GO`; `deployed:false` stays a test-invariant.
- No credential ever enters the repository — only *recorded public responses*
  as fixtures.
- No claim of endorsement, partnership, funding, or "live integration" beyond
  the exact three recorded events above.

## 6. Effort and permissions

| Step | Effort | Running | Software |
|---|---|---|---|
| L1 | ≈30 min | one credentialed API post + confirmation capture | none |
| L2 | ≈15 min | offline harness → then one packet send with the credential | Node 18+ |
| L3 | ≈30 min | endpoint receives stream → replay via `webhook-consumer.mjs` | Node 18+ |

Operator commands (no private keys, nothing runs on CoreGuard's author
machine):

    npm run peoples-court:harness -- --case examples/delivery-fixture/pairs/dispute-package/reference-A
    node packages/peoples-court-adapter/cli-harness.mjs --case examples/delivery-fixture/pairs/dispute-package/reference-A --feed packages/peoples-court-adapter/examples/recorded-feed.json

## 7. How to start

Open an issue or PR on this repository. Attach: the scope you sign (L1 / L2 /
L3 selection), the credential surface you hold, and the test-account
environment. CoreGuard then confirms that scope against this kit, records only
what the platform publicly returns, and updates statuses one step at a time.
Nothing else happens by default — and nothing is claimed until a step's
acceptance is recorded.