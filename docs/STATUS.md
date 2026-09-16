# CoreGuard STATUS — One Source of Truth

**Authoritative status file.** All repo docs (`README`, `docs/FUNDING.md`) point
here instead of duplicating numbers. Facts only — every metric below is
machine-measured, not estimated. Last verified: **2026-09-16**.

## Repo truth (measured this day)

| Item | Value | How verified |
|---|---|---|
| Test suite | **637 / 637 pass** | `npm test` (node `--test`) |
| Adversarial corpus | **73 / 73 pass** | `npm run corpus && npm run benchmark` |
| Execution Integrity Benchmark | **10,000 runs · False Accept 0 · False Reject 0** | `npm run benchmark:10k` |
| Mutation Laboratory | **1,000/1,000 mutants refused · 0 escaped** | `npm run mutation` |
| `git diff --check` | clean | gate check |
| Rust/WASM/independent parity | PASS | `test/independent-verifier/` |
| C verifier | PASS | `test/verifier-c/` (frozen reference, untouched) |
| Frozen evidence/canonical hashes | UNCHANGED | conformance suite `test/conformance/` |

## On-chain truth (Core Mainnet, chainId 1116)

| Item | Value |
|---|---|
| Anchor contract (V1, immutable) | `0x037dF08F2d43c5D03759279Fe35664f6AFf9EA6E` |
| Mainnet proof tx | `0xe67c61fda81200bf026faee31c23a7b7e7f56ed24f06ffe24f071fa06891a9b8` · block `38712625` |
| Proof verdict | **L1 VERIFIED (RECEIPT_INTEGRITY)** · receiptId `0x4f9d8586…` (frozen record: `scripts/verify-live.json`) |
| Cross-RPC verification | rpc.coredao.org + rpc.ankr.com — A+B+C VERIFIED ANCHOR INTEGRITY |

## Code truth

| Item | Value |
|---|---|
| Releases (local, per-workstream) | `v0.1.0` · `v0.1.1` · `v0.2.0` · `v0.2.1` · `v0.3.0` · `v0.4.0` · `attack-lab-v1.0.0-closed` |
| Verifier version in receipts | `0.1.0` (release boundary locked) |
| Verification levels | L0 · L1 · L2 claimable; L3/L4 exist but **not claimable** (INCONCLUSIVE, `REQUIRED_BY_LEVEL`) |
| EvidenceRegistryV2 | implemented; `forge build` clean (solc 0.8.24) + `forge test` 14/14 (local pass); mirror suite 12/12 |
| Verification-level truth + Trace Availability | implemented (`levelTruth`, `TRACE_AVAILABILITY`, additive receipt fields); suite 9/9 |
| Canonicalization hardening | `securityUint` — no security-critical integer as JS `Number`; hex-spelling preserved |
| Execution Integrity Benchmark | 10,000 generated executions, deterministic (`scripts/benchmark-10k.mjs`) |
| Mutation Laboratory | 1,000 deterministic mutants of one verified execution (`scripts/mutation-lab.mjs`) |
| Phase 1 · `@coreguard/sdk` guard.* surface | `guard.test.js` 14/14 — authorize ALLOW/DENY (six attacks BLOCKED) · verify VERIFIED/INVALID · anchor = `compute-commitment.mjs` parity |
| Phase 1 · Reference Vault ladder | `npm run demo:vault` ALLOW → VERIFIED → anchor PLAN; `npm run demo:attack` **7/7 blocked** (6 PRE + 1 POST) |
| Phase 1 · consumer integration | `create-coreguard-integration` template smoke 3/3 (`test/p1/create-integration.test.js`) |
| Phase 1 · CI exposure | `.github/actions/coreguard-verify` composite action → receipt VERIFIED → `CoreGuard Verification: PASS` (engine job) |

## Outreach truth (Decision-Gate inputs)

| Channel | State |
|---|---|
| Core Outreach #1 → `inquire@coredao.org` | **SENT** (owner-confirmed; delivery/open timestamp UTC PENDING) |
| Core Ventures (B) | NOT ACTIVATED |
| ElizaOS contact #21788 + email | **SENT**, response WAITING |

## Gates (locked, non-negotiable)

- Pricing / CP2 / customer claims — LOCKED.
- V2 deployment, Mainnet EvidenceRegistryV2 upgrade — NO-GO (Phase 1/2 scope).
- Phase transitions — explicit per-phase GO only; first external data that feeds
  the Decision Gate: Core reply + ElizaOS reply, facts-only.
- Frozen artifacts, never touched: `docs/ws-5.md`, `scripts/verify-live.json`,
  `packages/verifier-c/*`, `docs/counterparty-*`, `submission/*` evidence,
  `examples/pilot/proof-artifact-1.json`.

## How to refresh this file

Re-run the gates after any change and update every number above in the same
commit. No number here may be inferred — only measured.