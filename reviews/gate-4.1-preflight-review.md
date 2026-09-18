# Gate 4.1 — commitIntent Preflight Review Report

Status: **UNSIGNED PREFLIGHT COMPLETE — SIGNING NOT APPROVED**
Date: 2026-09-18 | Repo commit under review: `545e0e1a13215e6cf34a7573b847086fffb0ff0d`

Scope: CoreGuard Identity Anchor v1 — Mainnet step `commitIntent` (Core chain 1116).
This report intentionally contains **no private key and no full authorization signature**.

---

## 1. Artifacts under review

| File | SHA-256 |
|---|---|
| `scripts/mainnet/gate-4.1-identity-preflight.ps1` (final) | computed below at freeze time |
| `evidence/gate-4.0-identity-preflight.json` (rev3) | `0x675dc752322e28013d3d944ac75acc4cfb468f7638cb7c5e2c9391149049e3cf` |

## 2. calldata built by the REAL ABI encoder — verified facts

Source of truth: `cast calldata "commitIntent(bytes32,bytes32,address,uint256,bytes)" <…>`.
The script asserts every byte-level fact below and aborts on any mismatch.

- selector: `0x4fd0505d` (confirmed with `cast sig`, matches contract source `EvidenceRegistryV2.sol:212`)
- `commitIntentDigest` selector: `0x46f2d74b` — ABI `(bytes32,bytes32,uint256,address)` = `(intentId, intentCommitment, validUntil, signer)`, order from contract source (`EvidenceRegistryV2.sol:120–125`)
- head: 5 words = 160 B → `bytes` offset word = **`0xa0`** (not 0xc0, not 0x80)
- dynamic section: length word = **`0x41`** (65), 65 B EIP-712 signature + **31 B padding** = 96 B tail
- total calldata = 292 B (584 hex + `0x`) — verified against encoder output

## 3. Digest — INDEPENDENTLY recomputed off-chain == on-chain result

On-chain `commitIntentDigest` result (live RPC):
`0xef180bc3e001f197875e1fb6202a7cbd170bbf6d69bbd0145060fa2441e35103`
for the exact parameters below.

| Input | Value |
|---|---|
| intentId | `0xc4799b1ddb9ed99463400c8540aefc81d9998b5541cd878267c2144e5a16000d` |
| intentCommitment | `0xb82f1f8073286fdf5a598e69a17246fdea09d10a9958fbc52f9ee8f7f925cee6` |
| validUntil (run window) | `1789693955` |
| signer | `0xEa41BecDeb612d8625bF3060809964F1DAB43244` |
| chainId | `1116` |
| verifyingContract | `0x66268a47e81b8f657798d7b5bbedc956df7b13fd` |
| domainSeparator (computed == live) | `0x64cd419a63dc999341a1ae72ace3c5fa6d14a7c55e231cadd195b19c292ab06a` |
| structHash | `0x22649fc1c71709ced8516f7786be8c8eaace671f42aa54dc4aa3a6c91f19b7ca` |

Off-chain computation: `keccak256("\x19\x01" || domainSeparator || structHash)` → `0xef180bc3…`
→ **MATCH** with the live contract call. This is the ultimate digital evidence the digest binds
exactly these 7 inputs in the exact ABI order (`typehash, intentId, intentCommitment, validUntil,
signer, chainId, verifyingContract`), per `EvidenceRegistryV2.sol:126–142`.

## 4. Runtime facts observed (read-only)

- chainId `1116` (live), registry code length `3128` (matches evidence)
- signer identity: derived from key == `.env` MAINNET_DEPLOYER_ADDRESS == gate-4.0 value
- nonce `8`, balance `917293380000000000` wei (`0.917` CORE; independent `cast balance` cross-check: same value)
- preview calldata (placeholder sig): selector `0x4fd0505d` / offset `0xa0` / length `0x41` / tail 96 B / 292 B — encoder-verified

## 5. Signature / key handling (audited — residual risks registered)

- private key: read from `.env` at runtime only, never printed, never written, never leaves the local machine
- signature: created locally by `cast wallet sign` on the digest; held only in a script-scope variable;
  **never echoed**, **never persisted** (evidence JSON has no signature field), used solely as the `authorization`
  argument inside `eth_call` / `eth_estimateGas` payloads
