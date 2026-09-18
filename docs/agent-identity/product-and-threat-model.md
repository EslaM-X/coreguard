# Agent Identity & Provenance — Product & Threat Model (Phase A)

**Version**: 1.7.0-draft (Phase A, Revision 7) · **Status**: Design only — no production code
**Workstream**: Agent Identity & Provenance · **Branch**: `feature/agent-identity-provenance`
**Baseline**: `2ea7c18` · **Parent**: `spec/CGEP-1-AGENT-PROVENANCE.md`
**Gate**: Phase A review → approval is REQUIRED before any Phase B code.

---

## 0. Normative precedence (Revision 7)

`spec/CGEP-1-AGENT-PROVENANCE.md` **§4, §5, §6, §7a, §5b** is the normative source
of truth for this workstream. These Phase A documents are a **subordinate
extension** and MUST NOT re-define: the executor taxonomy, the attestation
envelope, issuer recognition, canonical encoding, revocation authority, or the
trust ordering. Any conflict with the spec is resolved **in favor of the spec**,
or recorded as an explicit governance decision (see the governance record).

## 1. Purpose

Extend CoreGuard's declared execution provenance with an **optional identity
description** of the executor — executor class, and (when the operator chooses to
publish them) a declared manufacturer, model, and model version — plus a
Core-native presentation layer.

The product answers one question **per execution**:

> *Who/what declared responsibility for THIS execution, under which authority,
> and is that claim independently re-verifiable?*

It does **not** answer, and must never claim to answer:

- whether the executor is a human or a robot (behavioral detection);
- whether the manufacturer/model claim is true unless the spec's issuer
  recognition says so;
- whether the executor is "safe" or "trustworthy".

## 2. Relationship to existing work (extension, not re-definition)

| Existing artifact | Reused as |
|---|---|
| `spec/CGEP-1-AGENT-PROVENANCE.md` §4 | executor taxonomy (normative) |
| `spec/CGEP-1-AGENT-PROVENANCE.md` §5 + §5a | manifest + signature envelope (normative) |
| `spec/CGEP-1-AGENT-PROVENANCE.md` §6 | closed verification states + ordering (normative) |
| `spec/CGEP-1-AGENT-PROVENANCE.md` §7 / §7a | verification axes + issuer recognition (normative) |
| `spec/CGEP-1-AGENT-PROVENANCE.md` §5b | revocation authority (normative) |
| `spec/canonical-encoding.md` | canonical JSON / hashing (normative) |
| `spec/agent-provenance-threat-model.md` | threat goals 1–5 (A1–E2) |
| `spec/privacy-model.md` | disclosure tiers |
| `spec/agent-provenance-dapp.md` | badge semantics (never prettified) |
| `packages/provenance/taxonomy.js` (`EXECUTOR_TYPES`) | the closed `executorType` enumeration |

New in this workstream: three **optional declared identity fields**
(`manufacturer`, `model`, `modelVersion`) under `declared.identity`, a
**per-claim** trust result, and a Core-native dApp/API surface (Phase D — not
built here). No new attestation mechanism is introduced; identity claims reuse
the spec's existing `attestations[]` and issuer-recognition machinery.

## 3. Scope for Phase A

**In scope (documents only):** this product & threat model; the identity schema
design; trust-level and attestation binding rules; the governance decision
record.

**Out of scope (Phase A):** any code (verifier, CLI, SDK, contracts, dApp), any
on-chain transaction, any token, any pricing, any release, and any change to
`main` or frozen artifacts.

## 4. Users and use cases

| User | Use case |
|---|---|
| Executor operator (bot, AI agent, org, custodian) | publish a declared, key-bound identity to support counterparties in evaluating declared provenance |
| Consumer (dApp, wallet, risk desk, auditor) | re-verify a declared identity deterministically against an explicit evidence set |
| Integrator (protocol) | consume the API/SDK to annotate an execution with its declared evidence level |
| Buyer (including regulated) | obtain a receipt that shows provenance **as declared**, with the evidence level stated |

None of these use cases is a guarantee. The protocol provides **evidence for the
consumer's own review**; it **does not itself establish regulatory compliance**,
and no use case implies that a counterparty will clear an execution faster.

## 5. System boundaries

- **Off-chain** manifest + deterministic verifier; **Core chain = anchor only**
  (`Anchor ≠ execution proof`).
