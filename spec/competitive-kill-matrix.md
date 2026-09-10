# CoreGuard — Competitive Kill Matrix v0.1

**Purpose**: Identify exactly what no one else does, so we can own it.

**Methodology**: Each project evaluated on 8 capabilities. ✅ = Production, ◐ = Partial/Development, ❌ = Absent.

---

## 1. The Matrix

### A. Risk Intelligence Projects

| Project | Risk Scoring | Real-time Monitoring | Execution Verification | Cryptographic Evidence | Independent Verification | Privacy | Core-native | Open Standard |
|---|---|---|---|---|---|---|---|---|
| **DeFi Risk** (general concept) | ✅ 184 factors | ◐ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Philidor** | ✅ 0-10 score | ✅ Hourly | ❌ Explicitly read-only | ✅ EIP-191 signed decisions | ✅ Public verify endpoint | ◐ Public verify, no API key needed | ❌ 10 chains, Core not included | ❌ |
| **TokenIntel** | ✅ 7 dimensions | ❌ Point-in-time | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **DeFi Sentinel** | ✅ 5 fields | ❌ Point-in-time | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **RFS Risk Intelligence** | ✅ 39 KRIs | ✅ Hourly | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### B. Monitoring & Detection Projects

| Project | Risk Scoring | Real-time Monitoring | Execution Verification | Cryptographic Evidence | Independent Verification | Privacy | Core-native | Open Standard |
|---|---|---|---|---|---|---|---|---|
| **Tenderly** | ◐ Invariants | ✅ Block-by-block | ❌ Simulation only | ❌ Trust Tenderly | ❌ | ❌ | ❌ EVM only | ❌ |
| **Forta Network** | ◐ Bot findings | ✅ Real-time | ❌ Alerts, not proof | ◐ Scan node JWT signatures | ◐ IPFS-stored alerts | ◐ Private bots | ❌ EVM only | ❌ |
| **Hypernative** | ✅ Risk scoring | ✅ Real-time | ❌ Pre-transaction only | ❌ Audit trails | ❌ | ❌ | ❌ | ❌ |
| **Blockaid** | ✅ Risk scoring | ✅ Pre-signing | ◐ Pre-execution only | ✅ VTX (signed) | ✅ Ledger can verify | ❌ Provider sees tx | ❌ | ❌ |
| **EigenPhi** | ◐ MEV detection | ❌ Discontinued | ❌ Analysis only | ❌ | ❌ | ❌ | ❌ | ❌ |

### C. Security Audit Projects

| Project | Risk Scoring | Real-time Monitoring | Execution Verification | Cryptographic Evidence | Independent Verification | Privacy | Core-native | Open Standard |
|---|---|---|---|---|---|---|---|---|
| **CertiK** | ◐ Audit scores | ❌ | ❌ Point-in-time | ◐ PoR Merkle proofs | ◐ PoR verifiable | ◐ PoR hashed | ◐ BTC audits | ❌ |
| **Halborn** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Spearbit** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Ackee Blockchain** | ❌ | ❌ | ❌ | ◐ GPG-signed reports | ◐ GPG verifiable | ❌ | ❌ | ❌ |
| **Runtime Verification** | ❌ | ❌ | ◐ Building universal proofs | ◐ ZK proof checker (RiscZero) | ◐ Research phase | ❌ | ❌ | ❌ |

### D. Governance & Specialized Projects

| Project | Risk Scoring | Real-time Monitoring | Execution Verification | Cryptographic Evidence | Independent Verification | Privacy | Core-native | Open Standard |
|---|---|---|---|---|---|---|---|---|
| **Anticapture** | ✅ Governance risk | ✅ Live stages | ◐ Calldata review only | ❌ Reports only | ❌ | ❌ | ❌ Ethereum-first | ❌ |
| **Anoma** | ❌ | ❌ | ◐ ZK execution circuits (dev) | ✅ ZK proofs (dev) | ✅ ZK verifiable | ✅ Shielded state | ❌ BNB Chain | ❌ |

### E. Custody & Infrastructure Projects

| Project | Risk Scoring | Real-time Monitoring | Execution Verification | Cryptographic Evidence | Independent Verification | Privacy | Core-native | Open Standard |
|---|---|---|---|---|---|---|---|---|
| **BitGo** | ◐ Policy checks | ✅ Transaction monitoring | ◐ Intent binding (5-layer) | ✅ API attestations | ◐ Hardware-backed | ❌ | ◐ Core validator | ❌ |
| **Fireblocks** | ✅ Policy engine | ✅ Transaction monitoring | ◐ Co-signer verification | ✅ MPC + TEE proofs | ◐ Signing callbacks | ❌ | ❌ | ❌ |
| **Chainalysis** | ✅ Risk scoring | ✅ Real-time alerts | ❌ Forensic, not execution | ✅ Daubert-admissible | ✅ Court-validated | ❌ Surveillance model | ❌ | ❌ |

---

## 2. The Gap Analysis

### What NO PROJECT Does Today

| Capability | Exists? | Who's Closest | Gap |
|---|---|---|---|
| **1. Pre-execution intent specification** | ◐ Partial | CoW (trading only), BitGo (custody only) | No general-purpose intent→execution framework |
| **2. Pre-execution policy evaluation** | ◐ Partial | Fireblocks (custody only), Hypernative (detection only) | No open, composable policy engine |
| **3. Post-execution trace verification** | ❌ | Forta (alerts, not proof), Tenderly (simulation, not proof) | No one proves execution matched intent |
| **4. Cryptographic execution evidence** | ◐ Partial | Blockaid (pre-signing VTX only), Anoma (ZK, dev phase) | No production post-execution evidence |
| **5. Independent verification** | ◐ Partial | Philidor (risk decisions, not execution), CertiK PoR | No one lets you verify execution correctness |
| **6. Privacy-preserving verification** | ◐ Partial | Anoma (ZK, dev phase) | No production privacy-preserving execution verification |
| **7. Open verification standard** | ❌ | None | No CGEP-like standard exists |
| **8. Core-native** | ❌ | None of the above | Zero execution verification tools on Core |

