# AgentProof Business Model & Positioning (Design Draft)

**Version**: 1.0.0-design · **Status**: Design only — validates incentive model
**Parent**: CGEP/1:AGENT-PROVENANCE

---

## 1. Value Proposition

Two-sided:

- **Executors** (bots, agents, orgs, custodians) get a cryptographically
  verifiable, privacy-preserving provenance badge — counterparties accept them
  faster, risk desks clear them sooner, on-chain activity is auditable.
- **Consumers** (DApps, wallets, risk desks, auditors) get deterministic,
  independently re-verifiable execution provenance — not a heuristic guess.

## 2. What Is Sold / What Is Free

**Free (public good):**
- Protocol + spec + all verification tooling (open source, same
  CI-reproducibility discipline).
- Badge rendering for any anchored manifest.
- Independent re-verification.

**Paid (services, not facts):**
- Hosted/verification infra, SLAs.
- Registry services (agent registration, org attestation management).
- Enterprise: private registries, custody attestation, policy/firewall
  integration support.
- Protocol integrations (SDKs, smart-account firewall enablement).

## 3. Governance & Neutrality (COMPLIANCE GUARD)

- The protocol does NOT turn states into ratings, doesn't rank executors, does
  not police behavior.
- Badge states are facts ABOUT A MANIFEST, not verdicts on a person/organization.
- No profiling/surveillance use case; anti-scoring by design.
- Declared facts are represented AS declared — CoreGuard (or anyone) can
  display `DECLARED` but never silently presents it as proven.

## 4. Competition / Differentiation

| Class | Capability they own | CoreGuard differentiator |
|---|---|---|
| Heuristic scanners (Blockaid etc.) | safety scanning, malware detection | deterministic execution EVIDENCE, zero heuristics in verdicts |
| Risk/analytics dashboards | risk scoring, behavioral attribution | execution provenance + cryptographic authority, no scoring |
| Identity/oracle services | names/credentials | provenance bound to EVIDENCE + anchoring, privacy-preserving |
| Monitoring/alerting | event watching | provenance enforcement gate (firewall), not just alerts |

CoreGuard does NOT compete on "who is this wallet" — it answers "who/what
DECLARED responsibility for THIS execution, and with what proof."

## 5. Monetization Vectors (design, non-committal)

1. Hosted verify + DApp hosting (freemium).
2. Registry & attestation services (B2B).
3. Firewall integration licensing/SDK (B2B2D, when firewall ships).
4. Protocol integrations with Core dApps (fee-split / Revenue share aligned).

## 6. Metrics Honesty (MANDATORY)

- No fake users, TVL, stars, partnerships, or integration counts.
- Any published metric is independently reproducible (e.g., badge counts from
  the open registry + verifier), never vanity numbers.
- No claim of "first/no-competitor" without a prior-art check (see IP spec).

---

*End of AgentProof Business Model & Positioning Draft.*