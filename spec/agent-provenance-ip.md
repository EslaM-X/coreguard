# AgentProof IP & Legal Posture (Design Note)

**Version**: 1.0.0-design · **Status**: Informational; NOT legal advice
**Parent**: CGEP/1:AGENT-PROVENANCE

---

## 1. Purpose

Provides a defensible, no-hype IP posture for the provenance system. **This
document is not legal advice**; counsel review is required before any filing or
licensing decision.

## 2. IP Principles (agree-up-front)

1. **Publication-first.** The protocol, schema, and verification logic are
   public and open — establishing prior art, building trust, and keeping the
   protocol non-proprietary (education + ecosystem).
2. **Separate concerns.** The OPEN PROTOCOL stays free; any commercial
   implementation/service layer can be differentiated separately.
3. **No unverified claims.** No claim of novelty, non-obviousness, "industry
   first", or patentability is made in any doc until prior-art + counsel review.
4. **No legal advice offered in-repo.** Docs state posture, not opinion.

## 3. What Might Be Protectable (TO BE EVALUATED — not claimed)

- Specific implementation shortcuts (canonical manifest encoding optimizations,
  key-binding for serviceId, anchoring scheme specifics) — evaluated by counsel
  against prior art, NOT self-asserted.
- Trademark/brand (AgentProof, CoreGuard) — registration decisions deferred to
  counsel; no TM claim made here.
- Trade-secret style know-how (e.g., attestation vetting workflow) — if kept
  internal, explicitly NOT in-public as a matter of policy.

## 4. Prior-Art Gate (BEFORE any claim/roadmap says "novel")

- Compare against: existing execution-verification (CGEP/1 itself), identity
  standards (ENS, DID/VC, verifiable credentials), on-chain attestations,
  custodial/regulated provenance, ML-in-browser "this is a bot" products.
- Any statement like "no production system combines X+Y+Z" ships ONLY after a
  checked, dated prior-art scan (roadmap gate G-4).

## 5. Licensing Posture (Direction, Not Decision)

- Protocol spec + reference verifier: open (source-available) — consistent with
  current repo license.
- Commercial services (registry/attestation/firewall enablement): proprietary
  implementation layer, respecting the OPEN protocol.
- Reuse/redistribution: per repo license terms (see LICENSE).
- **Counsel sign-off required** before any dual-licensing statement.

## 6. Compliance Guardrails

- No claims that could be read as "detecting humans/robots" conclusively while
  the technology only verifies declarations.
- No "surveillance" or "profiling" language anywhere in sellable material.
- No fake metrics (updated by every design doc — see business spec).

---

*End of AgentProof IP & Legal Posture.*