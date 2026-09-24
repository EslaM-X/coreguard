# Funding roadmap (Phase D) — 2026

Honest inventory of funding paths for a small OSS verification protocol.
Baseline rules: never build a financial plan on a program that may be closed,
never count a program as "engaged" because a page exists, and never convert lack
of a decision into success.

---

## 1. The one concrete, open OSS path: OCV Catalyst v2

**Status: CONFIRMED OPEN (Summer 2026 cohort, verified 2026-09-24).**

| Item | Value (verified) |
|---|---|
| Program | OCV Catalyst v2 — OSS incubator |
| Award | $10,000 |
| Cohort | 8 accepted projects |
| Selection | rolling review |
| Application deadline | 2026-06-28 |
| Kickoff | 2026-07-14 |
| Application channel | greenhouse.io OSS listing |

Notes:
- This is the **only** currently-live OSS grant path we could confirm with dates
  from a primary source. An earlier search result pointed at a "v1 Application
  (Spring 2026)" record with different dates (deadline January 16, kickoff
  February 2); those dates describe an earlier cohort and must not be cited for
  the Summer 2026 window.
- Candidate fit: CoreGuard is a determinism-focused, test-heavy OSS protocol —
  the conformance/verification angle is directly demonstrable in a 3-month
  incubator (forensic determinism, adapter conformance, reference tribunal).
- Pre-submission evidence already in-repo: 23 new conformance/contract tests for
  the adapter + tribunal, byte-determinism tests, fail-closed semantics.

### Milestones we would ship each is funded

| Milestone | Deliverable | Gate |
|---|---|---|
| M0 (now, no funding) | Adapter dry-run, reference tribunal, conformance suite, article draft | merged + CI green |
| M1 | Live-submission harness template + webhook consumer (eventId dedup + replay) | integrates with a credential-holding integrator test account only |
| M2 | Generic tribunal signing interface (adapter-agnostic Award ingestion) | awardSlot ingestion + signature verification contract |
| M3 | Settlement-boundary SDK for wallet/Firewall layer | mock execution path in conformance; real execution gated by governance |

---

## 2. Core ecosystem programs — flagged, some possibly closed

Core's Dev Hub exposes accelerator programs (a Bitcoin Fi accelerator, a
community/catalyst program, etc.). **Do not build the financial plan on them**:
several appear to be cohort-based programs whose previous cohorts may be closed
or superseded. Treat any future application as opportunistic, not planned
income. If a current window is confirmed from a primary source, it goes on the
table above, with dates, in the same "verified" format.

---

## 3. Realistic funding targets (12-month view)

| Path | Probability | Amount | Trigger |
|---|---|---|---|
| OCV Catalyst v2 | honest: low (8 slots) | $10,000 | application by 2026-06-28 |
| Service: verification runs for BTCFi protocols/auditors | medium | $2k–10k / engagement | external demand + a signed engagement |
| Core accelerator (if a current cohort opens) | low–medium | variable | confirmed window + application |
| Grants (ecosystem DAOs, matching pools) | low | variable | open calls, no fabrication |

Financial discipline (binding):
- Numbers above are **ranges**, not commitments; nothing is "secured".
- No metric in the repo may be converted to a funding claim (downloads, clones,
  UNKNOWN → success are never revenue signals by themselves).
- Any paid engagement must keep the protocol MIT/open and the conformance
  evidence free.

---

## 4. What never appears in this document

- A claim that any program has "shown interest" or "responded".
- A dollar figure described as committed.
- An accelerator described as funded purely on the strength of its public page.