# 12 — IP / patent strategy

Summary of `spec/agent-provenance-ip.md` (design note; **not legal advice**).

## Principles (agreed up-front)

1. **Publication-first.** Protocol, schema, verification logic are public and open —
   establishing prior art, building trust, keeping the protocol non-proprietary.
2. **Separate concerns.** OPEN protocol stays free; any commercial service layer can be
   differentiated separately.
3. **No unverified claims.** No novelty / non-obviousness / "industry first" /
   patentability claim anywhere until prior-art + counsel review.
4. **No legal advice in-repo.** Docs state posture, not opinion.

## What might be protectable (TO BE EVALUATED, not claimed)

- Specific implementation shortcuts (canonical manifest encoding, key-binding for
  serviceId, anchoring scheme specifics) — evaluated by counsel against prior art.
- Trademark/brand (CoreGuard) — registration decision deferred to counsel.
- Trade-secret know-how (e.g., attestation vetting workflow) — if kept internal,
  explicitly NOT public as a matter of policy.

## Prior-art gate (before any "novel" claim)

Compare against: CGEP/1 itself, identity standards (ENS, DID/VC, verifiable
credentials), on-chain attestations, custodial/regulated provenance, ML-in-browser
"this is a bot" products, ERC-8004 / ERC-8126. Any statement like "no production system
combines X+Y+Z" ships **only** after a checked, dated prior-art scan (roadmap gate G-4
in `spec/agent-provenance-roadmap.md`).

## Licensing posture (direction, not decision)

- Protocol spec + reference verifier: open (source-available, MIT) — consistent with
  repo license.
- Commercial services (registry / attestation / firewall enablement): proprietary
  implementation layer, respecting the OPEN protocol.
- **Counsel sign-off required** before any dual-licensing statement.

## Compliance guardrails

- No "detecting humans/robots" conclusively — the tech verifies declarations.
- No "surveillance" / "profiling" language in sellable material.
- No fake metrics (metrics honesty is mandatory in every design doc).