- The system verifies **declarations and cryptographic authority**, never
  behavior, intent, or real-world truth of a name.
- The system is **not** a registry of real companies, **not** a scoring engine,
  and **not** a surveillance tool.
- Every claim is displayed at exactly the state supported by the evidence **at
  the referenced execution block**, never higher.

## 6. Identity claims vs the operator block (semantic separation)

This workstream adds a description of the **artifact (manufacturer/model)**,
which is distinct from the existing description of the **responsible party
(operator)**:

| Field group | Describes | Example |
|---|---|---|
| `declared.serviceId` / `declared.displayName` / `declared.operator.organizationId` | the entity responsible for, or operating, the execution | `acme-labs` |
| `declared.identity.manufacturer` / `.model` / `.modelVersion` | the declared maker / model / version of the executed artifact | `example-labs` / `reasoner` / `2.1.0` |

They are **independent namespaces**. An operator MAY be an organization while
the manufacturer is a different party (or the same). Any relationship between
them (e.g. "this operator is authorized to run this model") is itself a **claim
that requires its own binding or evidence** — it is never inferred from the mere
presence of both.

## 7. Assets

| Asset | Why it matters |
|---|---|
| Identity claims (`manufacturer`, `model`, `modelVersion`) | basis of downstream display and filtering |
| Per-claim trust result | prevents silent over-claiming |
| `attestations[]` (spec §5) | the only path from `DECLARED` to `ATTESTED`/`VERIFIED` |
| Manifest commitment (`manifestId`, anchor) | tamper-evidence |
| Operator privacy | deanonymization/fingerprinting is a harm, not a feature |

## 8. Threat model (identity extension)

Reuses `spec/agent-provenance-threat-model.md` (goals 1–5, A1–E2). New surface:
**the gap between a technical key and a claimed manufacturer/model identity.**

| ID | Threat | Mitigation (design) |
|---|---|---|
| T-ID-1 | Operator claims `manufacturer`/`model` it has no right to | claim is `DECLARED`-only by construction; never presented as fact; `UNKNOWN` default; strong display requires evidence |
| T-ID-2 | Self-upgrade: attacker sets a strong state in the payload | the state is **derived by the verifier**, never trusted from input (spec §6/§7a) |
| T-ID-3 | `model`/`modelVersion` used as a covert wallet fingerprint | fields optional, no default collection; privacy tiers (§10); dApp renders badge-only views |
| T-ID-4 | Forged or replayed attestation lifts a claim | spec §7a: a valid signature alone never implies `ATTESTED` |
| T-ID-5 | Wrong coupling: a claim is attached to a different execution | spec `DECLARER_EXECUTION_BINDING`; claim without binding stays `NOT_PROVEN` |
| T-ID-6 | Post-anchor mutation of identity fields | `manifestId` re-derivation vs anchored commitment → `INVALID` (spec §8) |
| T-ID-7 | Dilution: nobody declares, so `UNKNOWN` everywhere | `UNKNOWN` stays a normal, honest state (spec §4 rule 1; threat goal 3) |
| T-ID-8 | UI over-claim: badge shows a company as fact | copy is the exact per-claim state (spec §6) |
| T-ID-9 | Legal/reputational harm from naming a real company without proof | no association of a technical identity with a real entity without evidence; policy deferred to Phase H (legal review) |

### Deferred threats (added in Revision 1, owner: Phase B design review)

| ID | Threat | Scenario | Status |
|---|---|---|---|
| T-ID-10 | Attestation substitution | swap an envelope carrying a different claim | deferred — must be covered when binding claim sets are defined |
| T-ID-11 | Revocation race | evaluate revocation at run time instead of the execution block | deferred — spec §5b governs; test design pending |
| T-ID-12 | Issuer key compromise | leak of a recognized issuer key | deferred — key-risk is CGEP/1 out-of-scope; policy owner needed |
| T-ID-13 | Privacy correlation | correlate `modelVersion` with off-protocol execution patterns | deferred — privacy review owner needed |
| T-ID-14 | Cross-environment replay | reuse an attestation across chain/environment | deferred — spec §5a domain separation; identity scope TBD |
| T-ID-15 | Ambiguous normalization | divergent canonical form across verifier implementations | deferred — must reuse `spec/canonical-encoding.md` |

Each deferred item has a named owner decision in Phase B; none may ship
unresolved as an implementation detail.

