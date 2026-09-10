# CoreGuard — 6 Killer Features Technical Specification

**Version**: 1.0.0-draft  
**Status**: Draft — Pre-implementation  
**Parent**: COREGUARD-MASTER-SPEC-v0.1.md

---

## Overview

CoreGuard is not a dashboard. It is not a risk score. It is an **Execution Truth Layer** with 6 interconnected killer features, each with a real technical implementation, measurable on-chain value, and organic adoption path.

```
USER INTENT
     │
     ▼
  POLICY
     │
     ▼
EXPECTED EXECUTION
     │
     ▼
 ACTUAL EXECUTION
     │
┌────┴────┐
▼         ▼
STATE   RISK
DELTA   ANALYSIS
│         │
└────┬────┘
     ▼
  EVIDENCE
     │
     ▼
CRYPTOGRAPHIC PROOF
     │
┌────┴────┐
▼         ▼
VERIFY   ANCHOR
│         │
▼         ▼
VALID/   CORE
INVALID  CHAIN
     │
     ▼
COREGUARD VERIFIED
     │
     ▼
ECOSYSTEM ADOPTION
```

---

## Killer #1: Proof Before & After Execution

### What It Does

The user/protocol doesn't just say "execute this transaction." CoreGuard converts the intent into an **Intent Commitment** — a cryptographic hash of what the user authorized — before execution happens. After execution, CoreGuard proves whether the actual execution matched the committed intent.

### Technical Design

```
Phase 1: INTENT COMMITMENT (pre-execution)

User signs intent:
{
  action: "DEPOSIT",
  target: "0xColendVault",
  function: "deposit(uint256)",
  value: "1000000000000000000",  // 1 BTC
  max_fee: "5000000000000000",   // 0.005 BTC max fee
  deadline: 1726086400,
  allowed_protocols: ["0xColendVault"],
  nonce: "0x..."
}

CoreGuard computes:
intentHash = SHA256(intent || signer || chain_id || timestamp)
intentCommitment = Pedersen(intentHash, blinding_factor)

On-chain: EvidenceRegistry.commitIntent(intentId, intentCommitment)
Off-chain: User stores intent + blinding_factor locally
```

```
Phase 2: EXPECTED EXECUTION (simulation)

CoreGuard simulates against archive node:
expectedExecution = {
  from: "0xUser",
  to: "0xColendVault",
  value: "1000000000000000000",
  calldata: "0x...",
  expected_state: {
    user_shares: "+950000000000000000",
    vault_balance: "+1000000000000000000"
  }
}

expectedHash = SHA256(expectedExecution)
```

```
Phase 3: ACTUAL EXECUTION (post-execution)

Transaction confirmed on Core block N:
actualExecution = tracer.capture(txHash)

actualHash = SHA256(actualExecution)
```

```
Phase 4: COMPARISON + EVIDENCE

comparison = {
  intentMatch: (intentHash == recompute(actualExecution)),
  expectedMatch: (expectedHash == actualHash),
  stateDeltaMatch: (expectedState == actualState),
  valueMatch: (intent.value == actual.value),
  targetMatch: (intent.target == actual.to),
  calldataMatch: (intent.calldata_hash == SHA256(actual.calldata)),
  feeMatch: (actual.gas_used * actual.gas_price <= intent.max_fee),
  deadlineMet: (actual.block_timestamp <= intent.deadline)
}

result = ALL(comparison) ? VALID : INVALID

evidence = {
  intentCommitment,
  intentHash,
  expectedHash,
  actualHash,
  comparison,
  result,
  timestamp: block.timestamp,
  blockNumber: block.number
}

proof = SHA256(evidence)
```

### On-Chain Value

| Metric | Value |
|---|---|
| Intent commitment gas cost | ~50,000 gas (~0.005 CORE) |
| Proof verification gas cost | ~30,000 gas (~0.003 CORE) |
| Evidence storage (on-chain) | 32 bytes (commitment only) |
| Evidence storage (off-chain) | ~2KB per evidence item |

### Adoption Driver

