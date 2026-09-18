# C9 — Owner Decision Record

> **هذه الورقة قرار المالك حصريًا.** لا يملأها منفذ الإصلاحات، ولا تُستنتج من نجاح الاختبارات.
> تُملأ فقط بعد C7 = APPROVED وC8 = APPROVED. الفارغ = القرار لم يصدر بعد.

**Project:** CoreGuard Assurance · **Release:** v4.2.x · **Baseline commit:** `ccd75e8` (full SHA: `git rev-parse ccd75e8`)

## 1. Inputs to this decision (must all be verified by the owner or delegate)

| Input | Required state at decision time | Verified by owner? |
|---|---|---|
| Technical verification | PASS (713/713 at `d7ca118`; freeze 46/46 anchored @ `c34cae8684c1`) | ☐ |
| C7 — security review | APPROVED, signed, findings closed or formally accepted | ☐ |
| C8 — independent evidence review | APPROVED, H1–H8 signed | ☐ |
| Freeze integrity | Disk ↔ Manifest ↔ Anchor coherent; clean tree; HEAD == origin/main | ☐ |
| Open exceptions | EX-1 CLOSED · EX-2 accepted explicitly below | ☐ |

## 2. Owner decision

```
Decision:            [ APPROVE / DEFER / REJECT ]        (strike one)
```

**Conditions and scope** (write explicitly, or "none"):

> 

## 3. Mainnet authorization — separate, explicit, narrow

```
Mainnet authorization:   [ NOT AUTHORIZED / AUTHORIZED ]
Network + chain ID:      [ … ]
Target contract(s):      [ … ]
Permitted operation(s):  [ sign-only / tx-creation / submit / broadcast — strike all but one ]
Value / gas ceilings:    [ … ]
Valid from (UTC):        [ … ]   Valid until (UTC):   [ … ]
Revocation mechanism:    [ … ]
```

## 4. Broadcast execution authorization — a further separate step

```
Broadcast execution:     [ NOT ELIGIBLE / ELIGIBLE ]
Requires:                a separately signed EXECUTION AUTHORIZATION naming the
                         authorized operator, per the governance plan (P7).
```

## 5. Signature

```
Owner name / role:
Identity basis:
Date (UTC):
Signature:
Evidence revision this decision covers (commit):
```

---

*This record grants nothing while blank. Success of any test, hash, or CI run is not this decision.*
