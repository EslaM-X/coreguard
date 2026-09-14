# AgentProof Execution Roadmap (Post-P2-1)

**Version**: 1.1.0-approved · **Status**: G-1 PASS, G-2/CAP-1 PASS, Phase A IMPLEMENTED (commits e0f9ff4, b951036, 86048c6, 9f5de66), Phase B-1 EIP-1271 DESIGN v1.2 APPROVED → **GO GRANTED (2026-09-13)** → **Phase B-1 implementation review = PASS (2026-09-13)** — G-4 READY — v0.2.0 release boundary established (no tag); Phase D Execution Firewall DESIGN v0.3.0 FINAL DESIGN REVIEW PASS → **GO GRANTED (2026-09-13)** — implementation NOT started (spec committed docs-only); **Phase D CLOSED / RELEASE-READY (e479caa, 2026-09-13)** — 293/293 tests, 73/73 benchmark; Attack / Mutation Lab DESIGN v0.1.2 **FINAL SECURITY REVIEW PASS → GO GRANTED (2026-09-13)** — implementation authorized (adversarial tests only, additive `test/firewall/attack-lab/`; SUT frozen at e479caa); **RELEASE DECISION REVIEW — Q-REL-1..6 RULED (2026-09-14)** — v0.2.0 release boundary realized as per-workstream commits (WS-1 → WS-2 → WS-3) + combined-state tag `v0.2.0`, local only (no push), git-only (no registry); `package-lock.json` regenerated (adds firewall/sdk/independent-verifier; +30/-0), `npm ci` clean, full gates 512/512 · 73/73 · `git diff --check` clean · WASM build gate PASS · **v0.2.0 FROZEN RELEASE-READY WITHOUT COMMIT/TAG (OWNER DECISION 2026-09-14)** — commit/tag PENDING OWNER DECISION, push NO, publish NO; next workstream decision independent; **C Verifier DESIGN LOCKED (2026-09-14)** — Dec-C-1..11 APPROVED as written (`spec/verifier-c.md`), stdlib-only Python 3.14 third verifier; awaiting SECURITY REVIEW → FINAL SECURITY REVIEW → OWNER GO / NO-GO; **C Verifier SECURITY REVIEW PASS (2026-09-14)** — C-SR-1..6 = 6/6 PASS · 0 findings; **FINAL SECURITY REVIEW PASS (2026-09-14)** — FSR-C-1..6 = 6/6 CLOSED · 0 findings; **C Verifier OWNER GO GRANTED (2026-09-14)** — implementation OPEN (additive only, `packages/verifier-c/` + `test/verifier-c/`); next: **IMPLEMENTATION → IMPLEMENTATION REVIEW → RELEASE BOUNDARY REVIEW**; **C Verifier IMPLEMENTATION DONE + REVIEW PASS (2026-09-14)** — 53/53 C tests, full suite 565/565 · 73/73 benchmark · `git diff --check` clean · A↔B↔C parity demonstrated · additive only; next: **RELEASE BOUNDARY REVIEW**; **C Verifier RELEASE BOUNDARY REVIEW = PASS (2026-09-14)** — additive-only boundary verified, protected/frozen paths untouched, no runtime/pip deps, no RPC/network, no decision participation, no AI semantics, Dec-C-9 wording preserved, no deviation/§7 finding → **C VERIFIER CLOSED · FROZEN WITHOUT COMMIT/TAG** — release still NOT authorized; v0.2.0 state unchanged
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
| B-1 | EIP-1271 Contract Authentication (MULTISIG/SMART_CONTRACT → VERIFIED; Q10 closure) | code/contracts (NEW, additive on v0.1.1; NOT through EOA path) | A, Q10 |
| B-2 | Registry (agent profile + delegation + attestation) | code/contracts (deferred beyond B-1; not required for B-1) | B-1 |
| C | `verify-provenance` surface + tests | code | B |
| D | Execution Firewall design→impl (v0.2) | design v0.3.0 APPROVED / **GO GRANTED**; impl NOT started; no P2 contract | C |
| AL | Attack / Mutation Lab (adversarial workstream, post Phase D — SUT frozen at e479caa) | tests (additive, adversarial) **DESIGN v0.1.2 APPROVED / GO GRANTED** | D (CLOSED) |
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
| G-4 | Phase B-1 commit | new contract/package; B-1 EIP-1271 tests pass (additive on top of 184); evidence frozen hash unchanged |
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
5. **Phase B-1 (EIP-1271) — GO GRANTED (2026-09-13):** spec
   `agent-provenance-eip1271.md` v1.2 (approved, design as-is). Pipeline below.
