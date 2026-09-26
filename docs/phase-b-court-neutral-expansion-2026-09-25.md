# Phase B — Court-neutral expansion matrix (2026-09-25)

Companion to `docs/master-launch-adoption-plan-v2-2026-09-25.md`. This matrix
turns one verified fact into one actionable outreach item: **we are the
evidence/verification layer any adjudication system can consume.** Entry is
always an artifact (EVP/1 · ADAL/1 · AEA/1 · adapter · reference tribunal ·
conformance), never an ask. Every item below needs a separate owner sign-off
before an actual letter/draft is posted.

Source note: competitor facts below were gathered by web research on
2026-09-?? (this week); re-check each before any letter touches a real
person. Dates and org lists can move.

## A. Canonical entry kit (used by every track)

- Evidence package standard `EVP/1` (tri-state modeled consent,
  evidenceStatus/actualStatus split) — one command: `npm run evidence-package`.
- Dispute & attestation standard `ADAL/1` — `npm run dispute-package`.
- Escrow/arbitration boundary record `AEA/1` — `npm run aea1:prepare`.
- Attestation adapter (`packages/peoples-court-adapter`, integrationStatus
  NOT_BUILT) + synthetic `examples/reference-tribunal`.
- Conformance/determinism: `npm test` (1061, CI-enforced) + `npm run
  boundary:audit` (0 violations, committed-tree scope) + docs-node contract.
- Public anchor: release `https://github.com/EsLaM-X/coreguard/releases/tag/v0.6.0`.

## B. Tracks

### B1 — Internet-Court ecosystem (GENLAYER: the biggest institutional player)
- What it is: GenLayer's AI adjudication protocol (Optimistic Democracy,
  GenVM); the "Internet Court" initiative announced July 2026 with 20+
  organizations (MetaMask, OKX, BNB Chain, Matter Labs); mainnet target Q4
  2026. This is where agent disputes will materially land.
- Our entry: EVP/1 + ADAL/1 + conformance fixtures — the evidence rail a GenVM
  arbiter reasons over.
- Message line: "AI adjudication needs evidence it can verify before it can
  judge; here is an open, offline, hash-pinned evidence/dispute package
  standard — inspect and run it as-is."
- Never say: partnership, sponsorship, "their arbiter uses our format", any
  integration commitment, deployment timeline.
- Owner sign-off: checkbox — legal letter (evidence-layer only) drafted/posting.

### B2 — Agentic-court systems (biggest open-source overlap)
- `kalashshah/tribunal`: verifiable AI court for autonomous agents; escrow
  auto-enforced, iNFT judges (ERC-7857 on 0G Chain), REE reproducible
  inference receipts (Gensyn), AXL P2P, ENSIP-25, MCP server. Overlap in kind
  but not in role: they adjudicate, we attest.
- `Polycourt` (ETHGlobal): multi-LLM judge on Oasis ROFL TEE, weighted voting,
  x402 payments — x402 is already a surface in our integration map.
- `QE-Court` (`proffesor-for-testing/agentic-qe`): hosted adversarial verdict
  service (`/v1/qe/verdict`) — adversarial testing of evidence labels is
  exactly the critique loop our A/B rounds used.
- Our entry: AEA/1 + adapter + reference tribunal; conformance fixtures cross
  MCP/x402 wherever the public surface allows.
- Message line: "Verifiable evidence in, deterministic receipts out — the
  fixtures that drove two read-only review rounds are here to run."
- Never say: running any of their nodes, endorsing their verdicts, joint
  verdict authority.

### B3 — Legacy ODR rails (evidence-in, not replacement)
- Kleros (PNK courts), UMA / Optimistic Oracle, Reality.eth, Aragon Court
  (dormant), Jur. These need evidence with pinned provenance feeding their
  oracle/court flows.
- Our entry: EVP/1 + `verify-provenance` exit-code discipline.
- Message line: "Optimistic and oracle dispute flow benefit from a
  deterministic evidence-in with pinned labels and unknowns preserved."
- Never say: "our standard replaces yours", "we are the new Kleros".

### B4 — Agent-commerce infrastructure (x402 / A2A / marketplaces)
- x402 ecosystem, agent-to-agent protocols, agent marketplaces and escrows are
  the customers of the boundary record, not competitors.
- Our entry: `docs/integration-surface-map` + adapter DRY-RUN (no live calls).
- Message line: "A boundary record between agent evidence and escrow /
  arbitration surfaces — DRY-RUN until an integrator with a credential runs it."

### B5 — Core ecosystem
- Touchpoints: CoreDAO dev-support, Core Ventures (track B NOT ACTIVATED),
  `inquire@coredao.org` outreach (SENT — delivery/open timestamp pending per
  STATUS). The on-chain anchor (EvidenceRegistryV2, Gate 4.1 commitIntent) is
  live Mainnet evidence.
- Our entry: dossier + funding one-pager (EN/AR) + publish pack.
- Message line: "Verification and evidence infrastructure for agentic commerce
  on Core, anchored on-chain, offline-deterministic."

### B6 — Accelerators / grants
- Application-oriented programs for agent-infrastructure / dispute-infra /
  AI-commerce rails. Apply with the publish pack + one-pager + dossier.
- Honest boundary in every application: no revenue, no traction metrics beyond
  the two public review rounds, verification infra only, pricing locked.

## C. Outreach truth ledger (maintained as the plan runs)

| Date | Track | Target | Action (posted?) | Reply | Owner gate |
|---|---|---|---|---|---|
| 2026-09-25 | — | People's Court | Phase A draft ready (owner holds) | — | not yet |

Every row lands here; post or none, it is recorded. The ledger mirrors
STATUS.md's "Outreach truth" section.

## D. Rules that cut across all tracks

1. Artifact-first: a letter that cannot name the exact file/command it refers
   to is not sent.
2. One number allowed: whatever `docs/state-snapshot.json` says today.
3. No deadline energy: nothing is chased; progress is recorded, not pushed.
4. Any counterparty reply that reads as *critique of the artifact* upgrades
   the standard (that is the winning loop); a reply that reads as a
   commitment must be reported to the owner before anything else happens.