# CoreGuard Stellar Verify Demo (TESTNET)

A working end-to-end demonstration of CoreGuard's verification engine on the
Stellar testnet. No mainnet funds. No real money.

## What it does

1. Creates two testnet accounts via Friendbot.
2. Funds both accounts.
3. Builds a payment transaction (10 XLM).
4. Signs and submits the transaction to Stellar testnet.
5. Reads the transaction result from Horizon.
6. Commits a CoreGuard commitment (L0).
7. Replays the execution deterministically (L2).
8. Produces a tamper-evident evidence package with a real transaction hash.

## Run it

```bash
npm run stellar:demo
```

Or directly:
```bash
node examples/stellar-verify/demo.mjs
```

## Output

The demo prints a real transaction hash that you can verify on
[Stellar Expert (testnet)](https://stellar.expert/explorer/testnet) or
[Horizon](https://horizon-testnet.stellar.org/transactions/<hash>).

## Honesty

- All claims are measured. No fabricated traction, funding, or live integrations.
- The transaction is on TESTNET only. No mainnet funds.
- The evidence package is deterministic and replayable.
- Status: DRY_RUN / NOT_BUILT until a real counterparty + credentials + receipt.