6. **Phase B-2 (Registry):** deferred beyond B-1.
7. **Phase D (Execution Firewall) — GO GRANTED (2026-09-13):** spec
   `agent-provenance-firewall.md` v0.3.0-design (Q-FW1–Q-FW10 + amendments
   approved; FINAL DESIGN REVIEW PASS). **Implementation NOT started** — the
   design is committed docs-only; implementation proceeds as separate atomic
   commits later.

---

## Phase B-1 (EIP-1271 Contract Authentication) — design & gates

**Spec:** `spec/agent-provenance-eip1271.md` (v1.2.0-design) · **Closes Q10.**
Release boundary: **v0.2.0** (new independent release — v0.1.0/v0.1.1 immutable).

```
Phase B-1 pipeline:

Design v1.2 (Q-B1.1–Q-B1.6)
        ↓
Threat Model finalized (T1–T9, §3)
        ↓
Test Vectors V1–V10 + V9b/V9c/V9d (§4)
        ↓
FINAL DESIGN REVIEW
        ↓
GO  ← GRANTED (2026-09-13)
↓
Implementation  →  DONE (commits 199c745, f64766c, 87df335, cdcc43e; +1f3a42d docs, 8abac4d dependency-gate)
            ↓
B-1 implementation review = PASS (2026-09-13)
            ↓
G-4 READY / v0.2.0 release boundary (no tag; v0.1.0/v0.1.1 immutable)
```

**Design status (approved mechanics):**
- `CONTRACT_AUTHORIZATION` axis (read-only `eth_call`, execution-block pinned,
  explicit caller context, no STATICCALL-opcode claim, no on-chain wrapper).
- `CONTRACT_EXECUTION_BINDING` = strict admissible-evidence rule; invariant
  `tx.from ≠ executor`; **EIP-1271 OK + binding NOT_PROVEN ⇒ overall NOT_PROVEN**
  (authorization ≠ execution proof).
- `signature` self-describing: `scheme: "EIP-712" | "EIP-1271"`; consistency
  `kind` ⇔ `scheme`; mismatch ⇒ NOT_PROVEN.
- NOT_RUN: no provider / historical state unavailable; no `latest` fallback.
- T1–T9 single-version threat rows; vectors V1–V10 + V9b/V9c/V9d locked.

**Decision:** GO GRANTED (2026-09-13) — implementation open as additive B-1
workstream; atomic commit per logical unit: `npm test` → `git diff --check` →
frozen-artifacts review → independent commit. Structured state: permission to
edit — EIP-1271 impl, B-1 tests, adapter/provider injection, execution-binding
per evidence contract, additive test counts.<br>
**Prohibited (red lines, phase B-1):** ✗ editing v0.1.1 · ✗ `verify-live.json` ·
✗ Mainnet/P0/P1 · ✗ `tx.from == contract` rule · ✗ on-chain wrapper in B-1 ·
✗ `latest`-state fallback · ✗ turning NOT_RUN→NOT_PROVEN merely for missing
historical RPC · ✗ treating `0x1626ba7e` as executor proof ·
✗ any AI-detector semantics.

