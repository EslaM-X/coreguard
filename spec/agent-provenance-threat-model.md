# Agent Provenance Threat Model (CGEP/1:AGENT-PROVENANCE)

**Version**: 1.0.0-draft · **Parent**: CGEP/1:AGENT-PROVENANCE

---

## 1. Scope and Relationship to CGEP/1 Threat Model

Reuses `spec/threat-model.md` (Core consensus, crypto primitives, EVM
determinism trusted; engine/RPC/storage/dashboard NOT trusted). This addendum
covers the NEW attack surface introduced by declared provenance: the gap
between a signing key and the responsible operator.

## 2. Assets

| Asset | Why it matters |
|---|---|
| `DECLARED` provenance manifests | basis of every AgentProof badge/verdict |
| Delegation signatures | authority chain from operator to executor key |
| Attestation signatures | third-party vouching for unverifiable facts |
| Anchored commitments | tamper-evidence; the on-chain truth anchor |
| `VERIFIED/ATTESTED/DECLARED` states | downstream consumption by DApps, firewalls, risk desks |

## 3. Adversarial Goals

1. Fake a strong state (`VERIFIED`/`ATTESTED`) for a weak reality.
2. Break the provenance↔execution binding (pin a fake manifest to a real tx).
3. Dilute accountability (make `UNKNOWN`/`NOT_PROVEN` the *unavoidable* default
   so bad actors hide in the noise).
4. Forge attestations or delegation links.
5. Tamper with a manifest after anchoring.

## 4. Attack-By-Attack

Goal 1 — Fake a strong state:

| Scenario | Attack | Result | Mitigation |
|---|---|---|---|
| A1 | Agent registers a paid agent profile under a victim's `serviceId` | Everyone sees "Known service" | `serviceId` MUST be bound to signing key or delegation root; no free-form name claims; conflict → `UNKNOWN` |
| A2 | A bot claims `HUMAN` | Badge "Human — DECLARED" | Name it honestly: DECLARED is a *declaration*, never proof; DApp displays "cannot be inferred unless attested" |
| A3 | Crawls a DID VC from a public registry and replays it | "ATTESTED" under a stolen credential | Verifier checks issuer binding + validity window + revocation (future); stolen keys are a CGEP/1 out-of-scope key-risk |

Goal 2 — Break provenance↔execution binding:

| Scenario | Attack | Result | Mitigation |
|---|---|---|---|
| B1 | Manifest for tx X signed by a *different* account than `from` | Pin of wrong agent | `DECLARER_EXECUTION_BINDING` check: `MANIFEST_SIGNATURE` (sig valid) + signer is tx signer or a delegation grantee |
| B2 | Attestation timestamp lies after the tx | Post-hoc laundering | `scope.expiresAt`/attestation window evaluated at execution block; stale → modern `NOT_PROVEN` |
| B3 | Delegation chain rewritten after the fact | Faked authority chain | Per-link signature replay; chain root must equal tx signer |

Goal 3 — Dilute accountability:

| Scenario | Attack | Result | Mitigation |
|---|---|---|---|
| C1 | Operators simply never declare | Everything `UNKNOWN`; provenance is useless | Design incentive (badge utility + fee tiers) so declaration is *rewarded*, not coerced; `UNKNOWN` stays a normal state, not a bug |

Goal 4 — Forge attestations/delegations:

| Scenario | Attack | Result | Mitigation |
|---|---|---|---|
| D1 | Attacker crafts a `CGEP/1:DELEGATION` signature it does not hold | Invalid link | Signature replay verification against the public key; failure → `INVALID`/`NOT_PROVEN` |
| D2 | Attacker self-signs an org attestation | Fake `ATTESTED` | ATTESTED requires a verifier-whitelisted issuer class (org DID/custodian); self-signed credit stays `DECLARED` regardless of volume |

Goal 5 — Tamper post-anchor:

| Scenario | Attack | Result | Mitigation |
|---|---|---|---|
| E1 | Manifest body altered after `anchorProof` | Divergent recompute | `manifestId` re-derivation vs anchored commitment → INVALID, no deeper eval |
| E2 | `provenanceHash` swapped in the on-chain commitment | Commitment mismatch | on-chain commitment is only itself; attacker can NOT alter the original anchor — replay of `verifyCommitment` is the check |

## 5. Explicitly Out of Scope (CGEP/1 exclusions, unchanged)

- Consensus-level attacks, network-level DoS/eclipse
- Private key compromise (incl. stolen attestation keys)
- Social engineering / phishing (UI spoofing is mitigated by open-verifier reproducibility, not eliminated)
- Physical attacks, zero-day Core vulnerabilities

## 6. Residual Risks (Tracked, Accepted)

- **Disclosure-gap**: honest actors may still under-disclose. Accepted; monitored via dashboard telemetry (anonymized) — never via profiling.
- **Heuristic misuse**: `PATTERN_HINT` could be misread as verdict. Mitigated by design: informational block only, never merged into verdict.

---

*End of Agent Provenance Threat Model.*