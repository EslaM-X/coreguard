# Verification Levels — CGEP/1 Core

**Version**: 1.1.0-p0
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

## 6. Boundary Contract (P0 closure — 2026-09-15)

The boundaries below are enforced in code, not just documented. Each is a line
the product never crosses when making claims.

| Boundary | Rule |
|---|---|
| **Anchor ≠ execution proof** | The registry proves a *commitment* was anchored on Core. The execution claim comes from the offline evidence/replay bound to that commitment — never from on-chain presence alone. |
| **L1 ≠ trace proof** | An L1 verification-level claim means committed hashes + state pinning + intent/policy binding. It is **not** a trace/replay proof. Receipts self-declare `levelReason` saying exactly that. |
| **L2 requires the trace** | `TRACE_HASH` is a required check at L2. A trace-less L2 claim is `UNVERIFIED` — never `VERIFIED`. Missing evidence is never silently skipped. |
| **Honest `TRACE_UNAVAILABLE`** | When no canonical trace exists (or its provenance is unknown), the positive `TRACE_AVAILABLE` block must NOT be declared. Callers emit `{ status: "TRACE_UNAVAILABLE", reason }` paired with a `levelReason`, e.g. `L1 — no canonical execution trace`. |
| **`TRACE_AVAILABLE` must be well-formed** | Declaring `TRACE_AVAILABLE` requires a provider + frames>0. A malformed positive claim FAILs closed (contradiction), never upgrades anything. |
| **Optional never upgrades** | `OPTIONAL_CHECKS_V` items (EVIDENCE_COMMITMENT, SIGNER_AUTHENTICATION, POLICY_EVAL, STATE_DELTA_CANONICAL, REPLAY_CONSISTENCY, TRACE_AVAILABILITY) can only *fail* a receipt — they can never upgrade a level or turn an UNVERIFIED into VERIFIED. |
| **Unclaimable levels** | L3/L4 exist in the protocol but have no v0.1 runtime pathway; claiming one yields `INCONCLUSIVE` (`LEVEL_UNAVAILABLE`). |
| **Canonicalization boundary** | No security-critical integer (amount, gas, timestamp, block, nonce, chainId) may be a JS `Number` in the public API. `securityUint` rejects JS `Number` outright; hex spelling is preserved at the declaration layer (a declaration binds the exact spelling). |
| **Registry V2 identity** | EvidenceRegistryV2 is immutable/versioned, keys are identity-based singletons (`intentId`/`proofId` reuse → `AlreadyCommitted`), and digests bind chainId + verifyingContract + verifierVersion + result. V1 stays frozen. |

The requirement profile (`REQUIRED_BY_LEVEL`) and the verdict rules in section 4
are the single source of truth in code (`packages/verifier/index.js`), mirrored
by `scripts/anchor-verdict.mjs` for the on-chain anchor path.

---

*End of Verification Levels Specification*