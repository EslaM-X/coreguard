# Quickstart — CoreGuard Verification Platform (offline, three verbs)

The whole integration surface is three calls: **commit**, **capture**, **verify**. This
directory runs them offline in a clean clone — no network, no keys, no credentials, and no
claim about anything upstream.

Run it:

    node examples/platform-quickstart/quickstart.mjs

npm script: `npm run quickstart`

## The three calls

- `commit(intent)` — L0. Canonicalize, hash, commit. The same intent bytes always produce
  the same `commitmentId`, so a commitment is replayable by construction.
- `verifyReceipt(receipt, commitment, chain)` — L1. Chain-confirmed integrity. The third
  argument is the chain authority: pass an object with `getReceipt(txHash)` and the verdict
  can be `VERIFIED`; omit it and the verdict is `UNKNOWN / NO_CHAIN_EVIDENCE`. The receipt
  itself is what your capture step produced — in this example, a literal, because there is
  nothing to capture from offline.
- `replay(intent, receipt, rules)` then `verifyMerkle(proof, root, leaf)` — L2 and L3.
  Deterministic rule replay, then a compact proof for one leaf.

Each call returns a verdict plus a code. None of them returns a promise, and none of them
upgrades itself.

## What the run prints, and why each line matters

| Line | Verdict | Reading |
| --- | --- | --- |
| same bytes, same id | `true` | L0 determinism: the commitment is replayable |
| with a chain authority | `VERIFIED / RECEIPT_INTEGRITY` | the chain confirms this txHash in this block |
| no chain authority | `UNKNOWN / NO_CHAIN_EVIDENCE` | a format-valid receipt is **not** verified |
| swapped txHash | `MISMATCH / TX_NOT_FOUND` | a substituted hash is a contradiction, not a near-miss |
| every rule PASS | `MATCH / REPLAY_CONSISTENT` | L2 replay, all canonical rules |
| one rule contradicted | `MISMATCH / RULE_FAILED` | a failed rule is a failure |
| no evidence at all | `UNKNOWN / EVIDENCE_MISSING` | missing evidence is UNKNOWN; no partial success upgrades to MATCH |
| leaf 1 proves | `true` | L3: one leaf is provable without the bundle |
| forged leaf | `false` | a substituted leaf fails the same proof |
| L4 | `RESEARCH` | no circuit, no prover, no "ZK supported" claim |

The exit code is non-zero if any of those lines is wrong, so this doubles as a smoke test in
CI.

## What this does not do

- It does not talk to a network, so it verifies nothing about a live chain. The mock chain
  knows exactly one mined transaction; that is the point — a chain that confirms everything
  would verify nothing.
- It is not a verdict on a real dispute. It is the machine that would produce one, with the
  evidence wired.
- It makes no adoption, revenue, partner, or L4 claim. Those counters are 0 and stay 0.

Next: `npm run partner:sandbox` for the eight integration scenarios, `npm run attack-lab` for
the ten tamper cases, and `docs/verification-and-integration-platform-2026-09-26.md` for the
full contract.
