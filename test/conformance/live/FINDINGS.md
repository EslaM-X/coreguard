# WS-5 Conformance Results & Findings — Core Live Data

Status: **WS-5 conformance DISCOVERY complete → F-W5-3 → WS-5R remediation IMPLEMENTED (no external shim), awaiting owner security re-review. NO COMMIT, v0.3.0 untouched except the WS-5R boundary file.**
Suite: `test/conformance/live/conformance.test.mjs` — **23/23 PASS** (full repo npm test: 512/512, benchmark 73/73, WASM artifact hash unchanged, frozen evidence/canonical hashes unchanged, `git diff --check` clean).

## 1. GATE-2 Capture (read-only, approved)

- Endpoint: `https://rpc.test2.btcs.network` — official Core **Testnet2** (chainId `0x45a` = 1114). Old testnet 1115 is decommissioned; Mainnet (1116) NOT used.
- 5 allowlist read calls only (`eth_chainId`, `eth_blockNumber` capture-support, `eth_getBlockByNumber`, `eth_getTransactionByHash`, `eth_getTransactionReceipt`); recorded in `calls.log`; no `eth_send*`/`eth_sign*`/deploy/broadcast possible (structural) nor present (audited log).
- Pinned historical block `0x11dd477` (18,732,151) hash `0xcf52a571…496f9`; raw envelopes frozen verbatim (full wire fields: `v/r/s`, `logsBloom`, `baseFeePerGas`, EIP-4844 fields, full log records).
- Captured object: staking/delegation tx to `0x0000…1000` (selector `0xf340fa01`) from EOA `0x1cd652…`, status `0x1`.
- Cross-back-reference: `block.hash == tx.blockHash == receipt.blockHash` (C-L-2 PASS).

## 2. What WS-5 proved on real data

| Check | Result |
|---|---|
| C-L-1 chainId boundary (WS-5R): wire `0x45a` hex normalized to canonical decimal in-boundary | PASS (post-fix regression) |
| C-L-1b chainId fail-closed: decimal passthrough, `0X` casing, junk → CHAIN_ID absent (NOT_RUN) | PASS |
| C-L-2 block pin cross-back-reference | PASS |
| C-L-3/4 full wire field conformance (tx/receipt/log) | PASS |
| C-L-5 extraction end-to-end → `VERIFIED` on the REAL frozen payload, **no external shim** | PASS (WS-5R regression) |
| C-L-5b attestation (receiptId null, SIMULATION committed) → `ATTESTATION_INTACT` | PASS |
| C-L-6 **independent recomputation Path B == Path A** (ref/hash/attestationRef, byte-identical) | PASS |
| C-L-7 determinism double-run (identical bytes) | PASS |
| C-L-8 read-only guard (4 replay reads only, no writes) | PASS |
| A-W5-1..8 adversarial (each exactly its expected fail-closed state) | PASS |
| Path B independent canonicalizer byte-stable | PASS |

## 3. Findings (reproduce-first; NOT fixes — v0.3.0 immutable)

### F-W5-1 — WS-4 does not itself enforce the cross-object block-hash back-reference (provenance-bound) — ACCEPTED / DOCUMENTED
A self-consistent "wrong block hash" world (`block.hash` AND `tx.blockHash` both rewritten)
produces `VERIFIED` inside WS-4 — the engine cannot see inside a provider-selected
view; the trust anchor is the pinned block hash + provenance manifest (§3 of the spec).
The pin-layer rejection exercised in `A-W5-1b` comes from the capture/replay boundary
(enforce candidate hash == pinned hash), not from WS-4. Design-consistent; document +
optionally harden in a future remediation workstream (own GO), never inside v0.3.0.

### F-W5-2 — Spec-table alignment on missing historical state — ACCEPTED / SPEC REFINED
Spec §6 expected `A-W5-4` as `NOT_RUN / STATE_UNAVAILABLE`; WS-4's actual verdict on a
missing provider state is **`UNVERIFIED` / `REQUIRED_EVIDENCE_MISSING`** with an
`EXTRACTION:BLOCK` `NOT_RUN / BLOCK_MISSING` check. Fail-closed holds (never `VERIFIED`).
Expected-state table refined to: `UNVERIFIED (fail-closed; EXTRACTION:BLOCK NOT_RUN)`.

