# WS-NPM — npm Publishability Workstream (reference record)

> Status of this document: records owner-approved decisions for WS-NPM.
> **npm publish remains NO-GO / NOT-YET-AUTHORIZED.** GitHub/source release and
> npm publish are two INDEPENDENT decisions.

## Status

| WS-NPM-1 phase | Status |
|---|---|
| Diagnose (audit) | PASS |
| Verifier-C / test registration | CLOSED |
| Publishability architecture (Phase B) | GO (executed, gate pending) |
| Clean-clone publishability gate | EXIT GATE of Phase B |
| Real npm publish | NO-GO / NOT YET AUTHORIZED |
| GitHub/source release | INDEPENDENT (unaffected) |
| Publish pipeline | AFTER clean-clone gate |

## Audit findings (WS-NPM-1, PASS)

- npm view 404 for `@coreguard/*` is **not a bug** — they have never been
  published. The real defect proven by the audit: packages are **not standalone
  publishable** (40+ sibling relative imports that cross package boundaries).
- `npm publish --dry-run --workspace=@coreguard/execution --access public`
  succeeds trivially — dry-run output does **not** prove installability.
- `workspace:*` is **rejected** as a mechanism. `npm install` with `workspace:*`
  ranges behaves differently across package managers, and npm refuses
  `workspace:` ranges inside a published tarball.

## Public / Internal split (APPROVED)

### PUBLIC — 13 packages
`canonical`, `evm`, `crypto`, `trace`, `evidence`, `policy`, `replay`,
`provenance`, `intent`, `firewall`, `execution`, `verifier`, `sdk`

### INTERNAL — 3 + root
`cli` (internal tool; keeps repo-relative imports), `independent-verifier`
(`private: true`), `verifier-c` (no manifest; spec: release NOT authorized),
root `coreguard` (`private: true`).

`crypto` and `replay` previously had **no package.json** — they gained real
manifests because `verifier` depends on them (graph integrity).

## Dependency graph (DAG, no cycles) — leaf-first publish order

```
L0  canonical, evm
L1  crypto, trace, evidence, policy, replay, provenance
L2  intent, firewall, execution, verifier
L3  sdk
```

Edges (source → target):

```
evidence  → canonical          trace     → canonical        policy → canonical
crypto    → canonical          replay    → canonical        provenance → canonical (+ optional @coreguard/evm)
intent    → canonical, provenance
firewall  → canonical, policy
execution → canonical, intent, trace, evidence
verifier  → canonical, policy, trace, crypto, replay
sdk       → canonical, intent, provenance
```

Publish order MUST be leaf-first so every dependent can resolve its dependency
at the moment of publication (`npm view` must not 404 when a dependent is
published).

## Dependency policy

- **No `workspace:*`** anywhere in publishable manifests.
- Internal dependencies are declared as **real npm semver ranges**, version
  `^0.1.0` current policy (all publishable packages ship at 0.1.0 on first
  publish; versions are independent of git tags).
- Mechanism that keeps the monorepo self-installable WITHOUT a registry:
  npm workspaces **link the local workspace** whenever the declared range is
  satisfied by the workspace version (`^0.1.0` vs workspace 0.1.0).
- An internal dependency must actually resolve at the time its dependent is
  published (enforced by the leaf-first order + the tarball install drill).
- Version bumping is per-package, on the dependency graph — never a blanket
  bump of every workspace package.

## Package manifest requirements (each PUBLISHABLE package)

- `name` `@coreguard/<name>` · `version` 0.1.0 · `type` module · `main` ./index.js
- `exports`: explicit map. **Least-surface rule**: expose `"."` plus ONLY the
  deep entry points actually imported cross-package:
  - `@coreguard/canonical` → `"./uint.js"`
  - `@coreguard/intent` → `"./authorization.js"`
  - `@coreguard/provenance` → `"./authorization-probe.js"`
  - others → `"."` only
  No wholesale export of package internals.
- `files`: explicit whitelist of the runtime closure of each package (no
  test/fixture/dead files). `chain-adapter.js` (canonical) and
  `verifier/run.js` are NOT exported (cli-internal only).
- `publishConfig`: `{ "access": "public" }`
- `engines`: `node >=18`
- `dependencies` / `optionalDependencies`: ONLY what is actually imported,
  in `^0.1.0` (internal) or stable public ranges (external: `@noble/*`).
  `provenance` keeps `@coreguard/evm` as `optionalDependencies` (runtime
  semantics: adapter absent → NOT_RUN), range bumped from exact `0.1.0`
  to `^0.1.0`.

## Boundary-import policy

- Every cross-package relative import **inside a PUBLIC package dir** is
  rewritten to a **bare specifier** (`../canonical/index.js` →
  `@coreguard/canonical`; deep entries via the exports map above).
- `cli` (INTERNAL) keeps repo-relative imports; it is not publishable and is
  documented as such.
- These changes are packaging only — **no protocol logic changes**, no verifier-c
  source changes, no frozen Mainnet evidence changes.

## Clean-clone publishability gate (Phase B EXIT)

`WS-NPM READY` ⟹ publishability proven. It does **NOT** mean npm PUBLISH GO.

```
npm ci
  ↓
npm test = 588/588
  ↓
npm pack --dry-run × 13
  ↓
npm publish --dry-run × 13
  ↓
real .tgz install drill (leaf-first, disposable consumer)
  ↓
imports/API smoke
  ↓
npm test
  ↓
WS-NPM READY
```

The **disposable tarball install drill is the authoritative judge** — dry-run
publishing proves nothing by itself. The tarballs must prove they depend on no
file that lives only inside the monorepo.

## Tarball install drill (detail)

1. `npm pack` each publishable package to a scratch dir, in leaf-first order.
2. Create a throwaway consumer `package.json` (no workspace, no path refs).
3. `npm install <tgz>` one by one in leaf-first order (npm resolves each
   `@coreguard/*` dep from already-installed tarballs — mirrors the registry).
4. `import` the public API surface of all 13 packages + the 3 deep entry
   points; execute one functional path per package (smoke).
5. True negative proof: nothing resolves below `node_modules`.

## Source release vs npm release (separation)

- GitHub/source release and npm publish are **independent decisions**.
- WS-NPM does not create or move tags/releases. `v0.4.0` stays frozen
  (`280fcfd`). The CI fix `8a66816` is a later, separate commit; any future
  release is its own Release Decision.
- First real npm publish requires a separate, explicit owner GO after the gate.

## Guardrails (binding)

- No real `npm publish` in this phase.
- No new GitHub release/tag caused by WS-NPM.
- `v0.4.0` and the `frozen Mainnet evidence` remain untouched.
- No `workspace:*`.
- No edits to `packages/verifier-c/*` (release not authorized anyway).
- `npm publish --dry-run` never treated as proof of installability.