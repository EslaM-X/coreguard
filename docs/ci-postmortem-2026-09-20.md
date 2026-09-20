# CI Postmortem & Red-Run Closure Register — 2026-09-20

> **Purpose.** Every red workflow run on `EslaM-X/coreguard`, root-caused from
> actual run logs, mapped to its fix commit and its permanent guard. This is the
> record a reviewer reads when they see red history — it proves the repo treats
> every red run as a closed incident, not a forgotten failure.
>
> **Honesty rules.** Log evidence is quoted verbatim. No run was rewritten or
> deleted (GitHub has no API for that, and re-running executes the identical
> commit tree). "Closed" means: root cause known, fix landed, permanent guard in
> place, current main green.

## The 5 jobs sent for resolution — verdict per job

| Job | Run @ commit | Failing step | Root cause (verbatim) | Fix commit | Class |
|---|---|---|---|---|---|
| `106025302128` (Engine 18) | 35490813895 @ `7bbd731` | `Run npm ci` | `npm error code EUSAGE ... Missing: @coreguard/pricing@0.1.0 from lock file` | `835999d` | A |
| `106025301943` (Demos) | 35490813895 @ `7bbd731` | `Run npm ci` | `npm error code EUSAGE ... Missing: @coreguard/pricing@0.1.0 from lock file` | `835999d` | A |
| `106025297518` (DDE) | 35490813823 @ `7bbd731` | `Run npm ci` | `npm error code EUSAGE ... Missing: @coreguard/pricing@0.1.0 from lock file` | `835999d` | A |
| `102754131715` (Engine 22) | 34440426922 @ `41ed0b4` | `actions/setup-node` (cache) | `##[error]Dependencies lock file is not found ... Supported file patterns: package-lock.json,npm-shrinkwrap.json,yarn.lock` | lockfile added `8567f79`; **guard closed in this change** | H |
| `102754131738` (Demos) | 34440426922 @ `41ed0b4` | `actions/setup-node` (cache) | `##[error]Dependencies lock file is not found ...` | same | H |

> Why they cannot be re-run green: at `7bbd731` no lockfile entry exists for
> `@coreguard/pricing` (re-run = same EUSAGE); at `41ed0b4` no lockfile exists
> at all (re-run = same setup-node failure). The engineering fix is the closure
> guard, not a cosmetic re-run.

## The complete register (24 runs, 2 workflows, 2026-09-10 → 2026-09-20)

### Class A — workspace/lockfile drift (`npm ci` EUSAGE) — 3 runs

| Run | Commit | Error |
|---|---|---|
| 35478251772 | `b59bd1b` | `Missing: @coreguard/delivery@... from lock file` |
| 35490813895 | `7bbd731` | `Missing: @coreguard/pricing@0.1.0 from lock file` (2 jobs) |
| 35490813823 | `7bbd731` | `Missing: @coreguard/pricing@0.1.0 from lock file` |

Fixes: `c7e7067` (delivery), `835999d` (pricing, `package-lock.json` +12).
Guard: `scripts/check-lock-sync.mjs` + `test/ci/lock-sync.test.js`, and since
2026-09-20 it runs **before** `actions/setup-node` (also closes Class H).

### Class B — `node --test` glob no-match on Node 18/20 — 1 run

| Run | Commit | Error |
|---|---|---|
| 34440482123 | `8567f79` | `Could not find '/home/runner/work/coreguard/coreguard/test/canonicalization/*.test.js'` |

Quoted glob arg is not expanded by Node 18/20 `node --test`. Fix: `164c77b`
"cross-version test runner (Node 18/20/22 compat)". Guard: `npm test`
script points at resolved test dirs/files; the glob quirk is recorded in
AGENTS.md.

### Class C — WebCrypto global absent on Node 18 — 1 run

| Run | Commit | Error |
|---|---|---|
| 34440557041 | `164c77b` | `not ok 9 - domainHash ... ERR_TEST_FAILURE ... 'crypto is not defined'` |

Fix: `6efd636` "use node:crypto sha256 — WebCrypto global unavailable on
Node 18". Guard: code imports `node:crypto`; matrix keeps Node 18/20/22.

### Class D — zero-jobs trap (unparseable workflow YAML) — 6 runs

| Run | Commit | Signature |
|---|---|---|
| 34549480446 | `5162c10` | run builds 0 jobs ("log not found") |
| 34549595231 | `19e8e8f` | same |
| 34549695569 | `3e9a289` | same |
| 34549782695 | `95de625` | same |
| 34551602132 | `37c8b3a` | same |
| 35480761761 | `6c4ca1d` | same |

Root cause (verbatim from the committed files): a plain (non-block) multi-line
`run:` scalar containing `': '` — `console.error('receiptId mismatch: '...)`
(09-11 era, ci.yml line 54) and `startDeliveryEndpoint({ port: 0 })` (6c4ca1d)
— fails PyYAML with "mapping values are not allowed here"; GitHub then builds
**zero jobs** and marks the run `failure` with no logs.
Fixes: `run: |` block scalars (landed by `9deeda2` for the 09-11 batch; the
DDE split after `6c4ca1d`). Guard: `scripts/check-workflows.mjs` +
`test/ci/workflows.test.js`, run in CI before `npm ci`.

### Class E — Solidity stack-too-deep (forge build) — 1 run

| Run | Commit | Error |
|---|---|---|
| 34954020459 | `e3b70a8` | `Error: Compiler error (/solidity/libsolidity/codegen/LValue.cpp:51): Stack too deep. ... try removing local variables.` |

