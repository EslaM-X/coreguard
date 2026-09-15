# 04 — Threat model

## Adversary model

CoreGuard's threat model bounds what a verification claim can mean. The adversary is
any party whose interest is to make execution **appear** to conform when it did not —
without leaving a detectable contradiction in the on-chain record.

### Attack classes the protocol detects (fail-closed)

| Class | Attack example | Verdict |
|---|---|---|
| Authorization forgery | Declaration claims signer X, but the EIP-712 signature does not recover to X | `NOT_PROVEN` (WS-1) |
| Execution substitution | Receiver/target swapped to an attacker address | `INVALID` (`TARGET_001` etc.) |
| Caller mismatch | Execution runs from an account that is not the declared executor | `NOT_PROVEN` / `INVALID` (binding) |
| Value tampering | Amount exceeds the committed VALUE_LIMIT | `INVALID` (`VALUE_001`) |
| Evidence laundering | Claim "verified" while required evidence (block/tx/receipt/history) is missing | `UNVERIFIED` / `NOT_RUN` |
| Trace fabrication denial | Internal execution path unknowable from a receipt | `TRACE_UNAVAILABLE` (honest) |
| Post-hoc blessing | Manufacture a "verification" to fit whatever happened | Prevented: recomputable from chain, fail-closed |

### What is explicitly out of scope (honest boundaries)

- **VERIFIED ≠ SAFE**: no claim about profitability, soundness of a strategy, or "no exploits".
- **L1/RECEIPT-level only** on Mainnet today — no L2 trace claim on public RPC, no
  fabricated internal calls.
- **No surveillance/profiling**: states are facts *about a manifest*, never ratings of
  a person/organization.
- **PRE vs POST seam**: evidence produced after execution never alters the
  PRE decision owner's ALLOW/DENY output.

### Core-attack alignment

Core's own surface (consensus, bridge coreBTC, staking) is **not** what CoreGuard
protects or claims authority over. CoreGuard's value is the layer above: proving what
**autonomous software acting on behalf of a party on Core** was authorized to do and
did. That is the class of incident Core-native BTCFI will face as agents move positions.

Full: `spec/threat-model.md`, `spec/agent-provenance-threat-model.md`,
`spec/agent-provenance-prior-art.md`, `docs/VERIFY-RUN.md`.