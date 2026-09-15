# WS-5 — Proof Artifact #1: Pilot-1 Agent Execution on Core Mainnet

**Status: L1 VERIFIED** — a real Core Mainnet execution by an automated agent,
pre-declared, executed, and independently verified by CoreGuard. This is the
first **positive-path proof**: not a staged transaction, not a demo — a mined
Mainnet transaction with independent recomputation reported **before** the
success is announced.

> This document is the institutional record (non-secret, reproducible). The
> machine-readable snapshot is `examples/pilot/proof-artifact-1.json` (committed,
> no private keys, no raw signed bytes). Local run artifacts stay gitignored
> (`examples/pilot/artifacts/`); this record is what freezes the proof.
>
> **Relationship to `spec/core-live-conformance.md`:** that spec is the WS-5
> conformance *design* (read-only live-data conformance of WS-4). Pilot-1 is the
> WS-5 *execution proof* shown to a buyer. Both are additive; neither touches
> the frozen v0.4.0 tree, `scripts/verify-live.json`, or `packages/verifier-c/*`.

## The proof chain

```
Pre-declared intent (EIP-712 ManifestDeclaration, signed by the agent EOA)
        ↓
Genuine preflight = eth_call replay at a PINNED pre-execution block
        ↓
Signed legacy EIP-155 Mainnet transaction (STAGED → SENT, GATED)
        ↓
Real mined receipt (status = 1)
        ↓
WS-4 execution evidence (pinned block, tx ↔ receipt)
        ↓
WS-1 recovered signer == actual caller
        ↓
B-EXEC conformance (target/caller/value; selector NOT_RUN, honest)
        ↓
Policy re-evaluation = SATISFIED
        ↓
L1 receipt verification = VERIFIED (RECEIPT_INTEGRITY)
        ↓
Execution Attestation = VERIFIED (intact)
        ↓
FINAL VERDICT: L1 VERIFIED
```

## Records (all from the live read + deterministic recompute)

| Record | Value |
| --- | --- |
| Verdict | **L1 VERIFIED** |
| Network / chainId | Core Mainnet `1116` (`rpc.coredao.org`) |
| Execution tx | `0xe67c61fda81200bf026faee31c23a7b7e7f56ed24f06ffe24f071fa06891a9b8` |
| Block | `38712625` · `0x4694bd584fdb3596216f7760dd568e8550edecae4e837b798b3e34adac22f671` |
| Receipt status | `1` (success) · gasUsed `21000` |
| From (agent, signer) | `0xea41becdeb612d8625bf3060809964f1dab43244` |
| To (controlled recipient) | `0x7b4ce161d65e679c30ba738a522a09d63880992c` |
| Value | `1000000000000000` wei = `0.001` CORE · nonce `4` · gasPrice 60 gwei |
| Intent ref | `0xc3902b31aecde32f3022ecb6bcbcbba3536a72b9d479f02b118a0b69c8f21445` |
| Manifest id | `0xc32be08dbd55b346a22ccd7e2339792e2603a0477caa6b71d07edc586868f843` |
| Preflight pin | block `38712024` · `0x7a30f4fb494624a8f814e257ee04c6e15da824b03d3906059d5f947227806cc7` · result `0x` |
| Authorization | OK · `RECOVERED_SIGNER` (EOA path) |
| Conformance | CHAIN_PIN PASS · VALUE_PIN PASS · RECOVERED_CALLER PASS · SELECTOR `NOT_RUN` · DECISION_RECORD `NOT_RUN` |
| Policy | `SATISFIED` (3 rules: VALUE_LIMIT, TARGET_ALLOWLIST, DEADLINE) |
| L1 verification | **VERIFIED** · `RECEIPT_INTEGRITY` · `requiredMissing=[]` |
| Receipt id | `0x4f9d85865b6c42e007496615a47309aa30579bd05f396ae801703447bb51767a` |
| Evidence ref | `0x60550267a65c65ad04ffe8634d1df92a37a098e3e2748ed3c3bdbbb5b3fdb0a2` |
| Attestation ref | `0xfa71e0a1ef12dd53cd5155920b16fe545f589d4b52945d01be070caafb737626` (integrity **VERIFIED**) |
| Evidence hash | `0x3588ed9e16c48ba9aa1dd1ed232d63609dfc0fc36928ea4c83b58f8ad0cadba9` |
| Commitment / proofId | `0x29ba9d7514fb86119eef00734f2a0e772227888aab054a0ea50ad7f1182cc3a4` / `0x62c32dabcb5ef1962bdebd29834b6b049306b20196774704f59fb569e9fbe4b5` |

The `txHash` equals the offline-computed hash because Ethereum transaction
hashing is deterministic (`keccak256(RLP(signed tx))`): the broadcast tool
returned it from `eth_sendRawTransaction`, then an independent read of
`eth_getTransactionByHash`/`eth_getTransactionReceipt` on Core Mainnet confirmed
it is mined with `status=1`.

## L1 checks (legacy verifier)

| Check | Result |
| --- | --- |
| RECEIPT_COMMITMENT | PASS |
| INTENT_HASH | PASS |
| POLICY_HASH | PASS |
| EVIDENCE_COMMITMENT | PASS |
| STATE_PINNING | PASS |
| TRACE_HASH | NOT_RUN (no trace provided — see boundaries) |

## Honest boundaries (explicitly not claims)

- **Trace:** `TRACE_UNAVAILABLE` on `rpc.coredao.org` → claims are **L1 /
  RECEIPT_LEVEL** only. No L2/opcode claim is made or implied.
- **Selector:** calldata-less native transfer → `B-EXEC-2 = NOT_RUN`, never
  fabricated into a selector claim.
- **Firewall:** direct EOA transfer, no firewall gate executed →
  `B-EXEC-5 = NOT_RUN`.
- These three are declared limits, not failures — the pilot refuses to upgrade
  an honest `NOT_RUN` into an absent claim.
- **Anti-blessing (sibling evidence):** the same machinery, run against the
  historical non-conforming Mainnet tx
  `0x3b04216084e1e7bc6e90ffb94fadd3b79862cca712614ea3afc52fc30b082714`,
  correctly returned `INVALID`/`NOT_PROVEN`/`VIOLATED` and **no** legacy receipt.
  Verification cannot be manufactured to fit whatever happened.

## Re-verify (read-only, reproducible)

```powershell
node examples/pilot/run-pilot.mjs capture --tx 0xe67c61fda81200bf026faee31c23a7b7e7f56ed24f06ffe24f071fa06891a9b8
# + independent RPC read of eth_getTransactionByHash / eth_getTransactionReceipt
# Expected: status=VERIFIED, ws1=OK RECOVERED_SIGNER, policy=SATISFIED,
#           legacy-L1=VERIFIED (RECEIPT_INTEGRITY), attestation=VERIFIED
```

## Proven and not proven

**Proven (recorded here):** who authorized (recovered signer), what executed
(target/value/policy), did it match the pre-declared intent (hash bindings,
conformance), all independently recomputable from chain reads.

**Not proven:** trace-level execution, firewall decision provenance, chain
consensus re-validation (conformance to the `core-live-conformance` design
guarantees determinism + tamper detection, not revalidation of Core consensus).