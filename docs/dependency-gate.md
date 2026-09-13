# Dependency Gate — @coreguard/evm (CGEP/1:AGENT-PROVENANCE Phase A)

The only dependency-carrying code introduced for AgentProof is the isolated
EVM crypto adapter (`packages/evm`). Before any `npm install` of it, every
criterion below must hold. Verified: **2026-09-13**.

## Terminology (precise)

`@coreguard/provenance` is **NOT** a zero-dependency package in the literal
npm sense: it declares `@coreguard/evm` under `optionalDependencies`, so npm
may install it. The precise claim is:

```
@coreguard/crypto        ZERO DEP
@coreguard/provenance    ZERO-DEP CORE PATH  +  OPTIONAL EVM CRYPTO ADAPTER
@coreguard/evm           EVM CRYPTO ADAPTER  +  @noble/curves + @noble/hashes
```

"Zero-dep" ALWAYS refers to the **core path** (canonicalization, manifest
model, delegation/attestation/orchestrator), never to the package as a whole.
The optional adapter never participates in that core path's logic via a static
import.

## Dependency rule (recorded architecture decision)

> **EIP-712 must be real. The existing zero-dependency core remains intact;
> secp256k1/Keccak-256 are introduced only behind an isolated EVM signer adapter.**

```
@coreguard/crypto        ZERO DEP                      canonicalize, sha256, P-256
@coreguard/provenance    ZERO-DEP CORE PATH            canonicalization, manifest model,
                         + OPTIONAL EVM CRYPTO ADAPTER     delegation / attestation / orchestrator
@coreguard/evm           EVM CRYPTO ADAPTER            signer/ eip712, secp256k1, address + keccak256
                         @noble/curves + @noble/hashes
```

- `packages/provenance` does **not** import `@coreguard/evm` statically. It
  consumes it through `evm-adapter.js` (dynamic import gate). When the adapter
  is unavailable the verifier reports **NOT_RUN** for EVM-dependent checks —
  it never fabricates a cryptographic result (no P-256 substitution, no
  invented signer binding).
- `packages/provenance/package.json` keeps noble OUT; it declares
  `@coreguard/evm` as an `optionalDependencies` workspace link. The **zero-dep
  claim is scoped to the core path only** — see Terminology above.
- The verifier's `MANIFEST_SIGNATURE`, `DECLARER_EXECUTION_BINDING`,
  `DELEGATION_CHAIN`, `ATTESTATION_SIGNATURES`, `ATTESTATION_RECOGNITION`
  axes are `NOT_RUN` when the adapter is absent. `PROVENANCE_COMMITMENT`
  (SHA-256 over canonicalized core) stays evaluable — it is zero-dep.

## Candidates

| Package | Version | Purpose |
|---|---|---|
| @noble/curves | 1.9.7 | secp256k1 sign + public-key recovery |
| @noble/hashes | 1.8.0 | Keccak-256 |
| ethers (rejected) | v6 | heavy, supplies far more than needed |

## Gate results

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Pure JavaScript / auditable source | ✅ | TypeScript→JS output; no `.node`/binary assets (`0` native files found) |
| 2 | No native binary requirement | ✅ | `@noble/*` builds from source JS; zero `.node/.so/.dll/.dylib` under `node_modules/@noble` |
| 3 | Deterministic | ✅ | Keccak-256 is deterministic; identical digests re-verified across runs (domain separator + typed digest + EIP-712 reference vector) |
| 4 | secp256k1 public-key recovery | ✅ | `Signature.recoverPublicKey` used by `recoverSignerAddress`; validated against official EIP-712 Cow wallet vector |
| 5 | Keccak-256 | ✅ | `keccak_256` in @noble/hashes; only dependency of @noble/curves (deduped) |
| 6 | License compatible with CoreGuard (MIT) | ✅ | Both packages `"license": "MIT"` (checked from installed `package.json`) |
| 7 | Minimal dependency tree | ✅ | `curves → hashes` only, deduped; `hashes` has zero dependencies |
| 8 | Lockfile committed | ✅ | `package-lock.json` tracked; change is reviewable |
| 9 | Independent test vectors | ✅ | Cross-validated vs ethers.js constants **and** official EIP-712 reference (Mail/Cow): digest `0xbe609aee…`, recovery → `0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826` |
| 10 | No secrets / network needed at verification time | ✅ | All crypto is offline, pure computation; tests run with `--test` and no network |

**npm audit (all deps):** `found 0 vulnerabilities`.

## Verdict

`@noble/curves@^1.9.0` + `@noble/hashes@^1.8.0` **pass all 10 criteria** and
are the only dependency-carrying addition for Phase A. They live exclusively
under `packages/evm` (the EVM crypto adapter), never in the zero-dep core path.