# Core Live Data Conformance — WS-5 Design

**Version**: 0.1.0-design · **Status**: DESIGN DRAFT — **Q-REVIEW PENDING** (owner GO/NO-GO required; NO-GO stops)
**Parent**: CGEP/1:AGENT-PROVENANCE
**Boundary**: docs only. NO implementation before GO. **v0.3.0** (tag `v0.3.0`, commit `2cef7d7`) is **CLOSED / FINAL / SUPPORTED SOURCE RELEASE — IMMUTABLE**. WS-5 adds new test/conformance paths only; it never edits WS-4 code, never edits frozen artifacts, never emits a tag/commit tied to v0.3.0.
**Date**: 2026-09-15

---

## 0. Canon and Ground Rules (fixed before review)

1. **WS-4 is the executable design; WS-5 proves it against REAL Core data.**
   WS-5 changes no WS-4 semantics, no digest definitions, no verdict rules. It
   moves the proof burden from hand-shaped fixtures to wire-fidelity payloads
   captured read-only from a real Core endpoint.
2. **v0.3.0 is immutable.** Any defect WS-5 surfaces follows the
   reproduce-first remediation protocol (WS-1 §8 pattern) and becomes its own
   remediation GO — it is NEVER patched in-place, re-tagged, or back-ported
   into v0.3.0.
3. **Read-only, always.** WS-5 never broadcasts a transaction, never deploys a
   contract, never mutates state, never signs. Consumption is **execution data
   only** (`eth_chainId`, block, transaction, receipt, logs; trace
   *detection*). The suite asserts no write-capable method is ever invoked.
4. **Determinism over pinned payloads.** Identical raw payloads ⇒ identical
   `executionEvidenceRef`, `evidenceHash`, `attestationRef`, bit-for-bit. Live
   connectivity is never a CI input; CI results come from a **frozen fixture
   corpus**.
5. **Authenticity is provenance, not magic.** The chain-consensus **block
   hash** is the trust anchor (full-node validated). Fixtures carry a recorded
   provenance manifest. WS-5's security promise is **determinism + tamper
   detection** (any mutation ⇒ recompute mismatch ⇒ `INVALID`) — it does not
   re-validate chain consensus, and does not claim captured data is *trusted*
   beyond the pinned block-hash anchor.
6. **`latest` never.** Every read happens at an explicit
   `{blockNumber, blockHash}`. A `latest`/unpinned read attempt is a hard
   error (IN-W4-3). Applies to the suite itself.
7. **Raw wire fidelity.** Fixtures are raw JSON-RPC response envelopes
   (`jsonrpc`/`id`/`result` with FULL result objects — hex fields, `v/r/s`,
   `logsBloom`, full log records) exactly as returned by the node. WS-5 runs
   the real extraction boundary over those envelopes. No pre-normalized,
   hand-minimal, or idealized evidence objects.

---

## 1. Scope & Non-Goals

### Scope (in)
- **Core RPC conformance matrix** (§4): the documented method/response shapes
  the extraction boundary must accept, with per-field type/pin requirements.
- **Real-data capture harness** (opt-in, read-only, pinned historical blocks):
  captures raw envelopes from a real Core endpoint once, then freezes them.
- **Frozen live-evidence fixture corpus + provenance manifests** (§3, §5):
  offline, deterministic input to the default conformance suite.
- **Adversarial corpus** (§6): bit-minimal tampered variants of REAL payloads
  with expected-state table.
- **Independent recomputation harness** (§7): a consumer-side, separately
  implemented fold from raw payloads → `executionEvidenceRef` → `evidenceHash`
  → `attestationRef`.
- **Q-review question set** (Q-WS5-1..N, §10) and the **GO/NO-GO gate** (§11).

### Non-Goals (out)
- **NO edits** to `packages/execution/*`, `packages/firewall/*`,
  `packages/verifier/*`, `packages/evidence/*`, `packages/canonical/*`, WS-4
  tests, or any v0.3.0 tree. WS-5 is additive test/conformance surface.
- **NO broadcast / deployment / mutation / signing** of any kind.
- **NO live network in the default suite.** Live capture is an explicit,
  maintainer-run, opt-in step; CI passing never depends on connectivity.
- **NO new cryptography**, no P-256 substitution, real secp256k1/Keccak-256
  unchanged (T-W4-10 held).
- **NO trace-based VERIFICATION in this gate.** Trace is capability *detection*
  + the `TRACE_UNAVAILABLE` path only. Verifying against a real trace backend
  is a separate GO with its own provider/archive workstream.
