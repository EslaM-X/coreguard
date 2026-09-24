# Phase 3 planning — credential acquisition (planning only)

Status: **PLANNING ONLY.** This document is the plan the owner reviews before
deciding whether and how to engage. It performs **no live action**: no
credential is requested, obtained, stored, or used; no network call is made;
`networkCall: NOT_PERFORMED` remains the test-invariant. Nothing here changes
any status in `docs/integration-surface-map-2026-09.md` — every surface stays
**DRY-RUN** or **NOT_AUTHORIZED** until an explicit owner sign-off exists per
step.

Sources this plan is pinned to:
- `docs/integration-surface-map-2026-09.md` — surfaces, rules, status vocabulary
- `docs/evidence-dossier-2026-09.md` — the three scoped live steps L1–L3 and
  the verified/ DRY-RUN matrix

---

## 1. Who holds the credential (fixed, non-negotiable)

| Party | Role | What they hold |
|---|---|---|
| You (owner) | sole decision-maker | authorization for each step, separately, every time |
| Integrator | credential-holding party | an authorized People's Court credential + its test account |
| CoreGuard (repo + agent) | never a holder | no credential: never stores, requests, or simulates one |

The repo's no-credential invariant is a fact of the design, not a gap. Any plan
that implied CoreGuard or the agent obtaining a credential would be refused.
The agent's only role after owner sign-off would be to record *publicly
verifiable results* honestly (below, §5) — and even that is per-step gated.

## 2. Which surfaces a credential unlocks

Per the surface map, a live step exists on these surfaces; each is
surface-scoped, and settlement is separately scoped by rule 1 (*Award ≠
execution* — `decision_served` never triggers execution without a separate
settlement-adapter credential).

| Surface | What the credential unlocks | Holder needed |
|---|---|---|
| Partner API v2 — authority grants + consents | posting one live authority grant → platform confirmation binding | integrator with PC credential |
| Partner API v2 — evidenceExporter | exporting a real evidence manifest | integrator |
| Partner API v2 — webhooks | receiving the at-least-once stream (dedup + cursor replays) | integrator's endpoint (no CoreGuard credential) |
| x402 `adjudication.prepare()` | one live adjudication prepare packet (deterministic `idempotencyKey`, digest pin) | integrator with PC credential |
| Settlement binding / execution | **never** — binding `CONDITIONAL NO-GO`, `deployed:false`, award slot external-signed | owner decision + separate credential (out of Phase 3 scope) |

Settlement, Mainnet broadcast, and any escrow deployment are **out of Phase 3
scope** and remain `NOT_AUTHORIZED` regardless of this plan.

## 3. Confirmation-binding steps (what makes a live grant provably live)

Surface rule 4: *a live authority grant requires the platform's confirmation
binding (`actorId` / `principalId` + digest-bound statement)* — CoreGuard's
`DERIVED` candidate is explicitly not that. So the plan's acknowledgment step is
a comparison, not a creation:

1. Integrator acquires the credential and test-account access under its own
   account, its own terms. CoreGuard is not a party to the account.
2. Integrator (not CoreGuard) posts one authority grant.
3. Platform returns the confirmation binding: `actorId` / `principalId` +
   digest-bound statement.
4. The CoreGuard-derived candidate is compared against the confirmation
   binding's digest. The `DERIVED` → `CONFIRMED` distinction is preserved: a
   `CONFIRMED` status means *the platform said so*, bound by its digest —
   never that CoreGuard declared itself confirmed.
5. The public confirmation record becomes the evidence. If recorded, it is
   captured as a **recorded fixture** (the pattern of
   `examples/recorded-feed.json`): source URL + capture hash, marked as a
   recorded confirmation — never as a possession or endorsement claim.

## 4. Scoping — the three live steps (unchanged from the evidence dossier)

| Step | What happens | What it proves | Gate |
|---|---|---|---|
| L1 — live authority grant | integrator's credential posts one grant + platform confirmation binding | the `DERIVED` candidate becomes a real, platform-confirmed grant | owner decision + integrator credential |
| L2 — live `adjudication.prepare()` | same credential sends the built packet | the packet is accepted by the live surface; digest survives transport | owner decision + integrator credential |
| L3 — live webhook receive | integrator's endpoint receives the at-least-once stream; `webhook-consumer.mjs` replays it | dedup + cursor hold on real deliveries | integrator endpoint (no CoreGuard credential) |

After L1–L3, the honest status moves from **DRY-RUN** to a small, recorded,
live-proven slice — still scoped: no settlement, no Mainnet, no escrow
deployment.

## 5. Owner decision checklist (all required, separately, per step)

- [ ] **Scope decision:** authorize L1 only / L1–L2 / L1–L3.
- [ ] **Name the integrator:** the credential-holding party. The agent has no
      network to find one; naming is a human/institutional act.
- [ ] **Claim language approval:** the exact honest wording for each completed
      step (status moves from **DRY-RUN** to *recorded live slice*; wording
      must still avoid any settlement/Mainnet/endorsement implication).
- [ ] **No-credential rule stays:** nothing is stored; only a recorded public
      confirmation may enter the repo as a fixture.
- [ ] **Per-step authorization:** each step is a separate explicit decision —
      no standing authorization is created by approving this plan.

Binding note: this plan is planning only. Until an explicit owner sign-off
exists for a concrete step, no action moves. If a sign-off is ever missing or
ambiguous, the agent refuses the step and restates the boundary.

## 6. What "done" looks like

- A recorded, platform-confirmed live grant (L1) whose digest matches a
  `DERIVED` candidate, captured as a fixture with source pointer + hash.
- A live-transport-proven `adjudication.prepare()` packet (L2).
- A recorded webhook stream the consumer replayed with dedup + cursor holding
  (L3) — the exact behavior the offline suite pins, now on real deliveries.

What never changes: no settlement authority, no Mainnet broadcast authority,
no credential held by this protocol, no claim of endorsement, partnership, or
of any surface being "live" without a recorded confirmation.

## 7. What this plan does NOT claim

- No credential is requested, held, or simulated — by CoreGuard *or* by any
  plan step the agent executes (agent steps are record-and-verify only).
- No integrator is identified, engaged, or even contacted by this document.
- No live integration exists, and no People's Court approval/response is
  implied or awaited for anything in this plan.
- L1–L3 are a plan gated on decisions, never a status; a planned step is never
  counted as done.