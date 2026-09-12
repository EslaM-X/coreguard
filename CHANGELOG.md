# Changelog

All notable changes to CoreGuard v0.1.

## [Unreleased] — P1 protocol-correctness engineering

### Closed: adversarial corpus expansion (61 → 73 scenarios)

- Denylist (P1): TARGET/RECIPIENT/SELECTOR_DENYLIST denied-vs-allowed pairs —
  the benchmark runner now also feeds `gasUsed` so MAX_GAS is evaluated for
  real (ceiling + at-ceiling).
- Integer Hygiene (P1): value exactly at `uint256` max is representable and
  conformant; overflow and unsafe JS Number coercion are documented INVALID
  (canonical uint boundary is fail-closed).
- Signer Auth (P1): signature-flip and identity-substitution narratives surface
  the SIGNER_AUTHENTICATION contradiction rule.
- Coverage: `benchmarks/generate-corpus.js` 73 scenarios; `npm run benchmark`
  reports **73/73 PASS**. README/CONTRIBUTING/FUNDING/COMMUNITY and spec §11
  refreshed from 61 → 73.

### Closed: single verdict vocabulary (verifier ↔ anchor-verdict ↔ toolchain)

- Offline verifier `SKIP` is renamed **`NOT_RUN`** — the exact spelling of
  `scripts/anchor-verdict.mjs`, so all levels (offline and on-chain) speak one
  vocabulary: `PASS / FAIL / NOT_RUN`. Verdict codes remain the shared set
  `VERIFIED / INVALID / INCONCLUSIVE / UNVERIFIED` (single source of truth).
- `scripts/compute-commitment.mjs` resultCode map now covers the full shared
  vocabulary (`VERIFIED|VALID → 1`, `INVALID → 0`,
  `INCONCLUSIVE|UNVERIFIED|UNVERIFIABLE|INCOMPLETE → 2`) — the proof artifact
  can no longer drift into home-grown enum names.
- Renderers (CLI, live-verify, all three demos) aligned to `NOT_RUN`.

### Closed: L2 deterministic replay consistency

- New `packages/replay/index.js` — a **structural impossibility proof** for a
  committed trace, fully offline and zero-dependency. Re-derives the rule book
  the chain MUST have followed if the recorded frames executed:
  - Well-formed depth-first call tree (frame 0 at depth 0; consecutive depth
    may never jump more than +1 — a child sits directly under its parent).
  - Root identity: root frame and transaction-level from/to/selector must
    agree, because a trace is ONE claim.
  - Gas coherence: frame `gasUsed` may never exceed `tx gasUsed`, which may
    never exceed the committed `gasLimit`.
  - Integer hygiene: every numeric field must be a valid CGEP/1 uint
    (negatives/floats/malformed rejected fail-closed).
- Deterministic plan digest: `H("CGEP/1:REPLAY" || canonicalize(plan))` — the
  same evidence always re-derives the same digest (commit/compare target).
- Verifier adds optional `REPLAY_CONSISTENCY` check: a self-contradictory
  trace → FAIL → `INVALID` at every level (optional is NOT permissive).
  Result now exposes `replay: { digest, frames }`.
- Spec: `spec/CGEP-1.md` §4.4 Replay Plan (`CGEP/1:REPLAY`).
- New suites: `test/p1/replay.test.js`, `test/p1/replay-verifier.test.js`.

### Closed: intent signer authentication (zero-dependency)

- New `packages/crypto/index.js` — intent authentication using **Node built-in
  WebCrypto ECDSA (P-256 / SHA-256)**. No external crypto library, no native
  bindings, no network. Fully deterministic and independently re-verifiable.
- CGEP-native prover identity: `signerAddress = "0x" + sha256(uncompressed
  public key).slice(0, 40 hex)` — chain-agnostic by design. Ethereum-style
  secp256k1/`ecrecover` is documented as an intentionally unsupported future
  adapter seam (Node exposes no secp256k1; a dependency would contradict the
  zero-dependency, independently-auditable verification model). Honest
  signatures fail-closed on material, never silently skip.
