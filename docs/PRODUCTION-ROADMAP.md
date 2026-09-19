# CoreGuard Production Roadmap — Gates 3–9 + Actor Classification + Competition

**Version**: 0.1.0-draft · **Date**: 2026-09-19 · **Status**: PLANNING DOCUMENT ONLY.

This document is **not** an implementation authorization. Every gate below
requires its own explicit GO (owner decision) before work starts, and every
phase keeps the existing commitment discipline. Nothing here changes frozen
evidence, P0/P1, `scripts/verify-live.json`, or the `b800768` baseline
(Gate 4.1 review reference; GOVERNANCE PENDING, not closed).

---

## 0. Baseline (already done)

| # | Item | Status |
|---|---|---|
| 1 | Freeze at a reviewable state (`b8007686d2c06787c7563a9199f11766b4060ae6`) | DONE — HEAD == origin/main == b800768, tree clean |
| 2 | Reproducible verification fix (verifier v2.1.0) — bare-clone CI runs 86–92, 727/727 ×3, verifier 66/66 | DONE (+ regression tests, reconciliation 54→66, F-4 disclosed) |
| 2b | Gate 3+5+4 execution (2026-09-19) — recovery engine, failure-injection suite, full-history secrets audit; full suite now **749/749** | DONE (see Gates 3/4/5 below) |

Everything below is **NOT STARTED** unless marked otherwise.

---

## 1. Production Gate 3 — Automated recovery redesign (F-4 class)

**Problem being solved:** the Gate 4.1 broadcast crashed post-send and was
reconstructed manually (`evidence/gate-4.1-broadcast.json` is tagged
`reconstructed`, finding F-4 filed). The fix is a **recovery design**, not an
origin rewrite.

| Item | Definition |
|---|---|
| Goal | A replay-safe, idempotent broadcast/record pipeline where a crash after send cannot leave an ambiguous or manually-patched state. |
| Exit criteria | (a) idempotent re-broadcast semantics (txHash lookup by intentId before any new send); (b) machine-derivable `reconstructed` vs `on-chain-confirmed` distinction with no human patch step; (c) failure-injection test proving crash-at-each-step leaves a deterministic, verifiable state (see Gate 5); (d) no manual reconstruction in the recovery path. |
| Design input | Existing evidence contract + `scripts/verify-gate-4.1-onchain.mjs` v2.1.0 schema; F-4 finding record. |
| Red lines | ✗ no re-broadcast that duplicates an existing tx · ✗ no "origin rewrite" of the 2026-09-18 event · ✗ no edit to committed evidence · ✗ no ambiguous success state. |
| Status | **DONE (2026-09-19)** — `packages/recovery/` (replay-safe, idempotent, intentId-keyed txHash lookup before any new send); `test/recovery/` = 10 failure-injection scenarios (crash-at-each-step leaves deterministic state). See Gate 5. |

---

## 2. Production Gate 4 — Security & secrets audit

| Item | Definition |
|---|---|
| Goal | Verify no private key, `.env`, or signing material exists in committed history, and that signing practice meets a documented minimum. |
| Exit criteria | (a) full-history secret scan (all branches, all commits, reflog) with `gitleaks`-class tooling; (b) `.gitignore` and quarantine policy verified effective (`legacy-quarantine/` stays byte-identical and out of scan roots by design); (c) audit trail committed as an evidence artifact; (d) any finding remediated + documented. |
| Status | **DONE (2026-09-19, criteria a/b/d; (c) pending commit)** — `scripts/audit-secrets.mjs`: full-history scan of 928 unique blobs across all refs via a single batched `git cat-file --batch` (no new deps). Result: PASS, 0 embedded secrets. Only benign empty/`$VAR` references in `.env.example`, `examples/pilot/agent-key.mjs`, `docs/DEPLOYMENT.md` (`isEmbeddedInlineLiteral` filter). Audit JSON regenerable with `--out`. |

---

## 3. Production Gate 5 — Failure-injection tests

| Item | Definition |
|---|---|
| Goal | Prove the pipeline's failure semantics by forcing failure at every step. |
| Exit criteria | (a) injection suite covers: RPC down at each call, send-fail-then-recover, crash post-send (F-4 class), timeout mid-phase, duplicate send (idempotency); (b) each scenario yields a deterministic exit code + records (`exit-code discipline 0/1/2/3/4`); (c) no scenario can produce an ambiguous "looks confirmed" state. |
| Status | **DONE (2026-09-19)** — `test/recovery/recovery.test.js`: 10 failure-injection scenarios covering crash-after-send, crash-during-receipt-read, RPC divergence, tx-exists-but-event-unexpected, recovery restart, duplicate-tx refusal. Each asserts deterministic recovery state — never an ambiguous "looks confirmed" outcome. |

