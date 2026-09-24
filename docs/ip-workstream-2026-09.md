# IP workstream (Phase F)

Decision chain for CoreGuard's IP posture: prior art → candidate claims →
counsel → patent / defensive publication / trade secret. This is a *plan*, not
legal advice. No claim is filed by this document.

---

## 1. Prior-art map (what already exists publicly)

Anything a claim must distinguish against:

| Area | Public prior art |
|---|---|
| Execution-as-evidence | on-chain receipts, event indexing, proofs of inclusion; existing "provenance" concepts across blockchains |
| Canonical evidence manifests | RFC 8785 (JCS), notarization/anchor services, evidence vendoring patterns |
| Consent labeling | tri-state / three-valued logic is classical; per-party modeled consent in treaty/fixture records is descriptive |
| Dispute packaging | litigation data standards (legal XML, e-filing envelopes), ADR record schemas |
| Tribunal transport | **People's Court Partner API v2** (authority grants, consents, evidenceExporter, settlement bindings, webhooks) and **@peoples-court/x402-disputes** — both public |
| Settlement-boundary semantics | "Award does not move money"; `decision_served` ≠ execution — stated in People's Court's public docs |

Implication: **many individual elements are public/served before us.** The only
plausible novelty is in the *combination and the fail-closed determinism
discipline*, and even that is contestable. The honest IP position is therefore
thin.

## 2. Candidate claims (assess, don't assert)

Candidates that *could* be argued as novel combinations:

1. **Fail-closed label discipline as a machine contract**: UNKNOWN party assent
   must never be inferred from a verified execution receipt — enforced by a
   verifier that rejects any record that converts an unknown (tests enforce it).
2. **Layered re-verification pipeline**: each protocol layer re-verifies the
   prior layer's pins before mapping/appending; outputs byte-deterministic
   across machines.
3. **Award slot that is structurally un-prefillable by the record producer**,
   with adapter mapping that keeps `integrationStatus: NOT_BUILT` until a
   verifiable external signer exists.
4. **Reference-tribunal fail-closed settlement semantics**: mock escrow that
   refuses any instruction whose award signature does not bind content and whose
   actions are not authority-bound.

Honest assessment: each of #1–#4 is likely to be seen as a **combination of
public building blocks with a discipline**, not as a breakthrough. Prior art on
#2/#3 includes core on-chain verification pipelines. #4 is a simulator.

## 3. Counsel step (required before any filing)

- **Do not file anything based on this document.** Engage IP counsel (small
  budget) with the prior-art map + candidate claims + the repository.
- Ask counsel: (a) freedom-to-operate against the People's Court Partner API /
  x402 docs (CRUD-style endpoints are Statutory-Subject-Matter-hard to claim);
  (b) whether any claim survives the Alice/Mayo-type eligibility inquiry;
  (c) defensive-publication cost/benefit vs. patent cost.

## 4. The three-way decision (recommended default in bold)

| Option | Fit | Cost | Open-source posture |
|---|---|---|---|
| **Defensive publication (recommended)** | strongest discipline, degrades others' ability to later block us | very low | keeps MIT; publish the conformance spec + semantics |
| Trade secret | determinism test-harness details, adapter mapping internals | low but brittle (all-repo is public already) | conflicts with "evidence over narrative" nothing stays hidden |
| Patent | only if counsel says a claim survives eligibility AND we can pay for prosecution | high (prosecution + maintenance) | risk of claiming "the method" that is actually a combination |

Given the mission (open protocol, reproducibility-as-trust), **defensive
publication is the natural default**. A patent would likely be both
non-qualifying and reputation-negative for an OSS trust layer.

## 5. Concrete next actions (order)

1. Freeze this IP document + prior-art map in the repo (done by this commit's
   ecosystem restructure).
2. Add a "defensive publication" appendix to the ADAL/1 standard
   (`docs/dispute-package-standard.md`) that publishes the fail-closed
   invariant in normative language.
3. Get one counsel hour with this document; record the reply verbatim in the
   same doc (no reinterpretation).
4. Decide defensive-publication vs. hold. Do NOT patent without step 3.

## Never

- Claim the adapter "is patented", "patent-pending", or "protected by IP" while
  nothing is filed.
- Ask a counterparty to sign anything related to these claims.
- Treat this roadmap as legal advice.