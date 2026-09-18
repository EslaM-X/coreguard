# Agent Identity & Provenance — Schema Design (Phase A)

**Version**: 1.7.0-draft (Phase A, Revision 7) · **Status**: Design only — no code in this phase
**Parent**: `spec/CGEP-1-AGENT-PROVENANCE.md` §5 (manifest), §6 (states), §7a (recognition), §5b (revocation)
**Companion**: `docs/agent-identity/trust-levels-and-attestations.md`
**Gate**: Phase A review → approval REQUIRED before implementation.

---

## 0. Normative precedence (Revision 7)

This document is subordinate to `spec/CGEP-1-AGENT-PROVENANCE.md` and
`spec/canonical-encoding.md`. It does not re-define the manifest envelope, the
signature envelope, issuer recognition, revocation, or the trust ordering. It
only adds three optional declared fields and specifies how their **per-claim**
state is derived using the spec's existing machinery.

## 1. Design principles

1. **Additive and optional.** No existing field changes meaning; absence of any
   new field is valid and means `UNKNOWN`.
2. **Claims, not facts.** Every identity value is a claim bound to a key.
3. **Status is derived, never trusted.** A caller-supplied state is ignored.
4. **No scoring.** No numeric confidence, probability, or 0–100 rating.
5. **Deterministic relative to an explicit evidence set.** Same manifest +
   same evidence set + same historical snapshot → same per-claim state, offline.
6. **No parallel machinery.** Identity claims reuse `attestations[]` (spec §5)
   and the issuer-recognition policy (spec §7a). There is **no**
   `attestationMethod` and **no** new `attestationRef` field. The spec's existing
   optional `declared.operator.attestationRef` is unchanged and unaffected.

## 2. Placement in the manifest

A new **optional** object under the existing `declared` block.

```json
{
  "version": "CGEP/1",
  "manifestKind": "STAMP",
  "declared": {
    "executorType": "AI_AGENT",
    "serviceId": "operator-alpha-7",
    "displayName": "Operator Alpha",
    "operator": { "type": "ORGANIZATION", "organizationId": "acme-labs" },
    "identity": {
      "manufacturer": "example-labs",
      "model": "reasoner",
      "modelVersion": "2.1.0"
    },
    "attestations": []
  }
}
```

- `executorType` stays where it is (spec §5); no `identity.executorType`.
- The per-claim state is **not** a stored field; it is an output of verification.
- `declared.identity` participates in `manifestCore` and therefore changes
  `manifestId` (spec §3) — expected.

## 3. Fields

| Field | Type | Required | Constraint | Meaning |
|---|---|---|---|---|
| `manufacturer` | string | no | 1–64 chars, `[a-z0-9._-]` | **opaque declared identifier** for the maker — not the legal entity name |
| `model` | string | no | 1–64 chars, same charset | opaque declared identifier for the model |
| `modelVersion` | string | no | 1–32 chars, same charset; opaque, not semver-enforced | opaque declared version label |

Notes:

- These are **identifiers**, not display names. They are lowercased and
  space-free so canonical JSON and hashing are unambiguous. Any human-readable
  label is a UI concern derived outside the manifest.
- No free-form description field in v1 (unbounded, high-fingerprint surface).
- `manufacturer` is **not** a statement about a real legal entity, and it is
  **not** the same namespace as `declared.operator.organizationId` (§4).

## 4. Identity vs operator (independent namespaces)

| Field | Namespace | Describes |
|---|---|---|
| `declared.serviceId` / `declared.displayName` / `declared.operator.organizationId` | responsible party | who is accountable for / operates the execution |
| `declared.identity.manufacturer` / `model` / `modelVersion` | artifact | which maker/model/version was declared for the execution |

An operator may be an organization while the manufacturer is another party. Any
link between them ("operator is authorized to run this model") is a **separate
claim** requiring its own binding/evidence; it is never inferred from co-presence.

## 5. Per-claim state (derived output)

Each field is evaluated **independently**; there is no single truth for a
bundle. The verifier emits:

- `claims`: a map, e.g. `{ manufacturer: DECLARED, model: DECLARED, modelVersion: UNKNOWN }`
- `manifest`: `VALID | INVALID | NOT_PROVEN` (spec §8) — a **flag**, not a state
- `overall`: the least-strong roll-up with structured reasons
- `reasons[]`: per-claim cause (e.g. `ISSUER_UNRECOGNIZED`, `SCOPE_MISMATCH`,
  `WINDOW_EXPIRED`, `REVOKED_AT_BLOCK`, `CLAIM_NOT_BOUND`, `MALFORMED_INPUT`)

`claims` values are exactly the spec §6 closed set:
`VERIFIED · ATTESTED · DECLARED · INFERRED · NOT_PROVEN · UNKNOWN`, with the
spec ordering `VERIFIED ▸ ATTESTED ▸ DECLARED ▸ INFERRED ▸ NOT_PROVEN`.
Per **DR-020**, `INVALID` is never a per-claim state: it is the manifest-level
verdict flag and a per-dimension flag (spec §7/§8). A malformed input is an
**input error** evaluated before the spec, not a §6 state. The `overall` value
MUST NOT be presented as a fact about a claim; it is a summary.

Resolution of each claim follows the per-claim rule-of-precedence in
`docs/agent-identity/trust-levels-and-attestations.md` §5 (DR-018): a valid
self-claim with **no** attestation asserted stays `DECLARED` (DR-019).

## 6. Binding a claim to evidence (no new mechanism)

