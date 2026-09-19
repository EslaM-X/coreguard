# Gate 4.1 — Verification Reconciliation & Assertion Inventory

Audit aid for the reviewer. Purpose: make the **PASS count auditable** by
explaining exactly where each number comes from and how the initial 54/54
became 66/66 without any fixture or evidence changing.

- Schema version: **asm-2026-09-19** (embedded in the verifier as `SCHEMA`).
- Verifier: `scripts/verify-gate-4.1-onchain.mjs` (v2.1.0).
- Result artifact: `evidence/gate-4.1-independent-verify.json`.
- Raw ground truth: `evidence/raw/` (6 verbatim RPC dumps + `manifest.json`),
  **unchanged** across every verifier revision (proven below).

## 1. Why the count changed: 54/54 -> 66/66 (exactly +12)

Both numbers verify the **same evidence files**. No assertion was silently
dropped; the old ones are a strict subset of the new ones (renamed with IDs).
The inventory grew by 12 instances = 6 unique assertions across **two new
categories** plus one appended check in two existing categories:

| Change | Unique | Instances | Category |
|---|---|---|---|
| `[spec]` Keccak sanity vectors (keccak=None, keccak=hello) | +2 | +2 | NEW spec |
| `[spec]` recompute commitIntent selector / IntentCommitted topic0 | +2 | +2 | NEW spec |
| `[tx]` calldata "last word == data length then ECDSA sig present" | +1 | +2 (2 RPCs) | added to tx |
| `[receipt]` log.address == registry | +1 | +2 (2 RPCs) | added to receipt |
| `[cross]` from/to/chainId/hash agree · nonce agree · sha256(calldata) identical · receipt status/block/gas agree | +4 | +4 | NEW cross |
| **Total added** | **+6 unique** | **+12 instances** | |

**Old subset (54/54) maps 1:1:** tx 13+... — refer to the machine-readable
inventory for the exact ID set. Category totals (from `SCHEMA.byCategory`):

| Category | v1 instances | v2 instances |
|---|---|---|
| spec | 0 | 4 |
| tx | 24 | 26 |
| receipt | 24 | 26 |
| readback | 6 | 6 |
| cross | 0 | 4 |
| **Total** | **54** | **66** |

### What really changed between 2dd2705 and d543fff (and now)

1. **Verifier implementation** — v1 used `@noble/hashes` (external package);
   v2 implements Keccak-256 inline (zero deps) so the verifier runs from a bare
   `git clone`. The keccak RHO-table indexing was corrected during the port and
   is now locked by the `SPEC-03/SPEC-04` reference vectors plus the
   `SPEC-01/SPEC-02` selector/topic0 assertions.
2. **Assertion structure** — v2 assigns every check a stable ID, category, and
   a one-line provenance `source`; `--inventory` prints the schema + full list.
3. **Result artifact** — regenerated (same verdict), now carries `schema`.
4. **Regression guard** — `test/independent-verifier/gate41-verifier.test.js`
   (6 tests) locks self-containment, crypto vectors, count/schema, determinism,
   committed-result reproducibility, and raw-dump manifest pins.

### What did NOT change
- `evidence/raw/*.json` and `manifest.json`: byte-identical (pins verified by
  the regression test; the manifest predates v2 and was never rewritten).
- `evidence/gate-4.1-identity-preflight.json`, `evidence/gate-4.1-broadcast-recovery.json`: untouched.
- On-chain facts (tx hash, block, receipt, readback): unchanged.

## 2. Evidence independence (why 66/66 is not "self-confirming")

- Ground truth is ONLY the verbatim RPC dumps under `evidence/raw/`.
- Expected values are DERIVED (not embedded):
  - intentId / commitment / signer / validUntil: read from the committed
    **pre-broadcast** evidence + the gate's recovery record;
  - selector / topic0 / sha256: recomputed locally by the inline crypto.
- The verifier (and its tests) never read `evidence/gate-4.1-independent-verify.json`;
  the regression test regenerates it and requires a byte-identical match.
- `--json` output is byte-deterministic (no timestamp field).

## 3. Reproducibility from a bare clone

```
git clone <repo> /tmp/check
cd /tmp/check                      # no npm install, no node_modules
node scripts/verify-gate-4.1-onchain.mjs          # -> PASS (66/66), exit 0
node scripts/verify-gate-4.1-onchain.mjs --inventory
node --test test/independent-verifier/gate41-verifier.test.js   # 6/6
node scripts/verify-gate-4.1-onchain.mjs --json > /tmp/regen.json
sha256sum /tmp/regen.json evidence/gate-4.1-independent-verify.json   # identical
```

## 3.b Test-count note (721 -> 727)

- `npm test` is now **727/727** (721 + 6 new Gate 4.1 regression tests in
  `test/independent-verifier/gate41-verifier.test.js`).
- The authoritative count lives in `docs/STATUS.md` (the single source of truth
  by the repo's own convention, per `README.md` §Testing).
- `README.md` (line 131) still reads "721 tests"; it is **frozen and re-pinned**
  in the freeze record, and is intentionally left untouched — it remains accurate
  as the historical example string and is superseded by `docs/STATUS.md`.
  Any renewal of the README figure requires a freeze re-pin, which the reviewer
  can request explicitly if desired.

## 4. F-4 (documentation-path defect) — remains disclosed

`evidence/gate-4.1-broadcast-recovery.json` records `calldataSha256 0x541c6f15...`
which is NOT reproducible from the on-chain input (`0xc10474ed...`). The recovery
file is original gate output and is intentionally unedited. `TX-06` documents
this: it checks sha256 reproducibility as a self-consistency property (F-4 explains
why a pinned constant would have been wrong). On-chain truth is unaffected and is
re-asserted by every other assertion.

## 5. Status

```
BLOCKCHAIN:       ON-CHAIN SUCCESS  — per announced evidence (independent RPC proofs on file)
VERIFICATION:     STRONGER, REMAINS SUBJECT TO HUMAN INDEPENDENT REVIEW
EVIDENCE:         VERIFIABLE, F-4 DISCLOSED
GOVERNANCE:       PENDING — NOT CLOSED (P7 5/6 human signature required)
```