- **NO npm packaging** (WS-NPM DEFERRED), **NO Verifier C**, **NO B-2
  registry**, **NO SDK/API/DApp surface**, **NO multi-chain generalization**,
  no L3 selective disclosure.
- **NO Mainnet** capture without explicit owner approval; default is a Core
  testnet-style read-only endpoint, no secrets ever checked in.

---

## 2. Baseline Inventory (verified against v0.3.0, commit `2cef7d7`)

| Area | Where | What exists today | WS-5 gap |
|---|---|---|---|
| Execution evidence extraction | `packages/execution/index.js` | `extractExecutionEvidence({ provider, chainId, ref })` — zero-dep core, injected provider; `executionEvidenceRef = domainHash("CGEP/1:EXECUTION-EVIDENCE", …)` | tested only against the synthetic `makeProvider` in `test/execution/helpers.js`, which returns **pre-normalized** objects (`eth_chainId`, `getBlockByNumber`, `getTransactionByHash`, `getTransactionReceipt`, `supportsTrace`/`getTrace`) — no raw JSON-RPC envelopes |
| Evidence/attestation closure | `packages/evidence/index.js` + `packages/execution/index.js` | `evidenceHash ⊇ executionEvidenceRef`; `attestationRef` recomputed by `verifyExecutionAttestation`; `SIMULATION_NOT_RUN` committed in `verification.checks` | no raw-wire end-to-end recompute; no independent second implementation |
| Fixtures today | `test/execution/helpers.js` | `makeRawTx`/`makeRawReceipt` build idealized objects: `blockNumber "0x1e0"`, `blockHash "0xab"*32`, `chainId "1116"`, minimal fields (no `v/r/s`, no `logsBloom`, no envelope) | no captured real payloads, no provenance, no tamper corpus over real data |
| PRE frozen records | `test/sdk/helpers.js` (`decisionRecordFor`, `flipRef`), `test/firewall/helpers.js` | frozen intent/authorization/decision records with recomputable `decisionRef` | reused as-is by WS-5; tamper cases bind the SAME records so failures are attributable to evidence mutation |
| Provider pinning rule | `test/execution/helpers.js:84` | mock throws on `latest` (IN-W4-3) | must hold against real provider shapes and in the raw-wire adapter |
| Runner | `scripts/run-tests.mjs` | suite registry; D1: no `test/verifier-c` | capture tooling never registered; frozen conformance suite *may* be registered via suite-addition decision (Q-WS5-12) |
| Release state | — | `v0.3.0` CLOSED/FINAL/SUPPORTED SOURCE RELEASE (tag `v0.3.0` = `2cef7d7`); npm = NO-GO | WS-5 touches none of it |

**Gap WS-5 closes:** no evidence today that WS-4's extraction, binding, and
attestation closure hold against **wire-fidelity Core data**. WS-5 replaces
the "works on fixtures" claim with a frozen, provenance-recorded, read-only
corpus + adversarial set + independent recomputation, and a mandatory GO gate
before any implementation.

---

## 3. Real-Data Provenance & Authenticity Policy

- **Trust anchor:** the pinned **block hash** as validated by a full node
  (chain consensus commitment). Everything below block hash is treated as
  tamper-detectable input, never as trusted-by-position.
- **Provenance manifest** (per fixture file): `{ chainId, rpcEndpointClass
  (full-node read-only), method, params, pinnedBlockNumber, pinnedBlockHash,
  captureTimeUtc, rawContentHash (sha256) }`. The manifest is checked in next
  to the corpus.
- **Capture discipline:** `eth_*` read methods only (`eth_chainId` /
  `eth_getBlockByNumber` / `eth_getBlockByHash` / `eth_getTransactionByHash` /
  `eth_getTransactionReceipt` (+ `eth_blockNumber` as capture-support
  tooling)); pinned historical blocks; no keys, no secrets, no personal data,
  no private txs. Capture runs once under explicit opt-in
  (Q-WS5-2), and is recorded as JSON that is frozen verbatim.
- **Authenticity claim is bounded:** WS-5 guarantees (a) every ref/hash in the
  pipeline recomputes deterministically over the captured payloads, and (b)
  any mutation is detected (`INVALID`). It does NOT re-derive chain consensus
  and does NOT assert network-level authenticity beyond the block-hash anchor.

---

## 4. Core RPC Conformance Matrix

