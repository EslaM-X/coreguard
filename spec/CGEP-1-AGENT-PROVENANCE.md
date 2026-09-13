# CGEP/1:AGENT-PROVENANCE — Declared Execution Provenance Protocol Specification

**Version**: 1.0.0-draft (design approved; Phase A implementation OPEN)
**Status**: G-1 PASSED; 5 spec blockers CLOSED; **CAP-1 / G-2 APPROVED (2026-09-13)** — Phase A in progress
**Parent**: CGEP/1 Core
**Scope**: Core blockchain only (Mainnet 1116 / Testnet2 1114)
**Surface family**: companion to `CGEP/1:VERIFY-RUN` (external verify surface)

---

## 1. Scope

CGEP/1:AGENT-PROVENANCE specifies how CoreGuard records and verifies WHO
declared responsibility for an execution, WHAT kind of executor it is, and
WHICH cryptographic evidence supports the claim.

The blockchain proves one fact: the key that authorized a transaction.
It does NOT say who operated that key, on whose behalf, with what tooling,
or under whose authority. This protocol makes that DECLARED responsibility
tamper-evident and independently verifiable.

It does NOT:
- Infer "human vs robot" from transaction patterns.
- Assign reputation scores.
- Profile wallets or individuals.

---

## 2. Killer Sentence

> **CoreGuard AgentProof verifies DECLARED execution provenance and
> cryptographic authority for humans, bots, AI agents, and organizations.**

---

## 3. Domain Separation (extension of CGEP/1)

New hash domains, distinct from existing CGEP/1 prefixes:

```
"CGEP/1:AGENT-PROVENANCE" — provenance manifest hash
"CGEP/1:DELEGATION"      — signed delegation link
"CGEP/1:ATTESTATION"     — third-party attestation
"CGEP/1:VERIFY-PROVENANCE" — external verification surface (companion to CGEP/1:VERIFY-RUN)
```

Host identity of the manifest — NO circularity:
```
manifestCore  = manifest WITHOUT { manifestId, signature, commit }
manifestId    = H("CGEP/1:AGENT-PROVENANCE" || canonicalize(manifestCore))
```

- `manifestCore` is the signed payload: everything except `manifestId`,
  `signature`, and `commit`. `manifestId` is computed FIRST over `manifestCore`;
  `signature` is computed over `manifestId` (see §5a); `commit` is added only
  after anchoring.
- Because `manifestId` never appears inside what it hashes, the hash is
  well-founded (no self-reference).
- Canonical encoding follows `spec/canonical-encoding.md` unchanged
  (alphabetical field sort, decimal strings, lowercase 0x, explicit null,
  required version field).

---

## 4. Executor Taxonomy (Enumeration, Not Free-Form)

| `executorType` | Meaning | Strongest achievable state |
|---|---|---|
| `UNKNOWN` | No declaration present | `NOT_PROVEN` (default, fail-closed) |
| `HUMAN` | Human-operated key | `DECLARED` or `ATTESTED` — never inferred |
| `AI_AGENT` | Autonomous LLM-driven agent | `DECLARED` or `ATTESTED` |
| `BOT` | Scripted automation, no learned decisions | `DECLARED` or `ATTESTED` |
| `AUTOMATION` | Scheduled/triggered pipeline (Keeper, cron, relayer) | `DECLARED` or `ATTESTED` |
| `ORGANIZATION` | Firm, DAO, fund | `ATTESTED` or `DECLARED` |
| `MULTISIG` | Multi-sig consensus execution | `VERIFIED` (confirmations), `ATTESTED` (signer org) |
| `CUSTODIAN` | Custodial service controls the key | `ATTESTED` (custody credential) |
| `SMART_CONTRACT` | Unattended contract-initiated execution | `VERIFIED` (code/deployment binding) or `DECLARED` |
| `PROTOCOL` | Protocol-level system operation | `ATTESTED` or `DECLARED` |

Rules:
1. `UNKNOWN` is a normal, first-class value — not an error.
2. Enforcement: unknown/unsupported `executorType` strings normalize to `UNKNOWN`.
3. A self-declared type resolves at most to `DECLARED` (authentic, not verified).

