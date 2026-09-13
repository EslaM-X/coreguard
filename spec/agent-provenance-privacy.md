# Agent Provenance Privacy Model (CGEP/1:AGENT-PROVENANCE)

**Version**: 1.0.0-draft · **Parent**: CGEP/1:AGENT-PROVENANCE

---

## 1. Principle

Reuses `spec/privacy-model.md`: CoreGuard needs to know whether execution was
correct, not who executed it. Provenance extends this:

> Provenance answers "who/wha**t** declared responsibility and with what
> authority" — WITHOUT collecting, profiling, or aggregating individuals.

## 2. Data Classification

### What manifests contain

| Field | Class | Privacy note |
|---|---|---|
| `executionRef` (chainId, txHash, block) | public chain data | txHash is public on-chain |
| `executorType`, `displayName` | self-declared | operator-controlled |
| `serviceId` | self-declared | must be key-bound (no impersonation) |
| `delegationChain` signers/authorities | on-chain addresses | public; signatures reveal no content beyond the link |
| `attestations` issuer/credential | public identity data | verifier-replayable, no new data collected |

### What CoreGuard never collects

- IP addresses, device fingerprints, behavioral profiles
- Off-chain identity (name↔address linkage beyond the self-declared `displayName`)
- Aggregated activity graphs per identity

## 3. Privacy Floors (by surface)

| Surface | Floor |
|---|---|
| On-chain | commitment only (`provenanceHash`); no manifest bodies ever anchored |
| Off-chain verifier (CLI/local) | zero network calls when no RPC binding requested — same guarantee as CGEP/1 |
| Report / DApp badge | commitments + states only; bodies never re-printed (`CGEP/1:VERIFY-PROVENANCE` inherits the `VERIFY-RUN` privacy rule) |

## 4. Selective Disclosure (extended)

A manifest holder can disclose subsets without revealing the rest:

- full manifest — for independent verification
- badge-only (`executorType` + state) — for UIs
- proof-only (`CGEP/1:ATTESTATION` sig) — for authority checks
- `UNKNOWN` views — nothing to disclose; badge renders "NOT_PROVEN", which is
  itself privacy-preserving (a non-declarer is indistinguishable from a
  non-discloser by design)

## 5. Anti-Surveillance Guarantees (unchanged + provenance-specific)

1. No profiling: states are per-manifest/per-execution, never rolled into an
   identity score.
2. No surveillance: no collection layer exists; manifests are produced
   operator-side and verified independently.
3. Local-first: verification of a manifest is a local computation.
4. Open source: the same CI-reproducibility and `verify-live` discipline as
   CGEP/1 applies.
5. **No inference**: nothing in this protocol converts behavioral observations
   into identity facts. `PATTERN_HINT` stays informational and opt-in.

## 6. Legal Note (unchanged posture)

Addresses and self-declared business identifiers may be personal data in some
jurisdictions; manifests are operator-authored and operator-controlled.
CoreGuard adds no centralized collection point. See `agent-provenance-ip.md`
for legal posture — no legal advice is offered here.

---

*End of Agent Provenance Privacy Model.*