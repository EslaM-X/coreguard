# CoreGuard STATUS — One Source of Truth

**Authoritative status file.** All repo docs (`README`, `docs/FUNDING.md`) point
here instead of duplicating numbers. Facts only — every metric below is
machine-measured, not estimated. Last verified: **2026-09-23**.

## Repo truth (measured this day)

| Item | Value | How verified |
|---|---|---|
| Test suite | **919 / 919 pass** | `npm test` (node `--test`) — includes 12 actor-card, 10 recovery, 9 pricing, 11 ci-guards (incl. class-H missing-lockfile), 7 pages-settle guard |
| Foundry contracts | **34 / 34 pass** | `forge test --match-path "test/contract/*"` (V2: 14 + EvidenceRegistryV3: 20) |
| Adversarial corpus | **73 / 73 pass** | `npm run corpus && npm run benchmark` |
| Execution Integrity Benchmark | **10,000 runs · False Accept 0 · False Reject 0** | `npm run benchmark:10k` |
| Mutation Laboratory | **1,000/1,000 mutants refused · 0 escaped** | `npm run mutation` |
| AgentProof `verify-provenance` surface | **exit-code discipline 0/1/2/3/4** · badge honesty tests | `test/provenance/cli-verify-provenance.test.js` (part of the suite) |
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
| **v0.5.5 (2026-09-20, this session)** | **Product-expansion pack** — (1) **Actor Identity Card** in `packages/provenance/actor-identity-card.js` (HUMAN/AGENT/BOT/ROBOT/COMPANY + maker/model/version + trust DECLARED→ATTESTED→VERIFIED; human never VERIFIED) wired into `verify-provenance` CLI + `12/12` tests; (2) **`EvidenceRegistryV3.sol`** — flat explicit `feeWei` commission paid atomically with `anchorProof`, `CommissionMismatch` on any mismatch, operator-only `withdrawTreasury`, `feeWei=0` = pure V2 path, domain-separated — `forge test` **34/34** (V2 14 + V3 20); (3) **hypothesis pricing** `packages/pricing/pricing.js` + `docs/pricing.md` (gate-locked, `gated:true`, never bills) with `9/9` tests; (4) **DApp surface** `docs/coreguard-dapp-core.html` (Core gold + CoreGuard green identity); (5) `submission/14-pitch-deck.md` + `submission/15-egypt-patent-file.md`; `npm test` **852/852** (incl. 11 CI-guard tests); pricing stays LOCKED — no committed pricing |
| **v0.5.6 + (2026-09-20, this session)** | **2026 competitive-intelligence wave (all dated/sourced, G-1 addendum)** — `docs/competitive-intelligence-overtake-2026-09-20.md` (matrix + overtake roadmap); prior-art gate updated with the post-2026-09-13 wave: **x401** (Proof, 2026-06-25, authorization-at-request — closest conceptual neighbor; mandatory in any filing), **World ID + AgentKit** (2026-03), **Self Protocol** (2026-04, zk human↔agent on ERC-8004), **Arkose** (behavioral — CoreGuard's opposite philosophy), **IETF web-bot-auth**; `submission/15` disclosure list extended; `submission/14` gains a dated "Market moment" section; new honest CORE-value map `docs/adoption/coreguard-core-value.md` (usage/scarcity/partnerships vs Core's 2026 buyback+agents direction). No novelty claim added — G-1 boundary update only |
| **v0.5.7 (2026-09-20, this session)** | **Full CI red-run closure** — every red run root-caused from logs into 14 classes / 24 runs (`docs/ci-postmortem-2026-09-20.md`): bootstrap-era (no-lockfile at `41ed0b4` = setup-node opaque failure; node18 `--test` glob; WebCrypto absent), zero-jobs YAML trap (6×: 09-11 batch + `6c4ca1d`), lockfile drift (A: 3×), stack-too-deep, mojibake (5×), python-pin Dec-C-9, EIP-1271 verdict, anchored-record + re-pin honesty. **Permanent new guard (closes class H):** lock-sync guard now runs BEFORE `actions/setup-node` in Engine/Demos/DDE, and `check-lock-sync.mjs` names a missing lockfile (`no package-lock.json in repo root`) instead of raw ENOENT + regression test → `npm test` **852/852**; CI+DDE+Pages green at `649114e` |
| **v0.5.8 (2026-09-23, this session)** | **Pages-build race closed + Windows-native delivery tests + facts record** — Pages race root-caused to an EXTERNAL median pusher (`coreguard-trend-bot`, commits land 15–21 s after each content push, proven from committer-date interleaving; identity configured in no local checkout) and closed with 3 layers: `scripts/pages-settle.mjs` settle guard (exit 0/1/2) wired into DDE's trend step (`GH_TOKEN`, defer instead of race) + committed `.githooks/pre-push` (install `git config core.hooksPath .githooks`; gates every `main` push; `PAGES_SETTLE_SKIP=1` emergency bypass; **5/5** contract tests incl. abort-while-building); `test/delivery/convert-zip.test.js` rewritten pure-JS (no system `unzip` — the 2 Windows failures are gone; CI parity) with in-process ZIP verification (EOCD + CD count + local-header walk + CRC-32 recheck); Pages root 404 fixed via `docs/index.html` (Arabic-first, EN mirrored); public-thread replies recorded `docs/elizaos-thread-replies-record-2026-09-23.md` (facts-only; frozen `docs/counterparty-*` untouched); `npm test` **919/919**; forge **34/34**; corpus+benchmark **73/73**; mutation **1000/1000 refused, 0 escaped**; 10k **FA 0 · FR 0**; pricing remains LOCKED |
| **v0.5.10 (2026-09-23, this session)** | **Mapping result received (comment `#18568567`); fixture corrected** — People's Court / Epistemic Labs replied: the read-only pass **supports the narrow mapping** (agreement/criteria versioned; authorization and execution separate; delivery, rejection and both positions without an engine verdict), with one clarification: the REAL anchored transfer (0.001 CORE coupon) must not be readable as settlement of the modeled compensation (0.25 CORE). Correction shipped: `execution-attestation.json` now records `executionCoupon` (REAL settled transfer) + `compensationSettlement.status = NOT_SETTLED` (`settledByExecutionCoupon: false`); the old top-level `paymentSettled: true` is removed (honesty contract in `test/delivery/fixture.test.js` updated); provenance + fixture README aligned; `hashes.json` regenerated. Repro unchanged: hashes 10/10 byte-exact · `EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE` · adversarial 13/13 · compound 5/5 · fuzz 50 seed 424242 → 0 · B1 PAYMENT_INFERENCE_FORBIDDEN PASS. Not a real bilateral case nor a People's Court endorsement (their words). Owner reply with the new stable anchor + thread record updated |

