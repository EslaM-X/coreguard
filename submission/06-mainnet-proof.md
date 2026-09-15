# 06 — Mainnet proof

## Proof Artifact #1 — a real automated agent execution on Core Mainnet

| Field | Value |
|---|---|
| Network / chain | Core Mainnet · chainId `1116` |
| Transaction | `0xe67c61fda81200bf026faee31c23a7b7e7f56ed24f06ffe24f071fa06891a9b8` |
| Block / blockHash | `38712625` · `0x4694bd584fdb3596216f7760dd568e8550edecae4e837b798b3e34adac22f671` |
| Agent (executing EOA) | `0xea41becdeb612d8625bf3060809964f1dab43244` |
| Recipient (separate EOA) | `0x7b4ce161d65e679c30ba738a522a09d63880992c` |
| Value | `1000000000000000` wei (≈ 0.001 CORE) |
| Nonce / gas | 4 · gasLimit 21000 · gasUsed 21000 · status `0x1` (success) |

## Verdict chain

| Step | Result |
|---|---|
| Pre-declared intent (EIP-712) | intentRef `0xc3902b31aecde32f3022ecb6bcbcbba3536a72b9d479f02b118a0b69c8f21445` manifestId `0xc32be08dbd55b346a22ccd7e2339792e2603a0477caa6b71d07edc586868f843` |
| WS-1 authorization probe | **OK — `RECOVERED_SIGNER`** (signature recovers to declared signer) |
| Policy conformance | **SATISFIED** — VALUE_001 · TARGET_001 · DEADLINE_001 |
| Preflight pin (genuine `eth_call` replay) | block `38712024` · `0x7a30f4fb494624a8f814e257ee04c6e15da824b03d3906059d5f947227806cc7` · result `0x` |
| **L1 verification** | **VERIFIED — `RECEIPT_INTEGRITY`** |
| L1 receiptId | `0x4f9d85865b6c42e007496615a47309aa30579bd05f396ae801703447bb51767a` |
| Commitment / proofId | `0x29ba9d7514fb86119eef00734f2a0e772227888aab054a0ea50ad7f1182cc3a4` / `0x62c32dabcb5ef1962bdebd29834b6b049306b20196774704f59fb569e9fbe4b5` |
| Execution Attestation | attestationRef `0xfa71e0a1ef12dd53cd5155920b16fe545f589d4b52945d01be070caafb737626` · executionEvidenceRef `0x60550267a65c65ad04ffe8634d1df92a37a098e3e2748ed3c3bdbbb5b3fdb0a2` |

## The three honest "NOT_RUN" entries (what we do NOT claim)

| Check | Result | Reason |
|---|---|---|
| `TRACE_HASH` | NOT_RUN | internal trace not provided — never fabricated |
| `B-EXEC-2` selector | NOT_RUN | value transfer has no calldata selector |
| `B-EXEC-5` decision record | NOT_RUN | frozen PRE decision record required |

## Independent anchor (separate hard proof)

The registry anchor (deploy → commitIntent → anchorProof → verifyCommitment) is live on
Mainnet: registry `0x037dF08F2d43c5D03759279Fe35664f6AFf9EA6E`, verdict **VERIFIED ANCHOR
INTEGRITY**, verified across two independent RPCs (`rpc.coredao.org` + `rpc.ankr.com`),
with the full evidence bundle in `scripts/verify-live.json` (frozen) and a step-by-step
reproduction in `docs/DEPLOYMENT.md`.

## Audit trail

- Institutional record: [`docs/ws-5.md`](../docs/ws-5.md)
- Machine-readable snapshot: [`examples/pilot/proof-artifact-1.json`](../examples/pilot/proof-artifact-1.json)
- Live re-derivation (read-only): `npm run demo:90s:live`