- `signIntent` binds the ENTIRE canonical intent — including `signer` and
  `signerPubKey` — under domain `CGEP/1:INTENT_AUTH`; identity substitution or
  any single-field tamper invalidates the signature.
- `verifyIntentSignature` is fully structural: scheme pinning (only
  `ECDSA_P256_SHA256`), 32-byte r/s, low-S mal­leability guard (scalar in
  [1, n-1]), identity derivation check, SPKI import + raw IEEE-P1363 verify.
- Verifier adds optional `SIGNER_AUTHENTICATION` check: whenever an intent
  carries a signature it is re-verified; FAIL → INVALID (contradiction
  dominates) — a forged or self-inconsistent signature is never ignored.
  Unsigned intents remain fully verifiable at L0/L1 (check omitted).
- New suite: `test/p1/crypto.test.js`, `test/p1/signer-auth-verifier.test.js`.

### Closed: canonical integer safety + multi-account state delta

- New `packages/canonical/uint.js` — single canonical CGEP/1 decimal-string
  form for every unsigned integer (`canonicalUintString`). RPC lower/upper hex,
  decimal strings, safe integers and BigInt collapse to ONE representation;
  leading zeros, case and sign ambiguity are destroyed. uint256 bound enforced
  (fail-closed); anything unrepresentable throws.
- `canonicalize()` now **rejects unsafe JS Numbers** (`> 2^53`) — large
  integers must be canonical decimal strings, so a rounded Number can never
  leak into a commitment.
- `normalizeExecution` emits **canonical decimal strings** for value, gasUsed,
  gasPrice, gasLimit, nonce, txType, blockNumber, blockTimestamp, call-frame
  value/gasUsed, and balance/storage before/after values. Adds `nonce`,
  `gasPrice`, `gasLimit`, `txType` to new traces (pre-P1 traces unaffected).
- New `computeCanonicalStateDelta()` — deterministic multi-account delta
  (accounts + storage sorted, signed decimal `delta` fields), committed via new
  `hashStateDelta` domain `CGEP/1:STATEDELTA`.
- `createEvidenceBundle` accepts `stateDeltaScheme: "CGEP/1:STATEDELTA"` so the
  verifier can recompute the delta commitment (additive; existing bundles
  unchanged).
- New suites: `test/canonicalization/uint.test.js`,
  `test/canonicalization/statedelta.test.js` (hex↔decimal no-collision proof,
  uint256 boundary, unsafe-Number rejection, per-account capture).

### Closed: complete intent→execution binding

- `INTENT_EXECUTION_BINDING` now enforces **sender (signer==from), target,
  selector, value, recipient, nonce (anti-replay), validity window
  (validAfter/validUntil vs mined blockTimestamp) and chainId** whenever the
  trace carries the observable — a committed field is never silently skipped
  when evidence exists; absence of pre-P1 trace fields is not a violation.
- New suite: `test/tamper/binding.test.js` (each binding axis, one failure at a
  time, real committed receipts).

### Closed: policy evaluation completeness

- Rule registry now ships **TARGET_DENYLIST, RECIPIENT_DENYLIST,
  SELECTOR_DENYLIST and MAX_GAS** alongside the original allow-list set —
  vocabulary fully matches intent ConstraintType.
- Verifier adds optional `POLICY_EVAL` check: the committed policy is
  **re-evaluated from the trace alone** (no trusted stored evaluation) — a
  VIOLATED policy → FAIL → INVALID, never VERIFIED.
- New suite: `test/anchor/policy-eval.test.js`.

### Closed: level semantics parity (offline verifier ↔ anchor-verdict)

