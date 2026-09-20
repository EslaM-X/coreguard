# CoreGuard STATUS — One Source of Truth

**Authoritative status file.** All repo docs (`README`, `docs/FUNDING.md`) point
here instead of duplicating numbers. Facts only — every metric below is
machine-measured, not estimated. Last verified: **2026-09-20**.

## Repo truth (measured this day)

| Item | Value | How verified |
|---|---|---|
| Test suite | **841 / 841 pass** | `npm test` (node `--test`) — includes 12 actor-card, 10 recovery, 9 pricing |
| Foundry contracts | **34 / 34 pass** | `forge test --match-path "test/contract/*"` (V2: 14 + EvidenceRegistryV3: 20) |
| Adversarial corpus | **73 / 73 pass** | `npm run corpus && npm run benchmark` |
| Execution Integrity Benchmark | **10,000 runs · False Accept 0 · False Reject 0** | `npm run benchmark:10k` |
| Mutation Laboratory | **1,000/1,000 mutants refused · 0 escaped** | `npm run mutation` |
| AgentProof `verify-provenance` surface | **exit-code discipline 0/1/2/3/4** · badge honesty tests | `test/provenance/cli-verify-provenance.test.js` (part of the 749) |
| Actor Classification Card | **12/12 tests** — HUMAN/AGENT/BOT/ROBOT/COMPANY buckets + maker/model/version | `test/provenance/actor-card.test.js` |
| Recovery engine (F-4 root fix) | **10/10 failure-injection scenarios** — no manual reconstruction, no ambiguous success | `test/recovery/recovery.test.js` |
| Secrets audit (full git history) | **PASS — 942 blobs, 0 embedded secrets** | `scripts/audit-secrets.mjs` |
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
| **EvidenceRegistryV2 (Phase 3)** | `0x66268a47e81b8f657798d7b5bbedc956df7b13fd` (Mainnet, immutable) |
| V2 deploy tx | `0x75aabacc94abc10a04c553c04788d797315fee2c2debb35db3d6d9f37f597793` · block `38764383` |
| V2 commitIntent tx | `0x0cd2a8c0de1b030552da16052650ae3c1d74821c2dfa3a4b40afa18d7367715c` · block `38764405` |
| V2 anchorProof tx | `0x5b9e7d6806200d1f3603ebd0f759d224e3096951dfb6ecbf3539b8b6d3e478d2` · block `38764446` |
| V2 verdict | **VERIFIED ANCHOR INTEGRITY (READBACK + INDEPENDENT RECOMPUTE)** |
| **Gate 4.1 identity anchor (commitIntent)** | `0x68d9fbf1b384fe416d2222347d15e492e78d7b14f05cae0c9edbd57ce373c567` · block `38827925` · `0x1` · intentId `0xc4799b1d…60000d` · **COMMITTED** — **ON-CHAIN SUCCESS, GOVERNANCE PENDING** (P7 §5/§6 human signature required; not closed). Independent round: `scripts/verify-gate-4.1-onchain.mjs` **66/66 PASS** from raw dumps `evidence/raw/` (coredao + ankr) → `evidence/gate-4.1-independent-verify.json`. `evidence/gate-4.1-broadcast.json` is **reconstructed** (gate crashed post-send; tagged + superseded); discovery-finding F-4 filed |

## Code truth

