# Changelog

All notable changes to CoreGuard v0.1.

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

- Testnet2 broadcast (awaiting deployer funding via faucet).
- v0.2 Execution Firewall — designed, not started (scope discipline).
- L3/L4 privacy proofs — research phase.