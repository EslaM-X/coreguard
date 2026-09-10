# Architecture

CoreGuard v0.1 is a zero-runtime-dependency ES module pipeline plus a single
Solidity contract. Nothing runs until you run it; the verifier never touches a
network.

```
                        ┌─────────────────────────────┐
   CLI (packages/cli)   │  packages/* (pure ESM)      │
        │               │                             │
        │ analyze       │  canonical ──► intent       │
        ▼               │       │        │            │
 ┌──────────────┐       │       ▼        ▼            │
 │ ChainAdapter │──────►│  trace ──► evidence ──► verifier
 │ (RPC 1114)   │       │                 │            │
 └──────────────┘       └─────────────────┼────────────┘
                                          ▼
                                   Execution Receipt
                                          │
                              EvidenceRegistry.sol (Core)
```

## Data model

| Artifact | Produced by | Contains |
|---|---|---|
| **Intent** | `intent` | What the signer authorized (action, target, amount, recipient, constraints) |
| **Policy** | `policy` | Deterministic rules (6 + ORACLE_BOUND guardrail) |
| **Trace** | `trace.normalizeExecution` | Canonical execution: tx, block, flattened calls, events, state delta |
| **Evidence** | `evidence.createEvidenceBundle` | commitments over intent/policy/trace, result, verification level, state pins |
| **Receipt** | `evidence.createReceipt` | `receiptId = H(chainId||tx||blocks||intent/policy/trace/evidence hashes||result)` |
| **VO (Verification Object)** | `verifier` | 6 independent checks + verdict |

## Hashing

Domain-separated, deterministic, RPC-free:

```
CGEP/1:INTENT   CGEP/1:POLICY   CGEP/1:TRACE   CGEP/1:EVIDENCE   CGEP/1:RECEIPT   CGEP/1:PROOF
```

Canonical encoding: integer→decimal string, hex→lowercase quoted, keys sorted,
arrays in order, null explicit. See `spec/canonical-encoding.md`.

## Verifier checks (independent, no trust)

1. `RECEIPT_COMMITMENT` — recompute `receiptId` from payload (excluding the ID field)
2. `INTENT_HASH` — recompute and compare
3. `POLICY_HASH` — recompute and compare
4. `TRACE_HASH` — recompute and compare
5. `INTENT_EXECUTION_BINDING` — target/value/recipient vs declared intent
6. `STATE_PINNING` — simulation vs execution block linkage consistent

Verdict: `VERIFIED` / `INVALID` / `UNVERIFIABLE` / `INCOMPLETE`.

## On-chain (v0.1)

`EvidenceRegistry` stores `bytes32 → bytes32` commitments. Tx-level events only.
Evidence/receipts are retrieved off-chain; the anchor proves *a commitment
existed at a point in time on a specific chain*.

## Chain capture

`CoreTestnet2Adapter` fetches `eth_getTransactionByHash` / receipt / block, and —
when the RPC exposes `debug_traceTransaction` — full call-frame traces. When node
tracing is unavailable (public RPC), state deltas are computed from
`eth_getBalance` at the pre/post block, giving **L1** chain receipt with state
pinning. L2 replay needs trace-capable endpoints or our own simulator.

## Honest failure modes

- Execution conformed but was harmful → policy authoring problem (documented).
- Deep per-call sequence diffs (hidden hop, sandwich, order-swap) → L2 layer
  status: catalogued in corpus, enforced at top-level + binding in v0.1.
- Oracle trust → assumptions documented in `spec/threat-model.md`; ORACLE_BOUND
  is a guardrail rule, not a claim of oracle security.