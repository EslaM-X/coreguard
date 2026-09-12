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

- **Result:** `L2` when trace + archive state allow deterministic replay; `L1` when receipt hashes (intent + policy) bind to provided documents; `L0` for commitment-only (no documents required).
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

The axes below describe what each check *means*; the requirement profile (when a
check is **required** vs **optional**) is defined separately in the verifier:
`packages/verifier/index.js` → `REQUIRED_BY_LEVEL` (offline receipt verifier),
mirroring the anchor profile in section 3. The former `skippedChecks <= 2`
leniency is **removed** — a receipt can never be `VERIFIED` when required
evidence for its claimed level is missing.

| Check | Required at | Meaning |
|---|---|---|
| RECEIPT_COMMITMENT | L0+ | recomputed ID equals stored ID |
| INTENT_HASH | L1+ | committed intent hash matches provided intent |
| POLICY_HASH | L1+ | committed policy hash matches provided policy |
| TRACE_HASH | L2 | normalized trace commits to its digest |
| EVIDENCE_COMMITMENT | (optional) | evidence bundle rehashes to stored root when supplied |
| INTENT_EXECUTION_BINDING | L2 | trace fields conform to intent fields |
| STATE_PINNING | L0+ | simulation vs execution block are explicitly distinct |

Offline verifier `REQUIRED_BY_LEVEL` (single source of truth in code):

| Level | Required evidence (all must PASS) |
|---|---|
| L0 | RECEIPT_COMMITMENT · STATE_PINNING |
| L1 | L0 + INTENT_HASH · POLICY_HASH |
| L2 | L1 + TRACE_HASH · INTENT_EXECUTION_BINDING |

Missing any required item → `UNVERIFIED`; any FAIL (required or optional) →
`INVALID`; all required PASS and no FAIL → `VERIFIED`; unknown level →
`UNVERIFIED`.

## 5. Interpretation Contract

- `VERIFIED` means: **execution conformed to committed intent/policy at the verified level**.
- `VERIFIED` does NOT mean "safe". Policy result and risk findings are separate axes.
- Expected-but-state-moved differences are not automatically failures — simulation block and execution block are pinned separately.

---

*End of Verification Levels Specification*