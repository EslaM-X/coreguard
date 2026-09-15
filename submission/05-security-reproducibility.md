# 05 — Security / reproducibility evidence

## Three independent implementations of the same verification chain

| Verifier | Language | Independence |
|---|---|---|
| A — reference engine (`packages/verifier`) | JS/ESM | reference implementation |
| B — `packages/independent-verifier` | Rust → WASM | written from scratch, never imports/trusts A's results |
| C — `packages/verifier-c` | Python 3.14, stdlib-only | third implementation, byte-for-byte parity with B |

Output parity is asserted **byte-for-byte** (Verifier C mirrors Verifier B exactly —
same envelope, labels, reasons). Design and review gates recorded in
`spec/verifier-c.md` and `spec/agent-provenance-roadmap.md`.

## Deterministic adversarial corpus

- `npm test` — unit/integration suites (canonicalization, policy, tamper, anchor, Pilot-1).
- `npm run corpus && npm run benchmark` — **73/73 adversarial scenarios** (valid,
  invalid, mutations, tamper, performance) pass deterministically.
- `test/firewall/attack-lab/` — adversarial attack/mutation lab (additive).

## Frozen, hash-pinned Mainnet evidence

- `scripts/verify-live.json` — **frozen historical record** of the Core Mainnet anchor
  (registry `0x037dF08F2d43c5D03759279Fe35664f6AFf9EA6E`; `VERIFIED ANCHOR INTEGRITY`).
  Live re-runs write to `scripts/verify-live.regenerated.json` and must never edit the frozen file.
- `examples/pilot/proof-artifact-1.json` — committed, **non-secret** Proof Artifact #1
  snapshot (no keys, no raw transaction hex).

## Reproduce each published number

```bash
git clone https://github.com/EslaM-X/coreguard.git && cd coreguard
npm install
npm test                 # canonicalization, policy, tamper, anchor, Pilot-1 suites
npm run corpus && npm run benchmark   # 73/73
npm run demo:90s         # recorded VERIFIED + fail-closed verdicts
npm run demo:90s:live    # + live re-derivation from Core Mainnet (read-only)
npm run anchor:verify    # regenerated bundle; frozen verify-live.json stays unchanged
git tag                  # v0.1.0 … v0.4.0
```

## CI

Workflows run the test + benchmark gates; the badge in the root README reflects the
current default branch. Every commit in the repo log carries its CI-visible result.

## Security process

Vulnerabilities: see `SECURITY.md`. Protocol spec CGEP/1 is a draft for open
discussion, not a claim of standard.