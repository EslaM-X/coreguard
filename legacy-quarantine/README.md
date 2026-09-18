# Legacy Quarantine — LEG-001 Remediation (2026-09-18)

## Why this directory exists
The CoreGuard Assurance engine (finding **LEG-001**, severity MAJOR, fail-closed) scans
`coreguard/scripts` and `./scripts` for dangerous legacy execution patterns:

  - `cast send`
  - `--private-key`
  - `eth_sendRawTransaction`
  - `eth_sendTransaction`

18 legacy scripts under `coreguard/scripts` matched at least one pattern. Per owner
directive (v4.2.2 remediation plan, Phase 2c), these files were **physically moved**
into this quarantine area so the scanned execution roots no longer contain any
state-changing or private-key-bearing script.

## Rules
1. Nothing in this directory may be executed. It is evidence, not tooling.
2. Nothing in this directory may be restored to `coreguard/scripts` or `./scripts`
   without an explicit, separate owner decision and a fresh assurance cycle.
3. If a modern equivalent is ever needed, it must be **rewritten** under the current
   policy (no `--private-key`, approved secret mechanism, bounded scope) and pass a
   fresh independent review. Moving a file back is not remediation.
4. Quarantine preserves bytes exactly — no content edits were made during the move.

## Content (3 groups)
- `2026-09-18-v4.2.2/anchor/` — local anchor helpers (anchor-local.ps1/.sh)
- `2026-09-18-v4.2.2/mainnet-gates/` — gate-3.x deploy/commitintent/anchorproof/readback/verify/freeze scripts + cg-gate31 + evidence-registry-phase3
- `2026-09-18-v4.2.2/broadcast-and-tests/` — gate-4.1 broadcast/preflight/recovery harness + testnet2 phases

Each subgroup README (see below) lists the exact original paths for restoration provenance.
