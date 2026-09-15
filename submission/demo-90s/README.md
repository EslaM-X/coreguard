# demo-90s — CoreGuard 90-second demo

**File:** [`run-demo-90s.mjs`](run-demo-90s.mjs) · **Run:** `npm run demo:90s`
(or `node submission/demo-90s/run-demo-90s.mjs`)

## What it proves (4 verdicts, ~2s; live re-verify +~10s local)

```
 1. AI AGENT …………………… EOA 0xea41becd…3244
 ↓  2. CoreGuard INTENT …………  intentRef 0xc3902b31…1445
 ↓  3. AUTHORIZATION (EIP-712)… RECOVERED_SIGNER
 ↓  4. FIREWALL ALLOW …………  policy SATISFIED (VALUE_001 · TARGET_001 · DEADLINE_001)
 ↓  5. CORE MAINNET TRANSACTION tx 0xe67c61fd…a9b8 · block 38712625 · status success
 ↓  6. CORE EXECUTION EVIDENCE  L1 receiptId + commitment
 ↓  7. INDEPENDENT VERIFICATION VERIFIED (RECEIPT_INTEGRITY)

 TAMPER TARGET        → INVALID       (TARGET_001 violated)    — synthetic, offline
 WRONG CALLER         → NOT_PROVEN    (WS-1 signer probe)      — synthetic, offline
 MISSING HISTORY      → UNVERIFIED    (3 evidence NOT_RUN)     — synthetic, offline
```

`npm run demo:90s:live` additionally shells the Pilot-1 `capture` against the real
Mainnet tx (read-only) and prints the fresh re-derivation:

```
capture: status=VERIFIED
   ws1=OK (RECOVERED_SIGNER)
   policy=SATISFIED
   legacy-L1=VERIFIED (RECEIPT_INTEGRITY)
   attestation=VERIFIED …
```

## Honesty scope (must-read)

- **Stage 1 reproduces the RECORDED, already VERIFIED Mainnet proof.** It is labeled as
  recorded evidence; live re-derivation happens in Stage 5.
- **Stages 2–4 are offline, deterministic, explicitly labeled synthetic demos** of the
  engine's fail-closed verdicts — the same machinery as the 73/73 adversarial corpus.
  They are never presented as real executions.
- **Receipt refs are capture-time recomputed.** Each live capture re-derives its own
  evidence bundle, so the fresh `receiptId`/refs differ from the frozen
  `proof-artifact-1.json` (the canonical recorded IDs, e.g. `0x4f9d8586…`). What is
  stable across runs: the verdict (`VERIFIED`), the tx, the recovered signer, and the
  policy conformance. The demo prints this note instead of hiding it.
- **VERIFIED ≠ SAFE.** L1/RECEIPT-level evidence; no L2/trace claim; read-only — never
  broadcasts, never uses funds.
- Exit code is non-zero if any expected fail-closed verdict does **not** fail closed.

## Dependencies

- Node ≥ 18. The pilot `capture` (`:live`) additionally needs the local pilot
  declaration artifacts (`examples/pilot/artifacts/*`) and network access; if missing,
  Stage 5 prints an explicit NOT-RUN note with reproduce instructions.