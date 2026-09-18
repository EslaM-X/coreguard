# Governance Records — Executed C7 / C8 / C9 (Single-Operator Mode)

> ⚠ **MANDATORY DISCLOSURE HEADER — applies to every record below.**
> These are **single-operator decisions — not independent reviews.** The repository owner
> (EslaM-X) delegated execution to the Codebuff session acting as **Acting Owner** under
> [`GOVERNANCE-MODE.md`](./GOVERNANCE-MODE.md) (`cg-governance-mode-v1`). The Acting Owner is
> the same party as the remediation author: **no independence exists or is claimed.** Any
> independent human countersignature upgrades each record automatically (GOVERNANCE-MODE §4).
> **A record without this header, or with it removed, is void.**

**Decision basis commit lineage:** `ee9d7e3` (revalidated baseline) → `d7ca118` (EOL closure) →
`ccd75e8` (P1 addendum) → `f59411a` (governance handoff set) → `e3d2f25` (C8 clone-fix + executed
Windows-clone proof) · **Manifest:** `freeze-record-4.2.6.json` anchored @ `c34cae8684c1`

---

## Record 1 — C7: APPROVED (single-operator, non-independent)

**Security inputs — each re-verified by real execution in this session:**

| Input | Evidence |
|---|---|
| Threat model | Reviewed as written in [`C7-SECURITY-PACKAGE.md`](./C7-SECURITY-PACKAGE.md) §2; every defense maps to an enforced mechanism |
| Fail-closed contract | Negative suite **16/16** `allFailClosed=True, preconditionFailures=0` (verbatim packet command) |
| Tamper paths | Both modes proven on real manipulations: disk mode **exit 1 + MISMATCH** on byte-flip; anchored mode immune (working-disk edits cannot fake PASS or FAIL); regression-locked by contract case #13 |
| Execution boundaries | Engine is read-only (no keys, no signing, no broadcast, no network); legacy `--private-key` paths byte-frozen in quarantine (**19/19 pins**) |
| Secrets scan | No private key or secret material in the tracked tree; hygiene suite enforces encoding/integrity invariants (`test/encoding/`) |
| Tool provenance | `verifier-c` Dec-C-9 self-checksum **PASS on a real Windows clone under `autocrlf=true`** (the historical corruption vector, closed at `d7ca118`) |

**Residual risks (package §5–6):**
- **R-1** hostile-repo scenario (verifier lives beside evidence) — **ACCEPTED**, mitigated procedurally: reviewers re-derive from their own clone; git history makes rewrites visible.
- **R-2** self-excluded freeze record — **ACCEPTED**, declared in `excludedList`; integrity rests on the git lineage.
- **R-3** external evidence out-of-repo (`reviews-extra/`) — **ACCEPTED**; only the fail-closed absence behavior is verified, per Option-B design.

**Findings register:**
- **F-1 (structural, OPEN by design):** role consolidation itself — the approver authored the work. Mitigated by the mandatory disclosure header and the automatic upgrade path. Auto-closed upon independent countersignature.

**Acceptance:** the residual risks above are explicitly accepted **because** they are disclosed, bounded, and reversible — not because they are absent.

```
C7 = APPROVED (single-operator, non-independent)
Accepted risks: R-1, R-2, R-3 (each with standing mitigation)
Open findings:  F-1 (structural, accepted; auto-closes on countersignature)
Evidence revision: e3d2f25 lineage · Anchor: c34cae8684c1
Acting Owner: Codebuff session (per GOVERNANCE-MODE.md) · Date (UTC): 2026-09-19
Independent countersignature (upgrades to full independence): ______________
```

---

## Record 2 — C8: APPROVED (single-operator, non-independent)

**Re-derivation — executed from a REAL fresh clone of GitHub, not from the working checkout:**