---

## 4. Production Gate 6 — Independent evidence validation

| Item | Definition |
|---|---|
| Goal | A human independent party (or a separately-sourced process) validates the evidence from the committed tree — not the working disk. |
| Exit criteria | (a) `git archive`/`git show`-based verification procedure documented; (b) independent validation run recorded + outcome; (c) this is a **human** step — P7 §5/§6 signature requirement stands; agent cannot self-certify. |
| Status | OUT OF AGENT SCOPE until a real party performs it. Both `docs/STATUS.md` and the final review report stay factually honest about this. |

---

## 5. Production Gate 7 — Release Candidate + checksums

| Item | Definition |
|---|---|
| Goal | A single, named, hash-pinned release candidate that a pilot can install and verify. |
| Exit criteria | (a) RC tag + SHA-256 manifest (source tree + build output); (b) `npm ci` from scratch on the RC; (c) full suite 727/727 + verifier 66/66 on exactly the RC commit; (d) no push without explicit owner authorization (git-only release precedent from v0.2.0). |
| Status | **PARTIAL (2026-09-19, criteria d respected)** — `scripts/build-rc-manifest.mjs` + `docs/rc-manifest-2026-09-19.json` (572 tracked files, per-file SHA-256, candidate `rc-2026-09-19-a`, honestly labeled DRAFT + dirty). Remaining: owner GO → commit → tag → `npm ci` on the RC commit → full 749/749 + verifier re-run. No push performed. |

---

## 6. Production Gate 8 — Internal pilot

| Item | Definition |
|---|---|
| Goal | Use the RC on a controlled set of executions (e.g. `examples/pilot/`) and record receipts end-to-end. |
| Exit criteria | (a) pilot scope + acceptance criteria defined in advance; (b) receipts from pilot executions verify offline (independent replay); (c) observed issues → triaged against Gates 3–5; (d) pilot results published in repo. |
| Status | NOT STARTED. |

---

## 7. Production Gate 9 — Market release

| Item | Definition |
|---|---|
| Goal | First public release with production semantics — only after Gates 3–8 pass. |
| Exit criteria | (a) README `Production Ready` claim becomes legitimate (frozen-claims rule: no such claim before this gate); (b) repo-formatted release (git-only, no publish without owner GO); (c) LICENSE, SECURITY.md, eol-policy current. |
| Status | NOT STARTED — **"Production Ready" claim is BLOCKED until this gate passes.** |

---

## 8. Feature — Verifiable actor classification (declared, not detected)

**Requested capability:** classify *who/what performed* a transaction as
**HUMAN / AGENT / BOT / ROBOT / COMPANY** plus **make/model/version**, in a form
anyone can verify.

### 8.1 Positioning (honest, G-1-compliant)

- The classification is **declared** (signer-bound) or **attested** (verified
  third party) — **never behaviorally inferred**.
- ✗ No "AI detector", ✗ no "human-vs-bot detector" framing (red line from
  `spec/agent-provenance-prior-art.md` G-1). The output answers *"what was
  declared for this execution, bound to a key, verifiable"* — not *"what do we
  guess the actor is"*.
- No novelty claim. The gap we hold is a **claim in a category** (see §9
  competitive table), not a "world-first" statement.

### 8.2 Reuse existing design (do not invent parallel machinery)

The schema already exists in `docs/agent-identity/identity-provenance-schema.md`
(Phase A, v1.7.0):

```json
{
  "declared": {
    "executorType": "AI_AGENT",
    "serviceId": "operator-alpha-7",
    "displayName": "Operator Alpha",
    "operator": { "type": "ORGANIZATION", "organizationId": "acme-labs" },
    "identity": {
      "manufacturer": "example-labs",
      "model": "reasoner",
      "modelVersion": "2.1.0"
    }
  }
}
```

Proposed actor-type set stays consistent: `HUMAN · AI_AGENT · BOT · ROBOT ·
ORGANIZATION` (declared or attested per §6/§7a). Per-claim state uses the
existing §6 closed set `VERIFIED ▸ ATTESTED ▸ DECLARED ▸ INFERRED ▸ NOT_PROVEN
▸ UNKNOWN` — never a score, never a derived "likelihood".

### 8.3 Deliverables (each separately gated)