- **For users**: "I can prove what I authorized vs what actually happened"
- **For protocols**: "We can show users their transactions were executed correctly"
- **For institutions**: "We have cryptographic proof of execution compliance"

---

## Killer #2: Prove What You Actually Authorized

### What It Does

A user authorizes: "Allow this protocol to use 1 BTC for strategy X for 24 hours." But the actual execution tries: 1 BTC → Protocol X → hidden callback → Protocol Y → unexpected recipient. CoreGuard detects the divergence and produces INVALID EXECUTION with proof.

### Technical Design

```
MULTI-STEP INTENT TRACKING

Intent:
{
  max_value: "1000000000000000000",  // 1 BTC
  allowed_protocols: ["0xProtocolX"],
  strategy: "yield_farming",
  duration: 86400,  // 24 hours
  constraints: [
    { type: "NO_CALLBACKS", targets: ["0xProtocolY"] },
    { type: "RECIPIENT_WHITELIST", addresses: ["0xUserVault"] },
    { type: "MAX_SLIPPAGE", bps: 100 }
  ]
}

Execution Trace (multi-step):
Step 0: User → ProtocolX (deposit 1 BTC)           ✓
Step 1: ProtocolX → ProtocolY (callback, 0.5 BTC)   ✗ VIOLATION
Step 2: ProtocolY → 0xDEF (transfer, 0.5 BTC)       ✗ VIOLATION

Evidence:
{
  step_violations: [
    {
      step: 1,
      rule: "NO_CALLBACKS",
      expected: "No interaction with 0xProtocolY",
      actual: "ProtocolX called 0xProtocolY with 0.5 BTC"
    },
    {
      step: 2,
      rule: "RECIPIENT_WHITELIST",
      expected: "Transfer to one of [0xUserVault]",
      actual: "Transfer to 0xDEF (not in whitelist)"
    }
  ],
  overall: INVALID,
  total_violations: 2
}
```

### On-Chain Value

| Metric | Value |
|---|---|
| Multi-step trace analysis | Supports up to 50 steps |
| Violation detection | 11 built-in rule types |
| Gas cost per step analysis | ~5,000 gas |
| Evidence generation time | < 100ms per step |

### Adoption Driver

- **For smart accounts**: "Our smart account uses CoreGuard to validate every execution step"
- **For DeFi protocols**: "Users can verify our vault strategy stayed within bounds"
- **For institutions**: "We can prove our portfolio management stayed within mandate"

---

## Killer #3: Proof Anchoring On-Chain

### What It Does

CoreGuard writes a **Proof Commitment** to Core blockchain — a 32-byte hash that anchors the evidence without revealing sensitive data. Anyone can later verify the evidence against the on-chain commitment.

### Technical Design

```
ON-CHAIN COMMITMENT STRUCTURE

struct ProofCommitment {
    bytes32 proofId;           // Unique proof identifier
    bytes32 intentHash;        // SHA256 of user intent
    bytes32 policyHash;        // SHA256 of applied policy
    bytes32 executionHash;     // SHA256 of execution trace
    bytes32 stateRoot;         // State commitment
    uint256 timestamp;         // Block timestamp
    address generator;         // CoreGuard engine address
    uint8 verifierVersion;     // Engine version
    uint8 result;              // 0=INVALID, 1=VALID, 2=INCONCLUSIVE
}

mapping(bytes32 => ProofCommitment) public proofCommitments;
```

```
PROOF LIFECYCLE

1. Intent Phase:
   - User computes intentHash locally
   - Optionally: register intentHash on-chain (for pre-commitment)

2. Execution Phase:
   - Transaction executes on Core
   - CoreGuard traces execution

3. Evidence Phase:
   - CoreGuard computes executionHash
   - CoreGuard computes policyHash
   - CoreGuard computes stateRoot
   - CoreGuard computes proofId = SHA256(intentHash || executionHash || timestamp)

4. Anchoring Phase:
   - EvidenceRegistry.anchorProof(proofId, intentHash, policyHash, executionHash, stateRoot, result)
   - On-chain: 32 bytes per commitment
   - Off-chain: Full evidence (local/encrypted)

5. Verification Phase:
   - Anyone calls EvidenceRegistry.verifyProof(proofId)
   - Compares against stored commitment
   - Returns: VALID / INVALID / NOT_FOUND
```

