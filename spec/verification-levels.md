# Verification Levels — CGEP/1 Core

**Version**: 1.0.0-draft  
**Parent**: CGEP/1 Core

---

## 1. Purpose

Defines the verification levels a CoreGuard Execution Receipt can claim. Levels are ordered by the strength of the evidence they rely on. The v0.1 MVP ships **L1 + L2**.

## 2. Levels

| Level | Name | Basis | v0.1 |
|---|---|---|---|
| L0 | Commitment | Intent/policy hash committed on-chain, no execution evidence | ✓ |
| L1 | Chain Receipt | Execution block + transaction receipt committed; on-chain availability (non-RPC) | ✓ |
| L2 | Deterministic Replay | Trace replayed deterministically from archive state; expected vs actual compared | ✓ |
| L3 | Merkle Evidence | Sub-call-level evidence tree with partial disclosure | post-v0.1 |
| L4 | Zero-Knowledge | ZK proof of conformance (no re-execution needed) | post-v0.1 |

## 3. MVP Scope (v0.1)

- **Result:** `L2` when trace + archive state allow deterministic replay; else `L1` when only receipt evidence is committed; else `L0` for commitment-only.
- **Claimable levels in v0.1:** `L0`, `L1`, `L2`. `L3`/`L4` are not claimable (no runtime pathway).
- **Result enum (P0):** `VERIFIED` / `INVALID` / `INCONCLUSIVE` / `UNVERIFIED`.

### Verdict semantics (P0 — closed)

The verdict is produced by `scripts/anchor-verdict.mjs` (single source of truth,
shared by `verify-anchor.ps1` and `verify-anchor.sh`) from a **required-evidence
profile** per level:

| Level | Required evidence (all must PASS) |
|---|---|
| L0 | offline recompute (C) · registry code present (A) · `verifyCommitment(proofId, commitment)==true` (B) |
| L1 | L0 + deploy tx deep (status 0x1, contractAddress) + commit tx deep (`IntentCommitted[receiptId, commitment]`) |
| L2 | L1 + anchor tx deep (`ProofAnchored[proofId, commitment, result]`) |

Rules:
- **Missing ANY required evidence → `UNVERIFIED`** — never `VERIFIED`. Evidence
  that never ran, errored, or was not supplied counts as missing.
- **Any run check that FAILs → `INVALID`** (contradiction) — dominates all else.
- **`VERIFIED` only when** every required check PASSes **and** no run check FAILs.
  Optional evidence (`storage slot`, `cross-RPC`, `bytecode`) that is simply not
  run does not block; a FAILing optional check is still a contradiction.
- **`INCONCLUSIVE`** is reserved for post-v0.1 levels (L3 partial disclosure);
  it has no runtime path in v0.1.
- on-chain result codes align: `0=INVALID, 1=VALID, 2=INCONCLUSIVE` — the
  on-chain `VALID` is one *evidence item* (B), never a substitute for the
  offline verdict.

## 4. Verification Axes

| Check | Level | Meaning |
|---|---|---|
| RECEIPT_COMMITMENT | L0+ | recomputed ID equals stored ID |
| INTENT_HASH | L0+ | committed intent hash matches provided intent |
| POLICY_HASH | L0+ | committed policy hash matches provided policy |
| TRACE_HASH | L1+ | normalized trace commits to its digest |
| EVIDENCE_COMMITMENT | L1+ | evidence bundle rehashes to stored root |
| INTENT_EXECUTION_BINDING | L2 | trace fields conform to intent fields |
| STATE_PINNING | L2 | simulation vs execution block are explicitly distinct |

## 5. Interpretation Contract

- `VERIFIED` means: **execution conformed to committed intent/policy at the verified level**.
- `VERIFIED` does NOT mean "safe". Policy result and risk findings are separate axes.
- Expected-but-state-moved differences are not automatically failures — simulation block and execution block are pinned separately.

---

*End of Verification Levels Specification*