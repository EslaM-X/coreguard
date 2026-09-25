# Campaign Ops — Outreach Execution Kit (2026-09-25)

Owner-facing kit for the **adoption mode** that began this day. Everything in
the plan (`docs/master-launch-adoption-plan-v2-2026-09-25.md`) becomes
executable here: the exact Phase A message, six copy-ready Phase B letters,
the only success metric that matters, and the rule that hard-stops release
creep. Nothing in this file is sent automatically. Every letter needs the
owner's separate sign-off (the gate column) before it exists in anyone's
inbox — and the truth ledger at the end records whatever actually goes out.

ملخص بالعربية: مرحلة التثبيت انتهت، ونحن في مرحلة العرض. الهدف الوحيد
للقياس هو **استهلاك خارجي لحزمة الأدلة** (يُشغّل أو يفحص أحدهم `npm test`/
`boundary:audit` على استنساخه أو يستخدم حزمة EVP/1 أو ADAL/1 داخل نظامه) —
ليس عدد الرسائل ولا الردود ولا الإعجابات. ست رسائل جاهزة للنسخ بالأسفل،
كل واحدة تقنية قصيرة بلا أي طلب ("No asks")، ونشر كل واحدة قرارك المنفصل.
لا إرسال تلقائي على الإطلاق، ولا مُطاردة مهما طال الصمت.

## 1. Phase A — the one People's Court message