---

## 5. Provenance Manifest (Schema)

```json
{
  "version": "CGEP/1",
  "manifestKind": "STAMP",
  "manifestId": "0x…",
  "executionRef": {
    "chainId": 1116,
    "txHash": "0x…",
    "blockNumber": "123456"
  },
  "declared": {
    "executorType": "AI_AGENT",
    "serviceId": "operator-alpha-7",
    "displayName": "Operator Alpha",
    "operator": {
      "type": "ORGANIZATION",
      "organizationId": "acme-labs",
      "attestationRef": "0x…"
    },
    "disclosure": {
      "automation": true,
      "aiAssisted": true,
      "humanSupervised": false
    },
    "signerBinding": {
      "address": "0x…",
      "kind": "EOA"
    },
    "delegationChain": [
      {
        "authority": "0x…",
        "grantedTo": "0x…",
        "scope": { "action": "SWAP", "maxValue": "5000" },
        "expiresAt": "1726086400",
        "revokedAt": null,
        "signature": "0x…"
      }
    ],
    "attestations": [
      {
        "issuer": "0x…",
        "credentialType": "AGENT_SERVICE_VERIFICATION",
        "proofRef": "0x…",
        "scope": {
          "chainId": "1116",
          "txHash": "0x…"
        },
        "issuedAt": "1726086000",
        "expiresAt": "1726172400",
        "revokedAt": null,
        "signature": "0x…"
      }
    ]
  },
  "signature": {
    "scheme": "EIP-712",
    "signer": "0x…",
    "digest": "0x…",
    "signature": "0x…"
  },
  "commit": {
    "provenanceHash": "0x…",
    "anchoredAt": {
      "proofId": "0x…",
      "commitment": "0x…",
      "result": 1,
      "blockNumber": "123500",
      "blockHash": "0x…"
    }
  }
}
```

### 5a. Manifest signature envelope (replaces `declaredBy`)

The manifest is signed as an **explicit EIP-712 envelope**:

```
manifestCore  = manifest WITHOUT { manifestId, signature, commit }
        ↓ canonicalize
manifestId    = H("CGEP/1:AGENT-PROVENANCE" || canonicalize(manifestCore))
        ↓
digest        = EIP-712(digest(primaryType), domain)  # see exact struct below
        ↓
signature     = EIP-712.sign(signer, digest)
```

- The verifier RECOVERS the signer from `signature` and asserts:
  `signature.signer == recovered address`.
- `declaredBy` is REMOVED from the schema — declaration identity is the
  recovered signer, never a free-form field.
- `signature.digest` is a convenience echo of the verified digest, included for
  tooling; it is NOT the source of truth. The verifier recomputes
  `manifestId` from `manifestCore` and re-derives the EIP-712 digest, then
  checks the recovered signer. A stored digest that mismatches the recomputed
  digest rejects the manifest.
- Because `signature` wraps `manifestId` (not `manifestCore` directly), the
  manifest body remains bindable to exactly one hash with no circularity.

#### EIP-712 — exact domain + primary type (deterministic)

```
DOMAIN_NAME      = "CoreGuard AgentProof"
DOMAIN_VERSION   = "1"
PRIMARY_TYPE     = "ManifestDeclaration"
CHAIN_ID         = 1116  (Mainnet) / 1114 (Testnet2); set by the chain being anchored

types["EIP712Domain"] = [
  { name: "name",      type: "string"  },
  { name: "version",   type: "string"  },
  { name: "chainId",   type: "uint256" }
]

types["ManifestDeclaration"] = [
  { name: "manifestId", type: "bytes32" }
]

domain = {
  name:    "CoreGuard AgentProof",
  version: "1",
  chainId: <1116 | 1114>
}
```

- `primaryType` is `ManifestDeclaration` with the single field
  `bytes32 manifestId`.
- `verifyingContract` is intentionally ABSENT until an official CoreGuard
  verifier contract exists; if added later it becomes a mandatory EIP-712
  domain field and a spec revision (Coordinated, no silent change).
