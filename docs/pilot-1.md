# Pilot-1 — Agent Execution Verification on Core Mainnet

Status: **L1 VERIFIED — Proof Artifact #1** (real Core Mainnet execution,
recorded in [`docs/ws-5.md`](./ws-5.md) and the non-secret snapshot
`examples/pilot/proof-artifact-1.json`).
Scope: **Pilot-first, one use case** — an AI/automated agent executes a small
CORE transfer on **Core Mainnet**, and CoreGuard independently verifies the
execution against the agent's pre-declared intent.

## Why this pilot (the 5 things it must prove)

1. **A real problem exists** — when an automated agent holds a key and executes,
   three questions are unanswerable today: *who* authorized, *what* exactly was
   executed, and *did* the execution match the intent? Logs are write-only by
   the same process that acts; there is no independent, recomputable record.
2. **CoreGuard actually solves it on a real chain** — a real Mainnet tx, real
   evidence extracted from the chain RPC, independent recomputation.
3. **Verification is independent** — the verifier re-derives intent/policy
   hashes and evidence commitments without trusting the executor.
4. **It fails closed** — authorization mismatch, execution mismatch, missing
   historical evidence, and unavailable trace are all rejected deterministically.
5. **Measurable commercial value** — see `docs/value-hypothesis.md`.

## Agent identity

- Agent = a **Core Mainnet EOA** derived from `.env` — **`MAINNET_PRIVATE_KEY`**
  first (the funded wallet that performed the historical Mainnet anchor,
  nonce 4, balance ≥ 0.98 CORE), falling back to `PRIVATE_KEY`. The key is never
  printed, logged, or written to artifacts; it is used only inside the EIP-712
  signing closure and the broadcast-stage signer. `CG_PILOT_PRIVATE_KEY`
  overrides both when set.
- Current agent address: `0xea41becdeb612d8625bf3060809964f1dab43244`
  (Mainnet, funded — readiness gate = READY).

## Scenario (pre-declared, never inferred)

- Receiver: a **separate controlled recipient EOA** (distinct from the agent —
  a real transfer `agent -> recipient`, never a self-transfer). The recipient
  key lives ONLY in the gitignored `examples/pilot/recipient.local.json`.
  Current recipient: `0x7b4ce161d65e679c30ba738a522a09d63880992c`
  (override `CG_PILOT_RECIPIENT`).
- Amount: `0.001 CORE` = `1000000000000000` wei (override `CG_PILOT_AMOUNT`)
- Action: `TRANSFER` — native asset, **no calldata** (a value transfer cannot
  claim selector binding; that claim is honestly `NOT_RUN`).
- Policy: `VALUE_LIMIT(max=amount)`, `TARGET_ALLOWLIST(targets=[recipient])`,
  `DEADLINE(deadline=validUntil)`.
- Chain: Core Mainnet 1116, RPC `https://rpc.coredao.org`, explorer
  `https://scan.coredao.org`. **No testnet, no faucet, no simulation-as-substitute.**

## Pipeline

```
plan      intent + WS-1 EIP-712 ManifestDeclaration (signed by the agent EOA)
          READY-GATES: chainId=1116, nonce, balance, WS-1 binding+probe
staged    plan + GENUINE preflight = eth_call replay of the execution at a
          PINNED pre-execution block (never "latest" as evidence)
          + stage signed EIP-155 tx    -> STAGED-NOT-SENT
broadcast [GATED]: funded EOA + CG_PILOT_ALLOW_BROADCAST=1 + --confirm --confirm
capture   WS-4 extraction (pinned) + WS-1 probe (EOA recover)
          + B-EXEC binding (target/caller/value; selector NOT_RUN)
          + policy re-evaluation + L1 legacy receipt (only with the GENUINE
            preflight pin AND a compliant execution) + Execution Attestation
          + commitment/proofId (CGEP/1:PROOF, CGEP/1:ANCHOR)
failclosed offline determinism demos (no funds needed)
```

## Commands

```powershell
node examples/pilot/run-pilot.mjs plan          # declare; never broadcasts
node examples/pilot/run-pilot.mjs staged        # + genuine preflight + signed-tx stage
node examples/pilot/run-pilot.mjs gate --json   # readiness matrix
node examples/pilot/run-pilot.mjs failclosed    # F1/F2/F2b/F3/F4 deterministic rejects
node examples/pilot/run-pilot.mjs capture --tx <hash>   # read-only bind + verify
node examples/pilot/run-pilot.mjs broadcast --confirm --confirm   # GATED; default NEVER
```

