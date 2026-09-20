# Delivery & Dispute Evidence — Integration Boundary (DDE/1)

**Status:** draft for counterparty review · **Version:** DDE/1 · **Date:** 2026-09-19 · **Verified:** `node examples/delivery-fixture/verify-fixture.mjs` · **Benchmarked:** `npm run benchmark:dde` (verify budget: median < 50 ms/fixture; measured ≈ 0.7 ms median, ~65× headroom)
**Engine:** `packages/delivery/index.js` (zero dependencies) · **Fixture:** `examples/delivery-fixture/` · **Verify:** `node examples/delivery-fixture/verify-fixture.mjs` · **HTTP:** `packages/delivery/http.js` (§6)

> **The boundary in one sentence.** Execution verification does not decide
> delivery conformity. Acceptance or rejection of the delivered work is a
> separate determination recorded by the parties — never derived from
> on-chain facts.

---

## 1. What CoreGuard proves, and what it does not

| Layer | Domain | What it establishes | What it can never establish |
|---|---|---|---|
| Authorization | provenance (CoreGuard) | who signed which declared intent, under which constraints | whether the delivered work matched the deal |
| Execution | provenance (CoreGuard) | that the authorized transaction ran and settled | whether the delivered work matched the deal |
| Delivery | **DDE/1** | what was delivered, when, pinned by SHA-256 | whether it was *acceptable* |
| Acceptance / Dispute | **DDE/1** (records only) | both parties' verdicts, positions, remedies | a winner — structurally |

A signature proves who authorized a transfer. A chain proves what settled.
**Neither is evidence that the brief was satisfied.** DDE/1 enforces this in
code, not in prose.

## 2. The evidence lifecycle

```
agreement + acceptance criteria
        ↓  (party records, sha256-pinned)
authorized intent (EIP-712, replayable)
        ↓  (provenance layer)
execution proof (on-chain receipt — REAL anchor in the fixture)
        ↓  (payment settles)
delivery evidence (artifacts + hashes)
        ↓  (party act, citing criteria)
acceptance / rejection record
        ↓  (if rejected)
dispute record — both positions, closed remedy vocabulary, no engine verdict
        ↓
closed record → neutral claim/evidence/readiness mapping (projection only)
```

## 3. The fail-closed checks

| ID | Check | Enforces |
|---|---|---|
| F0 | REQUIRED_RECORDS | all ten records present |
| F1 | EXECUTION_ACCEPTANCE_SEPARATION | acceptance cites criteria, is signed by a party, and never grounds itself in execution facts ("payment settled", "receipt proves", derivedFrom: execution) |
| F2 | CRITERIA_CLOSURE | every criterion evaluated, every evaluation cites a real criterion — no silent skips, no invented passes |
| F3 | LIFECYCLE_CONSISTENCY | the declared state matches what records establish |
| E3 | DELIVERY_INTEGRITY_REPLAY | every artifact re-hashes to its pin — one flipped byte fails |
| E4 | AUTHORIZATION_BINDING | delivery descends from the signed agreement, execution, and declared intent |
| E5 | CONSENT_BINDING | both parties' redaction-consent signatures replay (EIP-712); without an adapter: NOT_RUN, never fabricated |
| B1 | PAYMENT_INFERENCE_FORBIDDEN | `basis=[PAYMENT_SETTLED]` can never be the acceptance basis; ACCEPTED requires CRITERIA_EVALUATION |
| B2 | EXECUTION_DOES_NOT_DECIDE_CONFORMITY | ACCEPTED/REJECTED with zero evaluations is impossible |
| B3 | NO_ENGINE_ADJUDICATION | both positions + remedies from a closed vocabulary; the engine names no winner |

Every report carries the boundary banner verbatim; DDE output cannot be
quoted without it.

## 4. Determinism and honesty model of the fixture

- **`origin: "SYNTHETIC"`** at the manifest level and per record; the
  disclosure block states `realDisputeExists: false` in plain language.
- **The execution anchor is REAL**: the public Pilot-1 transaction on Core
  Mainnet (`0xe67c61fd…91a9b8`, status `0x1`, block `38712625`), receipt
  re-verified live from `rpc.coredao.org` at generation time.
