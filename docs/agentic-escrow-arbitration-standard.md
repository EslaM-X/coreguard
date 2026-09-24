# Agentic Escrow & Arbitration Layer Protocol (AEA/1)

> The deterministic boundary record tying a **verified ADAL/1 dispute
> package** to an **escrow-contract reference interface** and a **tribunal
> submission surface** — without crossing any execution boundary.
>
> **Status: protocol design and reference implementation inside this repo.**
> No escrow contract is deployed or signed, no live adapter exists, no
> execution credential is held or claimed. Governance CONDITIONAL NO-GO on
> signing/broadcast is unchanged. This is the integration-ready *shape*, not an
> integration.

---

## 1. Why a third layer

- On-chain execution proves a transfer happened (**CGEP/1 / receipt**).
- A dispute package freezes what the parties each claimed (**ADAL/1**).
- **AEA/1 names the escrow contract a future deployment could implement,
  shapes the tribunal submission a credential-holding integrator could send,
  and keeps every authority flag honest (`NOT`).**

It is the layer connectors build against: a contract author reads
`escrow-interface.json`; an integrator reads the `adapter` template in
`aea1-boundary.json`; a verifier reads `aea1-hashes.json`.

## 2. Structured layers (inside `aea1-boundary.json`)

| Key | Value | Who may change it |
|---|---|---|
| `packageRevision` | SHA-256 pin of the verified dispute package | no one (pinned) |
| `escrow` | `REFERENCE_INTERFACE · deployed:false · chain:"none"` | owner decision only |
| `award` | `UNKNOWN · adjudicator NONE` | ONLY an external adjudicator |
| `settlement` | `NOT_AUTHORIZED · funds NONE_MOVED` | credential-holding integrator, separate scope |
| `adapter` | `NOT_BUILT · networkCall NOT_PERFORMED` | integrator, not CoreGuard |

## 3. One-command usage

```bash
npm run aea1:prepare -- --case <dir> --out <dir>
# or directly:
node packages/agentic-escrow-arbitration/cli.mjs --case <dir> --out <dir>
```

Fail-closed exit codes:

- `0` `AEA1_BOUNDARY_READY` — package verified, boundary record built, pinned,
  self-verified (12 invariants A1–A10)
- `1` any stage failed — nothing usable is emitted
- `2` usage error

## 4. Mandatory rules (verified fail-closed)

1. **Package must re-verify.** `prepareAea1` re-runs the ADAL/1 dispute-package
   verifier against the exact delivered bytes; a tampered or unverified package
   refuses before any output.
2. **Escrow is reference-only.** `escrow.deployed === false`, `escrow.chain ===
   "none"`, `escrow.kind === "REFERENCE_INTERFACE"`. No contract, no signing, no
   broadcast.
3. **Award slot never prefilled.** `award.status === "UNKNOWN"`, adjudicator
   `"NONE"`, `signedReasonedAward === null`.
4. **No settlement authority.** `settlement.authorizationStatus ===
   "NOT_AUTHORIZED"`, `settlement.funds === "NONE_MOVED"`.
5. **No live adapter.** `adapter.integrationStatus === "NOT_BUILT"`,
   `adapter.networkCall === "NOT_PERFORMED"`, `consumers === []`.
6. **Settlement gate is authority-bound.** `escrow-interface.json` states the
   documented tribunal rule verbatim: *Award ≠ execution*; execution requires a
   separately scoped settlement-adapter credential.
7. **Determinism.** No `Date.now()`, no randomness, no network; two runs are
   byte-identical; every file is SHA-256 pinned in `aea1-hashes.json`
   (self-excluded).

## 5. What AEA/1 does NOT do (binding)

- Does **not** adjudicate: the award slot stays `UNKNOWN`; a genuine award is an
  external adjudicator's signed reason over the package bytes.
- Does **not** settle: `NOT_AUTHORIZED`, funds `NONE_MOVED`, no credential held,
  nothing broadcast.
- Does **not** call any API: `networkCall NOT_PERFORMED`; a credential-holding
  integrator performs the live step.
- Does **not** deploy an escrow contract. A real deployment requires the
  owner's separate explicit decision.

## 6. SDK API

```js
import { prepareAea1, verifyAea1 } from "@coreguard/agentic-escrow-arbitration";

const r = prepareAea1({ caseDir: "…/reference-A", outDir: "…/out" });
// r.ok · r.stage ("aea1-ready") · r.boundary · r.escrowInterface · r.report · r.hashes

const v = verifyAea1("…/out"); // { ok, checks, failures }
```

## 7. Files

| File | Role |
|---|---|
| `packages/agentic-escrow-arbitration/sdk.mjs` | AEA/1 SDK (`prepareAea1`, `verifyAea1`) |
| `packages/agentic-escrow-arbitration/cli.mjs` | one-command CLI (`npm run aea1:prepare`) |
| `packages/agentic-escrow-arbitration/schemas/aea1-boundary.schema.json` | boundary-record JSON Schema |
| `test/delivery/agentic-escrow-arbitration.test.js` | fail-closed + determinism + honesty tests (8) |
| `docs/agentic-escrow-arbitration-standard.md` | this protocol spec (AEA/1) |