**Review (2026-09-13):** **Phase B-1 implementation review = PASS** — gates:
design v1.2 (go) · dependency gate 10/10 (Q-B1.5) · EIP-1271 primitives ·
schema/kind↔scheme · contract authorization · independent execution binding ·
`tx.from` relayer shape · historical-state pinning · NOT_RUN semantics ·
V9/V9b/V9c/V9d · V10 chain separation · 214/214 tests · 73/73 benchmark ·
`git diff --check` clean · frozen artifacts untouched · v0.1.0/v0.1.1 untouched ·
no new on-chain deployment/wrapper. **Outcome:** G-4 READY — **v0.2.0 release
boundary established (no tag)**. No technical reason to reopen design or redo
B-1.

---

## Phase D (Execution Firewall) — design & gate

**Spec:** `spec/agent-provenance-firewall.md` (v0.3.0-design) · additive on
CGEP/1 + B-1; consumes the verifier, never re-defines it.

```
Phase D pipeline:

Design v0.3 (Q-FW1–Q-FW10 + amendments 1a/2a/3a/3b/3c/4a/6a/7a/8a/9a)
        ↓
Threat Model finalized (T-FW1–T-FW9, §10)
        ↓
Mutation Lab corpus (M1–M13, §11) + Invariants I1–I7 (§12)
        ↓
FINAL DESIGN REVIEW = PASS (2026-09-13)
        ↓
GO  ← GRANTED (2026-09-13)
        ↓
Implementation  →  NOT STARTED (separate atomic commits, later)
```

**Design status (approved mechanics):**
- **Temporal split:** pre-execution decision uses declaration binding only
  (`intentRef`+`bindingRef`+`chainId`/`nonce`+`executionScope`, Q-FW4); an
  actual `executionRef`/`CONTRACT_EXECUTION_BINDING` is POST-execution evidence
  (Q-FW10) — `ALLOW` is never gated on post-execution evidence.
- **Deterministic predicate (Q-FW5):** `ALLOW ⇔ POLICY_SATISFIED ∧
  AUTHORITY_PROBE_OK ∧ DECLARATION_BOUND ∧ SIMCONSISTENT ∧ ¬REVIEW_OBLIGATION`.
- **Fail-closed closed set (Q-FW7/Q-FW7a):** any `NOT_RUN` in
  **{POLICY, PROBE, BINDING, SIM}** ⇒ `DENY` (or configured
  `REQUIRE_REVIEW`); never `ALLOW`; reason recorded.
- **Immutability (Q-FW6/Q-FW6a):** `decisionRef = hash(canonical record)`;
  conformance annotation is a separate linked record; `DENY` stays `DENY`.
- **Delivery (Q-FW8/Q-FW8a):** `@coreguard/firewall` zero-dep core; EVM/transport
  injected per-call; static imports only from local zero-dep core; dependency
  gate 10/10 re-checked at implementation.
- **Review resolution (Q-FW2a/Q-FW9a):** `REQUIRE_REVIEW → ALLOW` only as a new
  authorized-writer frozen record; unauthorized writer ⇒ DENY-equivalent;
  deny-vs-VERIFIED conflict via CGEP/1 `CONTRADICTION_SCAN`.
- **T-FW3 honest scope:** decision-time EIP-1271 magic ≠ executor proof; the
  rubber-stamp is NOT detectable pre-execution (M9/M10 = `ALLOW` at decision,
  `NOT_PROVEN` post-hoc).
- Q-FW3c boundary stands: **Authority↔Policy scope = OUT OF SCOPE** (no B-2 /
  registry introduced to close it).

