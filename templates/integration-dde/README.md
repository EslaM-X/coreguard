# {{NAME}} — CoreGuard DDE payment-gate scaffold

{{NAME}} is a Delivery & Dispute Evidence (DDE/1) integration scaffold. It embeds
a working bilateral evidence fixture and a payment gate whose law is the DDE
boundary itself: **execution verification does not decide delivery conformity.**
Payment release requires a party-signed acceptance record resting on criterion
evaluations — a settled transaction, by itself, releases nothing.

## Files

| file | purpose |
| --- | --- |
| `dde-fixture/` | the ten DDE/1 records + `hashes.json` (SHA-256 pins over exact record bytes) |
| `verify-dde.mjs` | one-command re-verification: `node verify-dde.mjs` → full check table + exit code |
| `payout-gate.mjs` | the release loop: verify → party acceptance → release / hold with named reasons |
| `test/dde.test.js` | contract tests: `node --test` |

## Try it

```bash
node verify-dde.mjs      # → status=VERIFIED, decision=EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE
node payout-gate.mjs     # → release: gate satisfied
node --test              # contract tests green
```

## The boundary this scaffold enforces

- `EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE` is the honest
  success shape: the evidence record is admissible, and the engine has *not*
  judged the delivery.
- Payment release requires **both**: engine `VERIFIED` **and** a party-signed
  acceptance record resting on `CRITERIA_EVALUATION`. A settled transaction
  alone never satisfies the gate.
- The engine never names a dispute winner: both parties' positions and remedies
  are preserved verbatim in the closed record.
- Every report carries the `DDE-BOUNDARY` banner; quote it with any number you
  cite from a report.

## The fixture is a scaffold, honestly labeled

`origin: "SYNTHETIC"` on every record; `realDisputeExists: false`; both parties
are deterministic template identities. Two layers are placeholders by design:

- `execution-attestation.json` is `OWNER-DECLARED`: an unset placeholder with
  `paymentSettled: false` and a zero txHash. Replace it with your real
  execution evidence before shipping — never describe the placeholder as
  verified.
- `realSignatures: false`: the consent and intent signatures are deterministic
  scaffold values over the fixture's own keys. Swap in real EIP-712 signatures
  when your parties are real; `packages/delivery` replays them (check E5)
  the moment you supply an EVM adapter.

## Making it yours

1. Replace the delivery artifacts and acceptance criteria with your real
   deliverable and its testable criteria; re-pin `hashes.json` over the exact
   new record bytes.
2. Fill in real parties, real authorization, and a real execution attestation.
3. Wire `payout-gate.mjs` into your payment flow: release only when the gate
   says so, hold with the named reasons otherwise.

## Packages

The `@coreguard/delivery` engine (the boundary enforcement this scaffold
exercises) currently ships from the [coreguard repository](https://github.com/EslaM-X/coreguard)
(`packages/delivery`) — no npm package is published yet. Two ways to run this
scaffold against the real engine:

- **In the coreguard workspace**: link this directory into the repo's
  `workspaces` and import from `@coreguard/delivery` directly.
- **Standalone**: copy `packages/delivery/index.js` (zero dependencies,
  Node ≥ 18) next to your project and import it as a local module.

Until then the scaffold runs self-contained: its bundled `engine-dde.mjs`
implements the same DDE/1 boundary for offline use and is CI-checked against
the real engine.