| Item | Value |
|---|---|
| Releases (local, per-workstream) | `v0.1.0` · `v0.1.1` · `v0.2.0` · `v0.2.1` · `v0.3.0` · `v0.4.0` · `v0.5.0` · `v0.5.1` · `attack-lab-v1.0.0-closed` · `rc-2026-09-19-a` |
| v0.5.0 | **EvidenceRegistryV2 live on Core Mainnet (Phase 3)** — deploy + commitIntent + anchorProof + readback + independent verify, frozen in `evidence/` |
| v0.5.1 | **Repository encoding hygiene** — prior-art mojibake recovered, stray BOMs removed, permanent guard added; `npm test` **654/654**; frozen `scripts/verify-live.json` untouched |
| v0.5.2 | **AgentProof CLI surface (CGEP/1:VERIFY-PROVENANCE §10)** — `verify-provenance` subcommand + honest badge rendering + deterministic fixtures (`examples/provenance/`); `npm test` **721/721** (was 713 at `d7ca118`, +8 from `cli-verify-provenance.test.js`); freeze 46/46 still anchored |
| v0.5.3 | **Gate 4.1 identity anchor live on Core Mainnet** — `intentId 0xc4799b1d…60000d` committed in `commitIntent` (block `38827925`, status `0x1`); **ON-CHAIN SUCCESS verified 66/66** from raw dumps (`evidence/raw/` + `scripts/verify-gate-4.1-onchain.mjs`); **GOVERNANCE PENDING** (P7 §5/§6 human signature required — project NOT closed); `evidence/gate-4.1-broadcast.json` explicitly tagged **reconstructed** (gate crashed post-send; never re-sent); finding F-4 filed |
| **v0.5.4 (2026-09-19, this session)** | **Gate 3+4+5 + actor classification + Gate 7 RC manifest** — `@coreguard/recovery` (crash-safe broadcast pipeline, F-4 root fix; write-ahead journal, no ambiguous success) with **10/10** failure-injection tests; `scripts/audit-secrets.mjs` full-history secrets audit (**942 blobs, 0 embedded secrets**); `packages/provenance/actor-card.js` declared-level actor card (HUMAN/AGENT/BOT/ROBOT/COMPANY + maker/model/version, bilingual AR/EN, honest "declared, never detected") with **12/12** tests; `scripts/build-rc-manifest.mjs` + `docs/rc-manifest-2026-09-19.json` (**RC candidate `rc-2026-09-19-a`**, 581 files SHA-256, tag created); `npm test` **749/749**; freeze 47/47 still anchored (no pinned file touched); CI green ×3 |
| **RC 2026-09-19-a RELEASE** | **GitHub Release created** (`rc-2026-09-19-a`, prerelease, release URL on `EslaM-X/coreguard`) — RC candidate tagged + releases + notes; **NOT Production-ready claim**; Gate 6 external review NOT PERFORMED; legal NOT PERFORMED; pricing LOCKED. Gate 4.1 commitIntent **LIVE re-confirmed at release time** (`tx 0x68d9fb…` status `0x1`) via 2 independent RPC providers (coredao + ankr) + `scripts/verify-gate-4.1-onchain.mjs` **66/66** → `evidence/gate-4.1-live-reconfirmation-2026-09-19.json`; no duplicate broadcast issued |
| **PRODUCTION 2026-09-19 (owner-declared)** | **Owner decisions recorded** (`docs/OWNER-DECISIONS-2026-09-19.md`): (1) **Gate 6 CLOSED by owner decision** via strongest machine-provable independence — 3 independent re-derivations (B Rust/WASM **64/64** · C **66/66** · on-chain live **66/66**) + **clean-clone determinism 749/749 ×2**; external human review NOT performed NOR claimed. (2) **Production READY — OWNER-DECLARED** (non-prerelease GitHub release) with honest boundaries: no legal/external claims, no pricing published. (3) **Two evidence-stability fixes + proofs**: `.gitattributes -text` for frozen dashboard (CRLF drift on fresh Windows clones — was 71841 vs pinned 70787; now LF), **manifest rebuilt from pristine `core.autocrlf=false` clone → 582/582 == git blobs** at `f31eaae` (commits `a151a59`, `0788cfb`); final HEAD `0788cfb`; `npm test` **749/749** re-proven on fresh clone; CI green; 0/0 sync |
| Verifier version in receipts | `0.1.0` (release boundary locked) |
| Verification levels | L0 · L1 · L2 claimable; L3/L4 exist but **not claimable** (INCONCLUSIVE, `REQUIRED_BY_LEVEL`) |
| EvidenceRegistryV2 | implemented; `forge build` clean (solc 0.8.24) + `forge test` 14/14 (local pass); mirror suite 12/12 |
| EvidenceRegistryV3 | implemented (`contracts/EvidenceRegistryV3.sol`) — flat `feeWei` commission + treasury; `forge test` 20/20 (part of 34/34); **not deployed** (owner-only decision) |
| Verification-level truth + Trace Availability | implemented (`levelTruth`, `TRACE_AVAILABILITY`, additive receipt fields); suite 9/9 |
| Canonicalization hardening | `securityUint` — no security-critical integer as JS `Number`; hex-spelling preserved |
| Execution Integrity Benchmark | 10,000 generated executions, deterministic (`scripts/benchmark-10k.mjs`) |
| Mutation Laboratory | 1,000 deterministic mutants of one verified execution (`scripts/mutation-lab.mjs`) |
| Phase 1 · `@coreguard/sdk` guard.* surface | `guard.test.js` 14/14 — authorize ALLOW/DENY (six attacks BLOCKED) · verify VERIFIED/INVALID · anchor = `compute-commitment.mjs` parity |
| Phase 1 · Reference Vault ladder | `npm run demo:vault` ALLOW → VERIFIED → anchor PLAN; `npm run demo:attack` **7/7 blocked** (6 PRE + 1 POST) |
| Phase 1 · consumer integration | `create-coreguard-integration` template smoke 3/3 (`test/p1/create-integration.test.js`) |
| Phase 1 · CI exposure | `.github/actions/coreguard-verify` composite action → receipt VERIFIED → `CoreGuard Verification: PASS` (engine job) |
| **v0.5.5 (2026-09-20, this session)** | **Product-expansion pack** — (1) **Actor Identity Card** in `packages/provenance/actor-identity-card.js` (HUMAN/AGENT/BOT/ROBOT/COMPANY + maker/model/version + trust DECLARED→ATTESTED→VERIFIED; human never VERIFIED) wired into `verify-provenance` CLI + `12/12` tests; (2) **`EvidenceRegistryV3.sol`** — flat explicit `feeWei` commission paid atomically with `anchorProof`, `CommissionMismatch` on any mismatch, operator-only `withdrawTreasury`, `feeWei=0` = pure V2 path, domain-separated — `forge test` **34/34** (V2 14 + V3 20); (3) **hypothesis pricing** `packages/pricing/pricing.js` + `docs/pricing.md` (gate-locked, `gated:true`, never bills) with `9/9` tests; (4) **DApp surface** `docs/coreguard-dapp-core.html` (Core gold + CoreGuard green identity); (5) `submission/14-pitch-deck.md` + `submission/15-egypt-patent-file.md`; `npm test` **841/841**; pricing stays LOCKED — no committed pricing |

