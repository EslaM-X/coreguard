# 03 — Architecture

## Topology: Core records truth, CoreGuard verifies conformance

```
 DECLARED (before execution)          OBSERVED (after execution)
 ─────────────────────────────        ─────────────────────────────
 INTENT  ──┐                                 ┌── on-chain tx
 POLICY  ──┼── canonical hash ──┐            ├── receipt
 EXPECTED ─┘                    │            ├── block (state pinned)
                                 │            └── trace / state delta
                                 ▼                       │
                        COMMITMENT (anchor)             │
                                 │                       │
                                 └──► COMPARISON ◄───────┘
                                        │
                                        ▼
                              EVIDENCE BUNDLE
                                        │
                                        ▼
                               EXECUTION RECEIPT
                                        │
          ┌─────────────────────────────┴──────────────┐
          ▼                                           ▼
   INDEPENDENT VERIFIER                    EVIDENCE ANCHOR
   (no RPC, no trust)                      on Core (commitments only)
```

## Components (all in this repo, all additive, zero ESM runtime deps)

| Package | Role |
|---|---|
| `packages/canonical` | Canonical encoding + hashing (domain-separated, deterministic) |
| `packages/intent` | CGEP/1 intent model + EIP-712 authorization binding (WS-1) |
| `packages/policy` | Deterministic rule engine — VALUE_LIMIT · TARGET_ALLOWLIST · RECIPIENT_ALLOWLIST · SELECTOR_ALLOWLIST · DEADLINE · SLIPPAGE_BPS (+ ORACLE_BOUND) |
| `packages/execution` | Core-native adapter: extracts + binds chain facts (WS-4), fail-closed |
| `packages/evidence` | Typed evidence bundle, canonicalized `Execution Attestation` |
| `packages/verifier` | Receipt verification engine (`verify-run` surface, CGEP/1:VERIFY-RUN) |
| `packages/independent-verifier` (Rust/WASM) | Byte-for-byte independent re-derivation (Verifier B) |
| `packages/verifier-c` (Python, stdlib-only) | Third independent re-derivation (Verifier C) |
| `packages/firewall` | PRE-execution ALLOW/DENY decision owner (EIP-1271 capable) |
| `contracts/` | `EvidenceRegistry.sol` — commitment-only registry on Core |

## Verification levels

| Level | Meaning |
|---|---|
| L0 · Commitment | Intent + policy committed (hashed) before execution |
| L1 · Chain Receipt | Execution captured from chain, receipt pinned to block hash |
| L2 · Deterministic Replay | Execution replayed / compared against committed intent (MVP) |
| L3 · Merkle proof | Compact, privacy-friendly proof of a receipt sub-tree |
| L4 · Zero-knowledge | Fully private execution proofs (research phase) |

## Design invariants (non-negotiable, quoted from spec)

1. **Core = witness / anchor. CoreGuard = verifier.** Core is never claimed as the
   verifier of *conformance to intent*.
2. **No trace ≠ fake trace.** `TRACE_UNAVAILABLE` is reported — never synthesized.
3. **AUTHORIZATION ≠ EXECUTION CONFORMANCE.** POST-execution evidence never flows into
   a PRE-execution decision.
4. **Fail closed.** Anything missing ⇒ `NOT_RUN` / `UNVERIFIED` / `NOT_PROVEN`,
   never an inference, never `VERIFIED`.
5. **Never trust a caller-supplied claim** — every binding is recomputed from chain reads.
6. **Additive only.** No edits to frozen evidence (`scripts/verify-live.json`) or released trees.

Full source of truth: `spec/COREGUARD-MASTER-SPEC-v0.1.md`, `spec/signed-intent-authorization.md`,
`spec/core-native-execution.md`, `docs/ARCHITECTURE.md`.