# Master Launch & Adoption Plan — v2 (2026-09-25)

Built from `docs/current-state-audit-2026-09-25.md`, NOT from the old
v0.6.0-era plan. The starting truth is the pinned snapshot
(`docs/state-snapshot.json`): 1155 tests (CI-enforced), boundary audit
794 files / 0 violations on the committed tree, docs-node contract live, main 91
commits ahead of v0.6.0. Positioning (owner-confirmed): CoreGuard is **evidence and
verification infrastructure for agentic dispute systems** — not a court, not a
competitor of any tribunal, and never a "CoreGuard court". Every external act
in this plan requires a separate owner sign-off; nothing auto-sends.

## Executive summary (AR)

بعد تثبيت الحقيقة الحالية (أرقام قابلة لإعادة الإنتاج) نفّذنا الترتيب التالي:
**المرحلة A**: رسالة تقنية واحدة تحمل الأثر الحالي لـ People's Court — ثم انتظار
بلا مطاردة مهما طال الصمت. **المرحلة B**: توسّع محايد المحكمة على ست مسارات
(بيئة Internet Court، الأنظمة القضائية للوكلاء، قضبان ODR التقليدية، بنية
التجارة الآلية x402/A2A وأسواق الوكلاء، نظام Core البيئي، الحاضنات والمنح) —
كل مسار: الدخول بأثر معيّن (ADAL/1 · AEA/1 · EVP/1 · المحوّل · المحكمة
المرجعية)، ورسالة مسموحة، وسطر ممنوع (لا شراكة ولا تأييد ولا تكامل حي ولا سعر).
**المرحلة C** (معلّقة بقرار المالك): تجريبية مع integrator حقيقي يحمل
الـ credential. النجاح لا يقاس بعدد الرسائل بل بالتحقق من الخارج:
نقاش/إصدار/أثر يُفحص ويُقدَّر، واعتماد نموذج الأدلة.

## 1. The gap and our layer (the story, always this)

- **Gap**: autonomous agents conclude economic activity; when it goes wrong,
  there is no verifiable evidence rail a court, a tribunal, or an escrow can
  reason about. The Bespoke identity gap (B) is today's friction.
- **Our layer**: offline, deterministic, hash-pinned evidence packages
  (EVP/1), dispute packages (ADAL/1), a boundary record to escrow-and-arbitration
  (AEA/1), and a conformance adapter — each subject to a machine audit that
  refuses any claim of a performed network call, stored credential, or
  executed settlement.
- **The court-neutral promise**: we do not adjudicate; we give any
  adjudicator (GenLayer's arbiters, a verifiable iNFT judge, an open-source
  tribunal, a legacy ODR oracle, an internal company disputes process) evidence
  they can cryptographically check, critique, and pin. "Never another court"
  is a product line, not a slogan.
- **What we never say**: endorsement, partnership, "their verifier passed
  ours", "court that runs on CoreGuard", revenue, pricing, L3/L4 claimability.

## 2. Truth baseline (gate 0 — DONE this session)

Pinned in CI: suite count machine-enforced; boundary audit and docs-node
counters re-measured per run; canonical surfaces (STATUS, this plan, claimable
facts) cite only the snapshot. Any future number change updates docs in the
same commit or `npm test` goes red. This is the deliverable that makes every
external message reproducible instead of assertional.

## 3. Sequencing (owner-gated per step)

### Phase A — People's Court: exactly one technical follow-up
- Deliverable: the draft in `docs/phase-a-people-court-followup-draft-2026-09-25.md`.
- Rule: post once, then **hold indefinitely**. Re-entry only on their reply.
- This phase is about *the public technical signal*, not about them.

### Phase B — court-neutral expansion (six tracks, this plan §4 + phase-b doc)
For each track the entry artifact already exists; the step is a human-authored
letter/draft built from the playbook, posted by the owner after a per-track
checkmark. Track readiness of assets: publish packs (article/X/LinkedIn),
funding one-pager (EN/AR), evidence dossier — all already drafted, none posted.

### Phase C — integrator pilot (OWNER DECISION REQUIRED, not now)
A real integrator who holds the account credential; the execution stays on
their account; CoreGuard never signs/broadcasts/holds. Until the
integrator decision exists, pilot surfaces stay DRY-RUN. (Phase-3 hedges:
official engagement must not be claimed as endorsement; a demo is not an
integration.)