- **Signatures are cryptographically real** (EIP-712, deterministic RFC-6979
  over counter-derived test keys) — genuine replays that evidence nothing
  beyond the fixture itself.
- **Fully deterministic**: fixed timestamps, counter keys, canonical
  hashing; two runs are byte-identical (test-enforced).

## 5. Interface with a neutral dispute procedure

`mapToPeoplesCourt(fixture)` is a **pure projection**: it classifies the
fixture's evidence into nine classes (agreement, criteria, authorization,
execution, delivery, acceptance record, dispute record, consent, retention)
and reports `READY_FOR_CLAIM_MAPPING` or names its gaps. It performs no
custody transfer, no judgment, no merit finding, and asserts no
relationship with any specific provider — inclusion of the mapping implies
no endorsement by People's Court / Epistemic Labs.

The intended handoff: a verified DDE fixture gives a neutral procedure a
closed, hash-pinned, dual-signed record — so the procedure can frame the
conformity question without payment settlement or a valid signature
silently deciding it.

## 6. The HTTP verification endpoint

`packages/delivery/http.js` exposes the same fail-closed gate over HTTP so
external platforms (agent platforms, escrow providers, People's Court intake
tooling) can verify a bilateral fixture without installing anything beyond
Node's standard library. The engine is not re-implemented for the wire — the
endpoint calls `verifyDeliveryFixture` directly, so wire semantics are
byte-for-byte the CLI's semantics.

```bash
# start (loopback by default — a public bind is a deliberate act, not an accident)
node -e "import('./packages/delivery/http.js').then(m => m.startDeliveryEndpoint({ port: 8787 }))"

# assemble a fixture (records at their engine keys; Node ships everywhere, no jq needed)
node -e "
import { loadFixtureFromDir } from './packages/delivery/sdk.js';
process.stdout.write(JSON.stringify(loadFixtureFromDir('./examples/delivery-fixture').fixture));
" > fixture.json

# verify over the wire
curl -sS -X POST http://127.0.0.1:8787/verify \
  -H "content-type: application/json" --data-binary @fixture.json

# same, plus the neutral evidence-class projection
curl -sS -X POST http://127.0.0.1:8787/peoples-court \
  -H "content-type: application/json" --data-binary @fixture.json

# liveness (carries the boundary banner too — even a probe quotes the boundary)
curl -sS http://127.0.0.1:8787/health
```

**Status codes (complete, fail-closed):**

| Code | When | Body (`status` / `decision`) |
|---|---|---|
| `200` | full gate holds | `VERIFIED` / `EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE` |
| `422` | fixture fails any check (F0–F3, E3–E5, B1–B3) — a rejected submission, not a server error | `REJECTED` / `FIXTURE_REJECTED` + per-check `FAIL` detail |
| `400` | body is not valid JSON — malformed input is rejected, never a 5xx | `REJECTED` + named error |
| `413` | body exceeds 1 MiB — rejected before parsing (declared `content-length` gate, and a streaming cap for chunked or lying senders) | `REJECTED` + named error |
| `429` | per-address in-memory rate limit exceeded (fixed window, default 120/min; `retry-after` header) | `REJECTED` + named error |
| `404` | unknown path or wrong method (e.g. `GET /verify`) | `REJECTED` + usage hint |

Every response — including `404` and `/health` — carries the headers
`x-dde-version: DDE/1` and `x-dde-boundary: DDE-BOUNDARY`, and the banner in
the body. `decision` vocabulary never extends beyond
`EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE` and
`FIXTURE_REJECTED`: no network path can decide conformity, adjudicate, or
authorize.

Two wire-specific honesty rules:

- **Consent replay (E5) reports `NOT_RUN` unless the caller injects an EVM
  adapter.** The endpoint makes zero outbound network calls; absent evidence
  is never upgraded over the wire.
- **`POST /peoples-court` marks `hashesManifest: NOT_EVALUATED_OVER_HTTP`.**
  Record pins are enforced by the file-based verifier against `hashes.json`;
  the endpoint verifies the records *as submitted*. The mark exists so no one
  can misread a wire report as pin verification.

