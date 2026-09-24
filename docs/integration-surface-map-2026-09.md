# Integration surfaces — CoreGuard mapping (Phase C)

A canonical map of the *publicly documented* surfaces CoreGuard's ADAL/1 output
can be structurally mapped onto, and the exact status of each mapping. This is
the document the adapter, article, and conformance suite cite.

Status vocabulary: **NOT_BUILT** (design only) · **DRY-RUN** (offline mapping
shipped and tested, no live call) · **NOT_AUTHORIZED** (live step exists but is
credential-gated / governance-blocked).

---

## Surface inventory (public, verified 2026-09-24)

| # | Surface | Public reference | CoreGuard artifact |
|---|---|---|---|
| 1 | People's Court Partner API v2 — authority grants | `/api/v2/authorizations/authority-grants` | `packages/peoples-court-adapter` → authority mapping (`DERIVED`) |
| 2 | People's Court Partner API v2 — consents | `/api/v2/authorizations/consents` | consent-artifact mapping (`VERIFIED_LABELS`) |
| 3 | People's Court evidenceExporter role | canonical manifest (RFC 8785), pinned artifacts | evidence-export mapping (`SHA256_PINNED`) |
| 4 | People's Court settlement bindings | named allowed actions + authority corpus; Award ≠ execution | settlement-binding mapping (`AUTHORITY_BOUND`) |
| 5 | People's Court webhooks | at-least-once, `eventId` dedup, sequence cursor | documented in adapter fixture; not implemented |
| 6 | x402 dispute extension (`@peoples-court/x402-disputes`) | `adjudication.prepare()` with `idempotencyKey`, `authorityGrantId`, `consentArtifactIds` | referenced as an endpoint in the dry-run fixture; not invoked |
| 7 | Generic tribunal (any external adjudicator) | signed reasoned Award over package bytes | `examples/reference-tribunal` simulator (SYNTHETIC) |
| 8 | Escrow / settlement execution | CoreGuard `escrowRef` interface (reference-only) | mock escrow state machine (no funds, no broadcast) |

---

## Mapping matrix

| Surface | Status | Owner of the live call | CoreGuard role |
|---|---|---|---|
| PC Partner API v2 (authority grants + consents) | **DRY-RUN** | integrator with authorized PC credential | produce mapped candidates + offline template |
| PC evidenceExporter | **DRY-RUN** | integrator | emit pinned, canonical evidence manifest fields |
| PC settlement binding | **DRY-RUN** | integrator with settlement adapter credential | name the boundary; never write an executable action |
| PC webhooks | **NOT_BUILT** | integrator | contract documented; consumer not implemented |
| x402 `adjudication.prepare()` | **DRY-RUN** | integrator | packet-shaped fixtures; verification of packet integrity as a local pre-step |
| Generic tribunal (award slot) | **NOT_AUTHORIZED** — CoreGuard never fills the award slot | external adjudicator | award slot stays `UNKNOWN`; a real award is external-signed |
| Escrow settlement execution | **NOT_AUTHORIZED** — governance `CONDITIONAL NO-GO`; `deployed:false` | owner decision + separate credential | reference interface only |

---

## Rules that both sides honor (verified from public docs)

1. **Award ≠ execution.** *"decision_served never triggers execution without a
   separately scoped settlement adapter credential."* — mirrored in the
   `executionBoundary` text of the settlement-binding mapping.
2. **Rules are pinned, not authored.** `rulesetId` / `rulesVersion` /
   `rulesHash` are assigned at submission by the platform; CoreGuard's fixture
   records the reference and never authors the rules.
3. **Authenticity challenges ≠ exclusion.** Challenged evidence affects
   contested *weight* at adjudication, never automatic exclusion.
4. **Confirmation binds identities.** A live authority grant requires the
   platform's confirmation binding (`actorId` / `principalId` + digest-bound
   statement) — CoreGuard's `DERIVED` candidate is explicitly not that.

---

## What this document does NOT claim

- No live integration with People's Court (or anyone) exists.
- People's Court has not run CoreGuard's verifier, has not checked the chain,
  and gave only a read-only public critique of an early artifact.
- No settlement authority, no Mainnet broadcast authority, and no credential is
  held by this protocol.

All statuses are re-derivable from the repository: `npm test` runs the
conformance suite that pins this matrix (`test/delivery/
interop-conformance.test.mjs`).