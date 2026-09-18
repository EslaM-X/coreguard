# C8 Package — Independent Evidence Review Handoff

**For:** the independent reviewer (a human other than the remediation author)
**Purpose:** close gate C8 by re-deriving every claim from your own clone — then signing H1–H8.
**This package contains no commands of its own.** The only approved command surface is
[`release/v4.2.2-remediation/H1-H8.md`](./release/v4.2.2-remediation/H1-H8.md). Run nothing sourced elsewhere.

---

## 1. Clone and commit identity

```bash
git clone https://github.com/EslaM-X/coreguard.git
cd coreguard
git rev-parse HEAD   # must equal: f59411a (or later, per the governance log)
npm ci               # required before `npm test` — a fresh clone has no node_modules
```

All claims below are pinned to this lineage; verify before trusting anything:
`ee9d7e3` (final revalidated baseline) → `d7ca118` (EOL policy closure) → `ccd75e8` (closure addendum) → `f59411a` (governance handoff set + executed Windows-clone proof).

## 2. Re-derivation checklist (everything from YOUR clone)

| # | Claim to re-derive | Where the authoritative command lives | Acceptance |
|---|---|---|---|
| 1 | Freeze integrity: 46/46 pins match the anchor tree | H1-H8.md — verifier command | `PASS (46/46 MATCH, anchored @ c34cae8684c1)`, exit 0 |
| 2 | Engine self-test | H1-H8.md — SelfTest command | `checks: 21; failures: 0` |
| 3 | Negative suite fail-closed (with full preconditions) | H1-H8.md — NegativeSuite command | `16 scenarios; allFailClosed=True; preconditionFailures=0` |
| 4 | Report validator | H1-H8.md — validator command | `PASS (657 checks, 0 errors)` |
| 5 | Full test suite | `npm test` | all pass — expected count 713/713 as of `d7ca118` |
| 6 | Anchor honesty: every `postCommitRePins` entry matches its declared commit | automated — contract case in `test/verifier-c/validate-freeze.test.mjs` | contract suite green (13/13) |
| 7 | Clean-clone semantics: anchored verdict equals direct git-blob rehash | automated — contract case (same file) | contract suite green |
| 8 | EOL byte-exactness under Windows autocrlf | automated — `test/eol/eol-policy.test.mjs` | 4/4 |

## 3. Tamper evidence (re-run both modes yourself)

Recorded results from the author's session (reproduce, do not trust):

| Mode | Manipulation | Required outcome |
|---|---|---|
| `--disk` (triage, "not evidence") | append one byte to `README.md` | exit 1 + `MISMATCH README.md (disk)`; restore → clean tree |
| anchored (default) | same manipulation | exit 0, identical verdict — disk cannot fake PASS or FAIL |

The anchored mode is the only evidence surface. `--disk` exists for triage and is branded as such.

## 4. Intentional behaviors you must confirm (not bugs)

- **Clean-clone of the assurance engine fails `INV-001` (exit 1):** external evidence
  (`reviews-extra/`) is intentionally outside the repository; absence blocks, never passes.
- **Historical freeze records (4.2.2–4.2.5) fail `COMMIT-UNANCHORED`** by design: only the
  current record carries the commit anchor.
- **The freeze record excludes itself** from its own hash map (declared `excludedList`).

## 4-b. Printable governance dashboard (read-only reference)

[`GOVERNANCE-DASHBOARD.pdf`](./GOVERNANCE-DASHBOARD.pdf) is an A4 print export of the live
HTML governance board (15 pages): status board, architecture, fixes, freeze model, fail-closed
semantics, the packet's literal commands, cycle history, the H1–H8 matrix, the governors page,
and the path to GO. It is a **rendered snapshot for offline reading, not evidence** — every
claim in it re-derives from your clone via the commands above; if it disagrees with the
repository, the repository wins.

## 5. Open exceptions register

| ID | Item | State |
|---|---|---|
| EX-1 | EOL byte-exactness for `verifier-c` | **CLOSED** at `d7ca118` — `docs/eol-policy.md` + executable proof (4/4). Verify, then countersign the closure. |
| EX-2 | External evidence out-of-repo (`reviews-extra/`) | Documented Option-B design; absence = fail-closed. Reviewer confirms the behavior, not the evidence contents. |

## 6. Signature block (C8 closes here or not at all)

```
C8 = APPROVED / REJECTED (strike one)

Reviewer name:
Reviewer identity verification (how you are not the author):
Evidence revision reviewed (commit):
Date (UTC):
Deviations / notes:
Signature:
```

Signing closes C8 **only**. It grants no Mainnet authorization, no signing rights,
and no broadcast eligibility — those belong to C7 (security), C9 (owner), and a
separate execution authorization.

> **Standing exception (owner-accepted):** single-operator exception accepted by the
> project owner; independent review is unavailable in this project's current composition;
> transaction authorization remains the sole responsibility of the named human operator —
> [`OWNER-STANDING-DECLARATION.md`](./OWNER-STANDING-DECLARATION.md).