```
PRIVACY PRESERVATION

On-chain stores:
  ✓ proofId (hash)
  ✓ intentHash (hash of intent — no details)
  ✓ policyHash (hash of policy — no rules)
  ✓ executionHash (hash of execution — no trace)
  ✓ stateRoot (state commitment — no values)
  ✓ result (VALID/INVALID — no explanation)
  ✓ timestamp (when)
  ✓ generator (CoreGuard address)

On-chain does NOT store:
  ✗ User wallet address
  ✗ Transaction value
  ✗ Target contract
  ✗ Specific state changes
  ✗ Risk assessment details
  ✗ Policy rules
```

### On-Chain Value

| Metric | Value |
|---|---|
| Commitment storage cost | ~50,000 gas (~0.005 CORE) |
| Verification cost | ~10,000 gas (~0.001 CORE) |
| Storage per proof | 32 bytes on-chain |
| Full evidence (off-chain) | ~2KB |
| Verification time | < 1 second |

### Adoption Driver

- **For protocols**: "Our users can verify every transaction on-chain"
- **For auditors**: "We can verify historical execution evidence"
- **For institutions**: "We have on-chain proof of compliance"

---

## Killer #4: Execution Firewall

### What It Does

CoreGuard doesn't just tell you if a transaction is dangerous — it **prevents execution** if it doesn't match the declared intent. A Smart Account or Protocol calls `CoreGuard.validate()` and receives VALID (execute) or INVALID (revert).

### Technical Design

```
EXECUTION FIREWALL INTERFACE

interface ICoreGuardFirewall {
    struct ExecutionRequest {
        address user;
        address target;
        bytes data;
        uint256 value;
        bytes32 intentHash;
        uint256 deadline;
    }
    
    struct ValidationResult {
        bool valid;
        bytes32 evidenceId;
        string reason;
        uint8 riskLevel;
    }
    
    // Pre-execution validation
    function validate(
        ExecutionRequest calldata request
    ) external returns (ValidationResult memory);
    
    // Post-execution verification
    function verify(
        bytes32 proofId,
        bytes32 executionHash
    ) external returns (bool);
    
    // Batch validation
    function validateBatch(
        ExecutionRequest[] calldata requests
    ) external returns (ValidationResult[] memory);
}
```

```
USAGE IN SMART ACCOUNT

contract SmartAccount {
    ICoreGuardFirewall public coreguard;
    
    modifier executionFirewall(
        address target,
        bytes calldata data,
        uint256 value,
        bytes32 intentHash
    ) {
        ICoreGuardFirewall.ExecutionRequest memory req = ICoreGuardFirewall.ExecutionRequest({
            user: msg.sender,
            target: target,
            data: data,
            value: value,
            intentHash: intentHash,
            deadline: block.timestamp
        });
        
        ICoreGuardFirewall.ValidationResult memory result = coreguard.validate(req);
        
        require(result.valid, string(result.reason));
        
        _;
        
        // Post-execution: anchor proof
        coreguard.anchorProof(result.evidenceId);
    }
    
    function execute(
        address target,
        bytes calldata data,
        uint256 value,
        bytes32 intentHash
    ) external executionFirewall(target, data, value, intentHash) {
        // This code only runs if firewall passes
        (bool success, ) = target.call{value: value}(data);
        require(success, "Execution failed");
    }
}
```

```
GAS COSTS

Pre-execution validation:
  - Intent hash computation: ~3,000 gas
  - Policy evaluation: ~10,000 gas
  - Simulation: ~50,000 gas (off-chain, not gas)
  - Total on-chain: ~15,000 gas (~0.0015 CORE)

Post-execution anchoring:
  - Evidence anchoring: ~50,000 gas (~0.005 CORE)
  - Total: ~65,000 gas (~0.0065 CORE)

For comparison:
  - Typical DeFi swap: 150,000-300,000 gas
  - CoreGuard overhead: ~20-40% of typical tx
  - For high-value transactions: negligible overhead
```

