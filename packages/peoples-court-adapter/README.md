# @coreguard/peoples-court-adapter

Structural dry-run adapter that maps a verified CoreGuard **ADAL/1 dispute
package** onto the *publicly documented* **People's Court Partner API v2** and
**@peoples-court/x402-disputes** surface.

**Offline. Deterministic. Credential-free. No live call is claimed or performed.**

```
npm run peoples-court:prepare -- --case <dispute-package-dir>
```

## What it does

1. Re-verifies the ADAL/1 dispute package with the repo's fail-closed verifier
   (`verify-dispute-package.mjs`). If the package is tampered, **nothing is
   emitted**.
2. Derives the eight status labels from real package fields:
   `authority DERIVED · consent VERIFIED_LABELS · execution
   CORE_MAINNET_RECEIPT · evidence SHA256_PINNED · record ADAL/1 ·
   award EXTERNAL · settlement AUTHORITY_BOUND · network-call NOT_PERFORMED`.
3. Builds four *candidate* mappings (authority-grant, consent artifact,
   evidence-export, settlement-binding) mirroring the documented Partner API
   shapes, and schema-validates them against `schemas/`.
4. Emits an offline submission template:
   `expected-request.json` + `expected-response.json` + `adapter-report.json`.

## The honesty boundary (binding)

- **People's Court did not run CoreGuard's verifier, did not check the chain,
  and gave a read-only public critique.** No "accepted/validated/integrated"
  claim is ever made — `integrationStatus: NOT_BUILT` persists in every ADAL/1
  package.
- The Partner API v2 (`/api/v2/authorizations/authority-grants`, `/api/v2/
  authorizations/consents`, `evidenceExporter`, settlement bindings, webhooks
  with `eventId` dedup + sequence cursor) and the x402 dispute extension
  (`adjudication.prepare()` with `idempotencyKey` / `authorityGrantId` /
  `consentArtifactIds`) are **real, public** surfaces. Mapping to them is
  *structural* — the endpoints are referenced as documentation, never invoked.
- A live submission requires an **authorized People's Court credential** held
  by the integrator. This package never stores, requests, or simulates one.
- **An Award does not move money.** Execution is a separate, credential-scoped
  step; `decision_served` never triggers execution without a separately scoped
  settlement adapter credential. CoreGuard's escrow remains
  reference-only (`deployed: false`, `chain: "none"`).

## Usage

```bash
# from a delivered dispute-package dir:
npm run peoples-court:prepare -- --case examples/delivery-fixture/pairs/dispute-package/reference-A

# explicit out dir:
npm run peoples-court:prepare -- --case <dir> --out <out-dir>
```

Exit codes: `0` `PEOPLES_COURT_ADAPTER_READY` · `1` fail-closed (nothing
emitted) · `2` usage error.

## Layout

```
packages/peoples-court-adapter/
  adapter.mjs      core mapping pipeline (pure, testable)
  cli.mjs          npm script entry point
  schemas/         output-contract JSON schemas (authority, consent,
                   evidence-export, settlement-binding)
  examples/dry-run committed case-a + expected fixtures
```

## Reproducibility

Output is byte-deterministic for a given input package: fixed timestamps are
carried from the package (`generatedAtUtc`), no `Date.now()`, no
`Math.random()`, no network.