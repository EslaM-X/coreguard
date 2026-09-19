# Gate 4.1 — Final Review Report (release/review, NOT a closure announcement)

Status: **REVIEW REPORT** — not a closure, not an authorization. No broadcast
was made and none is requested.

- Report date: 2026-09-19
- Last published reference: `c8f516634ef4a97b41fa423f6ca5bd115fe0b966` (main)
- Preceding verification reference: `50b49434d98b2a81810c79f9b431c3046aa9d673`
- Independent round reference: `d543fff97c328d2345feeca6bc6b09d9569cf7fd`
- Baseline (54/54) reference: `2dd27058c43c3decd37cdf89a6d63aa27ece40c5`

---

## 1. What changed since the previous review round

Two documentary commits only — no verifier, evidence, raw-dump, or freeze-record modifications:

| Commit | Scope | Nature |
|---|---|---|
| `50b4943` | verifier v2.1.0 (schema/inventory), regression tests, reconciliation doc, result JSON | code + docs |
| `c8f5166` | `evidence/gate-4.1-verification-reconciliation.md` §3 (14 lines added) | **docs only** |

Both pushed to `main`. The repository is in sync with `origin/main`
(`c8f5166` = `origin/main`).

## 2. CI verification — run 88 (commit `c8f5166`)

- Run: **88** — id `35426912498`, event `push`, status `completed`, conclusion **success**
- `head_sha`: `c8f516634ef4a97b41fa423f6ca5bd115fe0b966` (full SHA confirmed in the
  job artifact `2_Run actions_checkout@v7.txt`)
- Archive validated: PK signature OK, EOCD found, central-directory entries = 80,
  80 files extracted (Windows-native `Expand-Archive`)
- Raw TAP output (read verbatim from `6_Run npm test.txt`, all three engine nodes):
  - Engine (node) (18): `# tests 727 / # pass 727 / # fail 0`
  - Engine (node) (20): `# tests 727 / # pass 727 / # fail 0`
  - Engine (node) (22): `# tests 727 / # pass 727 / # fail 0`
- Contracts (foundry): 14 `[PASS]` assertions on `EvidenceRegistryV2`

Baseline for the +6 delta (run 86, `d543fff`): `# tests 721 / # pass 721 / # fail 0`
in all three engine nodes — the 721→727 increase is exactly the six new
regression tests added in `50b4943` (`test/independent-verifier/gate41-verifier.test.js`).

## 3. Independent verifier — 66/66 PASS, schema v2.1.0

- Verifier: `scripts/verify-gate-4.1-onchain.mjs` (v2.1.0)
- Run without any `node_modules` (bare clone, only `node` installed):
  `node scripts/verify-gate-4.1-onchain.mjs` → **exit 0, PASS 66/66**
- `--json` is byte-deterministic (repeated runs identical) and byte-identical to the
  committed `evidence/gate-4.1-independent-verify.json`
- Schema lock: 37 unique assertions → 66 instances; per-category
  `{spec:4, tx:26, receipt:26, readback:6, cross:4}` matches `SCHEMA.checkCount = 66`
- `--inventory` lists all 37 assertions with per-assertion provenance
- **Reproducibility claim is precise:** the original v1 verifier (`2dd2705`, which
  produced 54/54) was **NOT** runnable from a bare clone (external `@noble/hashes`
  dependency → `ERR_MODULE_NOT_FOUND`). The "reproducible from a bare clone" claim
  applies **only to the v2.1.0 fix after the documented fixes** (inline Keccak,
  RHO-table correction, schema/inventory). This is stated verbatim in
  `evidence/gate-4.1-verification-reconciliation.md` §3.

## 4. Evidence integrity (unchanged, verified)

- `evidence/raw/` (6 verbatim RPC dumps + `manifest.json`): byte-identical to the
  54/54 baseline; SHA-256 pins in the manifest hold (regression test re-hashes all 6)
- `evidence/gate-4.1-identity-preflight.json`, `evidence/gate-4.1-broadcast-recovery.json`:
  untouched since `d543fff`
- `evidence/gate-4.1-broadcast.json`: still **RECONSTRUCTED** (`provenance.origin` =
  "RECONSTRUCTED — rebuilt by tooling after the original gate script crashed
  post-send; NOT the script's own output") — never re-sent, never replaced
- Finding **F-4** remains filed and visible in `evidence/gate-4.1-broadcast.json`
  (`finding` field): recovery-file `calldataSha256 0x541c6f15…` cannot be reproduced
  from the on-chain input (`0xc10474ed…`); recovery file intentionally unedited;
  on-chain truth unaffected and re-verified from raw dumps
- No freeze-record paths modified; `validate-freeze.mjs` PASS 47/47 anchored
  @ `5fcc247214e5ba1af9f48d0e0f97b350fa29b280`
- Test suite: `npm test` = **727/727 pass**

## 5. Governance state

```
BLOCKCHAIN:       ON-CHAIN SUCCESS — per announced evidence (raw RPC proofs on file)
VERIFICATION:     PASS 66/66 (v2.1.0) + 727/727 tests — REPORTED, subject to human review
EVIDENCE:         VERIFIABLE — F-4 DISCLOSED, RECONSTRUCTED file preserved
GOVERNANCE:       PENDING — NOT CLOSED (P7 §5/§6 human signature required)
```

The broadcast-confirmation token inside the quarantined gate is **not** a P7
signature, is not substituted for it, and P7 records were not filled by any tooling.

## 6. Reviewer's note (explicit)

The responsible engineer has **not** independently verified the commit, the CI
logs, or the raw RPC files. The decision recorded here is based on the report
carried over from the working session, not on independent corroboration.

## 7. Remaining human action (to governance close, out of band)

1. Fill P7 §5 (operator identity + personal signature over the file SHA-256) and strike §6.
2. Append the post-execution outcome entry §6 with `Execution authorization: AUTHORIZED`
   **by the named human, never by tooling**.
3. Optional: independent countersignature per GOVERNANCE-MODE §4.

**No further broadcast. No claim of final close.**