Fix: `51a5069` "fix EvidenceRegistryV2 forge gate — stack-too-deep + expectRevert
ordering". Guard: `forge build` + `forge test` in CI (contracts job green).

### Class F — mojibake encoding hygiene — 5 runs

| Run | Commit | Error |
|---|---|---|
| 35324679195 | `3a7ca37` | `not ok 141 - no double-encoded (mojibake) sequences in tracked text` |
| 35324933315 | `83ac866` | same |
| 35326319740 | `9ad7843` | same |
| 35326547879 | `c896cec` | same |
| 35344020066 | `a499cf4` | same |

Root cause: JSON artifacts written by PowerShell 5.1 under ANSI/CP1252
(corrupting em-dashes) — the AGENTS.md mojibake generator trap. Fix: repairs
via Node (freeze 4.2.4/4.2.6 sessions). Guard: encoding-hygiene test inside
`npm test` (fails on any C3/C2 high-byte sequence).

### Class G — receiptId fixture mismatch (offline recompute) — 1 run

| Run | Commit | Error |
|---|---|---|
| 34551945395 | `9deeda2` | Demos "Offline commitment recompute" step: `receiptId mismatch: 0x9ad913f3...` (expected fixture `0xd4ddd022...`) |

Closed by the canonical proofId/anchor alignment during 2026-09-11 → 2026-09-15
(`da0a578`, `ec8cc0a`, `c4de914`, `0980e1a`); the frozen fixture
`0xd4ddd02204f55662ef7db62b7a720c7e8dbff8d92a1cc621df22cf1b5dc22627` has
matched ever since. Guard: the CI offline-recompute step compares against that
fixture and hard-fails on mismatch.

### Class H — setup-node cache, lockfile absent — 1 run (the 41ed0b4 red)

| Run | Commit | Error |
|---|---|---|
| 34440426922 | `41ed0b4` | `##[error]Dependencies lock file is not found ... Supported file patterns: package-lock.json,npm-shrinkwrap.json,yarn.lock` |

Root cause: bootstrap-era commit shipped no `package-lock.json` while
`setup-node` used `cache: npm`. The failure happens **inside setup-node, before
any post-setup-node guard**.
Fix then: `8567f79` added the lockfile.
**Fix now (this change, 2026-09-20):** the lock-sync guard now runs **before**
`actions/setup-node` in Engine, Demos and DDE, and `check-lock-sync.mjs` returns
a clear `no package-lock.json in repo root — commit one before CI can npm ci`
(reason + per-workspace rows) instead of a raw ENOENT. Regression coverage:
`test/ci/lock-sync.test.js` "checkLockSync fails closed ... when package-lock.json
is absent (class H)".

### Class I — unlinked workspace fetched from registry (npm E404) — 1 run

| Run | Commit | Error |
|---|---|---|
| 35065081543 | `377c0e4` | `npm error code E404` (npm tried to fetch unpublished `@coreguard/verifier-c`) |

Fix: `e879280` added `packages/verifier-c/package.json` so npm ci links the
workspace. Guard: lock-sync guard fails on any declared-but-unlinked workspace.

### Class J — verifier-c python version pin Dec-C-9 — 1 run

| Run | Commit | Error |
|---|---|---|
| 34921077465 | `4cdbf4c` | `Error: verifier-c: python version pin violation (Dec-C-9): got 3.12.3, expected ^3.14` |

Fix: `8a66816` "install Python 3.14 and bump actions to v7". Guard: Engine job
pins `actions/setup-python@v7 python-version: '3.14'` before the C-verifier
tests.

### Class K — signer-auth verdict `PASS !== FAIL` — 1 run

| Run | Commit | Error |
|---|---|---|
| 34665305319 | `fe0e450` | `test/p1/signer-auth-verifier.test.js:90 ... Expected values to be strictly equal: 'PASS' !== 'FAIL'` |

Closed by the 09-12 EIP-1271 authorization/provenance wave
(`cdcc43e`, `87df335`, `e479caa`). Guard: the EIP-1271 + signer-auth suites run
in `npm test`.

### Class L — anchored record did not exit 0 — 1 run

| Run | Commit | Error |
|---|---|---|
| 35348614243 | `21da1e2` | `not ok 697 - contract: current anchored record -> exit 0` |

Closed by the commit-anchored freeze discipline (`0dde0d7` "disk mode must read
the disk for re-pinned files"). Guard: `validate-freeze.mjs` hashes `git show
<gitCommit>:<path>` blobs, and --disk runs are branded "not evidence".

### Class M — postCommitRePins honesty — 1 run

| Run | Commit | Error |
|---|---|---|
| 35398048308 | `7e29d3a` | `not ok 707 - boundary: every postCommitRePins entry is honest vs its declared commit` |

Closed by honest re-pin entries (`0dde0d7`, `84e15a7`). Guard: the boundary
honesty test in `test/verifier-c/validate-freeze.test.mjs` (any stale/duplicate
re-pin entry fails).

## Current posture (verified 2026-09-20)

- `npm test` 851 + 1 (class-H regression) = **852/852**.
- Both guard scripts pass (`check-lock-sync.mjs`, `check-workflows.mjs`) and are
  wired into CI + DDE: the lock-sync guard **before** setup-node, the workflow
  parser before `npm ci`.
- CI + DDE + Pages green on `649114e`; HEAD == origin/main.
- Any future instance of classes A/D/I fails at the guard step with a readable
  message naming the fix — never as a cryptic npm dump or a zero-jobs run.