### F-W5-3 — eth_chainId wire shape: hex vs decimal (boundary normalization gap) — **WS-5R REMEDIATED — PENDING owner security re-review (not yet CLOSED)**
A raw Core node returns `0x45a`; WS-4's CHAIN_ID item used `String(provider.eth_chainId())`
verbatim and B-EXEC-1 compares it against decimal `intent.chainId` → `CHAIN_MISMATCH` on
GENUINE data. WS-4's own mocks returned decimal, so this was invisible to unit tests.
**Remediation (WS-5R, own GO):** `canonicalChainId()` at the extraction boundary collapses
ANY uint256 representation (RPC hex `0x…`/`0X…`, decimal string, safe number) to the ONE
canonical CGEP/1 decimal string via `canonicalUintString`; unparseable input FAILS
CLOSED (CHAIN_ID evidence absent → B-EXEC-1 NOT_RUN, never fabricated). Path B mirrors the
same normalization, keeping byte-equality. Regression on the frozen real Core Testnet2
payload: **C-L-5 → `VERIFIED` with NO external shim**, and A-W5-2 cross-chain (`"0x1"` →
`"1"` ≠ `"1114"`) still `NOT_PROVEN / CHAIN_MISMATCH`. Full gates: npm test 512/512,
benchmark 73/73, WASM byte-identical, frozen evidence/canonical hashes unchanged,
`git diff --check` clean. No B-EXEC semantics, no latest fallback, no crypto, no P0/P1,
no Firewall, no frozen Mainnet evidence touched.
**CLOSED only after a WS-5R Security Re-review confirms** the RAW RPC → canonical decimal →
Path A ⇄ Path B byte equality → executionEvidenceRef → evidenceHash → attestationRef chain
over the captured payload and no regression.

## 3b. Boundary-hygiene checks (owner-requested, both verified)

- **transactionIndex vocabulary guard:** `packages/execution/index.js` puts
  `transactionIndex` in `RECEIPT.value` (line 212); the independent Path B carries it too
  (recompute.js, same key). New test asserts: present in BOTH paths with byte-identical
  values and inside the committed digest closure. No discrepancy; C-L-6 passes because
  both vocabularies match.
- **canonicalizer casing (0x vs 0X):** the CGEP/1 canonicalizer lowercases only strings
  starting with lowercase `0x` (both `@coreguard/canonical` and Path B mirror this). New
  parity test proves Path B reproduces the scheme byte-for-byte incl. this quirk, and
  documents that `0X…` is NOT a hex marker in canonical input (wire records already reach
  the canonicalizer lowercase via `toLowerHex`/`hexDec`). No divergence, no blocker.

## 4. Repository boundary (all new, none of it committed)

- `scripts/capture-live/capture.mjs` — opt-in read-only capture tool (allowlist-locked).
- `test/conformance/live/fixtures/` — frozen raw envelopes (`rpc-*.json`) + `provenance-manifest.json` (authoritative call allowlist + artifact hashes). `calls.log` is a local-only capture log (gitignored) and is not part of the frozen set; reproducibility relies on the tracked manifest + RPC envelopes.
- `test/conformance/live/rawReplay.js` — raw-wire replay (read-only, IN-W4-3 enforced).
- `test/conformance/live/recompute/recompute.js` — Path B independent recompute (no shared code).
- `test/conformance/live/conformance.test.mjs` — the offline suite (23 tests).
- `spec/core-live-conformance.md` — WS-5 design (approved).
- WS-5R (GO approved): modified `packages/execution/index.js` (boundary normalization only —
  the single tracked change), plus recompute.js + suite updates above.

Not touched: `v0.3.0` tag tree (`2cef7d7`), frozen artifacts, WS-4 test files, Firewall,
P0/P1, crypto/WASM, Mainnet evidence, `@coreguard/evidence`/`canonical` (hashes unchanged).

## 5. Owner-adopted status board (2026-09-15)

```
WS-5 SPEC                         APPROVED
GATE-2 REAL CAPTURE               PASS
OFFLINE CONFORMANCE               23/23 PASS
PATH A == PATH B                  PASS
DETERMINISM                       PASS
READ-ONLY                         PASS
ADVERSARIAL CORPUS                PASS
V0.3.0 IMMUTABLE (tree)           PASS (single WS-5R boundary edit on top)

F-W5-1                            ACCEPTED / DOCUMENTED
F-W5-2                            ACCEPTED / SPEC REFINED
F-W5-3                            WS-5R REMEDIATED — PENDING RE-REVIEW (not CLOSED)

WS-5R BOUNDARY NORMALIZATION      GO APPROVED → IMPLEMENTED (no external shim)
  npm test 512/512                PASS
  benchmark 73/73                 PASS
  WASM byte-identical             PASS
  frozen hashes unchanged         PASS
  git diff --check                PASS

SECURITY GATE                     HOLD (pending WS-5R re-review)
WS-4 PRODUCTION INTEGRATION       BLOCKED (until re-review PASS)
COMMIT WS-5 / WS-5R               BLOCKED
TAG/RELEASE                       BLOCKED
PUSH/PUBLISH                      BLOCKED
```

Remediation reproduction → implementation → regression → full gates completed under the
WS-5R GO. Closing F-W5-3 and lifting SECURITY GATE is the owner's Security Re-review
(RAW RPC → canonical decimal → Path A ⇄ Path B → executionEvidenceRef → evidenceHash →
attestationRef over the captured payload; no regression). No commit/tag/release/push yet.