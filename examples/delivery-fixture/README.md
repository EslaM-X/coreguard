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

### Prove the gate bites — one command

```bash
node examples/delivery-fixture/adversarial-runner.mjs
```

Applies exactly one named mutation per fail-closed check (F0–F3, E3–E5,
B1–B3) against a clean control, and demands each be caught by its own
check. Exit `0` = all 10 mutations caught; any survivor or wrong-check
catch exits `1` and names the hole. `--json` for machines.

Fuzz mode — seed-deterministic random stacks (size 1–10, PRNG-ordered) of
the ten mutations, one centering report per round; same seed replays
byte-identical rounds:

```bash
node examples/delivery-fixture/adversarial-runner.mjs --fuzz 50 [--seed 424242]
```

Regenerate (deterministic, byte-identical):

```bash
node examples/delivery-fixture/make-fixture.mjs
```

## Verify over HTTP — the platform integration path

Platforms integrate without pulling the engine in-process: start the endpoint
(node stdlib only), assemble the records at their engine keys, and POST.

```bash
# 1 — start (loopback by default; a public bind is a deliberate act)
node -e "import('./packages/delivery/http.js').then(m => m.startDeliveryEndpoint({ port: 8787 }))"

# 2 — assemble the ten records into one fixture document (no jq needed)
node -e "
import { loadFixtureFromDir } from './packages/delivery/sdk.js';
process.stdout.write(JSON.stringify(loadFixtureFromDir('./examples/delivery-fixture').fixture));
" > fixture.json

# 3 — verify over the wire (or /peoples-court for the evidence-class projection)
curl -sS -X POST http://127.0.0.1:8787/verify \
  -H "content-type: application/json" --data-binary @fixture.json
```

Every response — including errors and `/health` — carries
`x-dde-version: DDE/1` and `x-dde-boundary: DDE-BOUNDARY`, and the boundary
banner in the body.

| Code | When | Wire `decision` |
|---|---|---|
| `200` | full gate holds | `EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE` |
| `422` | fixture fails any F/E/B check (also: empty object) | `FIXTURE_REJECTED` |
| `400` | body is not valid JSON | rejected submission (named error) |
| `413` | body exceeds 1 MiB (rejected pre-parse) | rejected submission (named error) |
| `429` | per-address rate limit exceeded (fixed window, default 120/min; `retry-after` header) | rejected submission (named error) |
| `404` | unknown path or wrong method | usage hint |

Wire-specific honesty rules: consent replay (E5) reports `NOT_RUN` unless the
caller injects an EVM adapter (zero outbound calls, never fabricated over the
wire), and `/peoples-court` marks `hashesManifest: NOT_EVALUATED_OVER_HTTP` —
record pins are enforced by the file-based verifier, so a wire report is never
mistakable for pin verification. Hardening for a public bind, both fail-closed
and tested: an in-memory fixed-window rate limiter per direct peer address
(default 120/min, tunable via `rateLimit: { windowMs, max }`, `false` to
disable; no `X-Forwarded-For` trust; `/health` exempt so a flood cannot lock
out liveness probes; `x-ratelimit-*` headers plus `retry-after` on 429), and a
two-layer size gate (declared `content-length` refused before any body byte
is read; the 1 MiB streaming cap stays the truth for chunked or lying
senders). A worked consumer — a platform holding a payout on wire reports,
including a criteria-based scenario rejection — lives in
`examples/agent-platform-integration/run-http-payout-gate.mjs`.

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
Tests: `test/delivery/fixture.test.js` (33 tests — happy path, one mutation per
F/E/B check, determinism, and the compound attack batteries)

This fixture is the **synthetic schema exercise**. For a real paid transaction
with two consenting parties, use the
[real-fixture intake kit](../real-fixture-intake/) — bilateral consent with a
signed disclosure scope, removal checklist, fail-closed gate, and conversion
procedure.