For a **real** bilateral case (not the synthetic exercise): the
[real-fixture intake kit](../examples/real-fixture-intake/) provides the
bilateral consent template with a named disclosure scope (both parties sign
one `fixtureRef`; the gate enforces the scope's redaction cross-checks), the
removal checklist, and the conversion + submission procedure.

Hardening for a deliberate public bind (both fail-closed, both tested):

- **Rate limiting** — in-memory fixed window per direct peer address
  (default 120/min via `rateLimit: { windowMs, max }`; `false` disables it
  for platforms fronting their own). Keyed on `socket.remoteAddress` with no
  `X-Forwarded-For` trust — a spoofable header would forge identity.
  `/health` is exempt so floods can never lock out liveness probes. Responses
  carry `x-ratelimit-limit/remaining/reset`; the 429 carries `retry-after`.
  Memory is bounded: expired buckets drop on window rollover and the map
  sweeps past a size threshold.
- **Two-layer size gate** — a declared `content-length` over the cap is
  refused before any body byte is read; the 1 MiB streaming cap remains the
  truth for absent or lying declarations.

### Wire-level integration — a copy-ready payout gate

Any external platform (agent marketplace, escrow provider, settlement rails)
integrates in three lines: POST the fixture to `/verify` before releasing a
payout, and hold the release until the counterparty's criteria-based acceptance
record arrives. The snippet below is the canonical gate — the same shape the
reference consumer runs as a live five-scenario demo:

```js
// your platform, before releasing any payout:
import { loadFixtureFromDir } from "@coreguard/delivery/sdk"; // or build the fixture object yourself

const endpoint = process.env.DDE_ENDPOINT ?? "http://127.0.0.1:8787";

export async function payoutGate(fixture) {
  const res = await fetch(`${endpoint}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", connection: "close" },
    body: JSON.stringify(fixture),
  });

  // 200 = evidence VERIFIED · 422 = fixture REJECTED (checks name why)
  // 400/413/429 = submission-level rejections — never treat as "verified"
  const report = await res.json();
  const evidenceOk =
    res.status === 200 &&
    report.status === "VERIFIED" &&
    report.decision === "EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE";

  // Release is the COUNTERPARTY's criteria-based acceptance record —
  // never payment settlement, never execution success alone (F1/B1/B2).
  const counterpartyAccepted =
    fixture.acceptanceRecord?.verdict === "ACCEPTED" &&
    fixture.acceptanceRecord?.basis?.includes("CRITERIA_EVALUATION") &&
    Array.isArray(fixture.acceptanceRecord?.evaluations) &&
    fixture.acceptanceRecord.evaluations.length > 0;

  return evidenceOk && counterpartyAccepted
    ? { release: true, decision: report.decision }
    : { release: false, decision: report.decision, wire: res.status }; // HOLD
}
```

Behavior across the whole decision space (each row exercised live against a
running endpoint before it was written here):

| Fixture state | Wire | Gate |
|---|---|---|
| Delivery submitted, acceptance pending | `200 VERIFIED` | 🔒 HOLD |
| Counterparty rejects on a named criterion (`C-QUALITY`) | `200 VERIFIED` | 🔒 HOLD |
| Any artifact byte flipped → E3 names both hashes | `422 REJECTED` | 🔒 HOLD |
| Verdict flipped to `ACCEPTED` but `basis=["PAYMENT_SETTLED"]` | `422 REJECTED` (F1 kills payment-based acceptance) | 🔒 HOLD |
| Counterparty accepts on the same criteria | `200 VERIFIED` | ✓ RELEASE |

What the endpoint never returns: a conformity verdict. `decision` never exceeds
the two-word `EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE`,
and every response — including `429` and `404` — carries
`x-dde-boundary: DDE-BOUNDARY`, so even a rejection quote keeps the boundary
attached.

Reference consumer: `examples/agent-platform-integration/run-http-payout-gate.mjs`
holds a payout on wire reports — including a scenario rejection resting solely
on a failing acceptance criterion (`C-QUALITY`), which returns `200 VERIFIED`
while the platform's own gate stays closed. Evidence is admissible; conformity
is decided by the parties, never by this endpoint.

## 7. What this design deliberately does not do

- It does not judge who is right. Both positions survive verbatim.
- It does not let payment settle = acceptance, structurally.
- It does not treat a real signature as a real party.
- It does not decide remedies; it constrains them to a closed vocabulary.
- It does not replace escrow, arbitration, or law — it makes the record
  they would consume verifiable and complete.