**Decision:** GO GRANTED (2026-09-13) — permission to implement Phase D as
additive workstream; atomic commit per logical unit: `npm test` → `git diff
--check` → frozen-artifacts review → independent commit. Structured state:
permission to edit — firewall decision engine, decision-record schema, Mutation
Lab corpus/tests, additive test counts. **However, implementation is NOT
started by this GO**: the GO authorizes the design record only; implementation
commits are separate and later.<br>
**Prohibited (red lines, phase D):** ✗ "Firewall ALLOW is a pre-execution policy
decision, not proof execution will or did conform" · ✗ retroactively converting
a denied execution into an allowed one · ✗ AI/behavioral inference · ✗ editing
v0.1.1 / `verify-live.json` / P0/P1 / anchored evidence · ✗ on-chain
contract/deployment/P2 in this phase · ✗ merging firewall vocabulary into
verification verdicts (no new `VERIFIED`-style meaning) · ✗ static EVM/transport
imports across the firewall boundary.

**Review (2026-09-13):** **FINAL DESIGN REVIEW = PASS** — gates: Q-FW1–Q-FW10 +
all amendments approved · threat model T-FW1–T-FW9 · Mutation Lab M1–M13 ·
invariants I1–I7 · fail-closed closed critical set · content-derived
`decisionRef` · injected EVM/transport boundary · authorized-writer resolution ·
no B-2/registry · 3 review findings closed (M9/M10 honest-scope, M7 citation,
version refs). **Outcome:** design v0.3.0 committed docs-only; GO GRANTED;
implementation pending (not started).

---

## Attack / Mutation Lab (adversarial security workstream — post Phase D)

**Spec:** `spec/agent-provenance-attack-lab.md` (v0.1.2-design) · SUT frozen at
Phase D release boundary **e479caa** · adversarial tests ONLY (additive under
`test/firewall/attack-lab/`).

```
Attack / Mutation Lab pipeline:

Design v0.1 → v0.1.1 (review-gate NO-GO → 5 blockers + 4 notes closed)
        ↓
Design v0.1.2 (remaining A1.7/A1.9 post-signing seam closed)
        ↓
FINAL SECURITY REVIEW = PASS (2026-09-13)
        ↓
GO  ← GRANTED (2026-09-13)
        ↓
Implementation (adversarial tests ONLY, additive test/firewall/attack-lab/)
        ↓
Attack Lab review = PASS/FAIL
```

**Approved mechanics:**
- Invariant oracle IN1–IN8: NOT_RUN ⇒ never `ALLOW` (`REQUIRE_REVIEW` only on
  Phase-D review-eligible paths); no post-execution token in any PRE record;
  frozen content-addressed records; canonical determinism (equivalence defined by
  `packages/canonical`); policy commitment anti-rollback (caller values are
  claims vs harness-owned anchor); authority by recompute only; resolution
  anchored to the same bound intent/manifest; **unauthorized ALLOW = DEFEATED on
  sight** (any ALLOW failing IN8).
- Post-signing principle (A1.7/A1.9): intent mutation without a freshly valid
  declaration/signature over the changed intent ⇒ DECLARATION_BOUND ⇒ DENY,
  never ALLOW; a new consistent signature is a new authorization tested
  canonically (A13/A16).

**Decision:** GO GRANTED (2026-09-13) — implementation open as additive
adversarial-test workstream; atomic commit per logical unit: `npm test` →
`git diff --check` → frozen-artifacts review → independent commit.<br>
**Prohibited (red lines, attack lab):** ✗ editing `packages/firewall/*` as part
of the lab · ✗ editing e479caa except after a DEFEATED + deterministic
reproduction + user-approved remediation (§11 protocol) · ✗ SDK · ✗ B-2 ·
✗ on-chain work · ✗ `verify-live.json` / adversarial corpus / benchmark · ✗ any
ALLOW failing IN8.

**Review (2026-09-13):** **FINAL SECURITY REVIEW = PASS** — IN1–IN8 closed ·
A1.7/A1.9 blocker closed (post-signing principle) · trust boundary harness-vs-
claims · A3.3/A10.4/A12/A13/A14/A16 corrective notes closed · no SUT changes
authorized. **Outcome:** design v0.1.2 committed docs-only; GO GRANTED;
implementation pending (separate atomic commits, later).

