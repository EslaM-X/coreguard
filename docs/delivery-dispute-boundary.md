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

No terminal? Each command above runs in the published page with no server and no clone — try it live: [verify](https://eslam-x.github.io/coreguard/DDE-API-REFERENCE.html#run=honest) · [peoples-court](https://eslam-x.github.io/coreguard/DDE-API-REFERENCE.html#run=peoples-court) · [health](https://eslam-x.github.io/coreguard/DDE-API-REFERENCE.html#playground) — and the page deep-links every wire scenario in the table (`#run=tamper`, `#run=badjson`, `#run=oversize`, `#run=ratelimit`, `#run=notfound`).

Prefer to *see* the wire contract before running anything? The published
[DDE-API-REFERENCE page](https://eslam-x.github.io/coreguard/DDE-API-REFERENCE.html)
embeds the real DDE/1 handler and captures every status code below live in your
browser tab — plus an external-probe box you can point at any running endpoint.
For a shareable one-page summary of this whole section (drop-in link for
discussions and social posts), see
[INTEGRATION.md](https://github.com/EslaM-X/coreguard/blob/main/INTEGRATION.md)
— its runnable fences execute in CI against the live endpoint.

**Status codes (complete, fail-closed):**

| Code | When | Body (`status` / `decision`) |
|---|---|---|
| `200` | full gate holds | `VERIFIED` / `EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE` |
| `422` | fixture fails any check (F0–F3, E3–E5, B1–B3) — a rejected submission, not a server error | `REJECTED` / `FIXTURE_REJECTED` + per-check `FAIL` detail |
| `400` | body is not valid JSON — malformed input is rejected, never a 5xx | `REJECTED` + named error |
| `413` | body exceeds 1 MiB — rejected before parsing (declared `content-length` gate, and a streaming cap for chunked or lying senders) | `REJECTED` + named error |
| `429` | per-address in-memory rate limit exceeded (fixed window, default 120/min; `retry-after` header) | `REJECTED` + named error |
| `403` | peer socket address not on the `allowAddresses` list (guard only fires when the operator configures the list; `/health` gated too) | `REJECTED` + named error |
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

Hardening for a deliberate public bind (three fail-closed guards, all tested):

- **Rate limiting** — in-memory fixed window per direct peer address
  (default 120/min via `rateLimit: { windowMs, max }`; `false` disables it
  for platforms fronting their own). Keyed on `socket.remoteAddress` with no
  `X-Forwarded-For` trust — a spoofable header would forge identity.
  `/health` is exempt so floods can never lock out liveness probes. Responses
  carry `x-ratelimit-limit/remaining/reset`; the 429 carries `retry-after`.
  Memory is bounded: expired buckets drop on window rollover and the map
  sweeps past a size threshold.
- **Address allowlist** — for a deliberate public bind, pass
  `allowAddresses: ["127.0.0.1", "::1", …]` (to either start function): any
  other peer socket address is refused with **403 before the rate limiter** —
  a rejected peer never consumes budget — and `/health` is gated too, so an
  unlisted address learns nothing, not even liveness. IPv4-mapped IPv6
  collapses to plain IPv4 (`::ffff:127.0.0.1` ≡ `127.0.0.1`), so a dual-stack
  loopback matches either spelling. Keys on the direct peer only — put your
  proxy's address on the list, never trust forwarded headers. Omit the option
  → no filtering (default loopback-bind posture).
- **Two-layer size gate** — a declared `content-length` over the cap is
  refused before any body byte is read; the 1 MiB streaming cap remains the
  truth for absent or lying declarations.

### Wire-level integration — a copy-ready payout gate

Any external platform (agent marketplace, escrow provider, settlement rails)
integrates in three lines: POST the fixture to `/verify` before releasing a
payout, and hold the release until the counterparty's criteria-based acceptance
record arrives. The snippet below is the canonical gate — the same shape the
reference consumer runs as a live nine-scenario wire demo (mutual acceptance, a
later dispute that freezes the payout, a closure claim rejected as unproven,
and release only once the closed record is established by `closedAtUtc`):

**Copy-ready hardening** — to arm the third guard from the start, hand the
allowlist to the same start one-liner:

```bash
# the loopback bind is already its own guard; arm the list when the bind must
# deliberately widen (public/private interface) or to pin a proxy's address:
node --input-type=module -e "import { startDeliveryEndpoint } from './packages/delivery/http.js'; const server = await startDeliveryEndpoint({ port: 8787, allowAddresses: ['127.0.0.1', '::1'] }); console.log('DDE endpoint (allowlisted) on :8787 —', server.address());"
```

The list keys on the **direct peer** socket address: everyone not on it gets
`403` before the rate limiter — `/health` gated too (an unlisted address
learns nothing, not even liveness), and a rejected peer never consumes
rate-limit budget. IPv4-mapped IPv6 collapses to plain IPv4, so a dual-stack
loopback matches either spelling. Behind a reverse proxy, pin the proxy's
source address — never read forwarded headers (see the proxy posture below).

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
while the platform's own gate stays closed. Post-acceptance, a later dispute
freezes the escrow (`DISPUTE_OPEN`), a declared closure without evidence is
refused (`422` — closure is established by `closedAtUtc`, never declared), and
only a procedure-closed record releases funds. Evidence is admissible; conformity
is decided by the parties, never by this endpoint.

### Running behind a reverse proxy — production posture

All three guards key on the **direct peer** — the socket address that connected
to the Node process. Behind nginx/Caddy/Traefik/a cloud LB that peer is always
the proxy, so the guards' meaning changes. The posture below keeps every
fail-closed property intact; skip it and you get the two classic mistakes:
one shared rate bucket for all your visitors (one heavy client locks everyone
out), or an allowlist that either passes everything or nothing. The nginx
directives shown are verified against the official `ngx_http_limit_req_module`
and core-module documentation (zone/burst/nodelay syntax, `client_max_body_size`
default of 1m); adapt names to your proxy if it is not nginx.

**The five rules:**

1. **Client-differentiated limits live at the proxy, not the app.** The app
   cannot do them honestly — it must not read `X-Forwarded-For` (contract-tested:
   forged headers cannot mint identity, for the limiter and the allowlist
   alike). The proxy applies its own per-client rate limiting keyed on what
   *it* believes the client is:

   ```nginx
   # rate-limit real clients at the edge (the app cannot — it keys on the
   # socket peer, which is this proxy)
   limit_req_zone $binary_remote_addr zone=dde:10m rate=10r/s;
   server {
     listen 443 ssl;
     location / {
       limit_req zone=dde burst=20 nodelay;
       client_max_body_size 1m;              # keep the edge cap ≤ the app's 1 MiB
       proxy_pass http://127.0.0.1:8787;
       proxy_set_header Host $host;
       # X-Forwarded-For may be set for downstream LOGGING — the app ignores it
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
     }
   }
   ```

2. **Bind the app to loopback only.** The default `host: "127.0.0.1"` stays —
   never `0.0.0.0` "behind a proxy": that recreates a public bind whose guards
   key on the wrong peer. The app is reachable only through the proxy.

3. **Allowlist = pin the proxy's source address(es).** With the proxy on the
   same host, `allowAddresses: ["127.0.0.1"]` means the app accepts traffic
   from the proxy alone — a briefly misexposed port is still gated. On a
   private network, list the proxy hosts' addresses. (They all share one
   verdict: the proxy is the front door by design.)

4. **The in-process rate limiter becomes a backstop, not the primary limiter.**
   Size it above the proxy's per-client ceiling (e.g. `rateLimit: {
   windowMs: 60_000, max: 600 }` for a 10 r/s edge limit) so it only fires on
   aggregate floods or a misconfigured proxy. Do **not** disable it
   (`rateLimit: false`) unless something in front always limits — the
   in-process budget is the last line of defense.

5. **Keep the body caps aligned.** `client_max_body_size` (or your proxy's
   equivalent) ≤ the app's 1 MiB cap, so oversized bodies die at the edge and
   the app's two-layer gate remains the truth for anything that slips through.

**Production settings at a glance:**

| Setting | Direct bind (default) | Behind a reverse proxy |
|---|---|---|
| `host` | `127.0.0.1` | `127.0.0.1` (proxy on same host) or a private interface — never `0.0.0.0` |
| `rateLimit` | `120/min` per real client | backstop per proxy, sized **above** the proxy's per-client ceiling (e.g. 600/min); primary limiting at the edge |
| `allowAddresses` | omit — the loopback bind *is* the guard | pin the proxy's source address(es) — containment for a misexposed port |
| body cap | 1 MiB (two layers) | 1 MiB, with the edge cap ≤ 1 MiB so oversize dies at the proxy |
| TLS | out of scope (loopback) | terminated at the proxy; the app speaks plain HTTP over loopback/private net |

**Copy-ready production start** — the proxy posture as one verified line:

```bash
# proxy front door: pin the proxy's source address, size the in-process
# limiter ABOVE the proxy's per-client edge ceiling (edge 10 r/s → backstop 600/min)
node --input-type=module -e "import { startDeliveryEndpoint } from './packages/delivery/http.js'; const server = await startDeliveryEndpoint({ port: 8787, allowAddresses: ['127.0.0.1'], rateLimit: { windowMs: 60000, max: 600 } }); console.log('DDE endpoint (proxy posture) on :8787 —', server.address());"
```

The limiter keys on the proxy (the direct peer), so its `x-ratelimit-*`
headers read as the backstop budget — `x-ratelimit-limit: 600` on every
response is the proof the posture took. Per-client limiting lives at the
edge (`limit_req`), the app ignores forwarded headers by contract, and the
allowlist is the containment layer for a misexposed port.

**Backups and recovery.** The endpoint is stateless by design: no database, no
persisted fixtures, rate-limit state is per-process memory. There is nothing
to back up at the app layer. Back up instead: (1) the **reverse-proxy config**
— it carries the real client-identity and edge-limit policy, which is the part
that cannot be reconstructed from this repo; (2) any fixtures *you* submitted
are yours — the endpoint keeps nothing. A process restart resets rate budgets
(fail-safe: it briefly trusts more); behind the recommended proxy backstop
that window is bounded and invisible. Proxy upstream health checks should
target `/health` — it is exempt from the rate limiter and returns the boundary
banner; remember the exemption is per-endpoint: `/health` free does not mean
`/verify` free.

**Never do (ops edition):** bind `0.0.0.0` and rely on the app guards as if
the peer were the client · make the app read forwarded headers to "fix"
per-client limiting (the contract forbids it — the fix is at the proxy) ·
publish the app's port alongside the proxy's · point untrusted third parties
at the app behind the proxy: the proxy **is** the front door, and every app
side guard assumes the door is the proxy.

## 7. What this design deliberately does not do

- It does not judge who is right. Both positions survive verbatim.
- It does not let payment settle = acceptance, structurally.
- It does not treat a real signature as a real party.
- It does not decide remedies; it constrains them to a closed vocabulary.
- It does not replace escrow, arbitration, or law — it makes the record
  they would consume verifiable and complete.

## 8. Using the one-page integration summary as a ready reply

[INTEGRATION.md](https://github.com/EslaM-X/coreguard/blob/main/INTEGRATION.md)
(repo root) is the public-facing compression of this document: the boundary
quote, the ten checks, the runnable fixture, the endpoint, the release law,
and the People's Court projection — one page, absolute links. Its runnable
fences are members of the doc-curl contract, so the page cannot drift from
the wire: CI executes every command in it on every push.

**How to use it in discussions (elizaOS) and on X:**

1. **Lead with the link and the boundary sentence** — the quote *is* the
   argument; everything else on the page is its proof.
2. **Offer the three-command reproduction** (clone → verify → tamper) to any
   technical reviewer: it runs with Node alone, no install, and ends in
   `VERIFIED` then a fail-closed exit 1.
3. **For platform integrators**, point at the one-command scaffold
   (`create:integration --dde`) and the two-line SDK gate — not at this
   document; they want the surface, not the theory.
4. **For a real bilateral failure**, the only correct intake is the neutral
   procedure's own intake (peoplescourt.ai/request-demo). CoreGuard preserves
   the record; it does not run the procedure and must never be presented as
   doing so.
5. **Copy-paste the short version** at the page's end rather than writing a
   new summary — it is already claim-checked and encoded so nothing breaks
   on paste.

**Claim discipline when replying** (each has bitten public projects before):
never present the synthetic fixture as a real dispute (`realDisputeExists:
false` is structural); never describe the `OWNER-DECLARED` execution
placeholder as verified; never state or imply endorsement by People's Court /
Epistemic Labs; and quote the success shape exactly —
`VERIFIED · EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE` —
not a paraphrase of it.

Ready-to-paste reply:

```text
CoreGuard DDE: execution proof never decides delivery conformity. Ten
fail-closed checks; a flipped artifact byte fails closed; payout opens only
on a signed party acceptance over explicit criteria — never on a receipt.
One-page integration (every command CI-executed):
https://github.com/EslaM-X/coreguard/blob/main/INTEGRATION.md
Live engine, in-page: https://eslam-x.github.io/coreguard/DDE-API-REFERENCE.html
```
