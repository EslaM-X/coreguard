# CoreGuard Verify-Run — External Verification Surface

**Contract:** `CGEP/1:VERIFY-RUN` · **Engine:** coreguard v0.1.0

`verify-run` is the external, fail-closed surface of the CoreGuard verifier.
One complete claim (receipt + optional evidence/intent/policy/trace) in →
one deterministic verdict out, as a structured report or as a process exit
code. It reuses the exact engine checks and the exact verdict semantics of
`scripts/anchor-verdict.mjs` — it cannot drift from them.

## Layers

Every report separates three layers:

| Layer | Meaning |
|---|---|
| **OBSERVED** | what the caller supplied, at face value — receiptId, level, chainId, tx/block binding, and a `present` flag per evidence item |
| **DERIVED** | what CoreGuard independently recomputed — receiptId, intent/policy/trace/evidence hashes |
| **VERIFIED** | one row per run check: `PASS / FAIL / NOT_RUN` |

The report intentionally exposes **commitments only** — the intent, policy,
trace and evidence bodies are never re-printed. This is the privacy floor.

## Verdict semantics (fail-closed, unchanged from the engine)

- Missing ANY **required** evidence for the claimed level → **UNVERIFIED**.
  Missing evidence can NEVER reach VERIFIED.
- Any run check that **FAILs** (in the claim OR an optional RPC binding) →
  **INVALID** — contradiction dominates.
- `L3`/`L4` exist but are not claimable in v0.1 → **INCONCLUSIVE**.
- Unknown level → **UNVERIFIED**.
- VERIFIED only when every required check PASSes and nothing FAILs.

## Exit codes

| Exit | Meaning |
|---|---|
| `0` | VERIFIED |
| `1` | CLI / input / runtime error |
| `2` | INVALID (contradiction) |
| `3` | UNVERIFIED (missing / unsupported) |
| `4` | INCONCLUSIVE (unclaimable level) |

## Usage

```bash
# Single bundle (recommended): receipt + evidence + intent + policy + trace
node packages/cli/src/index.js verify-run --bundle examples/transfer/verify-bundle.json --json

# Individual files
node packages/cli/src/index.js verify-run \
  --receipt receipt.json \
  --intent  intent.json \
  --policy  policy.json \
  --trace   trace.json \
  [--evidence evidence.json] \
  [--json]

# Optional read-only on-chain binding (chainId/tx/receipt/block only — NO send, NO broadcast)
node packages/cli/src/index.js verify-run --bundle verify-bundle.json --rpc https://rpc.test2.btcs.network
```

`verify-run` uses **read-only** chain calls (`eth_chainId`,
`eth_getTransactionByHash`, `eth_getTransactionReceipt`,
`eth_getBlockByNumber`). It never builds, signs or submits a transaction. RPC
data is optional evidence: contradiction → INVALID; an unreachable RPC simply
leaves the binding `NOT_RUN` and can never block a complete offline VERIFIED.

## Fail-closed examples

| Input | Result | Exit |
|---|---|---|
| Full L2 bundle (matches) | VERIFIED | 0 |
| Drop the trace (L2 needs TRACE_HASH + INTENT_EXECUTION_BINDING) | UNVERIFIED | 3 |
| Tamper any committed hash | INVALID | 2 |
| Claim L3/L4 in v0.1 | INCONCLUSIVE | 4 |
| Unknown level | UNVERIFIED | 3 |
| RPC says tx does not exist on chain | INVALID | 2 |