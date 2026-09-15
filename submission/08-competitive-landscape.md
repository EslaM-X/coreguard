# 08 — Competitive landscape

Summary of the defensible positioning from `spec/competitive-kill-matrix.md`,
`spec/six-killers.md`, `spec/agent-provenance-business.md` and
`spec/agent-provenance-prior-art.md`. **Direction of travel matters**: CoreGuard is not
a "better scanner" — it answers a question scanners do not answer.

## The question CoreGuard answers (nobody else's default)

> "Who/what **declared** responsibility for THIS execution, and with what independently
> verifiable proof that it conformed to authorization?"

| Class | What they own | CoreGuard differentiator |
|---|---|---|
| Heuristic security scanners (Blockaid et al.) | Safety scanning, malware detection, pre-tx simulation | Deterministic execution **evidence**; zero heuristics in verdicts |
| Risk/analytics dashboards | Risk scoring, behavioral attribution | Execution provenance + cryptographic authority; **no scoring** |
| Identity / oracle / attestation services | Names, credentials, reputation | Provenance bound to **evidence + anchoring**; privacy-preserving |
| Monitoring / alerting | Watching events, alerting | **Enforcement gate** (firewall) + post-hoc proof, not just alerts |
| Log-based agent audit trails | Same-process logs | Receipts **recomputed from chain**, anchored, fail-closed |

## Prior-art boundaries (locked, honest)

- ERC-8004 (agent identity/discovery/trust primitives — active Draft) and ERC-8126
  (AI-agent technical verification — Final) exist; positioning was checked against
  them (dated prior-art note in `spec/agent-provenance-prior-art.md`).
- Blockaid's "Core integration" refers to the **Avalanche C‑Chain wallet for Core
  (Web3)**, not the Core DAO chain (chainId 1116) — kept out of any claim.
- Core itself has an active AI-agent + BTCFi execution ecosystem — that is a reason to
  build **on** Core, not a claim that CoreGuard owns the category.

## What CoreGuard does NOT claim

- Not "first", not "nobody does this", not "no competitors". (See IP/prior-art gates.)
- Not competing on "who is this wallet" — the question is **responsibility + proof**.
- Verdicts are facts about a manifest — **no surveillance, no profiling, no scoring**.