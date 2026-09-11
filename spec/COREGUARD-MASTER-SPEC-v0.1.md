# CoreGuard — Master Specification v0.1

**Verifiable Execution Truth Layer for Bitcoin DeFi**

| Field | Value |
|---|---|
| Document | COREGUARD-MASTER-SPEC-v0.1 |
| Date | 2026-09-10 |
| Status | Draft — Pre-implementation |
| Target Chain | Core Blockchain (Mainnet 1116 / Testnet2 1114) |
| Standard | CGEP/1 (CoreGuard Evidence Protocol) — Draft |

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [What CoreGuard Is](#2-what-coreguard-is)
3. [What CoreGuard Is NOT](#3-what-coreguard-is-not)
4. [The Pipeline](#4-the-pipeline)
5. [Execution Receipt](#5-execution-receipt)
6. [Verification Levels](#6-verification-levels)
7. [Architecture](#7-architecture)
8. [On-Chain Components](#8-on-chain-components)
9. [Off-Chain Components](#9-off-chain-components)
10. [MVP Scope](#10-mvp-scope)
11. [Benchmarks](#11-benchmarks)
12. [Core Alignment](#12-core-alignment)
13. [Funding Strategy](#13-funding-strategy)
14. [What We Do NOT Claim](#14-what-we-do-not-claim)

---

## 1. Problem Statement

### Did This Execution Do What Was Authorized?

A user authorizes:

```
Transfer 100 USDT to 0xABC
with max fee $2
before 12:00
through approved route only
```

A risk dashboard says: "Vault X = Low Risk"

But nobody can prove that this specific transaction:

- Went to 0xABC (not 0xDEF)
- Sent 100 USDT (not 101)
- Stayed within fee limit
- Used the approved route
- Produced the expected state transition

CoreGuard produces independently verifiable evidence answering: **Did the execution match the intent?**

---

## 2. What CoreGuard Is

CoreGuard is a **verifiable execution layer** that produces cryptographically anchored evidence of whether on-chain execution conformed to declared intent and policy.

### Core Principles

1. **Execution Truth over Risk Opinion.** Evidence of what happened, not ratings of what might happen.
2. **Verification over Trust.** Anyone can independently verify. No trusted party required.
3. **Privacy by Design.** Does not need to know who you are. Needs to know whether execution was correct.
4. **Deterministic.** Same input produces same evidence. No heuristics in verification.
5. **Core-native.** Built for Core from the first commit.
6. **Complementary.** Strengthens existing tools (risk dashboards, monitors) by providing execution verification they lack.

### The Killer Sentence

> CoreGuard doesn't tell you whether a transaction looks safe. It produces independently verifiable evidence of whether execution conformed to what was authorized.

---

## 3. What CoreGuard Is NOT

- Not a risk dashboard (Philidor, DeFi Risk do this)
- Not a monitoring tool (Tenderly, Forta do this)
- Not a security scanner (Slither, Mythril do this)
- Not a rating agency
- Not a guarantee of safety
- Not a surveillance tool
- Not competing with Core infrastructure (RPC, nodes, CoreScan)

---

## 4. The Pipeline

```
USER INTENT
     │
     ▼
  POLICY
     │
     ▼
EXPECTED EXECUTION (simulation at pinned state)
     │
     ▼
 ACTUAL EXECUTION (on-chain)
     │
     ▼
 TRACE NORMALIZATION
     │
     ▼
 COMPARISON (intent ↔ execution ↔ state delta)
     │
     ▼
  EVIDENCE BUNDLE
     │
     ▼
  EXECUTION RECEIPT
     │
     ▼
 INDEPENDENT VERIFICATION
     │
     ▼
 ON-CHAIN ANCHOR (commitment only)
     │
     ▼
 VALID / INVALID / INCONCLUSIVE
```

---

## 5. Execution Receipt

The Execution Receipt is the central artifact of CoreGuard.

```json
{
  "version": "CGEP/1",
  "receiptId": "0x...",
  "chainId": 1114,
  "txHash": "0x...",
  "blockHash": "0x...",
  "blockNumber": 123456,
  "intentHash": "0x...",
  "policyHash": "0x...",
  "executionTraceHash": "0x...",
  "stateDeltaHash": "0x...",
  "evidenceRoot": "0x...",
  "simulation": {
    "blockNumber": 1200000,
    "blockHash": "0x..."
  },
  "execution": {
    "blockNumber": 123456,
    "blockHash": "0x..."
  },
  "verifierVersion": "0.1.0",
  "verificationLevel": "L2",
  "result": "VALID",
  "timestamp": 1726000000
}
```

---

## 6. Verification Levels

| Level | Name | What It Does |
|---|---|---|
| L0 | Commitment | `hash(evidence)` — proves artifact unchanged |
| L1 | Chain Receipt | tx + receipt + logs + block — proves execution happened on-chain |
| L2 | Deterministic Replay | pinned state + pinned block + deterministic replay — proves execution matches trace |
| L3 | Evidence Merkle | Merkle root + membership proof — proves selective disclosure |
| L4 | ZK Execution | ZK proof + public inputs — proves computation without revealing witness |

**MVP: L1 + L2**

---

## 7. Architecture

### Chain Adapter Pattern

```
Core RPC
    ↓
ChainAdapter (interface)
    ↓
NormalizedExecution
    ↓
CoreGuard Engine
    ↓
Evidence
    ↓
Receipt
    ↓
Verifier
```

```
interface ChainAdapter {
  getTransaction(hash): Transaction
  getReceipt(hash): Receipt
  getBlock(number): Block
  traceTransaction(hash): Trace
  getPreState(block, address): State
  getPostState(block, address): State
  getCode(block, address): bytes
  getStorage(block, address, slot): bytes32
}
```

### Engine Modules

```
coreguard/
├── packages/
│   ├── canonical/        ← Canonical encoding
│   ├── intent/           ← Intent model + canonicalization
│   ├── policy/           ← Policy model + rule engine
│   ├── trace/            ← Trace normalization + state delta
│   ├── evidence/         ← Evidence bundle + commitment
│   ├── verifier/         ← Independent verification
│   └── cli/              ← CLI interface
├── contracts/            ← On-chain (EvidenceRegistry only)
├── benchmarks/           ← Golden corpus + mutations
├── examples/             ← Transfer, swap, multistep
└── test/                 ← Canonicalization, tamper, replay, adversarial
```

---

## 8. On-Chain Components

### v0.1: EvidenceRegistry ONLY

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract EvidenceRegistry {
    error AlreadyCommitted(bytes32 id);
    error InvalidResultCode(uint8 result);

    mapping(bytes32 => bytes32) public proofCommitments;

    event IntentCommitted(bytes32 indexed intentId, bytes32 indexed commitment, uint256 timestamp);
    event ProofAnchored(bytes32 indexed proofId, bytes32 indexed commitment, uint8 result, uint256 timestamp);

    function commitIntent(bytes32 intentId, bytes32 commitment) external {
        if (proofCommitments[intentId] != bytes32(0)) revert AlreadyCommitted(intentId);
        proofCommitments[intentId] = commitment;
        emit IntentCommitted(intentId, commitment, block.timestamp);
    }

    function anchorProof(bytes32 proofId, bytes32 commitment, uint8 result) external {
        if (proofCommitments[proofId] != bytes32(0)) revert AlreadyCommitted(proofId);
        if (result > 2) revert InvalidResultCode(result);
        proofCommitments[proofId] = commitment;
        emit ProofAnchored(proofId, commitment, result, block.timestamp);
    }

    function verifyCommitment(bytes32 id, bytes32 commitment) external view returns (bool) {
        return proofCommitments[id] == commitment;
    }

    function isCommitted(bytes32 id) external view returns (bool) {
        return proofCommitments[id] != bytes32(0);
    }
}
```

Intent identities: `commitIntent` is keyed by `intentId` (== `receiptId`, bound
before execution). `anchorProof` is keyed by `proofId =
H("CGEP/1:ANCHOR", {chainId, receiptId, commitment})` — a distinct anchor
identity, never assumed equal to `receiptId`, never a placeholder. `verifyCommitment`
reads back on `proofId` for Proof B.

No SecurityPassport. No Firewall. No PolicyVerifier in v0.1.

---

## 9. Off-Chain Components

- Execution Engine (trace + normalize + compare)
- Policy Engine (deterministic rule evaluation)
- Evidence Engine (bundle + commitment)
- Verifier (independent, can run without RPC)
- CLI (analyze, verify, report)

---

## 10. MVP Scope

### What We Build

1. Canonical encoding
2. Intent model + canonicalization
3. Policy model + 6 deterministic rules
4. Core ChainAdapter (Testnet2)
5. Execution normalizer
6. Intent ↔ Execution comparator
7. State delta engine
8. Evidence bundle + commitment
9. Execution Receipt
10. Independent verifier
11. EvidenceRegistry on Testnet2
12. CLI (analyze, verify, report)
13. 50-55 adversarial benchmarks
14. Tamper test suite
15. Mutation test suite

### What We Do NOT Build (v0.1)

- Risk score 0-100
- Passport / reputation
- ZK proofs
- Pedersen commitments
- Enterprise API
- Dashboard
- Cross-chain
- Firewall
- Monitoring

---

## 11. Benchmarks

### Categories (55 scenarios)

| Category | Count |
|---|---|
| Intent Integrity | 10 |
| Target Integrity | 5 |
| Value Integrity | 5 |
| Recipient Integrity | 5 |
| Calldata Integrity | 5 |
| Deadline/Nonce | 5 |
| Slippage | 5 |
| Oracle Bound | 5 |
| Multi-step | 5 |
| Adversarial Mutation | 5 |

### Golden Corpus Structure

```
benchmarks/
├── valid/
│   ├── transfer-001/
│   │   ├── intent.json
│   │   ├── policy.json
│   │   ├── expected.json
│   │   └── result.json
│   └── ...
├── invalid/
│   ├── wrong-recipient-001/
│   │   ├── intent.json
│   │   ├── policy.json
│   │   ├── expected.json
│   │   └── result.json
│   └── ...
├── mutations/
│   ├── valid-transfer-001/
│   │   ├── base.json
│   │   ├── mutate-recipient.json
│   │   ├── mutate-value.json
│   │   └── mutate-selector.json
│   └── ...
└── performance/
    └── ...
```

---

## 12. Core Alignment

| Core Feature | CoreGuard Fit |
|---|---|
| Testnet2 (1114) + archive RPC | Direct support for deterministic replay |
| Theseus hardfork (native tracing) | Infrastructure for execution evidence |
| BTCFi ecosystem (125+ dApps) | Ready ecosystem for integration |
| Institutional adoption (BitGo, Copper) | Enterprise demand for execution verification |
| Rev+ (gas fee sharing) | Recurring revenue from usage |
| Core Ventures / Cartel | Funding channels |
| September 2026 validator exploit | Demonstrates need for execution verification |

---

## 13. Funding Strategy

### Milestone-Based Ask

| Milestone | Deliverable |
|---|---|
| M1 | CoreGuard Engine v0.1 + Core Testnet2 + 25-50 scenarios |
| M2 | EvidenceRegistry + public verifier + 100+ scenarios |
| M3 | First Core protocol integration + smart-account firewall |
| M4 | CGEP/1 public specification + third-party implementation |

### Target Programs

1. **Core Cartel** (rolling, OPEN) — highest priority
2. **Core Commit Cohort #2** (OPEN)
3. **Core Ventures BTC-FI** (next cohort TBD)
4. **Core Connect Buildathon** ($1.2M pool)

---

## 14. What We Do NOT Claim

- ❌ "CoreGuard secures Core" → "CoreGuard provides verifiable execution evidence for applications on Core"
- ❌ "100% secure" → "Security coverage under defined assumptions"
- ❌ "AI detects all attacks" → "Deterministic execution evidence; AI assists report generation only"
- ❌ "Core-backed" → "Built on Core, seeking ecosystem partnership"
- ❌ "Industry standard" (now) → "CGEP/1 Draft — experimental open specification"
- "Nobody does this" → "We found no production system combining pre-execution intent commitments, post-execution trace comparison, independently verifiable evidence, and on-chain anchoring as one integrated protocol"
- Fake users, stars, TVL, or partnerships

---

*End of COREGUARD-MASTER-SPEC-v0.1*
