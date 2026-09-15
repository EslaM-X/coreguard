# 11 — 12-month roadmap

Honest baseline: **much of the protocol already exists and is committed** (engine,
three independent verifiers, on-chain anchor, Proof Artifact #1, firewall design,
attack lab). This roadmap therefore describes the *remaining* path to production on
Core, milestone-gated per [`10-funding-ask.md`](10-funding-ask.md).

## Already done (committed, verified — see item 13)

Engine + policy + verifier (+Rust/Python independent re-derivations) · Testnet2
staged campaign `PREPARED / FUNDING-BLOCKED` · live Mainnet anchor (`VERIFIED ANCHOR
INTEGRITY`) · Pilot-1 Mainnet execution `L1 VERIFIED` · firewall + EIP-1271 design
approved · adversarial corpus 73/73.

| | Month 1–3 | Month 4–6 | Month 7–9 | Month 10–12 |
|---|---|---|---|---|
| **Core-facing (MS-0)** | Testnet2 (1114) hardening campaign executed; real-user pre-declared commitment flow; demo pack + entry to Core programs | production hardening; first Core dApp integration POC (vault/strategy agent) | scale POC to 2–3 Core protocols; public badge surface for anchored manifests | Core integration review; ecosystem documentation + security review |
| **Firewall (MS-1)** | finalize v0.2 implementation plan (design approved) | Execution Firewall implementation + attack-lab strengthening (SUT frozen, additive) | firewall live + EIP-1271 smart-account demo on Testnet2/Mainnet | firewall-enabled agent flows; incident-response playbook |
| **Passport / findings (MS-2)** | schema + discretization design (findings ≠ scores) | build findings surface + registry interfaces | passport + findings shipped; Core dApp integration | reputation/attestation APIs for B2B |
| **Demand + pricing** | ElizaOS counterparty #1 conversation (posted/sent); pricing signal trial per-attestation > cost | pricing decision from signal; 2nd counterparty validation | ware vs per-attestation decision; B2B pilot(s) | signed reference trial; per-attestation economics live |
| **Verification research** | L3 Merkle sub-proof design | L3 prototype | L3 + selective disclosure integration | L4 ZK pre-research locked |

## Explicit gates (no milestone auto-proceeds)

- Any **release/tag/push** beyond current boundaries → explicit owner decision.
- Any **new on-chain deployment** → explicit go from Core program + security review.
- **Pricing/paid features** ship only after a real counterparty signal (no premature
  monetization).
- **No engineering on frozen artifacts** (`scripts/verify-live.json`,
  `examples/pilot/proof-artifact-1.json`, released trees) — additive only, always.

## What this roadmap does NOT promise

- No guaranteed TVL, users, or integrations.
- No L4/ZK timeline commitment (research phase).
- No "verified = safe" framing anywhere in deliverables.