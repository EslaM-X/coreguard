# Boundary enforcement — the "we will not claim" table, as code

The project's honesty contract is usually stated as a list of what we do NOT
claim (no live integration, no settlement authority, no Mainnet broadcast, no
credential held). This document describes the **machine-enforced version** of
that table: a fail-closed audit that refuses a violation anywhere in the
working tree — including in CI.

The rules below are the *enforcement* of the boundary rows in
`docs/evidence-dossier-2026-09.md` and `docs/funding-one-pager-2026-09.md`.

## What the audit refuses (fail-closed, exit 1)

| Check | Refuses | Why it matters |
|---|---|---|
| B1 / SECRETS | credential-like material: PEM private keys, labeled private keys/seed phrases/mnemonics, AWS keys, generic API tokens, Google keys, GitHub tokens, JWTs, npm tokens | "no credential of any party is held in this repo" stops being a promise and becomes a scan result |
| B2 / netcall | any `networkCall` value other than `NOT_PERFORMED` in an emitted JSON | the "no live call" invariant can no longer silently flip |
| B2 / integration | any `integrationStatus` outside `{NOT_BUILT, DRY-RUN, NOT_AUTHORIZED, UNKNOWN}` | a status cannot quietly become `LIVE` or `CONFIRMED` in a file |
| B2 / award-slot | any `awardSlot.status` other than `UNKNOWN` | CoreGuard never prefills or authorizes an award |
| B3 / exec-req | execution-request fields (`deployed`, `broadcast`, `releaseFunds`, `released`, `settled`, `settlementExecuted`, `executed`, `transferExecuted`) set to `true`/`executed`/… | the settlement/broadcast boundary is enforced structurally, not just in prose |

Matched content is never echoed — the report names the path, check id, and a
redacted SHA-256 prefix only.

## Exclusions (reported, never silent)

- `.git`, `node_modules` — repository mechanics and third-party dependency
  copies.
- `legacy-quarantine/**` — quarantined legacy broadcast/private-key scripts
  that must stay byte-identical to their originals by contract. The audit
  proves the exclusion applies; reinstating such scripts into live roots is
  refused by other gates.
- Local environment secret files (basename `/^\.env(\.|$)/` except
  `*.example`) — untracked local secrets are out of scan scope *by design*,
  and a companion guard asserts git never tracks such a file. A real secret in
  an `.env.example` is still caught.

## Where it runs

- Standalone: `npm run boundary:audit` (defaults to the repository root;
  `--root <dir>` for a targeted scan, `--out <report.json>` to pin the report).
- Enforced in the suite via `test/ci/boundary-enforcement.test.js` (auto-picked
  by `npm test`): it asserts the clean tree passes, that planted violations —
  a private key, `deployed: true`, `networkCall: PERFORMED`, a filled
  `awardSlot` — are refused, that the exclusions hold, that `git` never tracks
  a local env secret, and that the report is byte-deterministic.

## The honest boundary of this boundary

This layer proves the repository **cannot silently claim** — it does not, by
itself, create a live integration, an award, or settlement authority. Those
remain `DRY-RUN` / `NOT_AUTHORIZED` until an L1–L3 step is recorded by a
credential-holding integrator under an explicit owner decision (see
`docs/execution-kit-integrator-2026-09.md`). What it adds is that every future
emission that pretends otherwise is mechanically refused.