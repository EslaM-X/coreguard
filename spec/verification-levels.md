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
- **Result enum:** `VERIFIED` / `INVALID` / `UNVERIFIABLE` / `INCOMPLETE`.

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