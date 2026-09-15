# Why CoreGuard is valuable to Core itself

Core's 2026 direction, per its own communications, favors **revenue-generating
products and institutional-scale products** over "prove the tech works" proof
points. CoreGuard is positioned exactly there: it is the missing
**verification/security primitive for autonomous execution** — infrastructure,
not a dApp.

## 1. The problem CoreGuard names

On an EVM chain, a transaction proves *what* executed. It does not prove:

- **who authorized it** (which agent/principal actually signed),
- **against which intent it was authorized** (the agent's declared goal, not a raw tx),
- **under which policy** (value caps, target allowlists, deadlines),
- **whether a given actor was the caller at all** (spoofed "the agent did it").

As agents and automated DeFi/treasury flows grow on Core, that ambiguity
becomes a liability: disputes, misattribution, and un-auditable automation.

## 2. What CoreGuard gives Core

- **Deterministic execution verification** — every live capture resolves to one
  of `VERIFIED / INVALID / NOT_PROVEN / NOT_RUN`, **fail-closed** (no result on
  missing history). Demonstrated live on Core Mainnet (tx
  `0xe67c61fda81200bf026faee31c23a7b7e7f56ed24f06ffe24f071fa06891a9b8`, block
  `38712625`, receipt `RECEIPT_INTEGRITY` VERIFIED, L1-verified).
- **Provenance** — recovered signer (`WS-1`) + exact policy verdicts
  (`VALUE_001 / TARGET_001 / DEADLINE_001`). Attribution is deterministic, not
  narrative: wrong-caller → `NOT_PROVEN`; tampered target → `INVALID`;
  missing history → `NOT_RUN` (b) — each with an explicit reason.
- **Auditable automation evidence chain** — intent → authorization → policy →
  receipt → execution evidence → independent attestation, all hash-bound.
- **Infrastructure for AI agents and DeFi** — a primitive protocols can embed
  for agent/keeper/trade audits instead of raw-log forensics.

## 3. Mapping to Core's own selection criteria

Core Commit Program criteria (public, coredao.org/initiatives/commit-program):

| Criterion | CoreGuard evidence |
|---|---|
| Innovative product, strong technology | Deterministic fail-closed verifier; WASM (Rust) independent verifier; C verifier (Python 3.14 stdlib-only, byte-for-byte parity) |
| Scalable TAM | Every ERC-4337/agent/treasury execution on Core is addressable |
| Dedicated team, long-term vision, resilience | v0.1.0→v0.4.0 releases, CI, 73/73 adversarial corpus, documented security remediation |
| Sustainable business model → PMF | `use-cases.md` + `economics.md` (hypothesis; no fabricated revenue) |
| Detailed execution plan | `submission/10` MS-0..MS-3, milestone-gated |
| Robust tokenomics / competitive advantage | `submission/09`; independent __verification__ (vs audits-as-service or score-only) |

## 4. Deliverable claim (the ask, not the plea)

> "We need to see this **running on Core** — among real agents, protocols, and
> treasury flows — because CoreGuard can become a verification/security
> primitive for autonomous execution on Core."

Not: *"we are the greatest project / we need money."* The demo stands on the
Mainnet proof, not on the README.