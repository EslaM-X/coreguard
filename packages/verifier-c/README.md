# Verifier C — CGEP/1 independent verifier (stdlib-only Python re-derivation)

Third, fully independent implementation of the CGEP/1 verification chain
(`canonicalize → refs → scope → authority`), written from scratch against
Verifier B's Rust/WASM behavior (`packages/independent-verifier`) and the
reference SDK (`packages/sdk`), **byte-for-byte** output parity.

C mirrors B's contract exactly: same envelope, same labels/reasons, same
`needs_witness`/`refused`/`throw`/`input_error` modes, same EIP-712 + EIP-1271
semantics, same structural pre-execution seam refusal (Q-W3-6 / Q-FW10).

## Composition

| Path | Role |
| --- | --- |
| `verifier_c/_json.py` | V8-parity JSON parser + compact serializer + `String(number)` formatting + order-sensitive equality |
| `verifier_c/_keccak.py` | Self-written Keccak-256 (no `sha3` alias) |
| `verifier_c/_secp.py` | secp256k1 public-key recovery on Python ints |
| `verifier_c/_canon.py` | Canonicalization + hex handling + domain hashing |
| `verifier_c/_pipeline.py` | Full pipeline port of B's `lib.rs` (binding / scope / authority / EIP-1271 probe) |
| `verifier_c/__init__.py` | Library surface (`verify_raw` / `canon_raw` / `run`) |
| `bridge.py` | Test-transport bridge (newline-delimited JSON, explicit `--bridge`) |
| `index.js` | Node transport/marshalling wrapper (spawns the bridge, pins metadata) |

## The stdlib-`json` boundary (Dec-C-4)

One stdlib `json` usage is allowed: **I/O framing only** in `bridge.py`.
It never touches verification bytes.

- `json.loads` parses integers as arbitrary-precision Python ints — but the
  chain defines JSON numbers as IEEE doubles, so C's **own** parser produces
  floats and its own error strings (`JSON: ...`) matching B's parser exactly.
- `json.dumps` writes integral floats as `"1.0"` — but JS/hand-wrapped
  serialization writes `"1"`. C's **own** serializer (`ser_num`,
  `_ser_string`, `fmt_f64`), key order, and minimal escaping are what produce
  canonical text; byte parity with A/B requires it.

The bridge's framing `json.loads`/`json.dumps` never sees the input JSON text
(the protocol carries it inside a string) and never sees canonical output
(it is an opaque string field), so stdlib semantics cannot touch any
verification value.

## Boundaries

- **No CLI.** `python bridge.py` without `--bridge` prints usage and exits 0.
  The bridge is invoked by the Node wrapper only (spawn + pipe).
- **No RPC, no network.** Providers are injected asynchronously by the harness
  (`contractAuth.getCode` / `ethCall`), exactly like B.
- **Never decides.** Like B, C only ever returns deterministic outcomes; it
  never takes action.
- **No external pip dependencies.** Python standard library only, module is a
  plain `verifier_c` package (no build step, no `pyproject`).

## Reproducibility metadata (Dec-C-9)

`METADATA.json` pins the interpreter range (`^3.14`) and SHA-256 of each
source module. `index.js` refuses to run on a bridge whose version or checksums
do not match. Per Dec-C-9 this is **reproducibility metadata for the C
implementation**, not a cryptographic attestation of the interpreter itself.

## Using C in the test suite

`test/verifier-c/` runs a full three-way differential (A = reference SDK,
B = Rust/WASM, C = this package) over signed EOA and EIP-1271 fixtures plus
adversarial mutations and canon-parity corpus — asserting byte-identical
envelopes across all three implementations.