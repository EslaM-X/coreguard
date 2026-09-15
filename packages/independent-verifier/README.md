<p align="center">
  <img src="../../assets/core-guard-logo.png" alt="CoreGuard" width="180">
</p>

# @coreguard/independent-verifier

**WS-3 — Independent Rust/WASM Verifier (Verifier B)**

An additive, independently re-derived Rust/WASM implementation of the CGEP/1 authorization chain (canonicalize → signed refs → execution scope → authority probe), running *from raw canonical inputs inside WASM* and never importing or trusting `@coreguard/sdk` (or any JS result) as a source of truth.

**Consumer contract**: this package reports protocol facts (status/label/refs/scope), never an ALLOW/DENY decision. The Firewall stays the decision owner.

---

## Quick start

```bash
# Requires Node >= 18.  No Rust toolchain needed.
npm test
```

Tests consume the committed WASM artifact (`wasm/independent-verifier.wasm`) — no Rust required. See §Build gate for the deterministic regeneration contract.

---

## Three Verifiers Rule

```
Verifier A   JS reference (zero-dep core + WS-1/WS-2 + Phase D)   [exists]
Verifier B   This package (Rust/WASM, independent re-derivation)   [WS-3]
Verifier C   future (separate affirmative workstream)              [TBD]
```

A protocol fact is trusted ≥ when **the reference and every shipped verifier agree** on it. **Any divergence = HOLD + §8 investigation** (see spec).

---

## What it re-derives (byte-identical to the reference)

| Step | What | Domain / primitive |
|---|---|---|
| canonicalize | Deterministic JSON serialization | byte-identical to JS `canonicalize` |
| intentRef | `H(CGEP/1:INTENT, canonical(intent))` | SHA-256 |
| manifestId | `H(CGEP/1:AGENT-PROVENANCE, declarationCore(declaration))` | SHA-256 |
| bindingRef | `H(CGEP/1:FW-BINDING, {intentRef, manifestId, signature})` | SHA-256 |
| decisionRef | `H(CGEP/1:FW-DECISION, frozenRecordWithoutDecisionRef)` | SHA-256 |
| executionScope | `frozenRecord.binding.executionScope` only (byte-identity vs predicted `scopeOfIntent`) | — |
| EOA authority | EIP-712 digest (own implementation) + secp256k1 recovery | Keccak-256, secp256k1 |
| EIP-1271 authority | Own digest + calldata → injected JS transport reads at pinned block → magic check | Keccak-256 |

---

## Design boundary

| Layer | Responsibility |
|---|---|
| Rust/WASM (`rust/src/*`) | **Protocol facts**: canonicalize, all hashes, signer recovery, calldata construction, 1271 two-step protocol control (needs_witness echo with request binding to digest+calldata+contract+block), all status/label/path decisions. Zero function imports. |
| JS wrapper (`index.js`) | **Transport/marshalling only**: loads the WASM binary, moves JSON bytes across the ABI, performs I/O the WASM cannot do alone (EIP-1271 `getCode`/`ethCall` via an injected transport bound to the verifier's own digest+calldata), rejects post-execution evidence at the pre-execution seam. Never canonicalizes, hashes, recovers, or evaluates any protocol fact itself. |
| JS test harness | Differential parity against the reference and adversarial suites; never touches the verifier's trusted path. |

---

## WASM ABI

```
verify(ptr, len) → usize     // run the CGEP/1 pipeline; returns output_len
canon(ptr, len)  → usize     // canonicalize only; returns output_len
alloc(len)       → *u8
dealloc(ptr, len)
output_ptr()     → *const u8
output_len()     → usize
```

**Zero imports** — no wasm imports required. `panic = "abort"`, arithmetic overflow checks enabled.

---

## Build gate

```bash
# — gate (default): regenerate from source, FAIL on byte drift (= HOLD)
node scripts/build-verifier.mjs

# — gate + update: regenerate and promote the committed artifact (dev only)
node scripts/build-verifier.mjs --update
```

**Determinism**: same pinned Rust toolchain + `Cargo.lock` → identical WASM bytes (verified by the gate script). The committed artifact is the test-time source of truth; `npm test` uses it directly.

---

## Dependency boundary

- **Zero external crate dependencies** — self-contained crypto, JSON, secp256k1 recovery. (Design deviation from Q-W3-5 pinned-crate proposal: zero crates were required because Application Control on the build machine blocks all cargo/rustc-produced binaries, making `build.rs` impossible to execute. Zero crates achieves the same trust goal with stronger reproducibility.)
- **Zero JS imports by the verifier** — the WASM is the sole dependency; the JS wrapper imports only `node:fs`.
- **No SDK/firewall/evm imports** in the verifier path.

---

## Deviations from Q-W3-5 design (documented)

| Point | Q-W3-5 proposal | WS-3 implementation |
|---|---|---|
| Rust dependencies | `sha2`, `sha3`, `k256` + minimal JSON crate | Zero external crates; self-contained SHA-256, Keccak-256, secp256k1 recovery, JSON engine. Achieved via Application Control constraint requiring zero build-script execution. |
| chainId range | arbitrary BigInt (u256) | u128 (all practical chain IDs fit; >128-bit → `bigint_parse_js` error → fail-closed) |

All other Q-W3-1..12 decision points implemented as specified.

---

## Test suite

```bash
npm test          # full suite (existing + independent-verifier)
npm run benchmark # at frozen baseline
```

| File | What |
|---|---|
| `differential.test.js` | Byte-identical refs/scope/status vs reference `verifyBinding` for committed corpus |
| `adversarial.test.js` | Tampered intent/declaration/record/signature → deterministic change, never silent acceptance |
| `artifacts.test.js` | Zero imports, exports set, artifact integrity, guard seam, determinism, numeric robustness |
| `canonicalize.test.js` | `canon` export byte-parity vs reference `canonicalize` (W3-I2) |

---

## License

MIT
