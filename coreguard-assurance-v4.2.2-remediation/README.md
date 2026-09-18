# CoreGuard Assurance Platform — Gate 4.1

[![CI](https://github.com/EslaM-X/coreguard/actions/workflows/ci.yml/badge.svg)](https://github.com/EslaM-X/coreguard/actions/workflows/ci.yml)

**Verification only.** This platform holds no keys, creates no signatures, and broadcasts nothing. It exists to make one thing provable: whether a release is *fit for an independent authorization decision* — not to make that decision itself.

> **Independent reviewers (C8): start here.** Every command you need is on this page. Do not run any command sourced elsewhere.

---

## Verify the freeze in one command

```bash
node verification/validate-freeze.mjs release/freeze/freeze-record-4.2.6.json
```

**Expected output (exit 0):**

```
PASS (46/46 MATCH, anchored @ <gitCommit from the record>)
```

How to read this result:

- **Commit-anchored.** All 46 hashes are computed from the deterministic git tree recorded in the freeze record — never from the mutable working disk.
- **Exit contract.** `0` verified · `1` fail-closed (any mismatch, unresolvable anchor, or unanchored record) · `2` usage error. Every non-zero outcome is a refusal, by design.
- **`--disk` is diagnostics only.** It verifies working-tree bytes against the pins and is explicitly branded "not evidence". Never cite it in a review.
- **The record:** [`release/freeze/freeze-record-4.2.6.json`](./release/freeze/freeze-record-4.2.6.json) — 27 release files + 19 quarantined legacy files.

## Review map

| # | Artifact | Role |
|---|----------|------|
| 1 | [`STATUS-v4.2.2.md`](./STATUS-v4.2.2.md) | Current gate status and the binding decision |
| 2 | [`release/v4.2.2-remediation/H1-H8.md`](./release/v4.2.2-remediation/H1-H8.md) | Literal reviewer commands and the H1–H8 signature matrix — *the only approved command surface* |
| 3 | [`release/freeze/freeze-record-4.2.6.json`](./release/freeze/freeze-record-4.2.6.json) | The frozen evidence: pins, anchor commit, documented re-pins |
| 4 | `verification/validate-freeze.mjs` | Read-only verifier — never writes, never authorizes |

Older freeze records (4.2.2–4.2.5) and all changelogs are **historical**: preserved as-is, never rewritten.

## Integrity model

Four rules make the evidence tamper-resistant rather than merely present:

1. **Anchored, not floating.** Pins are verified against the anchor commit's tree, so post-freeze disk edits cannot fake a PASS — and cannot fake a FAIL either.
2. **Fail-closed by construction.** `BLOCKED` and `PRECONDITION_FAILURE` are never counted as success; a missing mandatory input stops the run with exit 1.
3. **Re-pins are named exceptions.** Any post-freeze byte change is re-pinned with its file, commit, and reason — and each re-pin is itself verified against the commit it declares.
4. **One declared self-exclusion.** The record cannot hash itself; this is stated in its `excludedList`, closing the loop honestly instead of pretending it doesn't exist.

## Clean-clone behavior is intentional

A fresh clone fails with `INV-001 — fail-closed (exit 1)` because `reviews-extra/` holds external evidence **by design** and is not part of the repository. This is the correct behavior, not an outage: absence of mandatory evidence must block, never pass.

## Decision record

```
C7 = PARTIAL · C8 = PENDING (signing H1–H8 closes C8 only) · C9 = PENDING
CONDITIONAL NO-GO — SIGNING / COMMITINTENT / ANCHORPROOF / MAINNET BROADCAST = NOT AUTHORIZED
```

**Verification success is not authorization.** No test result, hash match, or CI badge grants signing or broadcast rights. Only an explicit, separately recorded owner decision (C9) can move this state — and a green pipeline is not that decision.