The message is final in `docs/phase-a-people-court-followup-draft-2026-09-25.md`
(same artifact-first framing the owner confirmed: *"We kept building. The
current artifact is mechanically anchored and reproducible across Node
18/20/22. If useful, you can inspect or run the current evidence package."*).

Posting rules (binding, from the plan):
- Verify the day you post: `npm test` green and
  `node scripts/current-state.mjs --check` → CHECK OK.
- Post under the existing thread (not a new one), owner's account, GitHub
  Discussion Markdown.
- Then hold indefinitely. Re-entry only on their reply. If they never reply,
  the thread is CLOSED BY RECORD, never by noise.
- People's Court is a technical-signal channel, not a gate: whether or not
  they reply, Phase B below proceeds on schedule.

## 2. Phase B — six copy-ready letters

All letters share this honesty skeleton: we are the evidence/verification
boundary between execution evidence and adjudication/settlement; every claim
is reproducible from a fresh clone; nothing asks anything. Each letter is
written for the target's real surface. Commands stay inline (rendered as code)
so a counterparty can literally run them.

Shared facts every letter may state (stable, snapshot-anchored — no file
counts on purpose, so letters never go stale):
- `npm test` = 1033 tests, CI-enforced against `docs/state-snapshot.json` on
  Node 18/20/22 (a stale number in any doc is a failing build).
- `npm run boundary:audit` = committed-tree scan, 0 violations; the audit
  refuses any file that claims a live call, a stored credential, or a
  settlement.
- Building blocks: EVP/1 evidence package (tri-state modeled consent + the
  evidenceStatus/actualStatus split), ADAL/1 dispute & attestation standard,
  AEA/1 escrow/arbitration boundary record, conformance adapter
  (integrationStatus NOT_BUILT), synthetic reference tribunal.
- Anchor: https://github.com/EsLaM-X/coreguard/releases/tag/v0.6.0

### Letter B1 — Internet-Court ecosystem (GenLayer / Internet Court coalition)

Target surface: GenLayer docs/forum + the Internet Court initiative contacts
(July-2026 coalition incl. MetaMask, OKX, BNB Chain, Matter Labs; mainnet
target Q4 2026). Entry artifacts: EVP/1 + ADAL/1 + conformance fixtures.

> You are building the environment where AI adjudication will reason over
> agent disputes. The hard part of that is not the judge — it is the
> evidence: deterministic, source-attested, reproducible. We built exactly
> that rail and it is open.
>
> EVP/1 is an offline evidence package standard with tri-state modeled
> consent and a strict evidenceStatus/actualStatus split (absence supports
> "not evidenced as settled", never an invented verdict). ADAL/1 turns it into
> a dispute package with per-party attestation and an award slot that stays
> UNKNOWN until an authority sets it. One command produces and re-verifies:
> `npm run dispute-package -- --case A --out <dir>` (exit 0 =
> DISPUTE_PACKAGE_OK).
>
> The whole repository is machine-audited: 1033 tests enforced against a
> committed snapshot on Node 18/20/22, and a boundary audit that refuses any
> file claiming a live call, a stored credential, or a settlement. A fresh
> clone reproduces all of it — `npm ci && npm test && npm run boundary:audit`.
>
> If any of this is useful to the arbiters you are designing, it can be
> inspected or run as-is. No asks.

Never say: partnership, sponsorship, "their arbiter uses our format", any
integration commitment, deployment timeline. Gate: owner sign-off before send.

### Letter B2 — Agentic-court systems (tribunal / Polycourt / QE-Court)

Target surface: `kalashshah/tribunal` (iNFT judges, REE/Gensyn, MCP server),
Polycourt (TEE + x402 + weighted judges), QE-Court
(`proffesor-for-testing/agentic-qe`, `/v1/qe/verdict`). Entry artifacts:
AEA/1 + adapter + reference tribunal; conformance fixtures.

> Between an agent's execution evidence and a verifiable adjudicator's
> verdict there must be a boundary that preserves evidence honestly — or the
> verdict is only as trustworthy as the stories fed it. That boundary is the
> artifact we build.
>
> AEA/1 records the escrow/arbitration boundary: a verified ADAL/1 dispute
> package, an escrow-contract reference, a tribunal submission surface — and
> our adapter's integrationStatus honestly stays NOT_BUILT until a
> credential-holding integrator runs a step (`npm run aea1:prepare`). The
> repo also ships a synthetic reference tribunal and conformance fixtures so
> anyone can exercise the flow offline and deterministically.
>
> Reproducible everywhere: `npm ci && npm test && npm run boundary:audit` —
> 1033 tests CI-enforced on Node 18/20/22; the audit refuses any claim of a
> performed network call.
>
> If the evidence boundary is useful for your judge or your escrow flow, it
> can be inspected or run as-is. No asks.

Never say: running any of their nodes, endorsing their verdicts, joint
verdict authority, "moved from DRY-RUN". Gate: owner sign-off.

### Letter B3 — Legacy ODR rails (evidence-in, not replacement)

Target surface: Kleros (PNK courts), UMA/Optimistic Oracle, Reality.eth,
Aragon Court (dormant), Jur. Entry artifacts: EVP/1 + the
`verify-provenance` exit-code discipline.

> Optimistic dispute frontends and oracle-based rulings share one
> bottleneck: evidence arrives unpinned and un-label-checked, so the oracle
> arbitrates narrative instead of bytes. A deterministic evidence-in changes
> that baseline.
>
> EVP/1 packages evidence with modeled consent and a strict split between
> evidence status and actual status, and `verify-provenance` gives every
> package a byte-pinned exit code (0 = valid direct STAMP, 2 = schema-invalid,
> 3 = authority does not own the provenance, 4 = adapter unavailable —
> internally never a silent pass). It is all offline and hash-pinned.
>
> Reproduce from a fresh clone: `npm ci && npm test && npm run boundary:audit`
> (1033 tests, CI-enforced on Node 18/20/22).
>
> If evidence-in with pinned provenance helps any court or oracle flow, it
> can be inspected or run as-is. No asks.

Never say: "our standard replaces yours", "we are the new Kleros", pricing.
Gate: owner sign-off.

### Letter B4 — Agent-commerce infrastructure (x402 / A2A / marketplaces / escrows)

Target surface: x402 ecosystem, agent-to-agent protocol groups, agent
marketplace/escrow builders. Entry artifacts: integration-surface map +
adapter (DRY-RUN) + `verify-provenance`.

> Agent commerce disputes will settle in escrows and arbitration rails — and
> the only asset those rails can verify is the evidence boundary, not the
> sales pitch behind a transaction. We build that boundary.
>
> Our integration map names each live surface (platform grants, x402
> `adjudication.prepare()`, escrow bindings, webhooks) and states the honest
> status: DRY-RUN, adapter NOT_BUILT — the repo's audit structurally refuses
> any file that claims a performed network call or a stored credential.
> Everything that CAN be proven today is offline and pinned: `npm test` =
> 1033 tests CI-enforced on Node 18/20/22, boundary audit 0 violations on the
> committed tree.
>
> Reproducible: `npm ci && npm test && npm run boundary:audit`.
>
> If the evidence boundary belongs between your agent execution and your
> escrow surface, it can be inspected or run as-is. No asks.

Never say: live calls, stored credentials, "our escrow", revenue, pricing.
Gate: owner sign-off.

### Letter B5 — Core ecosystem

Target surface: CoreDAO developer support; note `inquire@coredao.org` was
already sent (see truth ledger + STATUS), Core Ventures track NOT ACTIVATED.
Entry artifacts: evidence dossier + funding one-pager (EN/AR) + publish pack.

> On Core, we shipped the on-chain anchor of an evidence layer for agentic
> commerce: `EvidenceRegistryV2` (deploy, commitIntent, anchorProof live on
> Mainnet) with the engine offline, deterministic, and fail-closed. The
> verified evidence side is L1-verified on a real Core transfer.
>
> The repository is machine-audited so every claim is reproducible from a
> fresh clone: `npm test` = 1033 tests CI-enforced on Node 18/20/22,
> `npm run boundary:audit` = committed-tree scan, 0 violations — the audit
> refuses any claim of a performed call, a stored credential, or a
> settlement, so the repo literally cannot overstate itself.
>
> If verification infrastructure for agentic commerce on Core is useful to
> your ecosystem work, the dossier and one-pager are ready to read. No asks.

Never say: any promise of chain funding, "Core supports us", reward
expectations. Gate: owner sign-off (and Core Ventures stays off until a
separate owner decision).

### Letter B6 — Accelerators / grants (application-oriented)

Target surface: application-based programs for agent-infrastructure /
dispute-infra / AI-commerce rails. Use publish pack + one-pager + dossier.

> CoreGuard is offline-first verification and evidence infrastructure for
> agentic commerce and disputes: EVP/1 evidence packages, ADAL/1 dispute and
> attestation standard, AEA/1 escrow/arbitration boundary record, a
> conformance adapter and reference tribunal — everything deterministic,
> hash-pinned, and machine-audited (1033 tests CI-enforced on Node 18/20/22;
> the repo's own audit refuses any claim of a live call, a stored
> credential, or a settlement).
>
> Reproducible from a fresh clone with `npm ci && npm test && npm run
> boundary:audit`. The on-chain anchor lives on Core Mainnet (deploy +
> commitIntent + anchorProof, verified).
>
> Honest boundaries for any application: no revenue, no user-base metrics
> beyond two recorded read-only public review rounds, verification layer only,
> pricing locked. If the profile fits the program, the dossier is available.
> No asks.

Never say: revenue, traction, "we are the next X", any acceptance prediction.
Gate: owner sign-off per application.

## 3. Sequencing and cadence

- Sequence: B1 and B2 first (that market is forming fastest), B4 alongside,
  B3 later, B5/B6 horizontal. Phase A stays independent of all of them.
- One outreach per track, then wait. A second touch to the same target is a
  NEW owner decision, never an automatic follow-up.
- Cadence rule: at most one new outgoing letter per track per week, and each
  must be recorded in the ledger before it is sent.
- No deadline energy: silence is recorded, not chased.

## 4. The only success metric that matters (KPI)

**Success = independent external consumption of the evidence package.** Signs
that count (record each in the ledger):
- An independent system or engineer runs the artifact on a fresh clone
  (`npm ci && npm test && npm run boundary:audit`) and reports — a PASS or a
  critique both count (a critique that upgrades the standard is a win).
- A counterparty forks or links the EVP/1 / ADAL/1 artifact or uses it as the
  evidential input of an adjudication flow.
- A conformance/adapter consumer exercises our fixture set.
- A third party verifies one of our hash-pinned results independently.

Signs that mean nothing (record but never call success): likes, follower
growth, "looks cool", meetings without artifacts, invites without a
verifiable surface, replies that name no file or command.

## 5. Versioning policy (binding decision, 2026-09-25)

No new release number for the sake of counting commits or "feeling progress"
(no v0.7.x on commit count alone). A new release happens only when a
measurable external milestone lands. The four acceptable triggers:

1. An external verifier ran the package (fresh-clone reproduction report).
2. The first integration pilot is recorded (L1/L2/L3 step with a
   credential-holding integrator).
3. The first real adapter consumer uses the artifact.
4. The first paid verification/conformance engagement is signed.

Until one of the four is real and recorded, main stays at v0.6.0-era truth
with snapshot-pinned numbers — which is itself the honest pitch.

## 6. Reply taxonomy (how to read any response)

| Reply type | What it is | Response (owner + agent) |
|---|---|---|
| Engineering critique naming a file/command | external review, the winning loop | record; if valid, fit a correction commit then ONE acknowledge line; upgrade the standard |
| "We ran/verified the package" | external consumption milestone | record in ledger; owner decides next step; never auto-expand |
| Interest in integration/escrow | commercial signal | report to owner before ANYTHING else; nothing auto-happens |
| Praise with no artifact ("looks cool") | noise | record; no reply required |
| Silence | the normal default | close by record; build the next track regardless |

## 7. Outreach truth ledger (append-only, maintained as the plan runs)

| # | Track | Target | Sent? | Date | Reply? | Outcome | Owner gate |
|---|---|---|---|---|---|---|---|
| A1 | Phase A | People's Court (thread #21788) | no — owner holds | — | — | — | owner posts manually; then hold |
| B1 | Internet-Court ecosystem | GenLayer / Internet Court contacts | no | — | — | — | sign-off |
| B2 | Agentic-court systems | tribunal / Polycourt / QE-Court | no | — | — | — | sign-off |
| B3 | Legacy ODR rails | Kleros / UMA / Reality.eth | no | — | — | — | sign-off |
| B4 | Agent-commerce | x402 / A2A / marketplaces / escrows | no | — | — | — | sign-off |
| B5a | Core ecosystem | inquire@coredao.org | yes (earlier session) | retained in STATUS | — | — | follow-up = new sign-off |
| B5b | Core ecosystem | Core Ventures (track B NOT ACTIVATED) | no | — | — | — | separate owner decision required |
| B6 | Accelerators / grants | application programs | no | — | — | — | sign-off per application |

Every row is written before anything leaves; identical to how the repo treats
every other claim.