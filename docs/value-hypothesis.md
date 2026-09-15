# Value Hypothesis — Who pays CoreGuard for agent-execution verification?

Pilot-1 proves one specific capability on real Core Mainnet: an automated
agent's execution can be independently and recomputably verified against its
pre-declared authorization (who/what/did-it-match). This document states the
buyer, the pain, the payment, and why a plain database log is not a substitute.
It is a **hypothesis to be validated with a real counterparty**, not a claim
that revenue exists yet.

## 1. The buyer (candidates, in order)

- **B1 — AI/automation platforms** (agent frameworks, trading bots, SaaS that
  moves user funds on-chain). Their product liability is "the agent did only
  what you authorized." Today they ship best-effort logs. Unit economics: an
  admission-of-guilt after a loss costs far more than a per-attestation fee.
- **B2 — custodians and treasury operators** who let software execute. They pay
  for audit-grade proof that their policy gate actually constrained execution
  (compliance/auditor evidence, cheaper than forensic reconstruction after an
  incident).
- **B3 — Auditors/oracles** who resell cross-chain execution attestations as a
  service (CoreGuard as the attestation primitive, not the app).

## 2. What they pay for

A **recomputable Execution Attestation**: `{intentRef, manifestId, bindingRef,
executionEvidenceRef, receiptId, verification profile, chain pin, attestation
ref}` that an independent verifier re-derives from chain reads. The buyer gets
three guarantees missing from logs:

1. **Attribution** — the executing account RECOVERS to the pre-declared signer
   (WS-1 probe), so "who authorized" is a cryptographic fact, not a row.
2. **Conformance** — target/caller/value bind to the declared intent and the
   declared policy is re-evaluated from the observed execution (B-EXEC +
   POLICY_EVAL), so "what actually executed" must equal "what was authorized".
3. **Anti-blessing** — non-conforming or evidence-less executions are rejected
   (`NOT_PROVEN`/`UNVERIFIED`), so a "verification" cannot be manufactured to
   fit whatever happened.

## 3. Pricing shape (hypothesis)

- Per-attestation fee (anchor to the existing Core Mainnet registrar, which
  already carries ~0.0198 CORE of frozen proofs) — audit-grade receipt at a few
  $/ attestation; the marginal cost is one L1 receipt + one anchor tx.
- Platform-license alternative: automation vendors embed the verifier and pay a
  per-monthly-active-attestation fee, with fail-closed forgery insurance as the
  differentiator.
- Open-source/audit free tier: the verifier is a deterministic artifact (this
  repo) precisely because trust must never depend on us running a hosted check.

## 4. Risk reduced / cost displaced

| Control | Broken in = value destroyed | CoreGuard changes |
| --- | --- | --- |
| Where-did-the-money-go | Insurers refund; blame disputes | Deterministic conformance pin (target/value/caller) |
| Who-programs-the-agent | Prompter claims "the tool did it" | EOA recovery of the authorization |
| Policy-guard effectiveness | Auditor day 1x2 reconstruction | Recomputable policy re-evaluation |
| Post-incident forensics | Legacy replay bills dwarf the loss | Receipt integrity + evidence bundle rebuilt in ms |

## 5. Why a log is not enough (the test any prospect will run)

- A log is written **by the same process that executed** — it cannot prove what
  it records (no independent recomputation).
- A log is **not anchored**: it can be deleted/edited without a contradiction.
  CoreGuard's receiptId + commitment/proofId are deterministically re-derived
  and can be recorded on-chain (registrar exists on Core Mainnet).
- A log asserts; the CoreGuard verifier **proves or fails closed** — there is no
  "best effort".

## 6. Validation plan (what would confirm the hypothesis)

1. **Positive pilot on Mainnet** — **DONE (L1 VERIFIED).** Pilot-1 executed a
   real Core Mainnet transfer (tx
   `0xe67c61fda81200bf026faee31c23a7b7e7f56ed24f06ffe24f071fa06891a9b8`, block
   `38712625`) and returned L1 `VERIFIED` (`RECEIPT_INTEGRITY`), WS-1
   `RECOVERED_SIGNER`, `POLICY SATISFIED`, and an intact Execution Attestation —
   see [`docs/ws-5.md`](./ws-5.md) and the non-secret snapshot
   `examples/pilot/proof-artifact-1.json`. The anti-blessing behavior is also
   independently demonstrated on the historical non-conforming tx (rejected).
2. **Counterparty conversation**: present the attestation artifact to one
   candidate from B1/B2/B3; the hypothesis is confirmed only if a counterparty
   names a loss/bill that this artifact directly reduces, and indicates a
   budget line.
3. **Pricing signal**: one signed trial where per-attestation fee > compute+RPC
   cost (≈ cents today on Core).

## 7. Honest framing (what this pilot does NOT claim)

- No L2/trace claim on Mainnet public RPC — claims are L1/RECEIPT_LEVEL.
- No Firewall-decision provenance for a direct transfer (B-EXEC-5 NOT_RUN).
- No claim that any customer is paying yet. This is the cheapest falsifiable
  demonstration of the value chain; if it does not produce a counterparty
  conversation in N weeks, the use case changes (owner's GO/NO-GO gate).