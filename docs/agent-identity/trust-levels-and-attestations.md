# Agent Identity & Provenance — Trust Levels & Attestations (Phase A)

**Version**: 1.7.0-draft (Phase A, Revision 7) · **Status**: Design only — no code in this phase
**Parent**: `spec/CGEP-1-AGENT-PROVENANCE.md` §4 (taxonomy), §6 (states), §7a (recognition), §5b (revocation)
**Companion**: `docs/agent-identity/identity-provenance-schema.md`
**Gate**: Phase A review → approval REQUIRED before implementation.

---

## 0. Normative precedence (Revision 7)

States, ordering, issuer recognition, and revocation are **defined by the spec**
(`§4`, `§6`, `§7a`, `§5b`) and are only restated here for identity claims. On any
conflict the spec wins. No new attestation method or trust mechanism is invented.

## 1. States (spec §6 closed set)

| State | Meaning (spec §6) |
|---|---|
| `VERIFIED` | proven cryptographically from evidence at hand |
| `ATTESTED` | a verified third party vouched for an unverifiable fact |
| `DECLARED` | authentic self-claim; content not independently verified |
| `INFERRED` | heuristic hint ONLY; never a verdict |
| `NOT_PROVEN` | no evidence / no declaration — fail-closed |
| `UNKNOWN` | not declared / irresolvable (e.g. contradiction) |

**Ordering (strict, spec §6):** `VERIFIED ▸ ATTESTED ▸ DECLARED ▸ INFERRED ▸
NOT_PROVEN`. Upgrade only by a stronger mechanism — never by absence, never by
aggregation, never by `INFERRED`. `UNKNOWN` represents "irresolvable/not
declared" and is not a rung on the strength ladder.

There is no numeric level and no percentage.

## 2. Scope of a state (per-claim)

A state applies to a **single claim** (`manufacturer`, `model`, `modelVersion`,
or the executor type separately) — never to a bundle. The verifier MAY emit a
roll-up, but a roll-up is a summary with reasons, not a fact. Identity claims
and the executor-type claim are computed **independently**.

## 3. Executor taxonomy vs identity claims (corrected)

The strongest state an **executor-type** claim can reach is defined by spec §4.
`packages/provenance/taxonomy.js` (`EXECUTOR_STRONGEST`) is an **advisory,
Phase-A-scoped** projection: `MULTISIG` and `SMART_CONTRACT` are `NOT_PROVEN`
**in Phase A only**, because no EOA ECDSA path can prove a smart-contract
authorization (EIP-1271 is Phase B — spec §11 Q10).

- Spec §4 assigns `MULTISIG → VERIFIED (confirmations) / ATTESTED (signer org)`
  and `SMART_CONTRACT → VERIFIED (code/deployment binding) / DECLARED`. These
  remain the semantic ceilings; Phase A simply cannot reach them yet.
- This is a **phase/implementation limitation, not a semantic cap**. The wording
  "cannot be declared" from Revision 0 is withdrawn.
- `EXECUTOR_STRONGEST` constrains the **executor-type claim only**. It does
  **not** cap `manufacturer`/`model`/`modelVersion`, which are evaluated by the
  separate identity rules below.

## 4. Evidence (spec §5 / §7a — no parallel mechanism)

Identity claims are upgraded only through the spec's existing
`declared.attestations[]` entries and the `ATTESTATION_RECOGNITION` axis. The
spec §7a resolution matrix applies unchanged:

| Signature | Issuer recognized | Credential type | Scope/window at block | Field result |
|---|---|---|---|---|
| valid | YES | YES | YES | `ATTESTED` |
| valid | NO | — | — | `DECLARED` |
| valid | YES | NO | — | `DECLARED` |
| valid | YES | YES | NO | `NOT_PROVEN` (for THIS execution) |
| invalid / absent | — | — | — | `NOT_PROVEN` |

Consequences that Revision 0 got wrong and now follow from the spec:

- An **unrecognized issuer does not erase the claim**: it remains `DECLARED`.
- Only a valid-but-out-of-scope/expired/revoked-for-this-execution attestation
  yields `NOT_PROVEN` for that execution.
- A valid signature alone NEVER implies `ATTESTED` (defense against T-ID-4 / D2).

## 5. Transitions and the rule of precedence (deterministic)

**Single canonical source (DR-021).** This section is the only place in Phase A
that defines the per-claim rule-of-precedence. The other Phase A documents refer
to it by section number and MUST NOT restate the table; they may restate
**input-validity classification only** (which is evaluated *before* this table).

**DR-019 — absence of an attestation is not a failed attestation.** A valid
self-claim with **no** attestation asserted stays `DECLARED`. Only an *asserted*
attestation that fails, or fails to bind, yields `NOT_PROVEN`.

**DR-020 — `INVALID` is not a state.** The closed set is exactly spec §6
(`VERIFIED · ATTESTED · DECLARED · INFERRED · NOT_PROVEN · UNKNOWN`). `INVALID`
is a manifest-level verdict flag (spec §8) and a per-dimension flag (spec §7); it
never appears as a per-claim state.

Per-claim resolution — the first matching row governs (spec basis in parentheses):