Artifacts (gitignored): `examples/pilot/artifacts/{plan,intent,policy,declaration,stage,capture,
receipt,attestation,verification,broadcast}.json`.

## Honesty invariants (what this pilot refuses to do)

- **Never fabricate** a trace, a simulation pin, a selector, or a `VERIFIED`.
- Trace on `rpc.coredao.org` = `TRACE_UNAVAILABLE` — claims are **L1 /
  RECEIPT_LEVEL**, stated precisely; no L2 claim is made.
- Legacy receipt is emitted **only** when (a) `staged` recorded the GENUINE
  eth_call preflight pin at the pinned pre-execution block, AND (b) the executed
  tx is compliant (policy satisfied, WS-1 probe OK, no B-EXEC FAIL/NOT_PROVEN).
- Broadcast requires funding + explicit operator double-confirmation + env guard.
- No claim about a Firewall decision (B-EXEC-5 = `NOT_RUN`): the pilot is a
  direct EOA transfer, not a gated flow.

## Execution result (Proof Artifact #1)

Executed on Core Mainnet `1116` with the funded agent EOA:

| | |
|---|---|
| txHash | `0xe67c61fda81200bf026faee31c23a7b7e7f56ed24f06ffe24f071fa06891a9b8` |
| block | `38712625` · `0x4694bd58…` · status `1` |
| from / to / value | `0xea41becd…` → `0x7b4ce1…` · `0.001 CORE` · nonce 4 |
| intentRef / manifestId | `0xc3902b31…` / `0xc32be08d…` |
| Verdict | **L1 VERIFIED** (`RECEIPT_INTEGRITY`) · receiptId `0x4f9d8586…` |
| Attestation | `VERIFIED` · ref `0xfa71e0a1…` |
| Snapshot | `examples/pilot/proof-artifact-1.json` (committed, no secrets) |

## GO / NO-GO gate

**GO achieved** — the funded positive path ran on Mainnet and `capture` returned
L1 `VERIFIED` + WS-1 `RECOVERED_SIGNER` + `POLICY SATISFIED` against the real
tx, with the anti-blessing behavior also demonstrated on the historical
non-conforming tx. The fail-closed demos and the historical read-only binding
remain evidence of the machinery; the positive execution (recorded above) is now
the proof. Next step per owner: freeze (done) → WS-5 artifact (done) → Value
Hypothesis validation → first counterparty.

## Funding status (resolved)

The agent EOA (`0xea41becd…`, the funded Mainnet wallet) holds **≈ 0.98 CORE** —
far above the exact readiness requirement (**0.00226 CORE** = 0.001 CORE transfer
+ 21000 gas). The readiness gate reports **READY**, and `staged` produced a
**genuine pinned eth_call = SUCCESS** (`0x` at the pinned pre-execution block)
with a signed tx in **STAGED-NOT-SENT** state.

Funding is **NOT part of the proof**: the proof starts at the pre-declared
intent and ends at the independent `capture` of the real Mainnet transaction.
Funding simply unlocks the broadcast.

Flow (literal): `gate` (**READY**) → `staged` (**PREFLIGHT SUCCESS** +
**STAGED-NOT-SENT**) → **STOP** → await explicit broadcast GO →
`broadcast --confirm --confirm` → `capture --tx <real-mainnet-tx>` →
L1 VERIFIED + RECOVERED_SIGNER + POLICY SATISFIED + Execution Attestation.
No broadcast until the genuine pinned preflight succeeded AND the owner grants
a separate broadcast GO.

## Related evidence (frozen)

Evidence recorded (`docs/DEPLOYMENT.md`, frozen): Core Mainnet registrar
`0x037df08f2d43c5d03759279fe35664f6aff9ea6e`; historical evidence tx
`0x3b04216084e1e7bc6e90ffb94fadd3b79862cca712614ea3afc52fc30b082714`
(read-only capture test above returned: binding NOT_PROVEN TARGET_MISMATCH /
policy VIOLATED — the system refuses to bless a non-conforming tx, as designed).