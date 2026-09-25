# CoreGuard Adoption Dashboard

Machine-backed board — every number below is read from committed sources
(`docs/state-snapshot.json`, `docs/integration-registry.json`,
`docs/adoption-milestones.json`, `docs/risk-findings.json`,
`docs/reputation-registry.json`). External counters are 0 until a recorded,
authorized step appends a milestone; they are never invented upward.

## Platform level

- **L0 — PUBLIC / REPRODUCIBLE / OFFLINE**

## Engineering truth (from the state snapshot)

| Metric | Value |
|---|---|
| Test suite | 1043 |
| Boundary audit | 785 files / 0 violations |
| Docs-node contract | 70 executed · 53 skip-listed · 18 covered |
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