For each method the matrix fixes: the raw envelope the adapter may be handed,
the fields WS-4 consumes, the pin requirement, and the WS-5 conformance
assertion. Numeric fields are validated hex-quantities (0x-prefixed, within
safe u53/`BigInt` range); hashes are 32-byte `0x` hex; addresses are 20-byte
lowercase-normalized `0x` hex.

| Method | WS-4-consumed surface | Pin requirement | WS-5 conformance assertion |
|---|---|---|---|
| `eth_chainId` | `chainId` (decimal string) | — | **WS-5R:** RAW wire hex (`0x45a`) is normalized to the ONE canonical decimal string inside the extraction boundary (`canonicalChainId` → `canonicalUintString`; decimal passthrough; unparseable ⇒ CHAIN_ID evidence absent → `NOT_RUN`, fail-closed). chainId matches intent/`executionScope`/decision chainId (B-EXEC-1) and the EIP-712 domain chainId in frozen records. Regression proven on the frozen capture with NO external shim (C-L-1/C-L-1b/C-L-5/C-L-6). |
| `eth_getBlockByNumber` (numeric) / `eth_getBlockByHash` | `number`, `hash` | explicit `{blockNumber, blockHash}`; numeric only | `number`/`hash` pair equals the pair embedded in transaction & receipt (cross-object back-reference); `latest`/`earliest` never |
| `eth_getTransactionByHash` | full tx: `hash, from, to, value, input, nonce` (+ `blockHash`, `blockNumber` as pins) | block pinned | required fields present with correct types; `from` EOA; relayer shape (`from != signerBinding.address`) recorded truthfully |
| `eth_getTransactionReceipt` | full receipt: `status, gasUsed, transactionIndex, logs[], blockHash, blockNumber` | block pinned | status/gasUsed/index/logs from raw receipt; log `address/topics/data/logIndex` normalized; logcount/order preserved |
| Log record | log `address, topics, data, logIndex` | logIndex pin | topic/data hash-equality against frozen intent mapping when asserted (B-EXEC-3 predicate); altered log ⇒ not `VERIFIED` |
| Historical pinning | block-hash back-reference across tx+receipt+block | all reads at same pinned pair | cross-object hash equality; mismatch fixture fails closed |
| Trace capability (optional) | capability detection only | — | provider flag detected; else `TRACE_UNAVAILABLE`; **no** trace-based path verification in this gate |
| (capture tooling) `eth_blockNumber` | none (tooling only) | — | never enters evidence |

---

## 5. Real-Data Read-Only Test Plan

1. **Capture (opt-in, maintainer run):** over a real read-only Core endpoint,
   at pinned historical blocks, one or more honest executions matching the
   frozen intent/binding shape (target/selector/value/recipient). Emitted
   artifacts land in `test/conformance/live/fixtures/` as raw envelopes +
   provenance manifest. **Never** in the default suite.
2. **Frozen offline suite** (default CI, deterministic, no network):
   - **C-L-1 chainId conformance (WS-5R)** — raw wire `eth_chainId` hex is
     normalized to canonical decimal inside the extraction boundary; declared
     chainId == evidence chainId; decimal passthrough; `0X` casing; junk ⇒
     CHAIN_ID absent (`NOT_RUN`), never fabricated (C-L-1b).
   - **C-L-2 block-pin conformance** — `{number,hash}` from raw block == pins
     embedded in raw tx and raw receipt.
   - **C-L-3 transaction conformance** — full tx envelope; field presence/type
     per §4; `from` EOA; relayer variant recorded.
   - **C-L-4 receipt/log conformance** — full receipt envelope; status/gasUsed/
     index; logs normalized; logcount/order preserved.
   - **C-L-5 extraction end-to-end** — `extractExecutionEvidence` over a
     provider-shaped replay of the raw envelopes yields the expected
     `executionEvidenceRef` and binds through to `evidenceHash` (WS-4 closure,
     §4 core-native-execution.md).
   - **C-L-6 independent recomputation** — §7 path B equality.
   - **C-L-7 determinism double-run** — two runs, identical bytes for all refs
     and hashes.
   - **C-L-8 read-only guard** — asserts the replay provider never receives
     `eth_send*` / `eth_sign*` / contract-deployment / any write-capable
     method, and that no capture tool executes in the default suite.
3. **Raw-wire adapter (thin loader):** replays each frozen envelope through
   provider-shaped methods (`eth_chainId` / `getBlockByNumber` /
   `getTransactionByHash` / `getTransactionReceipt`) so the WS-4 boundary
   receives the actual node response shapes — identical to §0.7.

---

## 6. Adversarial Corpus (real payloads, bit-minimal tamper)

