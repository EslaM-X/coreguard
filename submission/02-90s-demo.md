# 02 — The 90-second technical demo

## What you will see (in ~90 seconds, fully reproducible)

```
 1. AI AGENT …………………… EOA 0xea41becd…3244
 ↓  2. CoreGuard INTENT …………  intentRef 0xc3902b31…1445
 ↓  3. AUTHORIZATION (EIP-712)… RECOVERED_SIGNER
 ↓  4. FIREWALL ALLOW …………  policy SATISFIED (VALUE_001 · TARGET_001 · DEADLINE_001)
 ↓  5. CORE MAINNET TRANSACTION tx 0xe67c61fd…a9b8 · block 38712625 · status success
 ↓  6. CORE EXECUTION EVIDENCE  L1 receiptId + commitment
 ↓  7. INDEPENDENT VERIFICATION VERIFIED (RECEIPT_INTEGRITY)

 then, fail-closed (labeled, offline, deterministic):
     TAMPER TARGET        → INVALID       (TARGET_001 violated)
     WRONG CALLER         → NOT_PROVEN    (WS-1 signer probe)
     MISSING HISTORY      → UNVERIFIED    (evidence NOT_RUN — never fabricated)
```

## Run it

```bash
npm install
npm run demo:90s          # recorded VERIFIED + the three fail-closed verdicts
npm run demo:90s:live     # same, plus live re-derivation straight from Core Mainnet
```

Runs in ~2 seconds offline; the live stage adds one read-only RPC pass (~5–10 s).

## Where the verdicts come from (auditor-honest map)

| Stage | Source | Honest label |
|---|---|---|
| VERIFIED | Proof Artifact #1 — **real** Mainnet execution, recorded + independently re-derived | `RECEIPT_INTEGRITY` L1 |
| INVALID | Engine policy evaluation on a tampered copy (attacker recipient), offline | synthetic, labeled |
| NOT_PROVEN | WS-1 authorization probe under a forged signer claim, offline | synthetic, labeled |
| UNVERIFIED | Evidence extraction with historical state unavailable, offline | synthetic, labeled |

The failure verdicts are the **same deterministic machinery** as the 73/73 adversarial
corpus and the Pilot-1 `failclosed` suite (`examples/pilot/failclosed.mjs`) — the engine can
reject what it cannot prove. They are never presented as real executions.

## Why this is the demo, not a slide

- It re-verifies **today** against Core Mainnet (the `:live` variant) — nothing pre-rendered.
- It is reproducible by Core's own engineers: clone → `npm install` → `npm run demo:90s:live`.
- It demonstrates the property that matters for autonomous value movement: **the system fails
  closed**. A proof cannot be manufactured to fit whatever happened.

See [`demo-90s/README.md`](demo-90s/README.md) for the transcript and full honesty scope.