---

## Release Decision — v0.2.0 (2026-09-14, owner ruling from the record)

**Trigger:** WS-1 (`signed-intent-authorization.md`), WS-2 (`signed-intent-sdk.md`),
WS-3 (`independent-verifier.md`) all `CLOSED · IMPLEMENTED · REVIEWED · FROZEN
WITHOUT COMMIT/TAG`. v0.2.0 was the established B-1 release boundary (no tag,
2026-09-13); the current state adds WS-1/WS-2/WS-3 on top of it. This is the
independent release decision — **not an automatic release**.

```
WS-1/WS-2/WS-3 CLOSED/FROZEN
        ↓
RELEASE DECISION REVIEW  (Q-REL-1..6 → RULED below)
        ↓
Release boundary execution (per-workstream commits → v0.2.0 tag, local only)
```

**Release Decision Review evidence (2026-09-14):** full gates green — `npm test`
512/512, benchmark 73/73, `git diff --check` clean, WASM build gate PASS
(regeneration byte-identical, artifact SHA-256
`7CDA8E1B928DB3099579969FD614B8D8D5109988D24596550236537F9FD61C3D`). The only real
tracked-content change in the working tree is `scripts/run-tests.mjs` (additive
registration of the WS-1/WS-2/WS-3 suites); the remaining `git status -M` flags
(anchor/testnet2/verify-live scripts) are stat-cache only — content-identical to
HEAD, and as such are NOT part of the release (no artificial changes).

- **Q-REL-1 — scope = B.** One atomic commit per workstream (WS-1, then WS-2,
  then WS-3), then one tag on the combined state.
- **Q-REL-2 — `run-tests.mjs` = updated.** Its suite registration is real,
  required by `npm test`, and included in the release.
- **Q-REL-3 — `package-lock.json` = regenerated** and included (a Release
  Boundary action, not a silent WS-3 edit). The previous lock was stale: it
  lacked `@coreguard/firewall` (Phase D), `@coreguard/sdk` (WS-2), and
  `@coreguard/independent-verifier` (WS-3). Regeneration is purely additive
  (+30/-0 lines): the three workspace `link` entries; `lockfileVersion` and the
  two `@noble/*` registry entries untouched. `npm ci` verified clean from the
  regenerated lock (27 audited, 0 vulnerabilities; all workspace symlinks
  linked).
- **Q-REL-4 — tag = v0.2.0** (owner release-semantic inference; v0.1.0/v0.1.1
  immutable; content since B-1 is feature-scale, not a patch).
- **Q-REL-5 — local commit + tag only.** No `git push` without an explicit
  owner authorization.
- **Q-REL-6 — git-only release.** No npm publish / registry action; "release"
  = versioned Git state + tag.

**Boundary (given, per owner):** staging by explicit paths only (never
`git add -A`), so the stat-cache-only files cannot enter any release commit;
release scope = net-new WS paths (+ their specs/tests), `scripts/run-tests.mjs`,
regenerated `package-lock.json`, `scripts/build-verifier.mjs`,
`packages/independent-verifier/.gitignore`. Frozen evidence, P0/P1, firewall
source, WS-1/WS-2/WS-3 decision texts remain untouched.

