# 13 — GitHub + release/tag evidence

## Repository

`https://github.com/EslaM-X/coreguard` — all evidence below is clone-verifiable.

## Release tags

```
v0.1.0   v0.1.1   v0.2.0   v0.2.1   v0.3.0   v0.4.0
```

Plus workstream/hygiene commits recorded in `git log` (e.g., Pilot-1 gate → broadcast →
freeze → docs chain: `1eed420` … `5330b05` … `9ad7272` … `4403fe7`).

## Mainnet-verified anchor (frozen historical record)

- Registry `0x037dF08F2d43c5D03759279Fe35664f6AFf9EA6E` on Core Mainnet (1116)
- Verdict **VERIFIED ANCHOR INTEGRITY** (A+B+C), committed receipt `0xeaa87ec1…44eb6`,
  commitment `0xc0dbfb45…1052`, proof `0xecd9e6b3…a6b8`
- Verified across two independent RPCs (`rpc.coredao.org`, `rpc.ankr.com`) —
  bytecode, both commits, events, `verifyCommitment(...) == true`
- Bundle: `scripts/verify-live.json` (frozen) · reproduction: `docs/DEPLOYMENT.md`

## Pilot-1 execution proof (real Core Mainnet transaction)

- tx `0xe67c61fda81200bf026faee31c23a7b7e7f56ed24f06ffe24f071fa06891a9b8`, block `38712625`
- **L1 VERIFIED** — full record + all hashes in [`06-mainnet-proof.md`](06-mainnet-proof.md),
  machine-readable snapshot `examples/pilot/proof-artifact-1.json` (non-secret).

## CI + correctness evidence

- CI badge in the root README reflects default-branch runs.
- `npm test` (unit/integration incl. canonicalization, policy, tamper, anchor, Pilot-1
  suites) · `npm run corpus && npm run benchmark` (73/73) — both runnable in a fresh clone.
- Three independent verifiers (JS / Rust-WASM / Python) with byte-for-byte parity claims
  committed + gated in-repo.
- Frozen files are enforced by commit discipline (`git diff` hygiene; frozen evidence
  hash unchanged); additive-only rule recorded in spec.

## How to verify this page in ~2 minutes

```bash
git clone https://github.com/EslaM-X/coreguard.git && cd coreguard
git tag                               # v0.1.0 … v0.4.0
npm install
npm test && npm run benchmark          # suites + 73/73
npm run demo:90s:live                  # live re-derivation from Core Mainnet (read-only)
npm run anchor:verify                  # regenerated bundle; frozen file unchanged
```