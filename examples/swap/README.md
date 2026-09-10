# Example 2: Multi-Step Swap Verification

This example demonstrates detecting a violation in a multi-step swap where a hidden step sends funds to the wrong recipient.

## The Intent

```
"Swap ≤ 1 BTC through approved route
 with max 50 bps slippage
 and recipient = user"
```

## The Attack

```
CALL 0: User → Router          ✓
CALL 1: Router → Pool          ✓
CALL 2: Pool → Token           ✓
CALL 3: Token → Attacker       ✗ VIOLATION
```

## What CoreGuard Detects

```
Result: INVALID

Violation:
  RECIPIENT_ALLOWLIST
  Step: 3
  Expected: 0xUser
  Observed: 0xAttacker
```

## Policy Used

```json
{
  "rules": [
    { "ruleId": "T1", "type": "TARGET_ALLOWLIST", "params": { "targets": ["0xRouter", "0xPool", "0xToken"] } },
    { "ruleId": "SL1", "type": "SLIPPAGE_BPS", "params": { "bps": "50" } },
    { "ruleId": "R1", "type": "RECIPIENT_ALLOWLIST", "params": { "addresses": ["0xUser"] } }
  ]
}
```