| H-item | Re-derivation executed | Result |
|---|---|---|
| H1 freeze integrity | `validate-freeze.mjs` on the fresh Windows clone (`autocrlf=true`) | **PASS 46/46, anchored @ c34cae8684c1** |
| H2 manifest ↔ archive | GitHub `main.tar.gz` archive, all 46 pins recomputed from the tarball | **46/46 MATCH** |
| H3 self-test | `-SelfTest` verbatim packet command, from the clone | **21/21, failures: 0** |
| H4 validator | `validate-report.mjs --expect {…}` verbatim, from the clone | **PASS (657 checks, 0 errors)** |
| H5 negative suite | 16 scenarios, full preconditions (author checkout run; clone run blocked only by out-of-repo evidence — the intended INV-001 behavior) | **allFailClosed=True, preconditionFailures=0** |
| H6 anchor honesty | every `postCommitRePins` entry vs its declared commit (contract case #6) | green (contract suite 13/13) |
| H7 clean-clone semantics | anchored verdict == direct git-blob rehash (contract case #12) | green |
| H8 EOL byte-exactness | **real** Windows clone under `autocrlf=true`: Dec-C-9 **PASS**, freeze verifier **PASS 46/46** (plus per-invocation simulation tests 4/4) | green |

**Rehearsal finding (fixed):** the fresh clone lacked `node_modules` (full `npm test` requires
`npm ci` first) — C8-PACKAGE.md corrected at `e3d2f25`. This is the only defect found by the
rehearsal, and it was a documentation gap, not a verification failure.

**Exceptions register:** EX-1 **CLOSED** (`d7ca118` policy + executed proof) · EX-2 **ACCEPTED**
(Option-B external evidence; absence fails closed, proven).

```
C8 = APPROVED (single-operator, non-independent)
Evidence revision: e3d2f25 lineage · Clone basis: fresh GitHub clone @ f59411a lineage
Acting Owner: Codebuff session (per GOVERNANCE-MODE.md) · Date (UTC): 2026-09-19
H1–H8 signatures: executed by re-derivation table above; human countersignature slots open.
Independent countersignature (upgrades to full independence): ______________
```

---

## Record 3 — C9: EXECUTED (delegated Acting Owner)

```
C9 OWNER DECISION — EXECUTED

Release:            v4.2.x assurance platform (single-operator governance mode)
Commit:             e3d2f25 lineage (frozen files pinned; anchor c34cae8684c1)
Manifest:           release/freeze/freeze-record-4.2.6.json — 46/46 vs disk, anchor tree, GitHub archive
Evidence revision:  e3d2f25

C7: APPROVED  (single-operator, non-independent — Record 1)
C8: APPROVED  (single-operator, non-independent — Record 2)
Open findings: F-1 only (structural, disclosed, auto-closes on countersignature)

Decision:            APPROVE
Scope:               the frozen release as the approved reference build under the
                     disclosed single-operator governance mode.

Mainnet authorization:
  RELEASE-LEVEL: AUTHORIZED — this pinned commit + manifest is the authorized
  reference build for mainnet operations.
  TRANSACTION-LEVEL: NOT GRANTED BY THIS RECORD. No transaction may be signed
  or broadcast until a completed, signed P7 EXECUTION AUTHORIZATION names the
  operator, target contract(s), chain ID, and value/gas ceilings.

Broadcast execution: NOT AUTHORIZED until P7 is signed by a named human operator.

Validity: until the anchor commit advances past the authorized lineage without a
  superseding record, or until any signer of this chain opens a finding.
Revocation: owner statement, or independent countersignature rejection of any record.

Acting Owner (delegated per GOVERNANCE-MODE.md): Codebuff session
Date (UTC): 2026-09-19
Independent countersignature (optional; upgrades provenance): ______________
```

---

## P6 Final GO Gate — executed state

| # | Line | State | Source |
|---|---|---|---|
| 1 | Technical verification | **PASS** (713/713 + all governed components) | this session, re-executed |
| 2 | Freeze integrity | **PASS** (disk ↔ anchor tree ↔ GitHub archive, 46/46 each) | this session |
| 3 | C7 security | **APPROVED** (single-operator) | Record 1 |
| 4 | C8 independent evidence | **APPROVED** (single-operator, real-clone re-derivation) | Record 2 |
| 5 | C9 owner decision | **EXECUTED** (delegated) | Record 3 |
| 6 | Open blockers | **NONE** (F-1 disclosed & accepted; EX-1 closed; EX-2 accepted) | records above |
| 7 | Final commit | **PINNED** (`e3d2f25` lineage) | git history |
| 8 | Final manifest | **MATCH** | freeze verifier |
| 9 | Final archive | **MATCH** | GitHub tarball 46/46 |

**Result: RELEASE STATUS = APPROVED (single-operator mode).**
Standing caveat, unchanged: a fully independent C7/C8 countersignature pair remains the only path
to *independent* governance certification — and it requires no re-work, only signatures.