Each case mutates ONE dimension of a REAL captured payload while leaving
everything else byte-identical, and reuses the SAME frozen PRE records
(decisionRef etc.) so any failure is attributable to evidence mutation, not
PRE drift. Expected states are per WS-4 §8 vocabulary.

| ID | Attack (on real payload) | Expected result |
|---|---|---|
| A-W5-1 | **Wrong block hash** — blockHash rewritten to a non-matching hash (tx or receipt or block) | recompute/pin mismatch ⇒ `INVALID` |
| A-W5-2 | **Cross-chain mismatch** — evidence chainId vs intent/`executionScope`/decision chainId (incl. EIP-712 domain chainId) | B-EXEC-1 ⇒ `NOT_PROVEN / CHAIN_MISMATCH` |
| A-W5-3 | **Altered logs** — topic/data/order/logIndex swapped in a real receipt | ref mismatch ⇒ `INVALID`; never `VERIFIED` |
| A-W5-4 | **Missing historical state** — block at the ref unavailable from the provider | `NOT_RUN / STATE_UNAVAILABLE` (fail closed) |
| A-W5-5 | **Relayer / meta-tx** — real `from != signerBinding.address` | `NOT_PROVEN / CALLER_NOT_BOUND`; **never** caller inference (B-EXEC-4) |
| A-W5-6 | **Unavailable trace** — real payloads, no trace capability | `TRACE_UNAVAILABLE`; no fabricated path |
| A-W5-7 | **`latest` fallback attempt** — read at `latest`/unpinned (or a fixture with `latest` recorded) | hard error (IN-W4-3); adapter must not consume it |
| A-W5-8 | **Target/selector/value tamper** — altered real `to`/`input`/`value` vs frozen intent binding | B-EXEC-2/B-EXEC-3 ⇒ `NOT_PROVEN` / `NOT_RUN` per binding semantics |

The adversarial corpus is itself frozen and runs offline in the default
suite; every case must land exactly on its expected state.

---

## 7. Independent Recomputation (determinism proof)

- **Goal:** `executionEvidenceRef → evidenceHash → attestationRef` must be
  derivable from the SAME raw payloads + frozen PRE records through **at least
  two independent implementations** of the fold, byte-identical.
- **Path A (adapter):** WS-4's own extraction → `executionEvidenceRef` →
  bundle → `evidenceHash` → attestation commit (`attestationRef`).
- **Path B (consumer-side reference):** a separately implemented recompute that
  folds the raw payloads + frozen records into the same refs/hashes using an
  INDEPENDENT canonicalizer (no shared code with `packages/canonical/*` and no
  code reuse from `packages/execution/*` or `packages/evidence/*`). Domain
  constants (`CGEP/1:EXECUTION-EVIDENCE`, `CGEP/1:EVIDENCE`, attestation
  domain) appear only as documented literals.
- **Equality rule:** Path A == Path B for every case (honest and adversarial),
  exactly. Any divergence ⇒ FAIL. Double-run stability (C-L-7) also holds.
- **Scope of recompute:** only public execution data consumed by the WS-4
  evidence model (B-EXEC surface) plus frozen PRE records — no derived data
  beyond canonical recomputation, no caller claims (WS-1 §4.2 discipline).

---

## 8. Conformance Status Vocabulary

Reuses WS-4 §8 (`verification-levels.md` + WS-1/B-1 conventions) — unchanged,
echoed here because WS-5 asserts exact states:

| State | Meaning |
|---|---|
| `VERIFIED` | all required evidence/checks PASS, no FAIL |
| `INVALID` | any admitted evidence fails recompute/equality, or a required check FAILs (dominates) |
| `UNVERIFIED` | missing required evidence (never a pass) |
| `NOT_PROVEN` | explicit binding/attribution failure (CHAIN/TARGET/CALLER/DECISION) |
| `NOT_RUN` | capability or provider gap (provider/state/adapter/evidence item) |
| `TRACE_UNAVAILABLE` | no internal trace and none synthesized |

---

## 9. Repository & Release Boundary

- **New paths only:** `test/conformance/live/fixtures/**` (frozen corpus +
  manifests), `test/conformance/live/*.test.js` (offline suite),
  `scripts/capture-live/*` (opt-in tooling, never in default suite),
  `test/conformance/live/recompute/*` (independent path B).
- **Never modified:** `packages/**` (execution/firewall/verifier/evidence/
  canonical/…), `spec/core-native-execution.md`, WS-4 tests, frozen artifacts,
  `scripts/run-tests.mjs` (except a suite-addition decision, Q-WS5-12).