- `evaluateCheckVerdict` now maps unclaimable `L3/L4` → `INCONCLUSIVE
  LEVEL_UNAVAILABLE` (previously `UNVERIFIED`) — inherited from
  `scripts/anchor-verdict.mjs`, the single source of truth. Unknown levels stay
  `UNVERIFIED UNSUPPORTED_LEVEL`. Never `VERIFIED`.
- Offline optional checks: `EVIDENCE_COMMITMENT`, `SIGNER_AUTHENTICATION`,
  `POLICY_EVAL`, `STATE_DELTA_CANONICAL`.

## [Unreleased] — P0 anchor verification semantics

### Closed: verdict semantics (single source of truth)

- New `scripts/anchor-verdict.mjs` — pure, zero-dep evaluator producing
  `VERIFIED / INVALID / INCONCLUSIVE / UNVERIFIED` from a **required-evidence
  profile** per proof level (L0/L1/L2). Shared by both verifier scripts so they
  cannot drift.
- **Missing ANY required evidence → `UNVERIFIED`** — never `VERIFIED`.
- **Any run check that FAILs → `INVALID`** (contradiction dominates).
- `VERIFIED` only when every required check PASSes and nothing FAILs.
- `L3`/`L4` not claimable in v0.1 (`INCONCLUSIVE`, no runtime pathway).
- `verify-anchor.ps1`/`.sh` rewired to record every check state explicitly
  (PASS/FAIL/NOT_RUN) and defer the verdict to the module; they no longer
  hardcode `VERIFIED` (bash previously wrote `VERIFIED` unconditionally).
- `verify-live.json` artifact now includes `level · verdict · verdictCode ·
  required · requiredMissing · failing · states`.
- New suite: `test/anchor/verdict.test.js` (mutation/adversarial semantics).

### Closed: offline receipt verifier required-evidence profile

- `packages/verifier/index.js`: the former `skippedChecks <= 2` leniency is
  **removed**. A receipt can never be `VERIFIED` when required evidence for its
  claimed `verificationLevel` (L0/L1/L2) is missing → `UNVERIFIED`.
- Added `REQUIRED_BY_LEVEL` / `evaluateCheckVerdict()` (same closed semantics as
  the anchor module): any FAIL → `INVALID`; missing required → `UNVERIFIED`;
  unknown level → `UNVERIFIED`; all required PASS and no FAIL → `VERIFIED`.
  `EVIDENCE_COMMITMENT` is optional (advisory) advice at every level.
- Verifier result now exposes `verdict · verdictCode · verificationLevel ·
  required · requiredMissing · failing` alongside the legacy `result`.
- New suite: `test/anchor/verifier-evidence.test.js` (missing-evidence never
  VERIFIED; FAIL dominates; L1-without-trace; unknown level).

## [0.1.0] — 2026-09-10

### Added — v0.1 Evidence Protocol (MVP scope)

- **Canonical encoding** (`packages/canonical`) — deterministic JSON encoding
  (integers as decimal strings, lowercased hex, sorted keys) + domain-separated
  hashing (`CGEP/1:INTENT`, `...POLICY`, `...TRACE`, `...EVIDENCE`, `...RECEIPT`, `...PROOF`).
- **Intent model** (`packages/intent`) — canonical intent + commitment.
- **Policy engine** (`packages/policy`) — six deterministic v0.1 rules
  (VALUE_LIMIT, TARGET_ALLOWLIST, RECIPIENT_ALLOWLIST, SELECTOR_ALLOWLIST,
  DEADLINE, SLIPPAGE_BPS) + documented ORACLE_BOUND guardrail rule.
- **Trace normalizer** (`packages/trace`) — deterministic execution model,
  flattened call trace, events, balance/storage state delta.
- **Evidence + receipt** (`packages/evidence`) — evidence bundle, Evidence
  Bundle root, Execution Receipt with intent/policy/trace/state-delta/evidence
  commitments and state pinning (simulation vs execution block).
