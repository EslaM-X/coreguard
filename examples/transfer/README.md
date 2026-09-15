<p align="center">
  <img src="../../assets/core-guard-logo.png" alt="CoreGuard" width="180">
</p>

# Example 1: Transfer Verification

This example demonstrates the simplest CoreGuard flow: verifying a basic ERC-20 transfer against a committed intent.

## Setup

1. Create an intent:

```json
{
  "version": "CGEP/1",
  "chainId": "1114",
  "signer": "0x...",
  "action": "TRANSFER",
  "target": "0xUSDT",
  "selector": "0xa9059cbb",
  "amount": "100000000",
  "recipient": "0xAlice",
  "constraints": [
    { "type": "MAX_VALUE", "value": "100000000" },
    { "type": "RECIPIENT_ALLOWLIST", "addresses": ["0xAlice"] }
  ]
}
```

2. Commit intent hash on-chain:

```js
import { commitIntent } from "./coreguard/packages/intent/index.js";
const { hash } = await commitIntent(intent);
```

3. Execute transaction and capture trace:

```js
import { normalizeExecution } from "./coreguard/packages/trace/index.js";
const trace = normalizeExecution(tx, receipt, traceData, preState, postState);
```

4. Generate evidence and receipt:

```js
import { createEvidenceBundle, createReceipt } from "./coreguard/packages/evidence/index.js";
const evidence = await createEvidenceBundle({ ... });
const receipt = await createReceipt({ ... });
```

5. Verify independently:

```js
import { verifyReceipt } from "./coreguard/packages/verifier/index.js";
const result = await verifyReceipt(receipt.receipt, null, intent, policy, trace);
// result: { result: "VERIFIED", checks: [...] }
```

## Expected Output

```
Result: VERIFIED

Intent:  TRANSFER 100 USDT → 0xAlice
Policy:  Max value 100 USDT, recipient allowlist [0xAlice]
Trace:   Target 0xUSDT, value 100 USDT, recipient 0xAlice
Evidence:commitment matches
```