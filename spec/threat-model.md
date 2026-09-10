# CoreGuard Threat Model v0.1

## Trust Model

### We Trust

- Core blockchain consensus and finality
- Canonical chain data (blocks, transactions, receipts)
- Cryptographic primitives (SHA-256, Ed25519)
- EVM determinism

### We Do NOT Trust

- CoreGuard Engine (can be buggy — verification is independent)
- RPC provider (can return incorrect data — cross-check with block hash)
- Evidence storage provider (can tamper — commitment anchoring prevents this)
- Dashboard / API server (not required for verification)

## Threat Actors

| Actor | Motivation | Capability | CoreGuard Coverage |
|---|---|---|---|
| External attacker | Theft, manipulation | Exploit vulnerabilities | Intent/execution comparison, policy enforcement |
| MEV bot / searcher | Profit from ordering | Front-run, sandwich | Timing constraints, slippage limits |
| Oracle manipulator | Price manipulation | Flash loan attack | Oracle bound rules |
| Malicious protocol team | Rug pull | Upgrade proxy, drain | Admin power policies (future) |
| Compromised validator | Chain manipulation | Rewrite state | Cross-block evidence anchoring |

## Attack Surfaces

### 1. Intent Layer
- User expresses wrong intent
- Attacker modifies intent before signing
- Semantic mismatch (intent ≠ calldata)

### 2. Execution Layer
- Transaction manipulated in mempool
- Block producer reorders transactions
- State changes differ from simulation

### 3. Policy Layer
- Policy rules are incomplete
- Policy bypass via edge cases
- Policy engine bug

### 4. Evidence Layer
- Evidence tampered after generation
- Commitment collision (256-bit — probability ≈ 0)
- Verification key compromised

### 5. RPC Layer
- RPC returns incorrect trace data
- RPC returns stale state
- RPC becomes unavailable

## Protection Mechanisms

| Threat | Mechanism |
|---|---|
| Intent modification | Domain-separated intent hash, signer binding |
| Mempool manipulation | Post-execution verification against committed intent |
| State drift | State pinning (simulation block vs execution block) |
| Evidence tampering | On-chain commitment anchoring |
| RPC manipulation | Block hash pinning, deterministic replay |
| Policy bypass | Comprehensive rule types, metamorphic testing |

## Assumptions

1. Core blockchain consensus is functioning correctly
2. EVM execution is deterministic
3. User correctly specifies intent (garbage in, garbage out)
4. Policy rules accurately reflect security requirements
5. CoreGuard engine code is correct (verified by open source + benchmarks)

## Out of Scope

- Consensus-level attacks
- Network-level attacks (DoS, eclipse)
- Private key compromise
- Social engineering
- Physical attacks
- Unknown zero-day vulnerabilities in Core blockchain