- **Independent verifier** (`packages/verifier`) — recomputes all commitments,
  validates intent↔execution binding + state pinning; RPC-free.
- **Chain adapter** (`packages/canonical/chain-adapter.js`) — `ChainAdapter`
  interface + `CoreTestnet2Adapter` (RPC 1114; trace optional).
- **CLI** (`packages/cli`) — `analyze`, `verify`, `report`.
- **Solidity registry** (`contracts/EvidenceRegistry.sol`) — commitments only;
  `commitIntent` / `anchorProof` / `verifyCommitment` / `isCommitted`.
- **Foundry** — `foundry.toml` (Testnet2 + Mainnet), `script/Deploy.s.sol`.
- **Adversarial corpus** — deterministic generator: 61 scenarios across
  intent/target/value/recipient/calldata/deadline/slippage/oracle/multi-step/
  mutation/tamper/performance.
- **Tests** — canonicalization, policy, verifier/tamper suites (30 tests).
- **Demos** — runnable transfer, swap, multistep; live E2E verifier that
  verifies any real Testnet2 transaction.
- **Docs** — `spec/` (CGEP/1, master spec v0.1, canonical encoding, execution
  receipt, verification levels, threat model, privacy model), `docs/`.

### Verified

- `npm test` — 30/30 pass.
- `npm run benchmark` — 61/61 pass.
- Live E2E on real Core Testnet2 tx
  `0x01d6f346786c5cba5140bd0a81263f89b46605c4f1f899cac4a83f9b062e2801` → VERIFIED.
- On-chain anchor flow proven on `anvil` fork of Testnet2
  (`scripts/anchor-local.ps1|.sh`).
- **Mainnet live anchor (chainId 1116)** — registry
  `0x037dF08F2d43c5D03759279Fe35664f6AFf9EA6E`:
  - Deploy `0xe186646b…64e3` blk 38,597,312 · commitIntent `0xe224f58a…84ee1`
    blk 38,597,647 · anchorProof `0xc6229c76…fbdc` blk 38,597,679 — all status 1.
  - receiptId `0xeaa87ec1…44eb6` · commitment `0xc0dbfb45…1052` ·
    proofId `0xecd9e6b3…a6b8` — **VERIFIED ANCHOR INTEGRITY (A+B+C)**.
  - Cross-RPC (rpc.coredao.org + rpc.ankr.com) bytecode + `verifyCommitment`
    (intent & anchor) confirmed true.
  - Offline recompute (from the same canonical receipt) matches.
  - Freeze: `scripts/verify-live.json` (full bundle).

### Anchor integrity semantics (pre-broadcast correction)

- `proofId = H("CGEP/1:ANCHOR", {chainId, receiptId, commitment})` — derived
  from the engine artifact, **never** a placeholder and never assumed
  `proofId == receiptId` (removed `cdcd…`/`abab…` placeholders).
- Three-proofs verifier keys Proof B on the **anchor ID**: `verifyCommitment(
  proofId, commitment) == true`; optional deep `AnchorTx` check matches
  `ProofAnchored[proofId, commitment, result]`, `to == registry`, status 1.
- Result codes aligned with spec: `0=INVALID, 1=VALID, 2=INCONCLUSIVE`
  (`anchorProof(…, result=1)` for a VERIFIED anchor).
- `A+B+C = VERIFIED ANCHOR INTEGRITY` — not "execution truth"; the execution
  claim is carried by the receipt/evidence/replay bound to the commitment.
- `verify-live.json` now records `registry · deployTx · anchorTx · block ·
  proofId · receiptId · commitment · evidenceRoot`.
- CI uses `npm ci` only (lockfile drift fails instead of falling back).

### Not yet

- Testnet2 broadcast as a standalone deployment (Mainnet is the live anchor;
  Testnet2 remains the lighter-weight CI/local playground).
- v0.2 Execution Firewall — designed, not started (scope discipline).
- L3/L4 privacy proofs — research phase.