An identity claim is upgraded only through the spec's existing attestation
envelope and `ATTESTATION_RECOGNITION` axis (spec §5, §7a). Binding to the
execution reuses `DECLARER_EXECUTION_BINDING` (spec §7).

**Open question OI-002 — not an executable rule.** The exact *attested claim
set* — which identity fields plus which binding context (`executorType`,
execution `scope`, issuer class) an attestation signature must cover, and its
canonical/versioned encoding — is **not yet specified**. Until it is specified
against `spec/canonical-encoding.md` in Phase B, no claim-set composition is
normative and no verifier may rely on one. The Revision 1 phrasing
("canonical, versioned subset") is withdrawn as a rule and retained only as a
design intention.

## 7. Decisions recorded (Revision 2)

1. **Reject a numeric `confidence` field.** `NOT_PROVEN` is a state, not a
   degree; any number would be a de-facto score (prohibited). Resolved by the
   per-claim discrete state in §5.
2. **Reject `attestationMethod` / new `attestationRef`.** Superseded by
   `attestations[]` (spec §5) + issuer recognition (spec §7a) + revocation
   (spec §5b). The spec's existing optional `declared.operator.attestationRef`
   is untouched.
3. **Identifiers, not names.** See §3.

## 8. Canonical encoding & versions

- Canonical form follows `spec/canonical-encoding.md` (sorted keys, explicit
  null, decimal strings, lowercase `0x`).
- Because `declared.identity` is additive, manifests without it remain valid. A
  manifest-version bump is a Phase B decision and MUST NOT silently reinterpret
  existing `manifestId` values.

## 9. Input validity (evaluated before the §5 table)

This section classifies **input only**. The resulting per-claim state is defined
by the single canonical table in `trust-levels-and-attestations.md` §5 (DR-021)
and is not restated here.

| Input | Class | Handling |
|---|---|---|
| `declared.identity` absent | absent | proceed to §5 (row 5 → `UNKNOWN`) |
| `identity: {}` | empty optional | valid; proceed to §5 (row 5 → `UNKNOWN`) |
| `"manufacturer": ""` | invalid input (length 0) | input error (not a §6 state) |
| `"manufacturer": 42` | invalid input (type) | input error (not a §6 state) |
| `"manufacturer": "Acme Labs!"` | invalid input (charset) | input error (not a §6 state) |
| unknown enum value elsewhere | valid-but-unknown | valid; proceed to §5 |
| otherwise valid field | valid | proceed to §5 |

Invalid input is **never** silently downgraded to `UNKNOWN`; it is reported as an
**input error** (not a §6 state) so a consumer can distinguish "not declared"
from "malformed/tampered".

## 10. Worked examples

**A. Honest self-declaration**

```json
{ "declared": { "executorType": "BOT",
  "identity": { "manufacturer": "example-labs", "model": "crawler" } } }
```

→ `claims: { manufacturer: DECLARED, model: DECLARED }`, `overall: DECLARED`.
Copy: "declared by the operator; not independently attested."

**B. Attested claim via the standard envelope**

The claim is declared as above, and an entry in `declared.attestations[]`
(spec §5 shape: `issuer`, `credentialType`, `proofRef`, `scope`, `issuedAt`,
`expiresAt`, `revokedAt`, `signature`) is asserted for this execution (the exact
attested claim set is OI-002, §6). → `ATTESTED` **iff** spec §7a holds (signature
valid · issuer recognized · credential type recognized · scope covers this
execution · window/revocation evaluable at the execution block). If the signature
is valid but the issuer is **unrecognized**, the spec §7a matrix yields
`DECLARED`, not `NOT_PROVEN`.

**C. Over-claim attempt (must fail closed)**

Input adds a strong stored state → ignored. With no covering attestation the
result remains `DECLARED`.

## 11. Validation rules (fail-closed)

1. Reject non-string values; enforce charset/length before any state computation.
2. Absent or empty object → `UNKNOWN`; malformed input → **input error** (not a
   §6 state; may set the `INVALID` flag). Never silently downgrade or upgrade.
3. Derive state solely from evidence and spec §7a; discard any supplied state.
4. Contradiction → `UNKNOWN` + `INVALID` flag (spec §8); never a silent upgrade.
5. No identity claim may be upgraded by aggregation or by `INFERRED` (spec §6).

## 12. Open questions for Phase B

- **OI-002** — exact composition/encoding of the attested claim set (§6); must
  be specified against `spec/canonical-encoding.md`, never invented here.
- **OI-001** — CGEP-1 §6 `NOT_PROVEN` gloss vs §7a usage (owner clarification
  recommended; not encoded as a rule).
- **OI-003** — CGEP-1 §7 lists `EXECUTOR_TYPE` → "VERIFIED (valid enumeration)",
  while §8 resolves an unrecognized enum to `UNKNOWN` → `NOT_PROVEN`. Open for
  the spec owner: does §7's `VERIFIED` mean only "valid enumeration", or
  "trustworthy declared value"? How do §7 and §8 interact for an unknown enum,
  and which has precedence? Phase A follows §8 (trust §5 row 4); not encoded as
  a rule.
- Manifest-version bump vs additive-without-bump (decide with fixtures).
- Whether `modelVersion` is separately attestable from `model`.
- Multiple simultaneous claims (e.g. reseller vs OEM) and conflict resolution.
- Which verifier component emits the rollout `overall` and its reason codes.
- Owners for T-ID-10..15 (see the product & threat model).

---

*End of Agent Identity & Provenance Schema Design (Phase A, Revision 7).*