## 9. Abuse scenarios (must fail closed)

1. A script declares `executorType: AI_AGENT`, `manufacturer: "example-labs"`,
   and a strong state → the supplied state is **ignored**; result is the derived
   per-claim state.
2. A bot declares `HUMAN` → displayed as `Human — DECLARED`, with "cannot be
   inferred unless attested" (spec §4, threat A2).
3. An org copies a public credential and replays it → not treated as `ATTESTED`
   unless issuer recognition, scope, and window pass (spec §7a, threat D2).
4. A consumer tries to build a behavioral "human vs bot" filter from the fields
   → out of scope by policy; the protocol provides no behavioral signal.

## 10. Privacy

- **Data minimization:** every identity field is optional; absence is the safe
  default (`UNKNOWN`), not an error.
- **No profiling / no scoring:** the protocol does not rank executors.
- **Disclosure tiers** (per `spec/privacy-model.md`): `badge-only`,
  `state-only`, and full-manifest views. The dApp defaults to badge-only.
- **Fingerprint risk:** `manufacturer + model + modelVersion` can be uniquely
  identifying; treat as operator-owned, opt-in, and never required.
- **No sensitive data in logs:** raw identity bodies never enter verification
  reports (reuse the `VERIFY-RUN` report rule).

## 11. Fail-closed behavior (reference, not restatement)

The per-claim rule-of-precedence is defined **once** in
`trust-levels-and-attestations.md` §5 (DR-018) and is not restated here. This
document adds only the product-level principle:

- **Input validity and claim state are separate concepts (DR-017).** Absent or
  valid-but-unknown input resolves through the §5 table; **malformed input**
  (wrong type / length / charset) is an **input error** evaluated before the
  spec, is **never** silently downgraded to `UNKNOWN` or upgraded, and is not a
  spec §6 state.
- **`INVALID` is a manifest-level verdict flag and a per-dimension flag, never a
  per-claim state (DR-020).** Per-claim values use only the spec §6 closed set
  `VERIFIED · ATTESTED · DECLARED · INFERRED · NOT_PROVEN · UNKNOWN`; `INFERRED`
  is informational-only and can never upgrade a claim (ordering:
  `VERIFIED ▸ ATTESTED ▸ DECLARED ▸ INFERRED ▸ NOT_PROVEN`).
- **Every result is bounded by the applicable normative rule:** no failure or
  unknown evidence may silently produce a higher trust state. In particular, a
  valid signature with an **unrecognized issuer yields `DECLARED`, not
  `NOT_PROVEN`** (spec §7a; trust §4) — "fail closed" means bounded, not
  "everything becomes `NOT_PROVEN`".

Input-validity examples live in `identity-provenance-schema.md` §9; the
end-to-end fail-closed scenarios live in `trust-levels-and-attestations.md` §8.

## 12. Red lines (inherited, non-negotiable)

- No "AI detector" / "human vs bot detector" / behavioral attribution
  (`spec/agent-provenance-prior-art.md` §5).
- No security score (`0–100`) or numeric "confidence".
- No novelty/patentability claim before prior-art + counsel
  (`spec/agent-provenance-ip.md`).
- No token, no announced pricing, no fake metrics or partnerships.
- No edit to `main`, frozen evidence, `scripts/verify-live.json`, P0/P1, or any
  Mainnet artifact.

## 13. Phase A acceptance criteria → gate to Phase B

Phase B (schema/verifier code) may start **only** after independent review
confirms all of the following:

- [ ] No re-definition of any normative CGEP/1 area (§0).
- [ ] Product & threat model covers spoofing + identity impersonation
      (T-ID-1..9) and lists T-ID-10..15 with owners.
- [ ] The schema clearly separates `DECLARED` from `ATTESTED`/`VERIFIED`, per claim.
- [ ] Trust-transition rules are deterministic and testable.
- [ ] Identity claims reuse `attestations[]` and spec §7a (no parallel mechanism).
- [ ] Operator vs manufacturer semantics are explicitly separated.
- [ ] No human/bot behavioral-detection claim exists anywhere.
- [ ] `main` and frozen artifacts are unchanged by Phase A.
- [ ] The governance decision record is signed off.
- [ ] An independent design-risk review is complete.

---

*End of Agent Identity & Provenance Product & Threat Model (Phase A, Revision 7).*