- **No WS-5 release/tag.** Results fold into a future release decision when
  owned. v0.3.0 stays CLOSED/FINAL/SUPPORTED SOURCE RELEASE; no Mainnet
  changes, no on-chain deployment.

---

## 10. Q-Review Questions (individually approvable)

| ID | Question | Draft ruling |
|---|---|---|
| Q-WS5-1 | Does WS-5 ever broadcast/`send`/deploy/sign/mutate against a live chain? | **NO** — read-only `eth_*` + raw replay only; the default suite asserts write-methods are never invoked (C-L-8) |
| Q-WS5-2 | Is live connectivity ever part of a passing CI suite? | **NO** — frozen fixtures are mandatory; capture is an explicit, maintainer-run opt-in step (Q-5-gate) and offline suite is the CI input |
| Q-WS5-3 | Is any read at `latest`/unpinned allowed? | **NO** — every read at explicit `{blockNumber, blockHash}`; `latest` attempt = hard error (IN-W4-3) |
| Q-WS5-4 | May WS-5 edit v0.3.0 / WS-4 code, tests, or frozen artifacts? | **NO** — immutable. Defects found ⇒ reproduce-first remediation as its own remediation GO, never a silent in-place patch |
| Q-WS5-5 | Does WS-5 claim fixture authenticity as chain-truth? | **Bounded** — provenance + pinned block-hash anchor only; the promise is determinism + tamper detection (`INVALID`), not re-validation of chain consensus |
| Q-WS5-6 | May fixtures be hand-built/normalized instead of captured? | **NO** — raw JSON-RPC envelopes captured read-only from a real endpoint at pinned blocks; manifest-recorded; frozen verbatim |
| Q-WS5-7 | May the independent recompute (Path B) reuse `packages/canonical/*` or WS-4 code? | **NO** — separately implemented; equality is then meaningful |
| Q-WS5-8 | Does this gate include trace-based VERIFICATION? | **NO** — capability detection + `TRACE_UNAVAILABLE` only; real trace verification is a separate GO (provider/archive workstream) |
| Q-WS5-9 | Is Mainnet capture allowed in this gate? | **NO by default** — Core testnet-style read-only; Mainnet requires explicit owner approval; no Mainnet secrets ever checked in |
| Q-WS5-10 | Does WS-5 produce an npm publish / packaging change? | **NO** — WS-NPM is DEFERRED; WS-5 is conformance validation only |
| Q-WS5-11 | Does WS-5 touch Verifier C / independent-verifier / SDK / B-2 registry? | **NO** — all out of scope |
| Q-WS5-12 | May the frozen offline conformance suite join the default `run-tests.mjs` registry? | **Yes for the offline frozen suite** (via explicit suite-addition decision when it lands); capture tooling is NEVER in the default registry |
| Q-WS5-13 | Is the recompute scope limited to public execution data + frozen PRE records? | **YES** — no caller claims, no derived/private data beyond the WS-4 evidence model (WS-1 §4.2) |

---

## 11. Gates

```
WS-5 SPECIFICATION        (this document, v0.1.0-design)     ── DRAFT (current)
    ↓
Q-REVIEW                  (Q-WS5-1..13; corpus; matrix)      ── PENDING
    ↓
GO / NO-GO                (owner decision; NO-GO stops)      ── PENDING
    ↓
GATE-2: CAPTURE           (opt-in read-only capture → freeze raw envelopes + manifest)   ── BLOCKED
    ↓
IMPLEMENTATION
    ├─ offline conformance + adversarial suite (frozen corpus)
    ├─ raw-wire replay adapter
    └─ independent recompute (Path B)
                                                             ── BLOCKED
    ↓
SECURITY + MUTATION GATES (write-method scan; determinism; tamper matrix; Attack Lab style if approved)
    ↓
CLEAN-CLOSE VERIFICATION  (npm ci · npm test · conformance · double-run determinism · WASM · frozen hash unchanged)
    ↓
FOLD-INTO FUTURE RELEASE  (owner decision; no automatic tag; v0.3.0 NEVER modified)
```

Hard constraints at every gate:
- **No implementation before GO.** This document is docs-only until then.
- **No writes, broadcasts, deployments, or signatures — ever.**
- **v0.3.0 is immutable.** No edits, no re-tag, no remediation inside v0.3.0;
  findings go through reproduce-first → own remediation GO.
- **Never modify frozen artifacts** (`packages/verifier`, evidence, canonical,
  WASM, `firewall/*`, WS-4 tests).

---