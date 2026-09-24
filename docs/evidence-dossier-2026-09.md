# Evidence dossier — the live-integration boundary (Phase C)

The one document to read before an integration conversation. It shows what is
**verified today**, the exact **credential boundary**, and the **three scoped
live steps** that would make "we have a live integration" true — each gated on
the owner's separate explicit decision and a credential-holding integrator.
Nothing here is claimed as executed; everything marked *verified* is
re-derivable from the committed tree.

Release reference (the ONLY link used anywhere):
https://github.com/EsLaM-X/coreguard/releases/tag/v0.6.0

---

## 1. What is verified today (offline, reproducible)

| Surface | Status | Evidence (in-repo) |
|---|---|---|
| ADAL/1 dispute package (positions, closure, award slot UNKNOWN) | **DRY-RUN** | `npm test` fail-closed suite; a one-byte tamper is refused |
| Partner API v2 — authority grants + consents | **DRY-RUN** | `packages/peoples-court-adapter` mapped candidates, schema-validated |
| Partner API v2 — evidenceExporter | **DRY-RUN** | canonical RFC-8785 manifest + SHA-256 pins |
| Partner API v2 — settlement bindings | **DRY-RUN** | `Award ≠ execution` mirrored in the boundary text |
| Partner API v2 — webhooks (`eventId` dedup + sequence cursor) | **DRY-RUN** | `webhook-consumer.mjs` replay consumer + `examples/recorded-feed.json` fixture — dedup, cursor, out-of-order hold all test-enforced |
| x402 `adjudication.prepare()` | **DRY-RUN** | `x402-prepare.mjs` deterministic packet (idempotencyKey from package revision, authorityGrantId, consentArtifactIds, digest pin) |
| Harness (test-account-ready end-to-end) | **DRY-RUN** | `npm run peoples-court:harness` — verify → map → packet → replay → pin → self-verify, exit 0 |
| Generic tribunal (award slot) | **NOT_AUTHORIZED** | CoreGuard never fills the award slot; a real award is external-signed |
| Escrow settlement execution | **NOT_AUTHORIZED** | governance `CONDITIONAL NO-GO`; `deployed:false` |

Every **DRY-RUN** row is offline and deterministic: no network call, no
credential embedded, `networkCall: NOT_PERFORMED` is test-invariant.

## 2. The credential boundary (exactly where live starts)

A live authority grant and a live `adjudication.prepare()` call require, per
the publicly documented surface:

1. an **authorized People's Court credential** (channel token) held by the
   integrator — not by CoreGuard;
2. the platform's **confirmation binding** (`actorId` / `principalId` +
   digest-bound statement);
3. a **webhook endpoint** receiving the at-least-once stream on the
   integrator's side — the harness consumer is ready for that recorded stream;
4. for settlement: a **separately scoped settlement-adapter credential** —
   *Award ≠ execution*; decision served never triggers execution without it.

CoreGuard holds none of these. The repo never stores, requests, or simulates a
credential. This boundary is a fact of the design, not a gap being worked
around.

## 3. The three scoped live steps (each owner-gated)

These are the *only* things that would make the claim "we have a live
integration" true. Each requires (a) the owner's separate explicit decision and
(b) a credential-holding integrator. They are scoped small on purpose.

| Step | What happens | What it proves | Gate |
|---|---|---|---|
| L1 — live authority grant | integrator's credential posts one grant + platform confirmation binding | the DERIVED candidate becomes a real, platform-confirmed grant | owner decision + integrator credential |
| L2 — live `adjudication.prepare()` | same credential sends the built packet (deterministic `idempotencyKey`) | the packet is accepted by the live surface; digest survives transport | owner decision + integrator credential |
| L3 — live webhook receive | integrator's endpoint receives the at-least-once stream; `webhook-consumer.mjs` replays it | dedup + cursor hold on real deliveries | integrator endpoint (no CoreGuard credential) |

After L1–L3 the honest status moves from **DRY-RUN** to a small, recorded,
live-proven slice — still scoped: no settlement, no Mainnet, no escrow
deployment. Those remain `NOT_AUTHORIZED` under binding governance
`CONDITIONAL NO-GO`.

## 4. What this dossier does NOT claim

- No live integration with People's Court (or anyone) exists or is claimed.
- People's Court has not run CoreGuard's verifier; no endorsement, no
  partnership, no response is implied.
- No settlement authority, no Mainnet broadcast authority, and no credential is
  held by this protocol.
- Steps L1–L3 are a *plan gated on decisions*, never a status. A planned step
  is never counted as done.

Everything marked *verified* is reproducible: `npm test` runs the conformance
suite that pins these statuses, and `npm run peoples-court:harness` re-runs the
full offline path end-to-end.