### On-Chain Value

| Metric | Value |
|---|---|
| Validation gas | ~15,000 gas |
| Anchoring gas | ~50,000 gas |
| Total overhead | ~65,000 gas |
| vs Typical DeFi tx | 20-40% overhead |
| For high-value tx | < 5% overhead |

### Adoption Driver

- **For smart accounts**: "Every execution is validated against user intent"
- **For protocols**: "Users can enforce security policies at execution time"
- **For institutions**: "Automated compliance — invalid executions revert"

---

## Killer #5: CoreGuard Verified + Proof Passport

### What It Does

Every protocol that integrates CoreGuard gets a **Proof Passport** — a verifiable on-chain record of execution history. Users can see "CoreGuard Verified" with a link to independently verify any transaction.

### Technical Design

```
PROOF PASSPORT STRUCTURE

struct ProofPassport {
    uint256 passportId;
    address contractAddress;
    uint256 totalExecutions;
    uint256 validExecutions;
    uint256 invalidExecutions;
    uint256 lastVerification;
    bytes32 evidenceCommitment;
    uint8 overallScore;          // 0-100
    bool active;
}

mapping(uint256 => ProofPassport) public passports;
mapping(address => uint256) public contractToPassport;
```

```
PASSPORT LIFECYCLE

1. Integration:
   - Protocol integrates CoreGuard SDK
   - Protocol calls SecurityPassport.mintPassport(contractAddress)
   - Passport created with passportId

2. Usage:
   - Each transaction validated by CoreGuard
   - Valid execution → validExecutions++
   - Invalid execution → invalidExecutions++
   - Overall score = validExecutions / totalExecutions * 100

3. Verification:
   - User clicks "CoreGuard Verified" badge
   - Redirects to verify.coreguard.io/{passportId}
   - Shows:
     - Contract: 0x...
     - Chain: Core Mainnet
     - Total executions: 1,247
     - Valid: 1,245 (99.8%)
     - Invalid: 2 (0.2%)
     - Last verification: 2 hours ago
     - Evidence commitment: 0x...
     - Verify this passport: [VERIFY]

4. Independent Verification:
   - Anyone can call SecurityPassport.verifyPassport(passportId, commitment)
   - Compares against stored commitment
   - Returns: VALID / INVALID
```

```
VERIFICATION BADGE

┌─────────────────────────────────────────┐
│  🛡 CoreGuard Verified                  │
│                                         │
│  Contract: 0xColendVault               │
│  Chain: Core Mainnet                   │
│  Executions: 1,247                     │
│  Valid: 99.8%                          │
│  Last verified: 2 hours ago            │
│                                         │
│  [VERIFY THIS PASSPORT]                │
│                                         │
│  Proof ID: CGPP-001                    │
│  Evidence: 0x7a3f...                   │
│  Explorer: scan.coredao.org/...        │
└─────────────────────────────────────────┘
```

### On-Chain Value

| Metric | Value |
|---|---|
| Passport minting gas | ~100,000 gas (~0.01 CORE) |
| Score update gas | ~30,000 gas (~0.003 CORE) |
| Verification gas | ~10,000 gas (~0.001 CORE) |
| Passport data | 64 bytes on-chain |

### Adoption Driver

- **For protocols**: "Users see our security track record on-chain"
- **For users**: "I can verify any protocol's execution history"
- **For institutions**: "Due diligence via on-chain proof passport"

---

## Killer #6: CGEP/1 Open Standard

### What It Does

CoreGuard is not just a product — it proposes an **open standard** for verifiable execution evidence. Any wallet, protocol, or smart account can implement CGEP/1 without using CoreGuard's infrastructure.

### Technical Design