- `domain` IS part of the canonical verification algorithm: the verifier MUST
  rebuild the EIP-712 digest using these exact types/fields. A manifest whose
  digest was built with a different domain/type set is rejected (no "descriptive
  only" domain).
- EIP-712 does not provide automatic replay protection; for this protocol the
  `manifestId` is bound to one `executionRef` (STAMP) or one agent identity
  (REGISTRATION), and the chain-dependent domain guards cross-chain replay
  (a Mainnet signature cannot be replayed on Testnet2).

### Field rules

- `manifestKind` ∈ {`REGISTRATION`, `STAMP`} — REQUIRED:
  - `REGISTRATION` — long-lived agent declaration: `executionRef` MUST be `null`;
    `manifestId` binds to an agent identity (serviceId/org). Used by Q1 registry
    manifests + agent card.
  - `STAMP` — per-execution declaration: `executionRef` MUST specify EXACTLY
    ONE execution (chainId + txHash + blockNumber). Used by Q1 per-execution
    stamps. A STAMP with missing/multiple `executionRef` is INVALID.
- `executionRef` therefore binds a STAMP to exactly one execution; a
  REGISTRATION has none. One execution MAY have multiple STAMPs (e.g., executor
  declaration + organization declaration); conflicts between them are
  contradictions (see §8).
- The manifest signer (recovered from `signature`, §5a) is the declarer and
  MUST be the tx signer, or a grantee of the delegationChain whose root is the
  tx signer (`DECLARER_EXECUTION_BINDING`, §7). `declaredBy` is REMOVED —
  declarer identity is `signature.signer`.
- `delegationChain` is ordered authority→grantee; each link is a separate
  signed message per domain `CGEP/1:DELEGATION`.
- `attestations[].signature` is a replay-verifiable signature; recognition of
  the issuer is governed by the Issuer Recognition Policy (§7a) — a valid
  signature alone NEVER implies `ATTESTED`. The attestation's `scope`
  (chainId + txHash) and `issuedAt`/`expiresAt`/`revokedAt` ARE part of the
  schema (not implicit); a missing scope/validity makes the attestation
  unevaluatable → `NOT_PROVEN` for that execution.
- Optional fields (`displayName`, `attestationRef`, `revokedAt`)
  encode as explicit `null` per canonical encoding. Absence ≠ deception;
  the state machine decides.

### 5b. Revocation — authority, not self-report

`revokedAt` (on a delegation or attestation) is a **declaration**, not an
authority by itself. `<revokedAt>` lives inside the manifest the signer may
have produced — an attacker CAN sign "revokedAt: null" forever.

**Rule:** revocation (or non-revocation) is authoritative ONLY when supported by
verifiable revocation evidence:

1. An on-chain acceptance-stored revocation (e.g., EvidenceRegistry /
   future AgentRegistry marking a revokedAt/revoked commitment for a known
   manifestId/delegation), OR
2. A recognized, independently queried registry source (v0.2 AgentRegistry),
   OR
3. A cryptographically replayable signature of revoke by the delegator/issuer
   presented alongside the manifest.

Without such evidence, the verifier resolves:
- `revokedAt: <time>` present in-manifest → STALE: reported as
  revoked-for-comparison BUT `NOT_PROVEN` as authoritative (it lowers the
  confidence, it does not prove revocation).
- `revokedAt: null` present in-manifest only → reported as
  non-revoked-declared BUT `NOT_PROVEN` as authority (the verifier can never
  claim "NOT revoked" as a proven fact in v0.1).

**Corollary:** with Q6 keeping `AgentRegistry` outside P2, v0.1 verifier MUST
NOT claim it can prove current revocation status — the most it may assert is
`DECLARED`-level status (revoked/non-revoked as declared) or `NOT_PROVEN`.
This is an intentional, documented limitation, not a gap.

---

## 6. Verification States (Closed Set)

| State | Meaning | Achievable by |
|---|---|---|
| `VERIFIED` | Proven cryptographically from evidence at hand | key recovery / EIP-1271 / delegation signature replay / attestation replay |
| `ATTESTED` | A verified third party vouched for an unverifiable fact | valid issuer signature |
| `DECLARED` | Authentic self-claim; content not independently verified | signer-bound manifest fields |
| `INFERRED` | Heuristic hint ONLY; never a verdict | pattern heuristics (informational, optional) |
| `NOT_PROVEN` | No evidence / no declaration — fail-closed | absence |
| `UNKNOWN` | Executor type not declared / irresolvable | absence or contradiction |

**Ordering rule (strict):** `VERIFIED ▸ ATTESTED ▸ DECLARED ▸ INFERRED ▸ NOT_PROVEN`.
A field can ONLY be upgraded by a stronger mechanism — never by absence, never
by aggregation (many self-declarations do not become an attestation, and many
attestations do not become VERIFIED), never by `INFERRED`. Any attempt to
upgrade by a non-mechanism resolves to `NOT_PROVEN`.

---

## 7. Verification Axes (per-dimension checks)

| Check | Meaning | Strongest result implying |
|---|---|---|
| `PROVENANCE_COMMITMENT` | recomputed `manifestId` == stored; anchored commitment matches | VERIFIED (manifest integrity) |
| `MANIFEST_SIGNATURE` | EIP-712 signature replays; recovered signer == `signature.signer` | VERIFIED (signature validity) |
| `DECLARER_EXECUTION_BINDING` | `signature.signer` is the tx signer, or a grantee of a valid delegationChain rooted at the tx signer (for STAMP) | VERIFIED (declarer ↔ execution) |
| `DELEGATION_CHAIN` | each link sig valid, scope covers executionRef, not expired/revoked at execution block | VERIFIED (authority chain) |
| `ATTESTATION_SIGNATURES` | each attestation signature replays | VERIFIED for the *signature* |
| `ATTESTATION_RECOGNITION` | replaying ISSUER passes the Issuer Recognition Policy (§7a) | ATTESTED for the *content* |
| `EXECUTOR_TYPE` | declared type is a recognized enum value | VERIFIED (valid enumeration) |
| `CONTRADICTION_SCAN` | no two manifests for same executionRef declare conflicting fields | PASS only when no contradiction |
| `PATTERN_HINT` | optional heuristic (unchanged from CGEP/1 philosophy: informational) | INFERRED, never verdict |

### 7a. Issuer Recognition Policy (gate for ATTESTED)

A valid `attestations[].signature` proves ONLY "someone signed it." To claim
`ATTESTED` (meaning: a *trusted third party* vouched), ALL of these must hold:

1. **Signature valid** — EIP-712/EIP-191 replay succeeds against
   `attestations[].issuer`.
2. **Issuer recognized** — `issuer` resolves to a known trust-root per policy
   (curated registry for v0.1: organization DID contracts / custodian keys /
   known VC issuers on Core). An address NOT in the recognized set ⇒ issuer is
   unrecognized.
3. **Credential type recognized** — `credentialType` is an admitted schema
   (e.g., `AGENT_SERVICE_VERIFICATION`, `CUSTODY_ATTESTATION`); unknown type ⇒
   unrecognized.
4. **Scope covers the execution** — the attestation's declared `scope`
   ({chainId, txHash}) must include `executionRef`; out-of-scope ⇒
   not valid-for-this-execution.
5. **Validity window covers the execution block** — `issuedAt ≤ executionBlock`
   AND (`expiresAt` absent, `null`, or `> executionBlock`).
6. **Revocation evaluable** — per §5b: an in-manifest `revokedAt` is a
   declaration (at most `DECLARED` status); authoritative revocation requires
   on-chain/registry/verifiable evidence. Absent authoritative evidence,
   revocation is deemed `NOT_PROVEN`, not PRIMED to declare "not revoked".

Resolution matrix (fail-closed):

| Signature | Issuer recognized | Type | Scope/window | Field result |
|---|---|---|---|---|
| valid | YES | YES | YES | `ATTESTED` |
| valid | NO | — | — | `DECLARED` (strongest: authentic self-adjacent claim) |
| valid | YES | NO | — | `DECLARED` |
| valid | YES | YES | NO | `NOT_PROVEN` (for THIS execution) |
| invalid / absent | — | — | — | `NOT_PROVEN` |

`ATTESTED` therefore requires mechanism + recognition + scope + window — never
a bare signature. This is the defense against fake attestations (threat model
D2).

### Required profile (closed, mirroring anchor-verdict style)

| Claimed target | Required (all must PASS) |
|---|---|
| Any claim at `DECLARED` or stronger | PROVENANCE_COMMITMENT · MANIFEST_SIGNATURE · DECLARER_EXECUTION_BINDING · EXECUTOR_TYPE |
| delegation present | + DELEGATION_CHAIN |
| `ATTESTED` content-level claim | + ATTESTATION_SIGNATURES · ATTESTATION_RECOGNITION |
| `VERIFIED` on any field | the specific mechanism that produced it must PASS; all required PASS; no FAIL |
| `UNKNOWN` / absent manifest | NOTHING required — resolves `NOT_PROVEN` without error |

Rules (identical in spirit to `verification-levels.md` §3):
- Missing required → downgrade to `NOT_PROVEN`; never VERIFIED.
- Any FAIL (required or optional) → that field **and the manifest** are flagged
  `INVALID`/tampered for the contradictory dimension.
- Contradiction across manifests → affected fields resolve `UNKNOWN` +
  manifest flags `INVALID`.
- `INFERRED` can never upgrade any field.

---

## 8. Verdict Semantics (fail-closed)

- **Pass** = every required check for the claimed target PASSes and nothing FAILs.
- **Tamper** = `manifestId` mismatch or anchored commitment mismatch → `INVALID`,
  no deeper evaluation.
- **Missing** = required evidence absent → downgrade to `NOT_PROVEN`.
- **Contradiction** = conflicting declarations → `UNKNOWN` + `INVALID` flag.
- **Unknown type** = unrecognized enum → `UNKNOWN` → `NOT_PROVEN`.
- `INFERRED` is reported in a separate, clearly-labelled informational block,
  never merged into the verdict.

Verdict result surface (console/report): a per-field state map + a whole-manifest
`VALID` / `INVALID` / `NOT_PROVEN` + the provenance surface outcome
`VERIFIED / ATTESTED / DECLARED / NOT_PROVEN / UNKNOWN`.

---

## 9. Anchoring Flow (reuses existing commitment machinery)

1. Off-chain: compose `manifestBody`; compute `manifestId` (per §3/§5a).
2. Anchor: `anchorProof(proofId, commitment, result)` on the EXISTING
   `EvidenceRegistry` (no new contract in P2 for the manifest itself):
   - `proofId = H("CGEP/1:PROOF", {chainId, manifestId, commitment})` — same
     identity discipline as CGEP/1 (`anchor-verdict.mjs` single source of truth).
   - `commitment = manifestId`; `result = 1` (VALID) when declarer is the
     execution signer or valid grantee.
   - STAMP manifests anchor per execution. REGISTRATION manifests may anchor
     once (at registration) and are referenced by `manifestId` from subsequent
     STAMPs without re-anchoring; a STAMP may embed the REGISTRATION's
     `manifestId` as a referenced agent declaration (Q1 hybrid flow).
3. Independent verification recomputes `manifestId` and calls
   `verifyCommitment(proofId, manifestId)` — mirroring the L0/L1/L2 profile in
   `verification-levels.md`.
4. Bodies never go on-chain — commitment only (privacy floor, `privacy-model.md`).

On-chain storage plan is a SEPARATE decision (Q6) and is NOT part of P2 scope.

---

## 10. Surface: CGEP/1:VERIFY-PROVENANCE

Companion to `CGEP/1:VERIFY-RUN`. Same design constraints:
- Pure/hermetic: manifest + optional originals (delegation sigs, attestations)
  in → one deterministic report out.
- Fail-closed, no heuristics in verdicts, commitments only in the report.
- Exit-code discipline reused: `0=verified · 1=cli/input error · 2=invalid ·
  3=not proven/unverified · 4=inconclusive`.
- CLI subcommand `verify-provenance` (either reused bundle family or its own
  flags) — implementation detail deferred to the implementation phase.

---

## 11. Design-Level Decisions (set by G-1 / G-2; **CAP-1 — APPROVED 2026-09-13**)

| # | Decision | Adopted position |
|---|---|---|
| Q1 | Manifest unit | **Hybrid:** long-lived agent REGISTRATION manifest + per-execution STAMP manifest |
| Q1-impl | Q1 implementation prerequisite | `manifestKind` MUST distinguish `REGISTRATION` from `STAMP` (schema §5) — otherwise Q1 stays a strategy decision, not executable |
| Q2 | Human attestation standard | self-declared → `DECLARED`; vouched (org/custody DID VC) → `ATTESTED`; humans are never behaviorally inferred |
| Q3 | Delegation authority model | **EIP-712 signed delegation links** (in manifest) + on-chain EvidenceRegistry anchoring; on-chain delegation registry deferred (Q6) |
| Q4 | Novelty claims | **None.** G-1 prior-art gate blocks any novelty/「first」claim until a deeper checked scan + counsel (see prior-art + IP docs) |
| Q5 | Verify surface | sibling `CGEP/1:VERIFY-PROVENANCE` reusing the same verifier family + anchor-verdict rules |
| Q6 | Registry v0.2 | optional small `AgentRegistry` contract, NOT in P2; EvidenceRegistry reused meanwhile |
| Q7 | Patent/IP posture | publication-first; no legal claims in docs; counsel review before any filing (§ IP spec) |
| Q8 | EVM crypto dependency (ADDED 2026-09-13) | EIP-712 MUST be real. secp256k1/Keccak-256 introduced only behind an isolated `@coreguard/evm` EVM crypto adapter; the zero-dep claim is scoped to the **core path** (canonicalization, manifest, delegation/attestation/orchestrator); dependency gate in `docs/dependency-gate.md` |
| Q9 | NOT_RUN semantics (ADDED 2026-09-13) | when the EVM adapter is unavailable, EVM-dependent checks report `NOT_RUN` — never fabricated (no P-256 substitution; `signerBinding` remains a genuine EVM address) |
| Q10 | EOA vs smart-contract binding (ADDED 2026-09-13; NOT a Phase A blocker) | Phase A supports **EOA signer binding** via secp256k1 EIP-712 recovery. Smart-contract/multisig/custodian authorization is **NOT** claimed verified by an EOA signature of an associated party; it requires an explicit authorization path (e.g. EIP-1271) in a later phase |

**Decision status:** Q1–Q10 `APPROVED` · CAP-1 / G-2 `PASS` · Implementation `Phase A IMPLEMENTED (commits e0f9ff4, b951036, 86048c6, 9f5de66)` · Phase B (smart-contract/multisig authorization) OPEN — see §11 Q10.

## 12. Positioning (post G-1, adopted)

- **Brand:** CoreGuard AgentProof
- **Tagline:** *Verifiable Execution Provenance for Core.*
- **Layer statement:** *The execution-provenance layer for autonomous BTCFi on Core.*
- **Technical claim:** verifies declared execution provenance and cryptographic
  authority **for a specific execution**.
- **Explicit anti-position:** NOT an "AI detector", NOT "human vs bot detector",
  NOT "AI authentication"; NOT a replacement for ERC-8004 identity,
  ERC-8126 verification, or Blockaid-style threat detection (complementary at
  most).

## 13. What We Do NOT Claim

- ❌ "CoreGuard detects whether an address is a human or a robot."
  → We verify DECLARED provenance and cryptographic authority; human/AI are
  declared or attested, never behaviorally inferred.
- ❌ "Attested = true fact." → ATTESTED means a verified third party vouched.
- ❌ "100% attribution." → UNKNOWN / NOT_PROVEN is the honest, fail-closed default.
- ❌ "AI detector." → Provenance + authority, not personality inference.
- ❌ Fake users, stars, TVL, partnerships, integration counts.

---

*End of CGEP/1:AGENT-PROVENANCE Protocol Specification v1.0.0-draft.*