# AgentProof Execution Roadmap (Post-P2-1)

**Version**: 1.0.0-approved · **Status**: G-1 PASS, G-2/CAP-1 PASS, Phase A IMPLEMENTED (commits e0f9ff4, b951036, 86048c6, 9f5de66)
**Parent**: CGEP/1:AGENT-PROVENANCE

**Frozen / untouchable (hard constraints):**
- P0 (mainnet evidence, `scripts/verify-live.json`, `verify-anchor.*`) — frozen.
- P1 (protocol engine) — frozen; no changes in provenance work.
- P2-1 (verify-run surface) — reviewing/committing separately; provenance
  manifests and proofs NEVER modify `verify-live.json` or anchored evidence.
- Every deliverable is additive: new packages/contracts, NOT edits to frozen
  evidence.

## Phase Map

| Phase | Deliverable | Nature | Depends on |
|---|---|---|---|
| G-1 | Prior-art scan (see § prior-art gate) | analysis, doc | — |
| G-2 | Approve protocol spec (CAP-1) + decisions Q1–Q7 | decision | G-1 |
| A | Manifest canonicalization + hashing + domain separation | code (new `packages` only) | G-2 |
| B | Registry (agent profile + delegation + attestation) | code/contracts (NEW, not touching EvidenceRegistry) | A |
| C | `verify-provenance` surface + tests | code | B |
| D | Execution Firewall design→impl (v0.2) | deferred design; no P2 contract | C |
| E | AgentProof DApp (UX/branding as spec → impl) | front-end | C |
| F | Directory / explorer + account-abstraction integration | later | E |

## Commit Discipline (applies to every phase)

1. One atomic commit per logical unit; each compiles, tests pass (`npm test`),
   benchmarks hold at frozen baseline.
2. New files ONLY under new paths; no edition of frozen evidence or P0/P1.
3. Commits are additive and self-describing with `feat(agent-provenance): …`.
4. Gate before commit: `git diff --check`, full test run, benchmark, frozen
   `verify-live.json` unchanged by hash.
5. CLI smoke test per surface before commit records exit-code semantics.

## Gates

| Gate | Definition | Exit criterion |
|---|---|---|
| G-1 | prior-art check | dated scan note in repo; no novelty claim before it |
| G-2 | spec approval (CAP-1) | user approves protocol spec + decisions Q1–Q7 |
| G-3 | Phase A commit | `git log` shows one additive commit; tests 125/125 preserved (not enough — must stay 125, NOT counting new) |
| G-4 | Phase B commit | new contract/package; registry tests pass; evidence frozen hash unchanged |
| G-5 | Phase C commit | `verify-provenance` surface tested; exit codes documented |
| G-6 | DApp/EW | separately gated post-P2; explicit go/no-go |

