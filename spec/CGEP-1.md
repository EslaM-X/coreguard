# CGEP/1 — CoreGuard Evidence Protocol (Draft)

**Version**: 1.0.0-draft  
**Status**: Experimental Open Specification  
**Scope**: Core blockchain only (Mainnet 1116 / Testnet2 1114)

---

## 1. Scope

CGEP/1 Core defines the minimal protocol for:

1. Expressing execution intents
2. Defining security policies
3. Capturing execution traces
4. Generating verifiable evidence
5. Producing Execution Receipts
6. Independent verification

Extensions (CGEP/1-RISK, CGEP/1-ZK, CGEP/1-DISCLOSURE) are future work.

## 2. Domain Separation

All hashes use domain-separated prefixes:

```
"CGEP/1:INTENT"     — intent hashing
"CGEP/1:POLICY"     — policy hashing
"CGEP/1:TRACE"      — execution trace hashing
"CGEP/1:EVIDENCE"   — evidence commitment
"CGEP/1:RECEIPT"    — execution receipt
"CGEP/1:PROOF"      — on-chain proof
```

## 3. Canonical Encoding

See `canonical-encoding.md` for the full specification.

Key rules:
- All integers encoded as decimal strings
- All addresses lowercase hex with 0x prefix
- All bytes lowercase hex with 0x prefix
- Fields sorted alphabetically
- No trailing commas
- Null explicitly encoded
- Version field required in all structures

## 4. Data Structures

### 4.1 Intent

```json
{
  "version": "CGEP/1",
  "chainId": 1114,
  "signer": "0x...",
  "nonce": "0",
  "validAfter": 0,
  "validUntil": 1726086400,
  "action": "TRANSFER",
  "target": "0x...",
  "selector": "0xa9059cbb",
  "asset": "0x...",
  "amount": "100000000",
  "recipient": "0x...",
  "constraints": [
    {
      "type": "MAX_VALUE",
      "value": "100000000"
    },
    {
      "type": "RECIPIENT_ALLOWLIST",
      "addresses": ["0x..."]
    }
  ]
}
```

**Action Types**: TRANSFER, SWAP, DEPOSIT, WITHDRAW, BORROW, REPAY, STAKE, UNSTAKE, CUSTOM

**Constraint Types**: MAX_VALUE, MIN_VALUE, TARGET_ALLOWLIST, TARGET_DENYLIST, RECIPIENT_ALLOWLIST, RECIPIENT_DENYLIST, SELECTOR_ALLOWLIST, SELECTOR_DENYLIST, DEADLINE, SLIPPAGE_BPS, MAX_GAS, STATE_CHECK, ORACLE_BOUND, CUSTOM

### 4.2 Policy

```json
{
  "version": "CGEP/1",
  "policyId": "0x...",
  "name": "Transfer Policy",
  "rules": [
    {
      "ruleId": "VALUE_001",
      "type": "VALUE_LIMIT",
      "params": { "max": "100000000" },
      "severity": "CRITICAL"
    },
    {
      "ruleId": "TARGET_001",
      "type": "TARGET_ALLOWLIST",
      "params": { "targets": ["0x..."] },
      "severity": "CRITICAL"
    }
  ]
}
```

**Rule Types** (6 deterministic for v0.1):
1. VALUE_LIMIT — max/min value
2. TARGET_ALLOWLIST — approved contracts
3. RECIPIENT_ALLOWLIST — approved recipients
4. SELECTOR_ALLOWLIST — approved function selectors
5. DEADLINE — time window
6. SLIPPAGE_BPS — max slippage

### 4.3 Execution Trace

```json
{
  "version": "CGEP/1",
  "txHash": "0x...",
  "from": "0x...",
  "to": "0x...",
  "value": "1500000000000000000",
  "calldata": "0x...",
  "status": "SUCCESS",
  "gasUsed": "245000",
  "blockNumber": "123456",
  "blockHash": "0x...",
  "calls": [
    {
      "depth": 0,
      "from": "0x...",
      "to": "0x...",
      "value": "0",
      "calldata": "0x...",
      "returnData": "0x...",
      "status": "SUCCESS"
    }
  ],
  "events": [
    {
      "address": "0x...",
      "topics": ["0x..."],
      "data": "0x..."
    }
  ],
  "balanceChanges": [
    {
      "address": "0x...",
      "before": "1000000000000000000",
      "after": "2000000000000000000"
    }
  ],
  "storageChanges": [
    {
      "address": "0x...",
      "slot": "0x...",
      "before": "0x...",
      "after": "0x..."
    }
  ]
}
```

### 4.4 Evidence Bundle

```json
{
  "version": "CGEP/1",
  "evidenceId": "0x...",
  "intentHash": "0x...",
  "policyHash": "0x...",
  "traceHash": "0x...",
  "stateDeltaHash": "0x...",
  "result": "VALID",
  "verifications": [
    {
      "check": "INTENT_MATCH",
      "result": "PASS",
      "detail": "Execution matches committed intent"
    },
    {
      "check": "POLICY_SATISFIED",
      "result": "PASS",
      "detail": "All policy rules passed"
    },
    {
      "check": "EXECUTION_VALID",
      "result": "PASS",
      "detail": "Execution trace matches expected"
    },
    {
      "check": "STATE_DELTA_VALID",
      "result": "PASS",
      "detail": "State transitions match expected"
    }
  ],
  "simulation": {
    "blockNumber": "1200000",
    "blockHash": "0x..."
  },
  "execution": {
    "blockNumber": "123456",
    "blockHash": "0x..."
  }
}
```

### 4.5 Execution Receipt

The central artifact. See `execution-receipt.md`.

## 5. Verification

### Verification Result

```
VERIFIED     — all checks passed
INVALID      — evidence shows deviation from intent/policy
UNVERIFIABLE — required data unavailable for verification
INCOMPLETE   — trace exists but missing component
```

### Independent Verifier

The verifier can run without RPC. It:

1. Receives receipt + evidence
2. Recomputes all hashes
3. Validates commitments
4. Checks intent/execution binding
5. Re-evaluates policy
6. Returns VALID / INVALID / UNVERIFIABLE / INCOMPLETE

## 6. On-Chain

```
EvidenceRegistry
├── commitIntent(intentId, commitment)
├── anchorProof(proofId, commitment, result)
└── verifyCommitment(id, commitment) → bool
```

Only commitments are stored on-chain. Full evidence stays off-chain.

---

*End of CGEP/1 Core Draft*
