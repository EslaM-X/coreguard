# {{NAME}} — CoreGuard integration

{{NAME}} is a minimal CoreGuard integration scaffold. It uses the public
`@coreguard/sdk` guard surface (Phase 1) to run the full intent lifecycle
offline: **authorize** (firewall decision) → **verify** (receipt verdict) →
**anchor** (CGEP/1:PROOF commitment plan).

## Files

| file | purpose |
| --- | --- |
| `intent.json` | the intent envelope being delegated (target, selector, asset, amount, recipient, window) |
| `policy.json` | the committed policy the execution must satisfy (VALUE_LIMIT, TARGET/RECIPIENT/SELECTOR allowlists) |
| `trace.json` | a concrete execution trace to verify against |
| `verify.mjs` | derive + verify a receipt from the fixtures (`node verify.mjs`) |
| `example.mjs` | full authorize → verify → anchor lifecycle (`node example.mjs`) |
| `test/smoke.test.js` | baseline tests (`node --test`) |

## Try it

```bash
npm install @coreguard/sdk
node verify.mjs          # → verdict=VERIFIED
node example.mjs         # lifecycle walk-through
node --test              # baseline green
```

## What the guard guarantees (red lines)

- `guard.authorize`: a PRE-execution firewall decision only. It **refuses
  execution evidence** and **never suggests ALLOW** for unmodelable context
  (fail-closed DENY + NOT_PROVEN).
- `guard.verify`: recomputes `receiptId` from the payload every call; it never
  ratifies a caller-supplied authorization or receipt claim.
- `guard.anchor`: derives the on-chain commitment + proofId purely offline with
  the CGEP/1:PROOF / CGEP/1:ANCHOR domains.

## On-chain step

When you are ready to anchor, commit the planned receipt on the EvidenceRegistry
(`EvidenceRegistryV2.commitIntent`) and use `coreguard report --receipt` to print
the receipt for counterparties.