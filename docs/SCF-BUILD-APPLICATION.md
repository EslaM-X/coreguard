# Stellar Community Fund — Build Award Application

## Track: Integration Track

## Project: CoreGuard Global — Verifiable Execution Truth Layer for Stellar

---

### 1. Project Overview

CoreGuard is a verifiable execution truth layer that produces independently verifiable evidence of whether execution conformed to what was authorized. We are bringing this capability to Stellar, enabling every Stellar payment, Soroban contract invocation, and DEX transaction to be verified before submission with independently replayable evidence.

**What we're building on Stellar:**
- Soroban commitment anchor (deployed on mainnet)
- Freighter wallet integration (sign & verify)
- Soroban DEX gating (swap/path payment/liquidity verification)
- Payment verification before submission
- AI agent payment gates for Stellar
- Cross-border payment verification

---

### 2. Ecosystem Value

**Problem**: Stellar has 8M+ accounts and processes billions in cross-border payments, but there is NO tool that verifies whether execution conformed to authorization. Payment failures are hard to diagnose. Compliance teams trust, not verify.

**Solution**: CoreGuard on Stellar provides:
1. **Pre-submission verification** — verify before you submit
2. **Deterministic replay** — independently replay after submission
3. **Fail-closed** — UNKNOWN → HELD (never silently pass)
4. **AI agent gates** — verify AI agent payments before execution
5. **DEX gating** — verify swaps, path payments, liquidity provision

**Unique value**: No other project on Stellar provides verifiable execution evidence. We are the only tool that produces independently replayable proof of conformance.

---

### 3. Technical Feasibility

**Already built (verified on testnet):**
- ✅ Soroban commitment anchor (testnet deployed, contract ID: CCERTRITP7A6U4PQ7NUKHXKWL2BNRMSBLVAAAWWMRAZTICUN7ZGC5Q4R)
- ✅ Freighter wallet integration (`packages/stellar/freighter.mjs`)
- ✅ Soroban DEX gating (`packages/stellar/soroban-dex.mjs`)
- ✅ Mainnet executor (`packages/stellar/mainnet-executor.mjs`)
- ✅ Mainnet wallet created and funded
- ✅ First mainnet transaction executed (0.1 XLM → SDF, ledger 65,308,317)
- ✅ 1412 tests passing
- ✅ 1022 files, 0 boundary violations

**Tech stack:**
- Stellar SDK (@stellar/stellar-sdk)
- Soroban (Rust contract: cg-commitment-anchor)
- Freighter wallet integration
- Node.js 22+
- Rust (soroban-sdk 23)

---

### 4. Roadmap & Milestones

| Month | Milestone | Deliverable | Tranche |
|---|---|---|---|
| 1 | Soroban mainnet deployment | Contract deployed on mainnet | Tranche 1 (MVP) |
| 2 | Freighter integration | Wallet verification live | Tranche 1 (MVP) |
| 3 | DEX gating | Swap/path payment verification | Tranche 2 (Testnet) |
| 4 | AI agent gates | Agent payment verification on Stellar | Tranche 2 (Testnet) |
| 5 | Cross-border verification | Payment verification for remittances | Tranche 3 (Mainnet) |
| 6 | Launch | Full Stellar integration live | Tranche 3 (Mainnet) |

---

### 5. Budget

| Category | Amount | Justification |
|---|---|---|
| 2 Engineers (6 months) | $90,000 | Soroban contract development, SDK integration |
| Stellar ecosystem integration | $20,000 | Freighter, DEX, cross-border |
| Marketing & community | $10,000 | Developer outreach, documentation |
| Infrastructure | $10,000 | RPC nodes, hosting, monitoring |
| **Total** | **$130,000** | Within $150K cap |

---

### 6. Team

- **Founder**: EslaM-X (CoreGuard Global)
- **GitHub**: https://github.com/coreguard-global/CoreGuard
- **LinkedIn**: https://www.linkedin.com/company/coreguard-global
- **Twitter**: https://x.com/CoreGuardGlobal

**Experience:**
- Built CoreGuard from scratch (1412 tests, 1022 files)
- Deployed 2 contracts on Core DAO mainnet
- Deployed Soroban contract on Stellar testnet
- Executed first mainnet transaction on Stellar
- 10,000-run benchmark: 0 false accepts, 0 false rejects

---

### 7. Traction (on Stellar)

- ✅ Soroban contract deployed on testnet
- ✅ 7/7 Soroban integration tests passing
- ✅ Stellar agent payment verifier (STELLAR-AGENT/1)
- ✅ Freighter wallet integration
- ✅ Soroban DEX gating
- ✅ Mainnet wallet created and funded
- ✅ First mainnet transaction executed
- ✅ Mainnet executor ready

### Traction (on other chains)

- ✅ Core DAO mainnet: 2 contracts deployed & verified
- ✅ 1412 tests passing
- ✅ 10,000-run benchmark: 0 false accept, 0 false reject
- ✅ 1,000/1,000 mutants refused
- ✅ 18/18 release gate legs pass

---

### 8. Why Integration Track?

We are incorporating existing Stellar building blocks:
- **Soroban** — commitment anchor contract
- **Freighter** — wallet signing
- **Stellar SDK** — transaction building
- **Horizon** — account management
- **Soroban RPC** — contract invocation

We have existing significant traction on Core DAO and are ready to build fast on Stellar.

---

### 9. Links

- **Repo**: https://github.com/coreguard-global/CoreGuard
- **Website**: https://coreguard.app
- **Docs**: https://eslam-x.github.io/coreguard/
- **LinkedIn**: https://www.linkedin.com/company/coreguard-global
- **Twitter**: https://x.com/CoreGuardGlobal
- **Org Profile**: https://github.com/coreguard-global

---

### 10. Contact

- **Email**: inquire@coredao.org
- **GitHub**: https://github.com/coreguard-global
- **LinkedIn**: https://www.linkedin.com/company/coreguard-global

---

### SCF Referral

We are seeking an SCF referrer. If you are a Stellar community member, SDF employee, or partner, please reach out at inquire@coredao.org.