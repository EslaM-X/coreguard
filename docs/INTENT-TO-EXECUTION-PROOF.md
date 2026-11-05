# CoreGuard — Intent-to-Execution Conformance Proof

## What This Proves

CoreGuard detects when execution diverges from authorized intent.

## Test Case 1: Matching Intent & Execution (VERIFIED)

**Intent**: Send 100 XLM from Alice to Bob
**Execution**: Send 100 XLM from Alice to Bob
**Result**: VERIFIED ✅

```
Intent:    { source: Alice, destination: Bob, amount: 100, asset: XLM }
Execution: { source: Alice, destination: Bob, amount: 100, asset: XLM }
Verdict:   VERIFIED (0 mismatches)
```

## Test Case 2: Destination Mismatch (REJECTED)

**Intent**: Send 100 XLM from Alice to Bob
**Execution**: Send 100 XLM from Alice to Eve (attacker)
**Result**: REJECTED ❌

```
Intent:    { source: Alice, destination: Bob, amount: 100, asset: XLM }
Execution: { source: Alice, destination: Eve, amount: 100, asset: XLM }
Verdict:   REJECTED (1 mismatch: destination)
```

## Test Case 3: Amount Mismatch (REJECTED)

**Intent**: Send 100 XLM from Alice to Bob
**Execution**: Send 1000 XLM from Alice to Bob (10x inflation)
**Result**: REJECTED ❌

```
Intent:    { source: Alice, destination: Bob, amount: 100, asset: XLM }
Execution: { source: Alice, destination: Bob, amount: 1000, asset: XLM }
Verdict:   REJECTED (1 mismatch: amount)
```

## Test Case 4: Asset Mismatch (REJECTED)

**Intent**: Send 100 XLM from Alice to Bob
**Execution**: Send 100 USDC from Alice to Bob (asset swap)
**Result**: REJECTED ❌

```
Intent:    { source: Alice, destination: Bob, amount: 100, asset: XLM }
Execution: { source: Alice, destination: Bob, amount: 100, asset: USDC }
Verdict:   REJECTED (1 mismatch: asset)
```

## Test Case 5: Source Mismatch (REJECTED)

**Intent**: Send 100 XLM from Alice to Bob
**Execution**: Send 100 XLM from Eve to Bob (source spoofing)
**Result**: REJECTED ❌

```
Intent:    { source: Alice, destination: Bob, amount: 100, asset: XLM }
Execution: { source: Eve, destination: Bob, amount: 100, asset: XLM }
Verdict:   REJECTED (1 mismatch: source)
```

## How It Works

1. **Intent** is captured at authorization time
2. **Execution** is captured at submission time
3. **Conformance check** compares intent vs execution
4. **Verdict**: VERIFIED (match) or REJECTED (mismatch)
5. **Evidence** is generated and can be independently replayed

## Why This Matters

Stellar has Soroban authorization (`require_auth`, `require_auth_for_args`), but these only verify that the signer authorized the transaction. They do NOT verify that the transaction execution matches the original intent.

CoreGuard adds this missing layer:
- **Stellar verifies**: "Did the right signer sign?"
- **CoreGuard verifies**: "Did the transaction do what was authorized?"

## Independent Verification

Any party can independently verify the evidence:
1. Read the intent (authorized action)
2. Read the execution (actual action)
3. Compare (conformance check)
4. Verify (deterministic replay)

No trust in CoreGuard required. No trust in Stellar required. Just math.

## Test Results

All 9 DEX gating tests pass:
- ✅ Valid swap passes
- ✅ Excessive slippage rejected
- ✅ Denied destination rejected
- ✅ Max amount exceeded rejected
- ✅ Missing source held
- ✅ Conformance detects mismatch
- ✅ Conformance passes when matching
- ✅ Path payment valid
- ✅ Liquidity provision valid