# Stellar/1 — CoreGuard Stellar Integration Adapter

Honest status: **DRY_RUN / NOT_BUILT**. No secret key, no live submission, no funds movement.

## What this is

A deterministic, fail-closed adapter for the Stellar network (Horizon REST API):

- **Read** account state from Horizon (public testnet by default).
- **Build** payment intents offline (no signing).
- **Submit** only when an explicit submitter function is injected.

## What this is NOT

- Not a wallet. No secret key is stored, generated, or logged.
- Not a live integration claim. `status()` reports `UNKNOWN / DRY_RUN / NOT_BUILT` until a real counterparty + credentials + receipt are observed.
- Not revenue. No transaction is ever submitted by this module.

## Usage

```js
import { readAccount, buildPaymentIntent, submitTransaction, status, selfCheck } from "./packages/stellar/index.mjs";

const acct = await readAccount({ network: "testnet", accountId: "G..." });
console.log(acct.state, acct.account?.balances);

const intent = buildPaymentIntent({ source: "G...", destination: "G...", amount: "10" });
console.log(intent.state, intent.intent);

// Submit only with an injected submitter (you own the key + signer):
const result = await submitTransaction({ xdr: "<signed xdr>", submitter: async (x) => ({ ok: true, hash: "..." }) });

console.log(status());
console.log(selfCheck());
```

## Standards

STELLAR/1 (CoreGuard adapter envelope). Compatible with the adapter contract in `packages/adapters/contract.mjs`.

## Truthfulness

All claims measured. No fabricated traction, funding, partnerships, or live integrations. See `docs/CLAIMS-REGISTRY.md`.