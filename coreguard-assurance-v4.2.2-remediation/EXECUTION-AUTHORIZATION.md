# P7 — Execution Authorization (Template, Technically Pre-Filled)

> **What this paper is:** the final gate before any transaction signing or broadcast —
> structurally separate from C9 by design. C9 authorizes the *release as a reference build*;
> **only this paper can authorize an *execution*.**
>
> **Filling rule:** every technical field below is pre-filled from verified, reproducible
> sources (each one carries its verification command). The operator identity and signature
> blocks are deliberately empty — they can be filled only by a **named human operator**,
> in person, at execution time. **No agent, session, or tooling may fill them.** No private
> key, seed, or secret material may ever be produced, stored, or transmitted through this
> repository, its tooling, or any chat session.
>
> **This template grants nothing while the signature blocks are blank.**

---

## 1. Approved release (verified — do not retype, verify instead)

```
Approved release:    v4.2.x assurance platform — single-operator governance mode
Commit:              8e00475426150c33357e427e19d6a38b32f2e0c4  (HEAD == origin/main at template issue)
                     lineage: ee9d7e3 → d7ca118 → ccd75e8 → f59411a → e3d2f25 → fa15eb2 → 8e00475
Manifest:            release/freeze/freeze-record-4.2.6.json
Anchor:              c34cae8684c18111d014c89af3be2cad0d86f531
Manifest scope:      46 pins = 27 release + 19 quarantine entries (+1 self-excluded record)
```

**Verification commands the operator runs personally before signing** (from
[`release/v4.2.2-remediation/H1-H8.md`](./release/v4.2.2-remediation/H1-H8.md) — the only
sanctioned command surface):

| # | Check | Acceptance |
|---|---|---|
| 1 | `git rev-parse HEAD` from a fresh clone | equals the Commit above, or a successor explicitly re-authorized in C9 §3 |
| 2 | freeze verifier (H1-H8 command) | `PASS (46/46 MATCH, anchored @ c34cae8684c1)`, exit 0 |
| 3 | `npm ci && npm test` | 713/713 (or the successor's documented count) |
| 4 | CI on the exact commit | green (issue-state: run `35406195777` ✓ @ `8e00475`) |

If any check fails or HEAD moved: **stop.** A new lineage requires a superseding C9 record —
this template does not travel across commits.

## 2. Governance prerequisites at issue time (each: signed record, not a claim)

| Gate | State | Record |
|---|---|---|
| C7 security | APPROVED (single-operator, non-independent) | [`GOVERNANCE-RECORDS.md`](./GOVERNANCE-RECORDS.md) Record 1 |
| C8 evidence | APPROVED (single-operator, non-independent) | Record 2 |
| C9 owner decision | EXECUTED (delegated) — Mainnet release-level AUTHORIZED, transaction-level deferred to **this paper** | Record 3 |
| P6 GO gate | 9/9 executed | GOVERNANCE-RECORDS.md, P6 table |
| Disclosure caveat | **all of the above carry the mandatory single-operator header — no independence exists or is claimed** | [`GOVERNANCE-MODE.md`](./GOVERNANCE-MODE.md) |

> An independent countersignature pair on C7/C8 upgrades the chain to full independence
> automatically (GOVERNANCE-MODE §4) — it is not required for this paper to *function*,
> but its absence bounds what this paper can honestly certify.

## 3. Execution scope — operator fills in person, nothing pre-decided

```
Network + chain ID:          [ operator writes — must match C9 §3 if a target was recorded there ]

Target contract(s):          [ operator writes — exact address(es), verified on-chain ]

Permitted operation(s):      [ strike all but one:  sign-only / tx-creation / submit / broadcast ]

Value ceiling:               [ … ]        Gas ceiling:               [ … ]
Nonce / sequence range:      [ … ]        Expiry (UTC):              [ … ]

Revocation:                  owner statement voids this paper instantly;
                             any open finding by any signer of the chain voids it automatically.
```

## 4. Pre-execution verification by the operator (all boxes, in order)

```
[ ] Fresh clone: HEAD == authorized commit (§1)
[ ] Freeze verifier: PASS 46/46 anchored @ c34cae8684c1, exit 0
[ ] npm ci && npm test: green
[ ] CI green on the exact commit
[ ] chain ID of the live network matches §3 exactly
[ ] target contract bytecode/source verified independently of this repository
[ ] value and gas within the ceilings written in §3
[ ] no open finding in GOVERNANCE-RECORDS.md at signing moment
[ ] keys sourced from operator-controlled storage — never from this repo, its
    tooling, or any chat session
```

**One unchecked box ⇒ do not sign, do not execute. The failure mode is fail-closed.**

## 5. Operator identity and signature — the only blank that matters

```
Authorized operator:         [ full legal name — a human; agents and sessions are
                               structurally ineligible for this field ]

Role / capacity:             [ … ]
Operator identity basis:     [ how the counterparty knows you — verified out-of-band ]
Date (UTC):                  [ … ]
Signature:                   [ hand-signed or equivalent personal cryptographic signature
                               over this file's SHA-256 ]

File SHA-256 at signing:     [ sha256sum EXECUTION-AUTHORIZATION.md — computed by the
                               operator personally at signing time ]
```

## 6. Post-signing record

```
Execution authorization:     [ AUTHORIZED / NOT AUTHORIZED ]   (strike one)

Resulting state when AUTHORIZED:
  - RELEASE STATUS:          APPROVED (unchanged)
  - MAINNET (release-level): AUTHORIZED (unchanged, per C9 Record 3)
  - TX SIGNING:              AUTHORIZED — narrow scope of §3 only
  - BROADCAST:               AUTHORIZED — narrow scope of §3 only
  - Everything outside §3:   NOT AUTHORIZED — this paper grants no general permission

Post-execution: append the outcome (tx hash, block, actual gas) to
GOVERNANCE-RECORDS.md as a new dated entry — signed by the operator.
```

---

*Filed by the Acting Owner session as a template only. Fields marked "operator writes" were
left empty on purpose: they are the human boundary this governance system exists to defend.*
