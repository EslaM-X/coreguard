# DDE Delivery Fixture — Bilateral Dispute (Synthetic, Real Anchor)

A complete, replayable bilateral delivery-dispute fixture exercising the
**Delivery & Dispute Evidence (DDE/1)** layer. Built for counterparty
review (People's Court / Epistemic Labs track): it demonstrates that
CoreGuard can preserve authorization and execution proofs as evidence
**without letting them silently decide the delivery-conformity question**.

> **DDE-BOUNDARY (binding on every quoting of engine output):**
> *"Execution verification does not decide delivery conformity.
> Acceptance or rejection of the delivered work is a separate determination
> recorded by the parties, not derived from on-chain facts."*

## Read this first — honesty model

| Layer | Origin | Meaning |
|---|---|---|
| Execution anchor | **REAL** | public Pilot-1 Core Mainnet tx `0xe67c61fd…91a9b8` (status `0x1`, block `38712625`); receipt re-verified live from `rpc.coredao.org` at generation |
| Signatures | **REAL crypto** | genuine EIP-712 replays (intent + both redaction grants) over deterministic test keys — evidence of nothing beyond this fixture |
| Parties, delivery, dispute | **SYNTHETIC** | modeled scenario; `realDisputeExists: false` — no real parties, no real dispute |

`origin: "SYNTHETIC"` is declared in `hashes.json` (manifest level) and in
every record. This fixture answers the intake question "synthetic or real?"
accurately by construction.

## Verify in one command

```bash
node examples/delivery-fixture/verify-fixture.mjs
```

Exit `0` + `VERIFIED (10 PASS)` when every record is byte-exact vs
`hashes.json` and the full fail-closed gate holds. The `--tamper <id>` flag
flips one artifact byte in memory and exits `1` — watch the boundary
enforce itself. `--json` for machines.

Regenerate (deterministic, byte-identical):

```bash
node examples/delivery-fixture/make-fixture.mjs
```

## The records

| File | Purpose |
|---|---|
| `agreement.json` | the modeled agreement, versioned, both roles and authority |
| `acceptance-criteria.json` | 4 machine-inspectable criteria fixed before delivery |
| `parties.json` | both sides, agents + principals, deterministic addresses |
| `authorization.json` | the client agent's declared intent — real EIP-712 signature, replayable |
| `execution-attestation.json` | the REAL on-chain anchor (payment settled) |
| `delivery-manifest.json` | 3 artifacts with exact-byte SHA-256 pins |
| `acceptance-record.json` | REJECTED — solely on criterion evaluations (C-QUALITY fails: 2 color tokens < required 3) |
| `dispute-record.json` | both positions, closed remedy vocabulary, no engine verdict |
| `consent-and-disclosure.json` | both parties' signed redaction-consent grants + full disclosure block |
| `retention-policy.json` | retention window and purge commitment |
| `hashes.json` | the pin manifest — self-excluded (cannot hash itself) |

## What the demo teaches

The provider delivers. Payment had already settled on-chain (REAL). The
client rejects on a named criterion. A dispute opens. **Nothing in the
chain of custody lets the engine, the receipt, or the signature decide who
is right** — B1/B2/B3 make that structurally impossible, and the fixture
verifies precisely because it respects the boundary.

Boundary document: [`docs/delivery-dispute-boundary.md`](../../docs/delivery-dispute-boundary.md)
Engine: [`packages/delivery/index.js`](../../packages/delivery/index.js)
Tests: `test/delivery/fixture.test.js` (31 tests)