## 4. Phase B tracks at a glance (full matrix in phase-b doc)

| Track | Targets | Entry artifact | Primary message | Never say |
|---|---|---|---|---|
| B1 Internet-Court ecosystem | GenLayer / Internet Court (initiative July 2026: MetaMask, OKX, BNB Chain, Matter Labs; mainnet Q4 2026) | EVP/1 + ADAL/1 + conformance fixtures | "Evidence rail for AI adjudication — here is the open, checkable package standard" | partnership, sponsorship, integration commitment |
| B2 Agentic-court systems | kalashshah/tribunal (iNFT judges, REE/Gensyn, MCP), Polycourt (TEE + x402 + weighted), QE-Court (`/v1/qe/verdict`) | AEA/1 + adapter + reference tribunal | "Verifiable evidence in; deterministic receipts out — inspect the fixtures" | running any of their nodes, endorsing them |
| B3 Legacy ODR rails | Kleros, UMA/Optimistic Oracle, Reality.eth (Aragon Court / Jur beyond) | EVP/1 + verify-provenance | "Optimistic and oracle dispute flows need evidence-in with pinned labels; ours is deterministic and hash-bound" | "our standard replaces yours" |
| B4 Agent-commerce infrastructure | x402 ecosystem, A2A, agent marketplaces/escrows | integration-surface map + adapter (DRY-RUN) | "Boundary record between agent evidence and escrow/arbitration surfaces" | live calls, stored credentials |
| B5 Core ecosystem | CoreDAO support, Core Ventures (track B NOT ACTIVATED), `inquire@coredao.org` (SENT — status pending) | full dossier + funding one-pager | "Verification infrastructure for agentic commerce on Core" | any promise of chain funding |
| B6 Accelerators / grants | application-focused programs for agent-infra/dispute infrastructure | publish pack + one-pager + dossier | "Offline-first verification rail with on-chain anchor on Core" | revenue projections, "traction" (there is none in that sense) |

Sequence inside B (recommended): B1 and B2 first (the market is forming there
fastest), B4 alongside, B3 later, B5/B6 as horizontal tracks.

## 5. Metrics that count (honest KPI)

- **Signals we can count**: external technical engagement on our open thread
  (a reply, a review pass, an artifact hash check, an issue/PR from outside);
  verification of our fixtures by a third party; N docs/integration contacts;
  variant adoption in another codebase (an MCP bridge, a fork, a conformance
  run). Tracked in one "outreach truth" table (STATUS.md model).
- **Signals that mean nothing**: follower counts, likes, "looks cool",
  meetings without artifacts, invites without a verifiable surface.
- **Definition of success**: at least one independent system consuming an
  EVP/1/ADAL/1 package as the evidential input of its adjudication flow — or a
  documented external critique that upgrades the standard. Either is a win;
  both are honest.

## 6. Governance gates (all binding, unchanged)

1. Every external post/letter/send: separate explicit owner sign-off (P7 §5/§6).
2. Never claim: endorsement, partnership, verifier ran by a counterparty,
   live integration, stored credentials, L3/L4, legal/external review,
   revenue, pricing.
3. Pricing LOCKED. No broadcast/signing on agent initiative (governance).
4. Adapter integrationStatus stays NOT_BUILT until the integrator decision.
5. Numbers cited anywhere must equal `docs/state-snapshot.json`; the suite
   enforces it. One doc‑number‑commit discipline: any count change updates the
   snapshot + doc in the same push, or CI is red by design.

## 7. Risks and honest answers

- **Context collapse / AI noise**: every message is artifact-first
  (package → hashes → reproduction), so a skim can still verify.
- **Legal exposure**: no adjudication claim, no funds, no SLAs; the evidence-
  layer border is the safe jurisdiction.
- **Old-number habits**: 970-era numbers are retired; any stale figure is a
  build failure, not a typo.
- **Failure mode that is not failure**: silence after Phase A. The record is
  closed by documentation, not by noise. We build the next track regardless.
- **What we will never promise**: funding, "trending", acquisitions, wealth.
  Those are external outcomes, outside our control; nearest-honest wording is
  always the allowed lines from the claimable-facts instrument.

## 8. This session's output chain (what "finished" looks like today)

Monday-morning (09-25) truth pinned → Phase A draft ready → Plan v2 written →
Phase B matrix written → snapshot regenerated to the new file set → suite
green with the enforcement live → pushed → CI green on all engine legs.