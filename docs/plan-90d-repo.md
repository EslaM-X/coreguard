# CoreGuard 30/60/90 — Trust-Gap Closure (Repo-Level)

**Status:** PLANNING DOC ONLY (owner-approved 2026-09-15). No implementation
unescorted. Engineering stays LOCKED until the Decision Gate (Counterparty #1
result) or an explicit per-phase GO. This doc is the blueprint reviewers asked
for: file-by-file, what to change, add, remove.

**Purpose:** close the distance between "can prove a tx conformed to intent" and
"production security infrastructure" — the gap named in the external review:
`production proof + customers + independent security validation` are the missing
pieces, not ideas, not stars.

**Target positioning after 90 days:** *the execution-integrity layer for Core
BTCFi* — declare what may happen → verify what happened → prove conformance →
anchor privacy-preserving evidence on Core. We own the **category** ("Bitcoin
DeFi Execution Integrity"), not just the name.

---

## 0. Verified diagnostics (2026-09-15, file-verified)

- `contracts/EvidenceRegistry.sol:27,36` — `commitIntent`/`anchorProof` accept
  any EOA for an unused ID: **no signer/authorization binding**. Real, confirmed.
- `README.md:131` — stale test count ("125 tests") vs. measured **588**.
  Truth-hygiene fix (pending the minor-edit gate).
- External facts in the review (Decision Passport, other CoreGuard projects,
  QRYPTA, whether Core programs are open) — **unverified, NOT to be published
  as repo fact**.
- Frozen boundaries, never open: `docs/ws-5.md`, `scripts/verify-live.json`,
  `packages/verifier-c/*`, `docs/counterparty-*`, `submission/*` beyond the plan.

## 1. Days 1–30 — Truth + engine hardening (Phase 0)

### 1.1 Registry v2 (contract security model)
- Ship **`EvidenceRegistryV2`** as a new, **immutable/versioned** contract; V1
  stays frozen/anchored. No upgradeable proxy.
- New surface (from `spec/signed-intent-authorization.md`):
  `commitIntent(intentId, commitment, signer, validUntil, authorization)` and
  `anchorProof(proofId, commitment, result, verifierVersion, chainId, …)` where
  `authorization` = EIP-712 signature or EIP-1271 `isValidSignature` of `signer`,
  and the anchored record binds `intentId + intentCommitment + receiptId +
  proofCommitment + verifierVersion + chainId` (kills ambiguity).
- Tests: reject wrong signer · expiry passed · replay via nonce · ID reuse ·
  version mismatch. Local-fork style (`test/anchor/*` grows a `v2/` case).
- Contract review feeds the "audit" milestone (see Phase 2). No consumer change:
  `verifyCommitment`/`isCommitted` V1 API preserved.

### 1.2 Canonicalization policy
- Enforce: **no security-critical integer as JS `Number`** — `amount · gas ·
  timestamp · block · nonce · chainId` are `string|bigint` in public API with one
  canonical serializer (`packages/canonical`). Audit current intent/trace for
  hidden `Number` paths; keep domain separation; extend `test/adversarial`.
- Add mutation regressions for number-typed inputs → must canonicalize or fail.

### 1.3 Verifier-semantics ladder (already partly in `spec/verification-levels.md`)
- Receipt MUST self-declare `VerificationLevel: L0|L1|L2` + machine reason, e.g.
  `L1 — no canonical execution trace` — impossible to misread L1 as L2.
- Add **Trace Availability Proof**: per-RPC availability, trace depth, frame
  count, coverage (or the honest `L1` reason) — auditor-grade `packages/evidence`.
- Keep fail-closed + WS-1 signer recovery (`packages/verifier`); they are the
  strongest parts per review.

### 1.4 One Source of Truth
- New authoritative `docs/STATUS.md`: contract address, chain, anchor tx, tests
  (588), corpus (73/73), tags, release verifier versions. `README` and
  `docs/FUNDING.md` reference it instead of duplicating numbers.
- Fix `README.md:131` stale count as the single-line hygiene edit (pending gate).

### 1.5 Evidence engine
- Careful consolidation of `packages/evidence` + `packages/execution`:
  define exact evidence profiles per level so "execution proof" is never
  advertised for L1-only data. Review's phrase: Anchor ≠ execution proof, and
  the product must *be built on that distinction*.

### 1.6 Benchmark + mutation gates (`test/adversarial`)
- **Execution Integrity Benchmark:** ~10,000 generated executions (2k valid,
  2k amount, 2k target, 1k selector, 1k recipient, 1k trace, 1k replay/state).
  Output: `False Accept` (target 0) · `False Reject` · `Unverifiable` — public +
  reproducible in CI.
- **Mutation Laboratory:** every release: original execution + 1,000 mutations
  → verifier must reject all unauthorized ones; any PR breaking this = CI FAIL.

## 2. Days 31–60 — Execution Firewall + protocol SDK (Phase 1)

### 2.1 Execution Firewall (the killer feature)
- Implement from existing design `spec/agent-provenance-firewall.md` +
  `packages/firewall`: simulation-gated smart accounts (EIP-1271 capable).
  Flow: Intent → Policy → Simulation → signature → Smart Account → **ALLOW /
  REPLACE** → execution. Prevents, not just proves.
- Attack proofs (all must be BLOCKED): target substitution · recipient
  substitution · amount inflation · unexpected callback · expired intent ·
  calldata mutation.
- Demos become the `Attack Laboratory`: a 2–3min video per attack.

### 2.2 Protocol SDK
- `packages/sdk` stable public surface (zero-dep ESM stays):
  `guard.authorize(intent)`, `guard.verify({chain, txHash, intent, policy})` →
  receipt (`VERIFIED|INVALID|INCONCLUSIVE`, plus existing `NOT_PROVEN|NOT_RUN`),
  `guard.anchor(receipt)`.
- `npx create-coreguard-integration <name>` template → `intent/ policy/ verifier/
  examples/ tests/` so integration is minutes, not days.

### 2.3 Reference Vault + demo ladder
- **CoreGuard Vault** (a reference dApp, NOT a dashboard): user declares
  `Deposit ≤ 1 BTC · Target = Vault A · Recipient = mine · Slippage ≤ 50bps`,
  then attack playground re-runs the six BLOCKED cases live.
- Repo top page = try-it ladder: `npm install` → `npx coreguard demo attack` →
  real output → `Verify independently` → CoreScan tx.

### 2.4 CI / exposure
- GitHub Action `coreguard/action@v1`: verify receipts in CI →
  `CoreGuard Verification: PASS` — every integration becomes exposure.

## 3. Days 61–90 — Independent verification + pilots + privacy (Phase 2)

### 3.1 Three-Verifiers Rule
- Independent implementations verify identical receipts/hashes: **TS PASS ·
  Rust PASS · (WASM or third-party Python) PASS**. Extend
  `packages/independent-verifier` (Rust/WASM). **`packages/verifier-c` stays a
  frozen reference — do not touch** (per project rule); third-party Python
  implementation is a candidate third verifier.

### 3.2 Privacy (after fundamentals, NOT ZK-first)
- **Selective disclosure + Merkle commitments**: full evidence user-controlled
  (encrypted/local), only commitments on Core; user reveals only e.g.
  `Policy X passed` while hiding amount/wallet/counterparty. Implement, don't
  leave as a doc (`spec/privacy-model.md` → feature).
- ZK prototype only after product-market fit signal — never before.

### 3.3 Mandate Proof (institutional product)
- BTC portfolio mandate: treasury policy (protocol allowlist, max size, max
  slippage, no unknown recipients, deadline) → **Mandate Compliance Receipt**
  (auditor gets proof, not a screenshot), zero disclosure.

### 3.4 Three design partners
- **Partner 1** BTCFi lending · **Partner 2** BTC vault · **Partner 3**
  smart-account/wallet. Free integration for a public technical case study.
  Each produces: tx + receipt + proof + benchmark + case study →
  grounds for "CoreGuard verified X real Core executions across 3 production
  integrations" (real numbers only).

### 3.5 Audit milestone
- Independent review before any large funding ask: smart-contract audit,
  cryptographic review, canonicalization review, verifier review — by an
  independent crypto/security reviewer, published.

## 4. Positioning & Core engagement (post-gap)

- Pitch line: *"We are the execution-integrity layer for Core's Bitcoin
  economy. As BTCFi moves toward higher-value retail, institutional and
  automated execution, CoreGuard lets applications declare what may happen,
  verify what happened, prove conformance to the mandate, and anchor
  privacy-preserving evidence on Core — open, deterministic, independently
  verifiable, Core-native."*
- **Do not** claim "nobody does this"; say "we are building the Core-native
  execution-integrity layer for BTCFi." Competitors → integration layers
  (Tenderly sim → CoreGuard attestation; Blockaid pre-sign → CoreGuard
  conformance; QRYPTA authorization → CoreGuard execution; Fireblocks/BitGo
  policy → CoreGuard as the independent evidence layer underneath).
- Category matrix (`spec/competitive-kill-matrix.md`) stays but reworded to
  feature-truth columns (Pre/Post/Proof), never "crush".
- Historical Core programs (Connect/Builders/Commit/Starter/Accelerator) are
  history unless re-opened; do not assume an open program. Ask list = technical
  grant, DevRel sponsorship, ecosystem intros, gas support, audit support,
  accelerator consideration, advisor, listing, co-marketing, design-partner
  intros — not "give us money".
- Funding milestones follow `submission/10` (MS-0..MS-3); milestone figures in
  the review are **proposal structure, not Core-stated amounts** — keep labeled
  as such.

## 5. Not-to-do checklist (guards, non-negotiable)

- No token. No NFT. No AI/LLM inside the verifier (AI = UX entirely outside the
  trust boundary). No dashboard theater. No social features. No random chains.
  No fake integrations/metrics. No bought stars. No "we crush competitors". No
  unverified external facts into the repo.
- Never touch frozen artifacts: `docs/ws-5.md`, `scripts/verify-live.json`,
  `packages/verifier-c/*`, `docs/counterparty-*`, frozen submission evidence.

## 6. One Source of Truth (authoritative, 2026-09-15)

| Item | Value |
|---|---|
| Anchor contract | `0x037dF08F2d43c5D03759279Fe35664f6AFf9EA6E` (Mainnet, 1116, VERIFIED ANCHOR INTEGRITY) |
| Proof tx | `0xe67c61fda81…1a9b8` · block `38712625` · L1 VERIFIED (RECEIPT_INTEGRITY) · receiptId `0x4f9d8586…` |
| Tests / corpus | 588 pass (measured) / 73 adversarial |
| Releases | v0.1.0 · v0.1.1 · v0.2.0 · v0.2.1 · v0.3.0 · v0.4.0 (+ attack-lab tag) |
| Demo | `npm run demo:90s` (offline) · `npm run demo:90s:live` (Mainnet re-derive) |
| Outreach | Core Outreach #1 → `inquire@coredao.org` SENT (owner-confirmed, UTC PENDING) · ElizaOS #1 → WAITING |
| Gates | Pricing / CP2 / customer claims LOCKED · first contact reply → facts-only → Decision Gate |

## 7. Execution gates

- This doc changes nothing in code. Each phase (0/1/2) starts only on explicit
  GO, and softens only after the Decision Gate or owner direction.
- First external data that feeds priority: Core reply (SENT #1) and ElizaOS
  reply (WAITING). Their readings update `docs/STATUS.md` truthfully (facts-only).