**Note:** test count changes ONLY when an additive phase adds its own new suite —
baseline stays `125/125` (verify-run's own suite), any provenance adds more **on
top**, never alters the prior counts' meaning.

---

## G-1 — Prior-Art Gate

**Status:** COMPLETE / PASS
**Date:** 2026-09-13

**Gate decision:** PASS — positioning & novelty-restriction gate only.
Does NOT establish novelty, patentability, or freedom-to-operate.

**Next gate:** ~~G-2 / CAP-1~~ — **CAP-1/G-2 APPROVED (2026-09-13)**.

Phase A is OPEN (canonical model + EIP-712 primitives + tests,
`packages/provenance` + `test/provenance`). No mainnet / frozen-evidence
change is authorized by this gate.
- ERC-8004: agent identity/discovery/trust primitives (active Draft)
- ERC-8126: AI-agent technical verification (Final)
- Blockaid: transaction/threat security (Core integration = Core wallet on
  Avalanche, NOT Core DAO/Core Chain)
- Core: active AI-agent + BTCFi execution ecosystem

**Positioning locked:**
- CoreGuard AgentProof
- *Verifiable Execution Provenance for Core.*
- *The execution-provenance layer for autonomous BTCFi on Core.*

**Red lines locked:**
- No novelty claim
- No "AI detector"
- No behavioral human/AI inference
- No fake attribution
- No modification of frozen P0/P1/Mainnet evidence

**Specification blockers identified (5):**
1. manifestId circularity — CLOSED (manifestCore formula, §3/§5)
2. explicit manifest signature — CLOSED (EIP-712 envelope + exact
   domain/primaryType, §5a)
3. ATTESTED issuer recognition — CLOSED (§7a Issuer Recognition Policy)
4. REGISTRATION/STAMP manifest distinction — CLOSED (`manifestKind`, §5)
5. authoritative revocation semantics — CLOSED (§5b)

**Next gate:** G-2 / CAP-1 — **APPROVED (2026-09-13)**.

Phase A is IMPLEMENTED: canonical model + EIP-712 primitives + orchestrator +
tests committed, baseline preserved and counts grow additively on top.

## Architecture Decision (AD-2026-09-13): isolated EVM signer adapter

> **EIP-712 must be real. The existing zero-dependency core remains intact;
> secp256k1/Keccak-256 are introduced only behind an isolated EVM signer adapter.**

- `@coreguard/crypto` stays ZERO-DEP (`canonicalize`, sha256, P-256).
- `@coreguard/provenance` has a ZERO-DEP **CORE PATH** (canonicalization,
  manifest model, delegation/attestation/orchestrator) **plus** an OPTIONAL EVM
  CRYPTO ADAPTER — it is NOT a literally zero-dependency package (it declares
  `@coreguard/evm` under `optionalDependencies`). It consumes the adapter via
  dynamic-import gate (`packages/provenance/evm-adapter.js`), never statically.
- `@coreguard/evm` is the ONLY package that owns noble
  (`signer/{eip712,secp256k1,address}.js` + `keccak256.js`); dependency
  gate recorded in `docs/dependency-gate.md`.
- **NOT_RUN semantics:** when the EVM adapter is unavailable the verifier
  reports `NOT_RUN` for `MANIFEST_SIGNATURE`, `DECLARER_EXECUTION_BINDING`,
  `DELEGATION_CHAIN` (only its EVM parts), `ATTESTATION_SIGNATURES`,
  `ATTESTATION_RECOGNITION`. It NEVER fabricates a replay or substitutes P-256
  for the signer binding. `PROVENANCE_COMMITMENT` (SHA-256, zero-dep) stays
  evaluable.
- The manifest signer binding remains a genuine EVM address (`secp256k1`
  recovery); no redefinition of `signerBinding` to fit the crypto package's
  P-256 signer.
- **EOA boundary (Q10):** Phase A verifies EOA signer binding only.
  MULTISIG / SMART_CONTRACT authorization is NOT claimed VERIFIED via an EOA
  signature of an associated party; it needs an explicit authorization path
  (e.g. EIP-1271) in Phase B.

---

## Status Update (2026-09-13)

1. **G-1 PASS** — prior-art scan complete (5 spec blockers CLOSED).
2. **G-2 / CAP-1 PASS** — protocol spec + decisions **Q1–Q10 APPROVED**
   (Q8/Q9 EVM adapter + NOT_RUN; Q10 EOA boundary added at CAP-1 review).
3. **Phase A IMPLEMENTED** — commits `e0f9ff4`, `b951036`, `86048c6`,
   `9f5de66`; dependency gate `docs/dependency-gate.md` (10/10);
   184/184 tests; benchmark 73/73 intact; `git diff --check` clean.
4. **P2-1 (separate track):** commit external verify-run surface once user
   GOes — do NOT bundle with any provenance work.
5. **Phase B (OPEN):** smart-contract / multisig authorization via explicit
   path (e.g. EIP-1271) — NOT reachable by EOA-only verification (Q10).

---

## Do NOT Do (guardrails)

- ✗ Do not edit `verify-live.json`, P0/P1 files, or anchored evidence.
- ✗ Do not bundle provenance commits with P2-1.
- ✗ Do not claim MULTISIG/SMART_CONTRACT VERIFIED from EOA cryptography alone (Q10).
- ✗ Do not claim novelty/patentability before prior-art + counsel.
- ✗ Do not introduce any "AI detector" language into product/spec/marketing.

---

*End of AgentProof Execution Roadmap.*