### The CoreGuard Positioning

```
     "How risky is this protocol?"          "Did this execution actually match intent?"
              │                                          │
     ┌────────┴────────┐                      ┌──────────┴──────────┐
     │                 │                      │                     │
  DeFi Risk        Philidor              CoreGuard              Anoma
  TokenIntel       Foreshock             (what we build)       (ZK, dev)
  RFS Risk         Anticapture
     │                 │                      │
     ▼                 ▼                      ▼
  RISK DASHBOARD    RISK INFRASTRUCTURE   EXECUTION TRUTH LAYER
  (point-in-time)  (signed decisions)    (evidence + proof)
```

---

## 3. CoreGuard's Unique Position

### The 8-Capability Thesis

No project in production today combines all 8:

| # | Capability | CoreGuard v0.1 | CoreGuard v1.0 |
|---|---|---|---|
| 1 | Pre-execution intent specification | ✅ | ✅ |
| 2 | Policy evaluation engine | ✅ | ✅ |
| 3 | Post-execution trace verification | ✅ | ✅ |
| 4 | Cryptographic execution evidence | ✅ (hash) | ✅ (ZK) |
| 5 | Independent verification | ✅ | ✅ |
| 6 | Privacy-preserving verification | ◐ (selective disclosure) | ✅ (ZK) |
| 7 | Open verification standard (CGEP) | ✅ | ✅ |
| 8 | Core-native | ✅ | ✅ |

### The Closest Competitors and Why We Win

**Philidor** (closest business model):
- They say: "Risk infrastructure for on-chain capital"
- They do: Signed risk decisions on protocol risk (read-only)
- They don't: Verify transaction execution
- Our advantage: We verify what actually happened, not just what the protocol looks like

**Blockaid** (closest technical approach):
- They say: "Pre-transaction security"
- They do: VTX (signed pre-execution simulation)
- They don't: Post-execution verification, independent proof, Core-native
- Our advantage: We verify after execution too, and produce independent proof

**Anoma** (closest architecture):
- They say: "Intent-centric execution with ZK privacy"
- They do: ZK execution circuits (in development)
- They don't: Production deployment, Core-native, security-focused
- Our advantage: We ship first on Core, focused specifically on security evidence

**Chainalysis** (closest evidence model):
- They say: "Blockchain analytics with court-admissible evidence"
- They do: Forensic clustering, Daubert-admissible methodology
- They don't: Verify execution correctness, privacy-preserving
- Our advantage: We prove correctness, not just trace funds

---

## 4. The "Kill Zone" — What Would Kill CoreGuard

| Threat | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Philidor adds execution verification | LOW (they're explicitly read-only) | HIGH | Ship fast, own Core-native |
| Blockaid goes Core-native | LOW (Ledger-focused) | HIGH | Open standard (CGEP) creates lock-in |
| Anoma ships production first | LOW (still in development) | HIGH | Ship MVP on Core Testnet2 in 6 weeks |
| Core builds this internally | LOW (no evidence) | CRITICAL | Open source + CGEP standard = community ownership |
| Tenderly adds evidence generation | MEDIUM | MEDIUM | They're simulation-focused, not evidence-focused |
| Forta adds proof generation | MEDIUM | MEDIUM | They're monitoring-focused, not verification-focused |

---

## 5. The Positioning Statement

### For Core:

> "As Core scales Bitcoin-native capital through institutional products (lstBTC, SatPay, ETPs), the ecosystem needs a way to prove that high-value executions actually conform to declared intent and policy. CoreGuard is the verifiable execution layer for Core's BTCFi — not a risk dashboard, not a monitoring tool, but an evidence infrastructure that lets users, protocols, and institutions verify what actually happened and prove it to others."

### For Competitors:

> "CoreGuard does not compete with risk dashboards (DeFi Risk, Philidor) or monitoring tools (Tenderly, Forta). We provide the execution verification layer that these tools can integrate to strengthen their own assessments. When Philidor says a vault is 'Low Risk,' CoreGuard can prove that a specific transaction into that vault actually did what the user intended."

### For Investors:

> "CoreGuard is building the Execution Truth Layer for Bitcoin DeFi. No project today produces cryptographically verifiable evidence that a specific transaction executed according to its declared intent and security policy. CoreGuard does — with privacy preservation, independent verification, and an open standard (CGEP/1) — starting on Core blockchain where institutional BTCFi adoption creates immediate demand."

---

## 6. Data Sources

| Project | Source |
|---|---|
| Philidor | docs.philidor.io, philidor.io |
| Blockaid | blockaid.com, ledger.com integration docs |
| Anoma | anoma.net, forum.anoma.net |
| Anticapture | app.anticapture.com, blockful.gitbook.io |
| Forta | forta.network |
| Tenderly | tenderly.co |
| Chainalysis | chainalysis.com |
| BitGo | developers.bitgo.com |
| Fireblocks | fireblocks.com |
| CertiK | certik.com |
| Runtime Verification | runtimeverification.com |
| DeFi Sentinel | defisentinel.org |
| TokenIntel | tokenintel.org |
| RFS Risk | rfsrisk.ai |

---

*End of Competitive Kill Matrix v0.1*