| # | Condition | Claim state | Manifest flag |
|---|---|---|---|
| 1 | `manifestId` / anchored-commitment mismatch (§7 PROVENANCE_COMMITMENT, §8) | — (no claim evaluation) | `INVALID` |
| 2 | Malformed input (type / length / charset), evaluated pre-spec | — (input error; not a §6 state) | n/a |
| 3 | Contradiction across manifests for the same `executionRef` (§7, §8) | `UNKNOWN` | `INVALID` |
| 4 | Base authenticity (required for ≥ `DECLARED`) fails (§7): missing → `NOT_PROVEN` · signature/binding FAIL → `INVALID` · unrecognized enum → `UNKNOWN` | per sub-rule | per §7 |
| 5 | Claim field absent | `UNKNOWN` | `VALID` |
| 6 | Claim present, base authenticity passes, **no attestation asserted** | `DECLARED` | `VALID` |
| 7 | Attestation asserted, signature invalid/absent (§7a) | `NOT_PROVEN` | `VALID` |
| 8 | Attestation asserted, signature valid, issuer unrecognized (§7a) | `DECLARED` | `VALID` |
| 9 | Attestation asserted, valid, recognized, `credentialType` unrecognized (§7a) | `DECLARED` | `VALID` |
| 10 | Attestation asserted, valid, recognized, type ok, scope/window/revocation fails at block (§7a, §5b, §8) | `NOT_PROVEN` | `VALID` |
| 11 | All §7a checks pass | `ATTESTED` | `VALID` |
| 12 | Named reproducible `VERIFIED` rule passes (§6, §7) | `VERIFIED` | `VALID` |

Report shape: `claims[]` (spec §6 states only) + `manifest: VALID | INVALID |
NOT_PROVEN` + `reasons[]` (e.g. `ISSUER_UNRECOGNIZED`, `SCOPE_MISMATCH`,
`WINDOW_EXPIRED`, `REVOKED_AT_BLOCK`, `CLAIM_NOT_BOUND`, `MALFORMED_INPUT`).
Rows 8/9 stay `DECLARED` (not `NOT_PROVEN`) because they fail only the *higher*
`ATTESTED` requirement; row 10 is `NOT_PROVEN` because the attestation is
asserted for this execution but cannot establish it.

Hard rules:

1. **No self-upgrade.** A manifest cannot move itself past `DECLARED`.
2. **No upgrade by omission, aggregation, or `INFERRED`** (spec §6).
3. **Per-execution only.** State is computed for one execution and block; no
   global or cached upgrade.
4. **Idempotent relative to the evidence set.** Same inputs + same evidence set
   + same historical snapshot → same state.
5. **Offline determinism has a precondition.** Offline verification is
   deterministic *only relative to an explicitly identified evidence set and
   historical state snapshot*. Historical revocation cannot be assumed from the
   network.
6. **Revocation is governed by spec §5b.** A `revokedAt` inside the manifest is
   at most `DECLARED`; authoritative revocation requires on-chain/registry/
   replayable evidence. Absent that evidence the verifier MUST NOT claim
   "not revoked"; the result is `NOT_PROVEN`. Missing revocation data never
   becomes `ATTESTED`.

## 6. `VERIFIED` rules must be identified

`VERIFIED` for a claim is allowed only when a **named, versioned rule** passes,
with: rule identifier, rule version, inputs, block/reference context, and a
reproducible result — plus an explicit statement of **what the rule proves and
what it does not**. The Core chain can prove commitments and execution binding;
it does **not** by itself prove that a real-world company name is correct. UI
copy MUST NOT say "Verified Manufacturer" unless the specific rule proves that
specific claim.

## 7. Prohibitions

- No behavioral/biometric inference of human vs bot.
- No inference of identity from metadata, timing, or traffic.
- No numeric scores or probabilities; `INFERRED` is never a verdict.
- No "verified manufacturer" wording unless a §6 rule proves that claim.
- No silent defaulting of a missing field to a "trusted" value.

## 8. Fail-closed test matrix (design level)

| Scenario | Expected |
|---|---|
| Absent identity | `UNKNOWN` |
| Empty identity `{}` | `UNKNOWN` |
| `"manufacturer": ""` (length 0) | input error (not a §6 state) |
| Valid self-claim, **no** attestation asserted (row 6) | `DECLARED` |
| Valid self-claim, attestation asserted but signature invalid (row 7) | `NOT_PROVEN` |
| Valid signature, unrecognized issuer (row 8) | `DECLARED` (spec §7a) |
| Valid, recognized, unrecognized `credentialType` (row 9) | `DECLARED` |
| Valid + recognized + in-scope + in-window (row 11) | `ATTESTED` |
| Attestation bound to a different claim (row 10) | `NOT_PROVEN` |
| Attestation expired/revoked at exec block (row 10) | `NOT_PROVEN` |
| Revocation data unavailable offline (row 10) | `NOT_PROVEN` (never `ATTESTED`) |
| Input supplies a strong stored state | ignored → derived per-claim state |
| Contradiction across manifests (row 3) | `UNKNOWN` + `INVALID` flag |
| Tampered `manifestId`/commitment (row 1) | no claim eval; manifest `INVALID` |
| `MULTISIG`/`SMART_CONTRACT` with identity block | executor-type capped Phase A per §3; identity evaluated separately |

These become the Phase B conformance fixtures; none may be implemented before
Phase A approval.

## 9. Open questions for Phase B

- Concrete issuer-recognition interface and key distribution (spec §7a owner).
- Owner decisions for T-ID-10..15 (substitution, revocation race, issuer key
  compromise, privacy correlation, cross-environment replay, normalization).
- Attestation transport and offline evidence-set/snapshot format.
- How recognition changes are versioned without rewriting history.

---

*End of Agent Identity & Provenance Trust Levels & Attestations (Phase A, Revision 7).*
