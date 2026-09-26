# CoreGuard Adoption Dashboard

Machine-backed board — every number below is read from committed sources
(`docs/state-snapshot.json`, `docs/integration-registry.json`,
`docs/adoption-milestones.json`, `docs/risk-findings.json`,
`docs/reputation-registry.json`). External counters are 0 until a recorded,
authorized step appends a milestone; they are never invented upward.

## Platform level

- **L0 — PUBLIC / REPRODUCIBLE / OFFLINE**

## Control plane (derived from committed evidence only)

| Surface | Status |
|---|---|
| Verification L0 | PASS — offline reproducible |
| Verification L1 | RECORDED_ONLY — live receipts proven only when a real receipt is recorded |
| Verification L2 | REPLAY_CAPABLE — deterministic replay engine online |
| Verification L3 | AVAILABLE — merkle proof primitives |
| Verification L4 | RESEARCH — interface boundary only, no fake ZK |
| Integration — sandbox | AVAILABLE — npm run partner:sandbox (offline, mock chain) |
| Integration — webhook | AVAILABLE — documented start lines wire-proven |
| Integration — adapters | DRY_RUN — 3 adapter(s), no live claim |
| Integration — production | UNKNOWN |
| Commercial revenue | $0 |
| Commercial customers | 0 verified |
| Commercial partners | 0 verified |

Zeroes here are a trust feature, never hidden. No percentage is printed:
every value is derived from a committed source or stays at its honest
default.

## Engineering truth (from the state snapshot)

| Metric | Value |
|---|---|
| Test suite | 1061 |
| Boundary audit | 796 files / 0 violations |
| Docs-node contract | 77 executed · 53 skip-listed · 18 covered |
| Live-submission harness | PEOPLES_COURT_HARNESS_READY |

## Adoption surface (from the integration registry)

| Metric | Count |
|---|---|
| Adapters registered | 3 |
| Adapters in DRY_RUN | 3 |
| Adapters NOT_STARTED | 0 |
| Live adapters | 0 |
| Conformant | 0 |
| Outreach tracks | 6 |

## Risk findings & reputation (CG-RF/1 · CG-RP/1)

| Metric | Value |
|---|---|
| Risk findings version | CG-RF/1 |
| Risk findings (total) | 8 |
| Risk findings OPEN | 4 |
| Reputation version | CG-RP/1 |
| Reputation grade | UNPROVEN |
| Reputation score | 0 |

Findings are risk findings only — never a fuzzy safety score. Reputation
equals only recorded external milestones; engineering numbers are evidence,
not reputation.

## External milestones (append-only ledger)

| Metric | Count |
|---|---|
| External verifiers | 0 |
| Integrations | 0 |
| Conformant partners | 0 |
| Production deployments | 0 |
| Paid engagements | 0 |
| Funding | 0 |

No external milestone is claimed here until it is recorded.
