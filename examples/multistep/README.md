# Example 3: Multi-Step DeFi Execution

This example demonstrates the full flow for a complex multi-step DeFi execution.

## Scenario

User authorizes a strategy:

```
Deposit 1.5 BTC into Colend Vault
→ Stake rewards for 24 hours
→ Withdraw to user address
```

## Pipeline

```
USER INTENT
    │
    ▼
  POLICY (target allowlist, value limit, recipient allowlist)
    │
    ▼
EXPECTED EXECUTION (simulation at block N)
    │
    ▼
 ACTUAL EXECUTION (on-chain at block N+4)
    │
    ▼
 COMPARISON
    │
    ├── Step 0: Deposit to Colend          ✓
    ├── Step 1: Stake rewards              ✓
    └── Step 2: Withdraw to user           ✓
    │
    ▼
  EVIDENCE
    │
    ▼
  RECEIPT
    │
    ▼
 INDEPENDENT VERIFICATION → VERIFIED
    │
    ▼
 ON-CHAIN ANCHOR (commitment only)
```

## The Attack Scenario

If step 2 redirects to an attacker address:

```
  Step 2: Withdraw to attacker            ✗ VIOLATION

  Result: INVALID
  Violation: RECIPIENT_ALLOWLIST
  Step: 2
  Expected: 0xUser
  Observed: 0xAttacker
```