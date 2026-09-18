# C7 Package — Independent Security Review Handoff

**For:** the security authority (a human other than the remediation author)
**Purpose:** enable a real, in-scope security review of the frozen release — then a formal C7 approval.
**This package claims nothing on your behalf.** It defines the scope, the threat model, the
evidence pointers, and the known limitations; the judgment is yours.

---

## 1. Scope

| Item | Value |
|---|---|
| Review commit | `ccd75e8` (lineage: `ee9d7e3` revalidated baseline → `d7ca118` EOL closure → `ccd75e8`) |
| Platform | `coreguard-assurance-v4.2.2-remediation/` (27 pinned release files + 19 quarantined legacy files) |
| Engine | verification-only PowerShell + Node tooling; **no keys, no signatures, no transactions, no broadcasts** |
| Out of scope | contract runtime (`src/`, `contracts/`), CI infrastructure beyond the verification pipeline, anything not in the freeze map |

## 2. Threat model (what this platform defends against)

| Threat | Defense | Enforcement point |
|---|---|---|
| Silent evidence substitution | commit-anchored hash pins, verified from the git tree | `validate-freeze.mjs` (anchored mode) |
| Post-freeze edits passing as verified | disk edits cannot influence the anchored verdict; re-pins are named exceptions verified per-commit | `postCommitRePins` honesty (contract case #6) |
| Tampered verifier producing false PASS | verifier is outside the freeze map by declared decision; reviewer re-derives verdicts from their own clone (C8 package §2–3) | independent re-execution |
| `NOT_APPLICABLE`/`ABSENT` counted as success | strict scenario semantics; preconditions fail closed (exit 1) | negative suite (16 scenarios) |
| Engine that could sign or broadcast | read-only constitution; no key material in the repo; legacy `--private-key` paths quarantined and hashed | engine AST self-checks (SELF-002 contract) + quarantine pins |
| EOL rewriting corrupting byte-sensitive surfaces | `-text` rules + executable proof under `autocrlf=true` | `docs/eol-policy.md`, `test/eol/` |

## 3. Fail-closed contract (binding)

`PASS` only with evidence · `FAIL` on detected violation · `BLOCKED`/`PRECONDITION_FAILURE` on
missing mandatory inputs (exit 1) · `NOT_APPLICABLE`/`ABSENT` never count as success in mandatory
negative scenarios · any unresolvable anchor refuses the run.

## 4. Negative & tamper evidence pointers

- Negative suite: 16 scenarios, `allFailClosed=True` (command in H1-H8.md).
- Tamper, both modes: C8 package §3 (disk mode fails closed on drift; anchored mode immune).
- Quarantine integrity: 19 legacy files pinned — legacy `--private-key` paths provably byte-frozen.

## 5. Known limitations (explicit; none are hidden)

1. The verifier is inside the same repository as the evidence — a fully hostile repo could
   rewrite both. Mitigation is procedural: the reviewer re-derives from their own clone at a
   pinned commit (C8 §2), and git history makes silent rewrites visible.
2. The freeze record excludes itself from its own map (declared). Integrity of the record file
   itself rests on the git lineage and the reviewer's clone.
3. `reviews-extra/` external evidence is not in-repo by design (Option B); its contents were not
   verified by this platform, only the fail-closed behavior of its absence.
4. The Windows-autocrlf failure mode was live until `d7ca118`; clones made before that commit
   must be re-cloned or `git checkout` refreshed.

## 6. Residual risks you are asked to accept or reject

R-1 hostile-repo scenario above (accepted / rejected / mitigations required)
R-2 self-excluded record (accepted / rejected)
R-3 out-of-repo external evidence (accepted / rejected)

## 7. Signature block (C7 closes here or not at all)

```
C7 = APPROVED / REJECTED (strike one)

Reviewer name:
Scope reviewed (commit + files):
Findings: [OPEN findings must each carry severity + required remediation + owner]
Residual-risk acceptance (R-1/R-2/R-3):
Date (UTC):
Signature:
```

C7 approval does not authorize signing, `commitIntent`, `anchorProof`, or broadcast.
Next gates: C8 (independent evidence), then C9 (owner decision).
