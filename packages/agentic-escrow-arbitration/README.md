# Agentic Escrow & Arbitration Layer Protocol (AEA/1)

The deterministic boundary record that ties a **verified ADAL/1 dispute
package** to an **escrow-contract reference interface** and a **tribunal
submission surface** — without crossing any execution boundary.

AEA/1 is the layer the ecosystem was missing: on-chain execution proves a
transfer happened; ADAL/1 freezes the dispute record; **AEA/1 names the escrow
contract a future deployment could implement, shapes the tribunal submission a
credential-holding integrator could send, and keeps every authority flag honest
(`NOT`)**. It does not execute, does not settle, does not call an API, and does
not claim an integration.

> Status note: **no escrow contract is deployed or signed** (`escrowRef
> deployed:false · chain:none`), **no live adapter exists**
> (`integrationStatus NOT_BUILT · networkCall NOT_PERFORMED`), and **no
> execution credential is held or claimed**. Governance CONDITIONAL NO-GO on
> signing/broadcast is unchanged. Any real deployment requires the owner's
> separate explicit sign-off.

---

## 1. Why an escrow & arbitration layer after a dispute package

An ADAL/1 package records **what the parties each claimed** and pins the
evidence. What it deliberately does not do is touch money: the award slot stays
`UNKNOWN`, the escrow reference stays `deployed:false`. AEA/1 adds the
**contract- and transport-shaped layer** — the record an integrator actually
needs to (a) name which contract interface escrows the obligated value, (b)
shape which tribunal submission packet the evidence maps to, and (c) keep the
settlement gate authority-bound and fail-closed.

One command produces the whole record: `npm run aea1:prepare`.

## 2. Auto-setup

```bash
npm install
```

## 3. One-command usage

```bash
npm run aea1:prepare -- --case <dir> --out <dir>
```

What it does, deterministically (no `Date.now()`, no randomness, no network):

1. **re-verifies the ADAL/1 dispute package** fail-closed (the package
   verifier must pass; a tampered or unverified package refuses before any
   output)
2. **derives the escrow-contract reference interface** (`escrow-interface.json`):
   deposit / lockForDispute / executeSettlement / refund, with the settlement
   gate "Award ≠ execution — execution requires a separately scoped
   authority-bound credential"
3. **shapes the tribunal submission surface** (`aea1-boundary.json` →
   `adapter` section): structural template for the documented tribunal
   surface, `networkCall: NOT_PERFORMED`, `consumers: []`
4. **pins every emitted file** (`aea1-hashes.json`, self-excluded), then
   **re-verifies its own output** (12 invariants A1–A10)

Exit codes (fail-closed):

- `0` `AEA1_BOUNDARY_READY` — dispute package verified, boundary record built,
  pinned, and self-verified
- `1` fail-closed (package verification, artifact verification, or a boundary
  invariant failed — nothing usable is emitted)
- `2` usage error (missing `--case`, `--out` equal to the case dir, or the
  out dir holds foreign files)

## 4. The boundary record (all inside `aea1-boundary.json`)

| Field | Value | Meaning |
|---|---|---|
| `protocolVersion` | `AEA/1` | protocol identity |
| `packageRevision` | SHA-256 pin | binds to the exact verified ADAL/1 package |
| `escrow.kind` | `REFERENCE_INTERFACE` | contract interface target, not a deployment |
| `escrow.deployed` | `false` | no contract is deployed or signed |
| `escrow.chain` | `"none"` | no chain is named |
| `award.status` | `UNKNOWN` | CoreGuard never fills the award slot |
| `award.adjudicator` | `NONE` | no adjudicator record exists |
| `settlement.authorizationStatus` | `NOT_AUTHORIZED` | no settlement authority |
| `settlement.funds` | `NONE_MOVED` | no fund movement is claimed |
| `adapter.integrationStatus` | `NOT_BUILT` | structural template only |
| `adapter.networkCall` | `NOT_PERFORMED` | no live call, no credential, no submission |

## 5. What AEA/1 does NOT do (binding, self-verified)

- Does **not** adjudicate: award slot `UNKNOWN`, adjudicator `NONE` — a genuine
  award is an external adjudicator's signed reason over the package bytes.
- Does **not** settle: `authorizationStatus NOT_AUTHORIZED`, funds `NONE_MOVED`,
  no credential held, nothing broadcast.
- Does **not** call an API: `networkCall NOT_PERFORMED`; a credential-holding
  integrator performs the live step off this record's shape.
- Does **not** deploy an escrow contract: `deployed:false · chain:none`; real
  deployment needs the owner's separate decision (governance CONDITIONAL NO-GO
  unchanged).

## 6. SDK API

```js
import { prepareAea1, verifyAea1 } from "@coreguard/agentic-escrow-arbitration";

const r = prepareAea1({ caseDir: "path/to/delivered-package", outDir: "path/to/out" });
// r.ok · r.stage ("aea1-ready") · r.boundary · r.escrowInterface · r.report · r.hashes

const v = verifyAea1(outDir); // { ok, checks, failures }
```

## 7. Files

| File | Role |
|---|---|
| `packages/agentic-escrow-arbitration/sdk.mjs` | AEA/1 SDK (`prepareAea1`, `verifyAea1`) |
| `packages/agentic-escrow-arbitration/cli.mjs` | one-command CLI (`npm run aea1:prepare`) |
| `packages/agentic-escrow-arbitration/schemas/aea1-boundary.schema.json` | JSON Schema for the boundary record |
| `test/delivery/agentic-escrow-arbitration.test.js` | fail-closed + determinism + boundary tests (8) |
| `docs/agentic-escrow-arbitration-standard.md` | this protocol spec (AEA/1) |