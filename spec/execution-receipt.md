# Execution Receipt — CoreGuard Artifact Specification

**Version**: 1.0.0-draft  
**Parent**: CGEP/1 Core

---

## 1. Purpose

The Execution Receipt is the central artifact of CoreGuard. It connects intent, execution, and evidence into a single verifiable object.

## 2. Structure

```json
{
  "version": "CGEP/1",
  "receiptId": "0x...",
  "chainId": 1114,
  "txHash": "0x...",
  "blockHash": "0x...",
  "blockNumber": "123456",
  "intentHash": "0x...",
  "policyHash": "0x...",
  "executionTraceHash": "0x...",
  "stateDeltaHash": "0x...",
  "evidenceRoot": "0x...",
  "simulation": {
    "blockNumber": "1200000",
    "blockHash": "0x..."
  },
  "execution": {
    "blockNumber": "123456",
    "blockHash": "0x..."
  },
  "verifierVersion": "0.1.0",
  "verificationLevel": "L2",
  "result": "VALID",
  "timestamp": "1726000000",
  "checks": [
    {
      "check": "INTENT_MATCH",
      "result": "PASS"
    },
    {
      "check": "POLICY_SATISFIED",
      "result": "PASS"
    },
    {
      "check": "EXECUTION_VALID",
      "result": "PASS"
    },
    {
      "check": "STATE_DELTA_VALID",
      "result": "PASS"
    }
  ]
}
```

## 3. Fields

| Field | Type | Description |
|---|---|---|
| version | string | Protocol version |
| receiptId | bytes32 | `H("CGEP/1:RECEIPT" \|\| intentHash \|\| txHash \|\| timestamp)` |
| chainId | uint256 | Core chain ID (1116 or 1114) |
| txHash | bytes32 | On-chain transaction hash |
| blockHash | bytes32 | Block containing the transaction |
| blockNumber | uint256 | Block number |
| intentHash | bytes32 | Hash of committed intent |
| policyHash | bytes32 | Hash of applied policy |
| executionTraceHash | bytes32 | Hash of normalized execution trace |
| stateDeltaHash | bytes32 | Hash of state delta |
| evidenceRoot | bytes32 | Root of evidence bundle |
| simulation | object | Block at which simulation was run |
| execution | object | Block at which execution occurred |
| verifierVersion | string | CoreGuard engine version |
| verificationLevel | string | L0-L4 |
| result | string | VALID / INVALID / UNVERIFIABLE / INCOMPLETE |
| timestamp | uint256 | Receipt generation timestamp |
| checks | array | Individual verification results |

## 4. Receipt ID Computation

```
receiptId = H(
  "CGEP/1:RECEIPT" ||
  chainId ||
  intentHash ||
  policyHash ||
  txHash ||
  executionTraceHash ||
  stateDeltaHash ||
  timestamp
)
```

## 5. State Pinning

The receipt explicitly separates simulation state from execution state:

```
simulation.blockNumber  — block at which intent was simulated
simulation.blockHash    — hash of that block
execution.blockNumber   — block at which transaction was mined
execution.blockHash     — hash of that block
```

This prevents false negatives when state changes between simulation and execution.

## 6. Verification Levels

| Level | What Is Verified |
|---|---|
| L0 | Receipt commitment matches stored hash |
| L1 | tx + receipt + logs + block exist on-chain |
| L2 | Deterministic replay at pinned state produces matching trace |
| L3 | Merkle proof for selective disclosure |
| L4 | ZK proof of execution correctness |

## 7. Anchoring

```
EvidenceRegistry.anchorProof(receiptId, commitment, result)
```

On-chain stores only:
- receiptId (indexed)
- commitment (bytes32)
- result (uint8: 0=INVALID, 1=VALID, 2=INCONCLUSIVE)

Full receipt is off-chain.

---

*End of Execution Receipt Specification*