**Status (owner decision 2026-09-14):** **v0.2.0 = RELEASE-READY · FROZEN WITHOUT
COMMIT/TAG.** The release decision review completed PASS; the owner chose the
freeze path, not execution. COMMIT — PENDING OWNER DECISION; TAG — PENDING OWNER
DECISION (commit/tag remain separately authorized via an explicit "نفّذ Release
v0.2.0"); PUSH — NO; PUBLISH — NO. Transitioning to a new workstream is an
independent decision following this freeze.

---

## C Verifier (Verifier C) — design & gates

**Spec:** `spec/verifier-c.md` (v0.1.0-design) · third independent implementation
of the CGEP/1 chain (Verifier C of the Three Verifiers Rule) in stdlib-only
Python 3.14 · completes the start of the Three Verifiers Rule after
A (JS reference) + B (Rust/WASM, closed/frozen).

```
C Verifier pipeline:

Design (Dec-C-1..11)        → APPROVED as written (2026-09-14)
        ↓
SECURITY REVIEW             → PASS (2026-09-14; C-SR-1..6 = 6/6 · 0 findings)
        ↓
FINAL SECURITY REVIEW       → PASS (2026-09-14; FSR-C-1..6 = 6/6 CLOSED · 0 findings)
        ↓
GO / NO-GO                  → GO GRANTED (2026-09-14) — implementation only
        ↓
Implementation              → DONE (53/53 C tests; 565/565 full suite; 73/73 benchmark; git diff --check clean)
        ↓
IMPLEMENTATION REVIEW       → PASS (2026-09-14; owner-reviewed evidence; A↔B↔C parity demonstrated)
        ↓
RELEASE BOUNDARY REVIEW     → PASS (2026-09-14; additive-only boundary verified)
        ↓
CLOSE / FREEZE              → C VERIFIER CLOSED · FROZEN WITHOUT COMMIT/TAG (2026-09-14)
```

**Design status (approved mechanics, Dec-C-1..11):** stdlib-only Python,
script (no exe) — App-Control safe; self-implemented Keccak-256 + secp256k1
recovery, SHA-256 via `hashlib`; stdlib `json` + own CGEP/1 canonicalize rules;
library-only `verify*` surface mirroring B's `verifyRaw`; injected RPC witness
(C never calls RPC); three-way differential A↔B↔C; reproducibility metadata =
pinned Python version + source checksums only (Dec-C-9 — NOT a runtime
attestation). Red lines: no edits to A/B/WS-1..3/firewall/frozen, no RPC/
network, C never decides, no publish, no AI semantics.

**Status (2026-09-14):** **C VERIFIER CLOSED · FROZEN WITHOUT COMMIT/TAG.**
Security Review PASS (6/6) · Final Security Review PASS (6/6 · 0 findings) ·
**OWNER GO GRANTED (implementation only, additive)** — `packages/verifier-c/`
+ `test/verifier-c/` implemented, **IMPLEMENTATION REVIEW = PASS (2026-09-14)**
(A↔B↔C envelope/canon parity; 53/53 C tests · 565/565 full suite · 73/73
benchmark · `git diff --check` clean) · **RELEASE BOUNDARY REVIEW = PASS
(2026-09-14)** (additive-only boundary verified; protected/frozen paths
untouched; no runtime/pip deps; no RPC/network; no decision participation; no
AI semantics; Dec-C-9 wording preserved; no deviation / §7 finding). Closure =
freeze without commit/tag. This does NOT authorize release and does NOT change
v0.2.0 state — the commit/tag/push/publish decision remains separate and
RELEASE NOT AUTHORIZED stands.

---

## Do NOT Do (guardrails)

- ✗ Do not edit `verify-live.json`, P0/P1 files, or anchored evidence.
- ✗ Do not bundle provenance commits with P2-1.
- ✗ Do not claim MULTISIG/SMART_CONTRACT VERIFIED from EOA cryptography alone (Q10).
- ✗ Do not claim novelty/patentability before prior-art + counsel.
- ✗ Do not begin Phase B-1 code before FINAL DESIGN REVIEW → GO (design approval ≠ code GO).
- ✗ Do not begin Phase D implementation inside the design-GO commit (implementation = separate atomic commits, later).
- ✗ Do not edit `packages/firewall/*` as part of the Attack/Mutation Lab; the SUT is frozen at e479caa — any fix requires a DEFEATED + deterministic reproduction + user-approved remediation (§11 protocol).
- ✗ Do not introduce any "AI detector" language into product/spec/marketing.

---

*End of AgentProof Execution Roadmap.*