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

**Standing exception, owner-accepted:** the single-operator nature of every record above is
formalized in [`OWNER-STANDING-DECLARATION.md`](./OWNER-STANDING-DECLARATION.md)
(`cg-owner-standing-v1`) — independent review unavailable, accepted by name; transaction
authorization remains the sole responsibility of the named human operator, per the binding
P7 boundary (its §3).

---

## Record 4 — Gate 4.1 identity anchor: BROADCAST EXECUTED (Core Mainnet 1116)

**Single-operator disclosure applies — this is an executed single-operator broadcast, not an
independent review.** It was performed by the acting owner via the quarantined gate
`gate-4.1-broadcast.ps1` after full delegated authorization for this specific transaction
(the P7 §3 scope for this identity anchor), value 0, gas ceiling 300,000, nonce 8.

**Executed transaction (verified on-chain, not asserted):**

| Field | Value | How verified |
|---|---|---|
| Transaction | `0x68d9fbf1b384fe416d2222347d15e492e78d7b14f05cae0c9edbd57ce373c567` | `eth_getTransactionByHash` (blob: from/to/nonce/input identical to reviewed payload) |
| Block | `38827925` · gas 148,876 limit / **105,339 used** / price `60 gwei` | `eth_getTransactionReceipt` |
| Receipt status | **`0x1` (success)** | receipt |
| Function | `commitIntent(bytes32,bytes32,address,uint256,bytes)` · selector `0x4fd0505d` | ABI re-derived + byte-verified |
| Contract | EvidenceRegistryV2 `0x66268a47e81b8f657798d7b5bbedc956df7b13fd` (chainId 1116) | live chainId + codeLen 3128 |
| Signer | `0xEa41BecDeb612d8625bF3060809964F1DAB43244` (owner keystore, address-verified) | keystore derivation vs `.env` + gate-4.0 |
| intentId | `0xc4799b1ddb9ed99463400c8540aefc81d9998b5541cd878267c2144e5a16000d` | gate-4.0 evidence + readback |
| intentCommitment | `0xb82f1f8073286fdf5a598e69a17246fdea09d10a9958fbc52f9ee8f7f925cee6` | on-chain readback AFTER broadcast |
| validUntil | `1789797609` | readback + review plan |
| `IntentCommitted` log | topics[0..3] matched exactly (event sig, intentId, commitment, signer) | receipt log inspection |
| On-chain readback | `intentCommits[intentId]` → commitment + signer + validUntil **all match** | `eth_call` post-broadcast |

**Post-broadcast recovery review (manual, as the gate requires):** the gate wrote
`evidence/gate-4.1-broadcast-recovery.json` during its own post-send verification because its
log-match step hit a transient mismatch in that instant. The mandatory manual review —
performed here, independently of the gate, from the committed evidence and live RPC — confirms
the transaction **succeeded** (status `0x1`, log topics matched, readback committed by the exact
signer/commitment/validUntil). **No retransmission ever occurred;** the gate's never-auto-resend
contract was honored. The intent is now **committed on-chain**.

**Evidence on disk:** `evidence/gate-4.1-broadcast.json` (success, authoritative) +
`evidence/gate-4.1-broadcast-recovery.json` (the gate's transient post-send record). Neither
contains any private key, passphrase, signature, or raw calldata.

```
Gate 4.1 identity anchor = COMMITTED ON CORE MAINNET 1116
tx = 0x68d9fbf1b384fe416d2222347d15e492e78d7b14f05cae0c9edbd57ce373c567 · block 38827925
intentId = 0xc4799b1ddb9ed99463400c8540aefc81d9998b5541cd878267c2144e5a16000d
Acting Operator: owner (keystore coreguard-anchor) · Date (UTC): 2026-09-19
Independent countersignature (upgrades provenance): ______________
```