| # | Deliverable | Depends on |
|---|---|---|
| F-1 | On-chain **ActorRegistry** on Core (link executorAddress → profile {type, make/model/version, operator, attestations}) — reuses the deferred **Phase B-2** registry design | B-2 registry spec approval (currently deferred) — **NOT STARTED** |
| F-2 | Per-transaction **actor card**: type + make/model/version + registry reference + evidence hash, emitted post-verification (additive receipt field, never a verdict change) | F-1, verifier schema (additive) — **PARTIAL: declared-level card DONE (2026-09-19)** in `packages/provenance/actor-card.js` (buckets HUMAN/AGENT/BOT/ROBOT/COMPANY/OTHER + maker/model/modelVersion, bilingual labels, honest "declared, never detected" note; 12/12 tests). Registry reference + evidence-hash binding await F-1. |
| F-3 | **DApp badge + Core-identity UI** (Phase E scope): shows the actor card with replay buttons, bilingual AR/EN | F-2, Phase E boundary — **NOT STARTED** |
| F-4 | Verification surface for the card — must re-verify offline (independent replay of the same evidence set) | F-1/F-2 — **NOT STARTED** |
| F-5 | Free tier → priced tiers around card issuance/verification (pricing is LOCKED per standing gates; each tier is a separate approval) | F-4, pricing-gate re-open — **BLOCKED (pricing-gate standing rule)** |

### 8.4 Red lines (feature)

✗ no behavioral/human-vs-ai inference · ✗ no score numbers · ✗ no change to
verdict semantics (`VERIFIED/NOT_PROVEN` meaning stays CGEP/1-defined) ·
✗ no change to frozen P0/P1/evidence · ✗ feature ships only additively and only
after its own GO.

---

## 9. Competitive scan (2026-09-19) — where actor classification stands

Method: websearch of Core ecosystem + adjacent agent-identity standards.
**Sources require re-verification before any public claim** (prior-art gate
standing rule).

| Project | Chain | Actor classification? | Evidence-bound replay? | Notes |
|---|---|---|---|---|
| **CoreID** | Core | Identity (DID profile) only | ❌ | On-Core DID registry; no per-tx actor card |
| **Zeyo-core** (`prithwish122/Zeyo-core`) | Core | Reputation badges (SBT/ERC-1155, ZK) | ❌ | Privacy-preserving reputation, not execution-actor typing |
| **ERC-8004** (ADI Chain impl) | EVM (per-chain) | Agent identity/reputation/validation registries | ◐ | Identity NFTs + registries; validates agents, not per-execution proof |
| **ERC-8126** | EVM | Agent technical verification (Final) | ◐ | Off-chain-first, score-based; requires ERC-8004 agentId |
| **Chitin** | Base | "Birth certificates" for agents | ❌ | Record-of-existence, not actor-type per tx |
| **Agent-DID** | off-chain-first | did:webvh agent identity | ❌ | DID layer; EVM deferred |
| **Blockaid** | EVM | Transaction threat classification (malicious?) | ❌ | Threat, not actor-type; Core clarification = Avalanche wallet, not Core Chain |
| **CoreGuard (this plan)** | **Core** | **Declared actor type + make/model, verified** | **✅ offline independent replay + evidence** | The only plan combining both on Core |

**Honest gap statement:** no examined project on Core combines *declared +
verified actor classification* with *per-transaction evidence that re-verifies
offline* in one product. That is a **claimable category gap on Core**, not a
claim of world novelty.

---

## 10. What happens next (no code yet)

1. **Gate 3 design doc** — superseded by the 2026-09-19 implementation (recovery engine + failure-injection suite landed; see Gates 3/4/5). Remaining paper trail: evidence-artifact commit for the Gate 4 audit JSON.
2. **Actor classification**: F-2 declared-level actor card is DONE; next decisions: F-1 (ActorRegistry = Phase B-2 registry) re-scope + GO, then registry reference binding in the card, Phase E UI (F-3).
3. **Marketing/README**: positioned but NOT authored into the frozen README — the README is commit-anchored in `freeze-record-4.2.6.json` (postCommitRePins), and this roadmap gates marketing/README edits behind a binding decision (standing frozen-claims rule). Marketing copy is drafted in scope (this roadmap §8 + docs/adoption/) awaiting that decision. **Gate 7 RC manifest is the current candidate next step** (owner GO for any push).
4. Human steps the agent cannot perform: Gate 6 independent validation, P7 §5/§6
   signatures, legal/patent counsel (Egypt Law 82/2002 pathway is a registered
   attorney process; agent prepares technical material only).

---

*End of CoreGuard Production Roadmap v0.1.0-draft.*