## Outreach truth (Decision-Gate inputs)

| Channel | State |
|---|---|
| Core Outreach #1 → `inquire@coredao.org` | **SENT** (owner-confirmed; delivery/open timestamp UTC PENDING) |
| Core Ventures (B) | NOT ACTIVATED |
| ElizaOS contact #21788 + email | **SENT**, response WAITING |

## Gates (locked, non-negotiable)

- Pricing / CP2 / customer claims — LOCKED.
- V2 deployment, Mainnet EvidenceRegistryV2 upgrade — **EXECUTED (Phase 3, this session)**; deploy + intent + proof recorded on-chain.
- Phase transitions — explicit per-phase GO only; first external data that feeds
  the Decision Gate: Core reply + ElizaOS reply, facts-only.
- Frozen artifacts, never touched: `docs/ws-5.md`, `scripts/verify-live.json`,
  `packages/verifier-c/*`, `docs/counterparty-*`, `submission/*` evidence,
  `examples/pilot/proof-artifact-1.json`.

## How to refresh this file

Re-run the gates after any change and update every number above in the same
commit. No number here may be inferred — only measured.
## Phase 3 — Core Mainnet (chainId 1116) EXECUTED — ALL GATES COMPLETE

- **3.0 Preflight (zero-gas)**: runtime on-chain == local recompute (PASS).
- **3.1 Deploy**: `EvidenceRegistryV2` → `0x66268a47e81b8f657798d7b5bbedc956df7b13fd` · tx `0x75aabacc…97f597793` · block `38764383`.
- **3.2 commitIntent**: tx `0x0cd2a8c0…7367715c` · block `38764405` · intentId `0xe58574f4…eda9ac17`.
- **3.3 anchorProof**: tx `0x5b9e7d68…3e478d2` · block `38764446` · proofId `0x82f56aae…650452` · result 0 (VALID).
- **3.4 Read-back (zero-gas)**: on-chain intentCommits + proofAnchors match evidence exactly.
- **3.5 Independent verify (zero-gas)**: deployedBytecode recomputed from source == on-chain except the single 32-byte immutable, which equals on-chain `VERSION()` (`0x530b4f34…`).
- **3.6 Freeze (zero-gas)**: `evidence/phase-3-evidence-freeze.json` (SHA-256 per gate artifact).
- All broadcasts `--legacy` (Core is public EVM, no type-2 txs). Key: `.env` only, never printed or committed.
