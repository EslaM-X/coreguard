# Governance Decision Record — Agent Identity & Provenance Workstream

**Version**: 1.7.0-draft (Phase A, Revision 7) · **Status**: Records the authorization for Phase A only
**Branch**: `feature/agent-identity-provenance` (created from `2ea7c18`, local only)
**Baseline**: `main == origin/main == 2ea7c18` (frozen)
**Scope of this record**: opening the workstream, constraining Phase A, and
recording the Revision 1–4 decisions, the OI-003 open item, the Revision 6
acceptance-criteria reword, and the Revision 7 owner-review waiver (DR-023).

---

## 1. Context

A request was made to add (a) bot/human identification, (b) manufacturer/model
data, (c) a Core-native dApp, and (d) commercial pricing. A gap analysis found
that most provenance groundwork already exists (`spec/CGEP-1-AGENT-PROVENANCE.md`,
`spec/agent-provenance-threat-model.md`, `spec/agent-provenance-ip.md`,
`spec/agent-provenance-dapp.md`, `packages/provenance/*`), while several
requested items conflict with locked decisions. A design review of the Revision
0 documents found genuine conflicts with the normative spec; Revision 1 resolved
them. A consistency review of Revision 1 then found a residual
`DECLARED`/`NOT_PROVEN` ambiguity; Revision 2 closes it with the per-claim
rule-of-precedence and records OI-001 / OI-002 as open items. An independent
review of Revision 2 then flagged the rule-of-precedence as duplicated across
three documents (drift risk); Revision 3 makes trust §5 the single canonical
source and reduces the others to references (DR-021), with no semantic change.
A cross-consistency review against `CGEP-1` then found a field-path conflict
with spec §5 (`serviceId`/`displayName` live under `declared`, not under
`operator`); Revision 4 corrects it with DR-022. Recording the §7/§8
executor-type tension as OI-003 followed (Revision 5; no rule change). Revision 6
rewords two acceptance criteria (#5, #10) to avoid implying that the open OI-001
§6 wording and the user-reported cross-consistency review are independently
resolved. Revision 7 records the project owner's decision to approve Phase A with
an explicit **owner-review waiver** of the independent-external-review criterion
(DR-023) — a waiver, not a substitute for that review.

This record authorizes a **docs-only Phase A** to design the legitimate part —
identity *declaration and provenance*, never behavioral detection — and to
explicitly reject the conflicting parts.

## 2. Historical decisions retained (DR-001..DR-020)

These decisions were made in Revisions 0–2 and remain in force. DR-021 (Revision
3), DR-022 (Revision 4), and DR-023 (Revision 7) are recorded in §4.

| ID | Decision | Rationale |
|---|---|---|
| DR-001 | Open workstream "Agent Identity & Provenance" as an **extension** of CGEP/1, not a rewrite | reuse taxonomy, hashing, issuer rules |
| DR-002 | Phase A is **documents only**; no production code | review before implementation |
| DR-003 | Work on a dedicated branch from `2ea7c18`; no push without separate approval | keep frozen `main` intact |
| DR-004 | Add optional `manufacturer` / `model` / `modelVersion` as **declared claims** under `declared.identity` | primary product value, low risk |
| DR-005 | **Reject** human/bot behavioral detection | red line: `spec/agent-provenance-prior-art.md` §5 |
| DR-006 | **Reject** numeric confidence / any 0–100 score | prohibits scoring; use discrete states |
| DR-007 | **No token**, no NFT, no dashboard, no fake metrics | inherited locked decisions |
| DR-008 | **No announced pricing** in this workstream | pricing stays hypothesis until a Decision Gate |
| DR-009 | **No novelty/patentability claim** before prior-art + counsel | `spec/agent-provenance-ip.md` |
| DR-010 | dApp is **design-only** in Phase A; implementation is Phase D, gated | avoid premature surface |
| DR-011 | `main`, frozen evidence, `scripts/verify-live.json`, P0/P1, Mainnet artifacts are **read-only** | freeze discipline |

### Revision 1 decisions (added after design review)

| ID | Decision | Rationale |
|---|---|---|
| DR-012 | **Normative precedence:** `CGEP-1 §4/§5/§6/§7a/§5b` + `canonical-encoding.md` are the source of truth; Phase A docs are subordinate | prevent parallel re-definitions |
| DR-013 | **Reuse `attestations[]`**; the invented `attestationMethod` / new `attestationRef` are withdrawn | spec §5 + §7a already specify the envelope and recognition |
| DR-014 | `declared.identity.*` (artifact) and `operator.*` (responsible party) are **independent namespaces**; any link is a separate claim needing evidence | avoid conflating operator with manufacturer |
| DR-015 | Trust is **per-claim**, with an optional reasoned roll-up; no bundle-wide truth | a proof of one field does not prove another |
| DR-016 | Correct `EXECUTOR_STRONGEST`: it is a **Phase-A advisory / EOA-scope** projection, not a semantic ceiling; spec §4 ceilings stand (EIP-1271 = Phase B) | corrects a factual error in Revision 0 |
| DR-017 | Input-validity is separate from claim state: absent → `UNKNOWN`, invalid → `INVALID`, evidence-failure → `NOT_PROVEN` | consumers must distinguish "not declared" from "malformed/tampered" |

### Revision 2 decisions (added after consistency review)

| ID | Decision | Rationale |
|---|---|---|
| DR-018 | The **per-claim rule-of-precedence** (trust doc §5, rows 1–12) is the reference resolution algorithm for Phase B | single deterministic mapping tied to spec §6/§7/§7a/§8 |
| DR-019 | **Absence of an attestation is not a failed attestation**: a valid self-claim with no attestation asserted stays `DECLARED`; only an *asserted* attestation that fails/does not bind yields `NOT_PROVEN` | removes the Revision 1 internal contradiction |
| DR-020 | `INVALID` is a **manifest-level verdict flag and a per-dimension flag**, never a per-claim state; per-claim output uses only the spec §6 closed set | keep one closed state set |

### Open items (owner decision required; not rules)

| ID | Open item | Note |
|---|---|---|
| OI-001 | CGEP-1 §6 glosses `NOT_PROVEN` as "No evidence / no declaration", which is broader than §7a usage ("asserted but not established"). This record adopts the **§7a usage** and treats an absent optional field as `UNKNOWN`. | Recommend a future clarification in spec §6 by the spec owner. **Out of scope** for this branch; not encoded as a rule. |
| OI-002 | Exact composition/encoding of the *attested claim set* (which identity fields + binding context an attestation signature covers) | Remains an **open question for Phase B**; not an executable rule until specified against `spec/canonical-encoding.md`. |
| OI-003 | CGEP-1 §7 lists `EXECUTOR_TYPE` → "VERIFIED (valid enumeration)", while §8 resolves an unrecognized enum to `UNKNOWN` → `NOT_PROVEN`. Open questions for the spec owner: (a) does §7's `VERIFIED` mean only "valid enumeration" or "trustworthy declared value"? (b) how do §7 and §8 interact for an unknown enum? (c) which rule has precedence if interpretations differ? | Spec-internal tension; Phase A follows §8 (trust §5 row 4). Recorded neutrally; **no** Phase A rule added. |

## 3. In scope / out of scope (Phase A)

**In scope:** the four Phase A documents in `docs/agent-identity/`.

**Out of scope:** verifier/CLI/SDK/contracts code, on-chain transactions,
tokens, pricing, releases, npm publish, `main` changes, tag movement.

## 4. Revision 7 changes (current)

### DR-023 (Revision 7) — Phase A approved with owner-review waiver

| ID | Decision | Rationale |
|---|---|---|
| DR-023 | Phase A is **approved with an owner-review waiver**: the project owner accepts responsibility for the internal design decision without an independent external review. The independent-review acceptance criterion (§5) is **waived, not satisfied**, and must never be represented as an independent sign-off. | owner decision; avoids blocking Phase A while keeping the external-review gap explicit |

**Conditions of approval:**

- Revision 6 (`v1.6.0-draft`; docs-only) is the review baseline.
- OI-001, OI-002, and OI-003 remain **open**.
- No `VERIFIED` claim may be treated as genuine until a specific, verifiable rule exists.
- No behavioral human/bot detection.
- No changes to `main` or frozen evidence.
- No Mainnet transactions, token, pricing, or patent claims.
- **No Phase B implementation** is authorized by this decision.
- **No commit or push** is authorized by this decision.
- Phase B requires a **separate explicit GO**.
- This is **not** an independent external security review.

### Files touched by Revision 7

| File | Revision 7 change |
|---|---|
| all four `docs/agent-identity/*.md` | version label `v1.7.0-draft` (Revision 7) |
| `docs/agent-identity/governance-decision-record.md` | DR-023; §5 waiver note; §6 gate clarification; §7 status; §8 owner approval + independent-review waiver |

### Revision 6 changes retained

**No decision, no rule change.** Revision 6 rewords two acceptance criteria (§5):
#5 no longer implies the open OI-001 §6 wording is resolved, and #10 labels the
cross-consistency review as user-reported with finding F1 corrected through
DR-022.

### Revision 5 changes retained (OI-003)

Revision 5 records **OI-003** (§2): the spec tension between §7 `EXECUTOR_TYPE`
("VERIFIED — valid enumeration") and §8 (unrecognized enum → `UNKNOWN` →
`NOT_PROVEN`). It is an open question for the spec owner, not a Phase A rule.

### Revision 4 changes retained (DR-022)

| ID | Decision | Rationale |
|---|---|---|
| DR-022 | Operator/identity field paths MUST match spec §5 exactly: responsible-party fields are `declared.serviceId`, `declared.displayName`, and `declared.operator.{type, organizationId, attestationRef}`; Phase A documents MUST NOT invent `operator.serviceId` / `operator.displayName`. The attestation entry shape includes `proofRef`, and the spec's existing optional `declared.operator.attestationRef` is untouched. | cross-consistency review vs CGEP-1 found a field-path conflict with the normative manifest schema |

### Files touched by Revision 4

| File | Revision 4 change |
|---|---|
| `docs/agent-identity/product-and-threat-model.md` | §6 operator row corrected to `declared.serviceId` / `declared.displayName` / `declared.operator.organizationId` |
| `docs/agent-identity/identity-provenance-schema.md` | §3/§4 field paths corrected; §2 example aligned to spec §5; §10 attestation shape adds `proofRef`; §1.6/§7.2 note the spec's existing `declared.operator.attestationRef` is untouched |
| `docs/agent-identity/trust-levels-and-attestations.md` | version only (no field paths) |
| `docs/agent-identity/governance-decision-record.md` | this record; DR-022; status |

### Revision 3 changes retained (DR-021)

| ID | Decision | Rationale |
|---|---|---|
| DR-021 | The per-claim rule-of-precedence is defined **only** in `trust-levels-and-attestations.md` §5; `product-and-threat-model.md` §11 and `identity-provenance-schema.md` §9 reference it instead of restating it. Other Phase A documents may restate **input-validity classification only**, which is evaluated before the table. | eliminate drift risk from three copies of the same table |

### Files touched by Revision 3

| File | Revision 3 change |
|---|---|
| `docs/agent-identity/product-and-threat-model.md` | §11 reduced from a restated state table to the input-vs-state principle + references (DR-021); fail-closed wording made precise (unrecognized issuer → `DECLARED`) |
| `docs/agent-identity/identity-provenance-schema.md` | §9 reduced to input classification + `§5` reference; §10 worked example no longer implies a defined claim set (OI-002); §11 rule 2 no longer emits `INVALID` as a claim state |
| `docs/agent-identity/trust-levels-and-attestations.md` | marked as the single canonical rule-of-precedence (DR-021) |
| `docs/agent-identity/governance-decision-record.md` | this record; DR-021; historical/current sections separated |

### Historical changes retained (Revisions 1–2)

Revision 2 changes (DR-018..020; OI-001 / OI-002; per-claim rule-of-precedence;
`INVALID` as a flag) remain in force. Revision 1 changes (normative precedence,
operator/identity separation, reuse of `attestations[]`, corrected
`EXECUTOR_STRONGEST`, spec §7a/§5b alignment, deferred threats T-ID-10..15) also
remain in force.

## 5. Acceptance criteria

- [ ] The four documents are internally consistent and do **not** re-define any
      normative CGEP/1 area (DR-012).
- [ ] No code, no `main`/frozen edits, no tag/release changes.
- [ ] No human/bot detection, no score, no pricing, no token, no patent claim.
- [ ] Identity claims reuse `attestations[]` and spec §7a (DR-013).
- [ ] Deterministic per-claim handling is documented for Phase A, and
      `DECLARED`/`NOT_PROVEN` resolution is contradiction-free (DR-018, DR-019);
      the normative §6 wording remains an open owner clarification (OI-001).
- [ ] The rule-of-precedence is defined in exactly one place (trust §5) and all
      other Phase A documents reference it rather than restating it (DR-021).
- [ ] `INVALID` appears only as a flag, never as a per-claim state (DR-020).
- [ ] OI-001 / OI-002 / OI-003 are recorded and not encoded as rules.
- [ ] Encoding hygiene: UTF-8, **no BOM**, LF, no mojibake/trailing whitespace.
- [ ] Cross-consistency review against `CGEP-1` is user-reported as complete,
      with finding F1 corrected through DR-022.
- [ ] Independent review completed and signed below. **Status: WAIVED for Phase A
      by DR-023 — NOT satisfied, and not represented as an independent review.**

**Owner decision (DR-023):** Phase A is approved **with an owner-review waiver**
of the independent-review item above. The remaining criteria are recording-state
statements; several are user-reported and were not independently confirmed.

## 6. Gate to Phase B

Phase B (schema + verifier implementation) may begin **only after**:

1. All §5 criteria are met (Phase A approval itself was granted under the owner-review waiver, DR-023); **and**
2. An independent design-risk review is complete; **and**
3. A separate, explicit go-ahead is given for Phase B on this branch.

This Revision 7 approves **Phase A only, with an owner-review waiver** (DR-023)
and does **not** open Phase B. The waiver applies to Phase A approval; it does
not remove gate (2) for Phase B unless the owner separately waives it in
writing. No code is written and nothing is committed or pushed.

## 7. Current status (Revision 7)

| Item | State |
|---|---|
| Phase A authorized | Yes — docs only |
| Branch created (`feature/agent-identity-provenance` @ `2ea7c18`) | Yes (local) |
| Phase A documents | Revision 7 (`v1.7.0-draft`) |
| Phase A approval | **Approved with owner-review waiver** (DR-023) — **not** an independent external review |
| Committed / pushed | **No** — not authorized by DR-023 |
| Phase B | **Blocked** — requires separate explicit GO and gate §6 |

## 8. Sign-off

| Role | Name | Date | Decision |
|---|---|---|---|
| Owner (approver) | Project owner (self-declared) | 2026-09-17 | Approved Phase A with owner-review waiver (DR-023) |
| Independent reviewer | Not performed — waived for Phase A by DR-023 | — | n/a |

**Note:** the owner-review waiver is an internal design decision. It is **not** an
independent external security review and must not be represented as one. Phase B
still requires gate §6 (including item 2) and a separate explicit GO.

---

*End of Governance Decision Record — Agent Identity & Provenance Workstream (Revision 7).*