## Outreach truth (Decision-Gate inputs)

| Channel | State |
|---|---|
| Core Outreach #1 → `inquire@coredao.org` | **SENT** (owner-confirmed; delivery/open timestamp UTC PENDING) |
| Core Ventures (B) | NOT ACTIVATED |
| ElizaOS contact #21788 + email | **SENT** (email unacknowledged; no reply claimed) |
| #21788 public replies (People's Court / Epistemic Labs) | **RECEIVED** 2026-09-16 & 2026-09-19, official (disclosed) account — facts-only record: `docs/elizaos-thread-replies-record-2026-09-23.md` |
| #21788 fixture mapping (result + correction, owner's words) | **RESULT RECEIVED** 2026-09-23 (`#discussioncomment-18568567`): schema mapping supported; one clarification — anchored transfer (0.001 CORE) is an execution coupon, NOT settlement of the modeled compensation. **CORRECTION SHIPPED** same day (fixture `paymentSettled` removed → `compensationSettlement.status = NOT_SETTLED`; new stable anchor). No funding/partnership asks sent |

## Gates (locked, non-negotiable)

- Pricing / CP2 / customer claims — LOCKED.
- V2 deployment, Mainnet EvidenceRegistryV2 upgrade — **EXECUTED (Phase 3, this session)**; deploy + intent + proof recorded on-chain.
- Phase transitions — explicit per-phase GO only; first external data that feeds
  the Decision Gate: Core reply + ElizaOS reply, facts-only. The ElizaOS
  public-thread input is **recorded** (People's Court / Epistemic Labs reply,
  2026-09-16/19, official account — `docs/elizaos-thread-replies-record-2026-09-23.md`);
  CoreGuard's §4 fixture submission was **POSTED** on #21788 (2026-09-23,
  owner's words, comment `DC_kwDOMT5cIs4BGzrh`); the counterparty **ACCEPTED**
  the synthetic fixture for the public-thread mapping test and the owner
  delivered the stable anchor (comment `DC_kwDOMT5cIs4BG1R4`, `commit ea59a88`).
  **2026-09-23 mapping result received** (`#discussioncomment-18568567`): schema
  mapping supported; one clarification (the anchored execution coupon must not
  read as compensation settlement) — corrected and re-anchored same day so the
  fixture claims nothing beyond the truth. No pilot/partnership/funding request
  may be made before any follow-up result and the owner's explicit approval
  path. Core email unacknowledged. Pricing stays
  LOCKED until the owner's decision.
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
