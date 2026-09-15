# Use cases — 2–3 profiles for institutional proof

Each profile: **scenario → guard path → independent verifiability → who pays**.
All three are concrete enough to demo with the existing engine; none claim a
signed customer. They are **pilot hypotheses**, marked as such.

---

## U1 · DeFi protocol / BTCfi (keepers, strategies, incentives)

- **Scenario.** A DeFi protocol on Core runs automated keepers/strategies and
  pays incentives for activity. Disputes arise over *which actor ran which
  action* and whether an action matched the declared intent.
- **Guard path.** The actor signs a CoreGuard intent (goal + target + value cap
  + deadline). Live capture returns a VERIFIED receipt with recovered signer and
  exact policy verdicts; tampered target → INVALID; spoofed caller → NOT_PROVEN.
  (Offline demo reproduces all verdicts in ~2s: `npm run demo:90s`.)
- **Independent verifiability.** Anyone re-derives the verdict from the frozen
  evidence assets + Mainnet anchor — no trusted third party needed.
- **Who pays.** Protocol treasury / DAO budget for audit-and-attribution
  assurance; or per-execution verification gas-plus by the integrating protocol
  for its own counterparties.

## U2 · AI agent executing transactions

- **Scenario.** An agent holds funds and executes on Core; counterparties,
  custodians, and auditors need proof of *what was actually authorized* — a
  signed intent and policy, not "the agent did it."
- **Guard path.** Intent + authorization + policy honored; the `NOT_PROVEN`
  (wrong caller) and `INVALID` (tampered target) cases are exactly the
  self-demonstrating failure modes shown in the 90s demo.
- **Independent verifiability.** The evidence chain (receipt → evidence →
  attestation refs) is hash-bound and re-derivable from block data.
- **Who pays.** Agent platforms / wallet infrastructure / enterprise agent-ops
  budget (compliance line, not discretionary).

## U3 · Treasury / institutional automation

- **Scenario.** Compliance and internal audit need a per-execution attestation
  with a frozen anchor, and a **fail-closed** stance when history is missing.
- **Guard path.** Missing historic state → NOT_RUN (never a falsified
  "looks fine"); EIP-1271 / smart-account authority paths covered; fail-closed
  semantics built in (`docs/ARCHITECTURE.md`, `docs/VERIFY-RUN.md`).
- **Independent verifiability.** Same re-derivation; anchor integrity is
  independently confirmable on Core (registry `0x037dF08F…6E`, VERIFIED ANCHOR
  INTEGRITY across two RPCs).
- **Who pays.** Treasury ops / compliance budget. Mirror of U1's engine with a
  heavier compliance ask.

---

## Honesty box

- No signed pilot, no customer, no revenue exists. These are **demand
  hypotheses** to test *with* Core/partners once the Decision Gate opens.
- "Who pays" reflects existing institutional budgets (audit, compliance,
  agent-ops), not any contract we hold.

## What we'd ask a pilot partner

1. Pick one flow (keeper, agent spend, treasury payment).
2. We attach a pre-declared intent + policy; partner executes on Core.
3. We produce a VERIFIED/INVALID/NOT_PROVEN/NOT_RUN receipt they can re-derive.
4. Partner grades: does this make execution independently auditable for *them*?