- broadcast isolation (execution-path level, not string heuristics):
  - the file contains **no** `eth_sendRawTransaction` / `cast send` invocation — primary control is code absence
  - `InvokeCast` (the only native cast runner) **rejects the `cast send` subcommand**
  - `RpcP` enforces a **read-only method allowlist** (`eth_sendRawTransaction` not included)
  - `CG41_PERMIT_BROADCAST` kill-switch kept as accident protection, explicitly not a security boundary
  - broadcast, when authorized, will live **only in a separate script** (`gate-4.1-broadcast.ps1`), never here
- **RESIDUAL RISK R1 (open):** raw private key is passed to `cast` via `--private-key <key>` CLI argument
  (`cast wallet sign` offers no env-var path for a raw key; env vars cover keystore accounts only). The key is
  therefore visible in the local process list during that single moment — same pattern as the adopted,
  previously run gate-3.2 flow. Optional future hardening: keystore-based signing
  (`cast wallet sign --keystore …` + `ETH_PASSWORD` env). Not required for this approval, but not denied either.
- **RESIDUAL RISK R2 (open):** the signed `eth_call`/`eth_estimateGas` payload is transmitted to the public Core
  RPC node during simulation — inherent to simulation; a compromised/dishonest node could lie about the
  simulated outcome. No state change, no broadcast; the separate broadcast gate re-verifies state.
- **RESIDUAL RISK R3 (contextual):** the digest/simulation checks prove only what they verify — see §5a below.
  This gave us an independent copy of the on-chain digest at a given validUntil; it is window-bound.

### 5a. What the digest match proves — and does NOT prove

The independent off-chain recomputation proves the digest **binds these exact 7 inputs** in the exact ABI
order (`typehash, intentId, intentCommitment, validUntil, signer, chainId, verifyingContract`), i.e. the
script feeds `commitIntentDigest` the correct parameters. It does **not** by itself prove that
`commitIntent` will succeed: on-chain conditions — intentId not `AlreadyCommitted`, `block.timestamp <=
validUntil`, and `_authorize` recovering the signer from the 65-byte signature — are verified **only by the
signed `eth_call` simulation** (section 6), against the state at simulation time. State drift (a concurrent
commit of the same intentId, or time passing `validUntil`) between simulation and broadcast is a separate
concern for the broadcast gate.

## 6. Signed simulation — COMPLETED (local `-Sign`, 2026-09-18)

Run-specific facts (window-bound; `validUntil` is recomputed per run):

- `commitIntentDigest` (run window `validUntil=1789694435`): `0x0ad1fdb186113cb80bd464ef324391c1fd1a23c12015416b7c66c22a5e8c5291`
- `eth_call` (real signature, read-only): returned **`0x`** — **no revert**; the deployed contract accepted the
  REAL authorization at current state (ecrecover == recorded signer, intentId free, timestamp in window)
- `eth_estimateGas`: **106328** wei-gas (dry-run, nothing sent)
- evidence pinned after success only: `evidence/gate-4.1-identity-preflight.json`
  (sha256 `0x61d127f258a781561ffd9c9431efc667c5df111029fc23d03e4fed48304dbccf`) — contains the digest,
  calldata metadata, `simulationEthCall=0x`, `gasEstimateWei`, `txHash=null`; **no signature, no key**
- broadcast: **NONE** — no `eth_sendRawTransaction`, no `cast send`, `txHash` remains `null`

Stop-condition audit (per the owner's authorization): no RPC error, eth_call result exactly `0x`,
eth_estimateGas succeeded, evidence written only after simulation success, on-chain state verified
identical to preflight (chainId 1116, codeLen 3128, nonce 8, balance 917293380000000000 wei) and
Gate 4.0 hash unchanged (`0x675dc752…`).

Description of `commitIntent`'s ABI (authoritative):
- `commitIntent(bytes32,bytes32,address,uint256,bytes)` — external, **void return**
- `_authorize` requires `authorization.length == 65`, recovered via `ecrecover(digest, v, r, s)` == recorded
  signer (`EvidenceRegistryV2.sol:174–205`); the 65-byte signature and `0x41` length word are already proven.

## 7. Gates

| Step | Status |
|---|---|
| Gate 4.0 rev3 | COMPLETE (hashes pinned, unchanged) |
| Unsigned preflight | COMPLETE (this report) |
| Local `-Sign` + `eth_call` + `eth_estimateGas` | **COMPLETED** (this report §6) |
| Broadcast (`gate-4.1-broadcast.ps1`, separate script) | FORBIDDEN currently — separate GO required |
| Gate 4.2 anchorProof | not started |
| Commit of new files | undecided |

Any approval of the `-Sign` local step is **not** an authorization to broadcast or to run
`eth_sendRawTransaction`, and is not an authorization for Gate 4.2.