```
CGEP/1 STANDARD LAYERS

Layer 1: Intent Specification
  - Standardized intent schema
  - Action types, parameters, constraints
  - Human-readable semantic intent

Layer 2: Policy Framework
  - Standardized rule types (11 built-in)
  - Policy composition rules
  - Policy hashing and commitment

Layer 3: Execution Trace
  - Standardized trace format
  - State delta specification
  - Event capture specification

Layer 4: Evidence Schema
  - Evidence types and structures
  - Commitment schemes (hash, Pedersen, ZK)
  - Evidence metadata

Layer 5: Proof Protocol
  - Proof types (hash, Merkle, ZK)
  - Verification methods
  - Verification keys

Layer 6: Disclosure Protocol
  - Selective disclosure rules
  - ZK disclosure circuits
  - Compliance disclosure templates
```

```
OPEN IMPLEMENTATION

CGEP/1 is open source (MIT license):
  - CoreGuard: reference implementation
  - Any project: can implement independently
  - Standard maintained via CGEP Improvement Process

Reference implementations:
  - CoreGuard Engine (TypeScript/Rust)
  - CoreGuard Contracts (Solidity)
  - CoreGuard CLI (TypeScript)
  - CoreGuard SDK (TypeScript, Python, Rust)

Compliance levels:
  - Level 1: Intent + Evidence generation
  - Level 2: + Policy evaluation
  - Level 3: + On-chain anchoring
  - Level 4: + Privacy-preserving verification
  - Level 5: + Full CGEP/1 compliance
```

### On-Chain Value

| Metric | Value |
|---|---|
| Standard adoption | Any EVM chain |
| Implementation cost | Free (open source) |
| Verification cost | ~10,000 gas |
| Network effect | Each integration strengthens ecosystem |

### Adoption Driver

- **For Core**: "This is an open standard for our ecosystem"
- **For developers**: "Free, open, auditable"
- **For institutions**: "Industry standard for execution verification"

---

## How All 6 Killers Connect

```
Killer #6: CGEP/1 Standard
  │
  ├── Killer #1: Proof Before & After
  │     │
  │     ├── Intent Commitment
  │     ├── Expected Execution
  │     ├── Actual Execution
  │     └── Cryptographic Evidence
  │
  ├── Killer #2: Multi-Step Verification
  │     │
  │     ├── Step-by-step analysis
  │     ├── Violation detection
  │     └── Per-step evidence
  │
  ├── Killer #3: On-Chain Anchoring
  │     │
  │     ├── 32-byte commitment
  │     ├── Privacy-preserving
  │     └── Permissionless verification
  │
  ├── Killer #4: Execution Firewall
  │     │
  │     ├── Pre-execution validation
  │     ├── Real-time policy enforcement
  │     └── Automatic revert on violation
  │
  └── Killer #5: Verified Passport
        │
        ├── On-chain reputation
        ├── Verifiable track record
        └── Ecosystem adoption loop
```

---

## MVP Implementation Priority

### Phase 1: Core Engine (Weeks 1-4)

| Killer | Component | Priority |
|---|---|---|
| #1 | Intent Commitment | ✅ MVP |
| #1 | Expected vs Actual comparison | ✅ MVP |
| #2 | Multi-step trace analysis | ✅ MVP |
| #3 | On-chain ProofCommitment | ✅ MVP |
| #4 | Execution Firewall interface | ◐ Interface only |
| #5 | Proof Passport | ◐ Data structure only |
| #6 | CGEP/1 spec | ✅ Already done |

### Phase 2: Integration (Weeks 5-8)

| Killer | Component | Priority |
|---|---|---|
| #4 | Execution Firewall implementation | ✅ |
| #5 | Proof Passport minting + verification | ✅ |
| #1 | Privacy-preserving evidence (Pedersen) | ◐ |
| #3 | ZK proof generation | ⏳ Phase 3 |

### Phase 3: Scale (Months 3-6)

| Killer | Component | Priority |
|---|---|---|
| #3 | ZK proof anchoring | ✅ |
| #5 | Ecosystem adoption | ✅ |
| #6 | Standard governance | ✅ |
| #1 | Privacy-preserving verification | ✅ |

---

*End of 6 Killer Features Technical Specification v1.0.0-draft*
