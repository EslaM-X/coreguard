# External Verifier Campaign — Wave 1 tracker + per-segment draft messages

Sibling of `docs/external-verifier-campaign-v0.6.0-2026-09.md`. This file is the
execution surface: one draft message per segment, one tracker to run the wave.

Release reference (the ONLY link used anywhere, never invent another):
https://github.com/EsLaM-X/coreguard/releases/tag/v0.6.0

## CTA (unchanged core — do not rewrite)

> Clone it. Run it. Try to break the evidence model.
>
> We're looking for independent technical verification, not endorsement.
>
> If you find an ambiguity, false assumption, or fail-open path, open an issue
> or send us the reproduction.

Every message below ends with that CTA block. Personalize only the opening
paragraph per recipient; do not add claims about adjudication, settlement,
live integration, or endorsement.

## Wave-1 segments (10–20 people total, no bulk blasts)

| # | Segment | Who to look for | Status |
|---|---|---|---|
| 1 | agent infrastructure | builders of agent executors, tool servers, agent identity/finance stacks | pending |
| 2 | agent commerce / payments | payment-rail engineers, agent checkout/authorization reviewers | pending |
| 3 | escrow | escrow/depegging reviewers, custodial clearing auditors | pending |
| 4 | dispute resolution | arbitration/mediation infra or dispute-standard reviewers | pending |
| 5 | blockchain infrastructure | blockchain security/validation, proof-systems reviewers | pending |
| 6 | protocol / security engineering | protocol audits, fail-closed and threat-model reviewers | pending |

## Draft messages per segment

*Placeholder to replace before sending: `{name}`, `{repo_or_org}`, `{channel}`
(choose the channel the recipient actually reads). Send individually, never a
group broadcast.*

### 1 · agent infrastructure

> Hi {name} — I've been reading {repo_or_org} on agent execution and identity
> boundaries, and it lines up with a gap we've been building against: an agent
> can *prove execution* but nothing pins the boundary between execution,
> consent, and adjudication.
>
> CoreGuard (MIT, open source) just shipped v0.6.0 with a 90-second
> reproducible path — execution evidence, honest tri-state consent, a frozen
> ADAL/1 dispute package, tamper detection that fails closed, and an offline
> structural adapter toward external tribunals.
>
> It deliberately refuses to invent an award, a settlement, or an integration
> that isn't evidenced.
>
> Clone it. Run it. Try to break the evidence model.
>
> We're looking for independent technical verification, not endorsement.
>
> If you find an ambiguity, false assumption, or fail-open path, open an issue
> or send us the reproduction.
>
> https://github.com/EsLaM-X/coreguard/releases/tag/v0.6.0

### 2 · agent commerce / payments

> Hi {name} — {repo_or_org} works on agent payments, which is exactly where I
> think the missing piece is: a *receipt* proves execution, but nothing yet
> proves the consent state around it or keeps the dispute boundary
> machine-verifiable.
>
> CoreGuard v0.6.0 (MIT, open source) ships a 90-second demo covering
> execution evidence → consent-state separation → ADAL/1 packaging →
> tamper detection that fails closed. A flipped byte in a package is refused,
> and UNKNOWN consent stays UNKNOWN.
>
> Clone it. Run it. Try to break the evidence model.
>
> We're looking for independent technical verification, not endorsement.
>
> If you find an ambiguity, false assumption, or fail-open path, open an issue
> or send us the reproduction.
>
> https://github.com/EsLaM-X/coreguard/releases/tag/v0.6.0

### 3 · escrow

> Hi {name} — a pattern I keep seeing in {repo_or_org}: funds move on
> execution, while the conditions around release-of-funds live outside any
> verifiable record. CoreGuard keeps escrow *reference-only* and the award
> slot UNKNOWN until authority acts.
>
> v0.6.0 (MIT, open source) demos that boundary in 90 seconds: escrow
> reference-only (`deployed: false`), awards never pre-filled, and the
> reference tribunal refuses settlement on partial consent. It claims no
> adjudication and no settlement infrastructure.
>
> Clone it. Run it. Try to break the evidence model.
>
> We're looking for independent technical verification, not endorsement.
>
> If you find an ambiguity, false assumption, or fail-open path, open an issue
> or send us the reproduction.
>
> https://github.com/EsLaM-X/coreguard/releases/tag/v0.6.0

### 4 · dispute resolution

> Hi {name} — on dispute-resolution infra there's usually a hard split: the
> tribunal is the authority, but the *evidence handoff* into it is dark.
> CoreGuard makes the handoff deterministic: a frozen ADAL/1 dispute package
> with positions, closure window, and pins that fail closed on tamper.
>
> v0.6.0 (MIT, open source) includes a 90-second demo plus a structural
> offline adapter to the tribunal surface — explicitly *not* a live
> integration claim, just a verifiable dry-run path for any credential-holding
> integrator.
>
> Clone it. Run it. Try to break the evidence model.
>
> We're looking for independent technical verification, not endorsement.
>
> If you find an ambiguity, false assumption, or fail-open path, open an issue
> or send us the reproduction.
>
> https://github.com/EsLaM-X/coreguard/releases/tag/v0.6.0

### 5 · blockchain infrastructure

> Hi {name} — CoreGuard is a deterministic verification layer between agent
> execution evidence and adjudication: receipts are pinned, consent is honest
> tri-state (FULL / PARTIAL / UNKNOWN), and a one-byte tamper in a dispute
> package is refused by SHA-256 pin checks.
>
> v0.6.0 (MIT, open source) runs entirely offline and deterministic, with a
> 90-second reproducible demo driven by the repository's own verifiers.
>
> Clone it. Run it. Try to break the evidence model.
>
> We're looking for independent technical verification, not endorsement.
>
> If you find an ambiguity, false assumption, or fail-open path, open an issue
> or send us the reproduction.
>
> https://github.com/EsLaM-X/coreguard/releases/tag/v0.6.0

### 6 · protocol / security engineering

> Hi {name} — a protocol we're building enforces that *fail-open is a bug*:
> the demo exits non-zero if the expected fail-closed behavior does not
> happen. CoreGuard v0.6.0 (MIT, open source) ships that as one reproducible
> 90-second path — execution evidence, consent-state separation, ADAL/1
> packaging, tamper detection, and an offline structural adapter.
>
> We want it broken, not endorsed. If you find an ambiguity, false
> assumption, or fail-open path, open an issue or send us the reproduction.
>
> https://github.com/EsLaM-X/coreguard/releases/tag/v0.6.0

## Tracker

Start each row as `pending`; move to `sent` after the individual message is
out; mark `replied` on any reply; and move to `verifier` when a recipient
reports a reproduced run, an issue, or a PR. Targets: 10–20 total.

| Segment | Recipient | Channel | Handle/Link | Status | Response / reproduction link |
|---|---|---|---|---|---|
| agent infrastructure | (…) | | | pending | |
| agent commerce / payments | (…) | | | pending | |
| escrow | (…) | | | pending | |
| dispute resolution | (…) | | | pending | |
| blockchain infrastructure | (…) | | | pending | |
| protocol / security engineering | (…) | | | pending | |
| … (refill up to 20) | (…) | | | pending | |

## After wave 1 (feed-forward, independent of #21788)

1. A first external verifier reports a reproduced run (green or a real find) →
   publish the report as evidence.
2. External verifier → external adapter → external integration.
3. External integration → real case → paid pilot.

Do not wait for #21788 and do not gate the next wave on it.