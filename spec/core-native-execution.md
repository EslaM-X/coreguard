# Core-Native Execution Integration — WS-4 Design

**Version**: 0.1.0-design · **Status**: DESIGN DRAFT — **Q-REVIEW PENDING** (owner GO/NO-GO required; NO-GO stops)
**Parent**: CGEP/1:AGENT-PROVENANCE
**Boundary**: additive, docs only. NO implementation before GO. NO tag/commit as part of this spec (baseline: v0.2.1 `b3f1cbf` + hygiene `98fe77e`; both IMMUTABLE).
**Date**: 2026-09-14

---

## 0. Canon and Ground Rules (fixed before review)

1. **Core = witness / anchor. CoreGuard = verifier.** Core chain records
   execution truth (blocks/transactions/receipts/logs) and can host
   commitments; CoreGuard verifies declared provenance against that record.
   Core itself is **never** the verifier of execution *conformance to intent*.
2. **No trace ≠ fake trace.** When an internal trace is not available the
   adapter reports `TRACE_UNAVAILABLE` — it NEVER synthesizes a trace and NEVER
   infers a caller or an execution path from a receipt alone. The execution
   path of an internal call is simply unknown.
3. **AUTHORIZATION ≠ EXECUTION CONFORMANCE** (WS-1/Q-FW10 seam, unchanged).
   WS-4's evidence is **POST-execution** and must never flow into a
   PRE-execution decision (`ALLOW` stays deterministic: Q-FW5).
4. **Fail closed.** Anything missing (provider, historical state, adapter,
   evidence item, subscription) ⇒ a `NOT_RUN` / `UNVERIFIED` / `NOT_PROVEN`
   state — never an inference and never `VERIFIED`.
5. **Never trust a caller-supplied claim.** Every binding in §5 is recomputed
   from trusted inputs; caller-supplied `executionRef`/`caller`/`trace` is at
   best a *claimed equality target* to be re-derived (WS-1 §4 discipline).
6. **Additive only.** New packages/spec paths; NO edits to `packages/firewall/*`
   (SUT frozen), NO edits to frozen evidence / P0 / P1, NO edits to
   v0.2.x trees, NO Verifier C involvement.

---

## 1. Scope & Non-Goals

### Scope (in)
- **Core-native execution adapter** (`packages/execution/*`, new, zero-dep core +
  injected provider): extracts and binds on-chain facts
  `{ chainId, block, transaction, receipt, caller, target, selector, value, logs, executionReference }`
  as permitted by the actual evidence available on Core.
- **Execution evidence model**: typed, labeled, canonicalized evidence items;
  a recomputable `executionEvidenceRef`; admissible-vs-claim classification.
- **Intent → Authorization → Execution binding**: cross-checks adapter outputs
  against the frozen PRE records (intentRef / manifestId / bindingRef /
  executionScope / decisionRef) with the Q-FW10 seam held.
- **Execution Attestation**: portable certificate binding
  Intent + Authorization + Manifest + Execution Evidence + Verification Result,
  carrying a verifiable commitment; on-chain carries **only** the
  commitment / receipt reference, never raw evidence.
- **Firewall PRE/POST integration boundary** (§7): defines how POST evidence
  feeds conformance annotations without mutating decisions.
- **Provider / historical-state requirements** (§6) and **failure-state /
  fail-closed semantics** (§8).
- **Privacy / on-chain commitment boundary** (§9).
- **Threat model + attack classes** (§10) and **security invariants** (§11).
- **Q-review question set** (Q-WS4-1..n, §12) and the **GO/NO-GO gate** (§13).

### Non-Goals (out)
- **NO on-chain deployment**: no new contracts/registry/anchor in this design
  (the on-chain commitment anchor lives behind a separate GO if ever needed;
  `execution-receipt.md` anchoring semantics reused/referenced only).
- **NO edits to `packages/firewall/*`**; no redefinition of decision/review/
  resolution/conformance records.
- **NO trace provisioning**: WS-4 does not build an archive/archive-service or a
  private tracing backend; trace availability is a provider fact.
- **NO new cryptography**: sha256 / secp256k1 / Keccak-256 remain exactly as
  today (EVM crypto only behind the isolated EVM adapter; no P-256 substitution;
  EIP-712 must stay real).
- **NO Verifier C**, **NO B-2 registry**, **NO SDK/API/DApp work**, **NO
  multi-chain generalization** beyond `chainId` separation.
- **NO AI/behavioral inference**, no partial-disclosure UI work (L3 deferred),
  no ZK (L4 deferred).

---

## 2. Baseline Inventory (verified against v0.2.1 source)

| Area | Where | What exists today |
|---|---|---|
| Intent model | `packages/intent/index.js` | `createIntent`, `commitIntent`, `hashIntent`; canonical `CGEP/1` shape |
| Authorization binding | `packages/intent/authorization.js` | `buildAuthorization`, `scopeOfIntent` (WS-2 consumer surface) |
| Canonical encoding | `packages/canonical/index.js` | `canonicalize`, `domainHash`; unsafe-numbers fail closed |
| Firewall PRE decision | `packages/firewall/*` | binding/authority/policy/simulation/decision; `decisionRef = H(CGEP/1:FW-DECISION, record)`; ALLOW predicate Q-FW5; fail-closed set {POLICY,PROBE,BINDING,SIM} (Q-FW7) |
| Conformance seam | `packages/firewall/conformance.js` | separate `CGEP/1:FW-CONFORMANCE` record; decision never mutated post-hoc |
| SDK surface | `packages/sdk/index.js` | `verifyBinding`, `FW_DECISION_DOMAIN`, `FW_DECISION_RECORD_VERSION`; recomputes binding chain (§ WS-2) |
| EVM crypto | `packages/evm/` | isolated `@coreguard/evm`; keccak256/secp256k1/eip712/address; optional-dependency adapter pattern |
| Independent verifier B | `packages/independent-verifier/` | Rust/WASM `verifyRaw` + sha256 artifact; frozen artifact |
| Execution/trace primitives | `@coreguard/trace`, `@coreguard/evidence`, `@coreguard/replay` | v0.1 machinery: `normalizeExecution(tx, receipt, trace, preState, postState)`, `computeStateDelta`, `commitTrace`, `createEvidenceBundle`, `createReceipt`, `computeReceiptId` — WS-4 REUSES, never duplicates |
| Policy + CLI surfaces | `@coreguard/policy`, `@coreguard/cli` | policy evaluation; CLI surface (frozen, zero-dep) |
| Execution Receipt spec | `spec/execution-receipt.md` | receiptId, state pinning (simulation vs execution), L0–L4, anchoring (`commitIntent`/`anchorProof`, `proofId`) |
| Verification levels | `spec/verification-levels.md` | L0/L1/L2 required-evidence profiles; verdict rules (missing ⇒ `UNVERIFIED`; FAIL ⇒ `INVALID`) |
| Runner | `scripts/run-tests.mjs` | suite registry; D1 (2026-09-14): no `test/verifier-c` |
| Release state | — | v0.2.1 (`b3f1cbf` + tag `0dee051…`) + hygiene `98fe77e`, LOCAL ONLY, IMMUTABLE |

**Gap WS-4 closes:** today there is **no** Core-native *adapter* that turns a
Core transaction/receipt/logset into typed execution *evidence* bound to the
frozen PRE chain (the v0.1 machinery in `@coreguard/trace` /
`@coreguard/evidence` / `@coreguard/replay` exposes primitives but no
Core-RPC-response extraction boundary), and **no** Execution Attestation that
packages the result with a verifiable commitment. The verifier confirms
*intent/authorization* binding and (in `conformance.js`, domain
`CGEP/1:FW-CONFORMANCE`) has a post-hoc record seam, but the
evidence *extraction boundary* against real Core RPC responses is undefined.

---

## 3. Core Evidence Boundaries

### 3.1 What the adapter may read from Core (native, non-RPC-derived facts)
On Core (EVM-compatible), a transaction evidence set is bound to a
cryptographically anchored object: the **block** (number + blockHash), the
**transaction** (txHash, nonce, `from`, `to`, `value`, `input`), the
**receipt** (status, gasUsed, transactionIndex, logs, logIndex per log), and
**logs** (topics, data, address, blockNumber, logIndex). These are sourced from
the injected provider at a **pinned execution block**.

### 3.2 What the adapter may NOT fabricate
- **Internal execution trace** (nested calls, `DELEGATECALL`, storage reads):
  NOT available from public Core RPC receipt/logs ⇒ `TRACE_UNAVAILABLE`.
  Mapping onto the existing `@coreguard/trace` surface: when no trace-capable
  provider is present the adapter invokes `normalizeExecution` **without** a
  trace (argument absent ⇒ receipt-level evidence only) and `commitTrace` is
  **never** called with a synthesized trace. If a trace IS provided it is
  handled by `@coreguard/trace` — never by a WS-4-parallel normalizer.
- **Caller / execution path inference** from the receipt alone: a `from` is a
  *submitting* address; with meta-transactions/relayers the semantic caller is
  unknown without cross-checked evidence (see §5.4). Never inferred.
- **Pre-images / private data** of any kind.

### 3.3 Adapter evidence vocabulary
Each evidence item is `{ kind, source, value, blockPin, txPin }`, canonicalized
and, for commitment purposes, folded into `executionEvidenceRef`:

| kind | source | value |
|---|---|---|
| `CHAIN_ID` | provider `eth_chainId` (cross-check against declared `chainId`) | decimal chain id |
| `BLOCK` | `eth_getBlockByNumber` (pinned hash) | blockNumber + blockHash |
| `TRANSACTION` | `eth_getTransactionByHash` | txHash, from, to, value, input, nonce |
| `RECEIPT` | `eth_getTransactionReceipt` | status, gasUsed, transactionIndex, logs |
| `LOG` | receipt logs | address, topics, data, logIndex |
| `EXECUTION_REF` | blockPin + txPin (+ logIndex where applicable) | sealed execution reference |
| `TRACE` (optional) | injected trace-capable provider ONLY | normalized trace — else `TRACE_UNAVAILABLE`, never synthesized |

Every item carries the pinned `blockNumber`/`blockHash` it was read at;
**no `latest` fallback** (consistent with B-1 rules).

---

## 4. Execution Evidence Model

- `executionEvidence = canonicalize({ executionRef, items[] })` using
  `packages/canonical` (sorted keys, lowercase `0x`, unsafe numbers fail
  closed). Item collection reuses `@coreguard/evidence` conventions
  (`createEvidenceBundle`) rather than a parallel receipt writer; receipts
  remain `@coreguard/evidence` receipts (referenced, never re-implemented).
- `executionEvidenceRef = domainHash("CGEP/1:EXECUTION-EVIDENCE", executionEvidence)` —
  recomputable, tamper-evidence. A mismatched recompute ⇒ `INVALID`.
- **evidenceHash closure:** the WS-4 evidence bundle embeds the
  `executionEvidenceRef` inside its canonical `execution` object, so
  `evidenceHash = H(CGEP/1:EVIDENCE, bundle)` closes over the reference:
  `evidenceHash ⊇ executionEvidenceRef ⊇ {executionRef, items[]}`. Changing
  any item or `executionRef` changes the ref, which changes the bundle input,
  which changes `evidenceHash`. The attestation therefore never carries two
  independent/unbound side-by-side commitments — the relationship is
  cryptographically re-derivable and test-enforced (same ref ⇒ same hash;
  ref change ⇒ hash change).
- **Admissible-vs-claim rule:** evidence obtained by the adapter from the
  pinned provider = *admissible*. Any value supplied by the caller
  (`executionRef`, `caller`, a JSON trace object) = *claim*; it is only ever
  the target of a recompute-equality check, never a trusted input (WS-1 §4.2).
- Evidence is held **off-chain / local**; only its commitment (hash / root)
  enters on-chain anchoring (§9).
- Composed with the RECEIPT model of `execution-receipt.md` (state pinning
  simulation vs execution): WS-4 never fabricates a simulation — and therefore
  never emits a legacy CGEP/1 receipt that would be read through the legacy
  `verifyStatePinning()` presence check (which awards `STATE_PINNING` on the
  mere existence of `simulation.blockNumber/blockHash` and cannot reason about
  an annotation it never reads). WS-4 without a real simulation emits NO legacy
  receipt: its attestation carries `receiptId: null` and the typed
  `{ check: "SIMULATION", result: "NOT_RUN", label:
  "SIMULATION_NOT_PERFORMED" }` entry inside `verification.checks` — the
  profile the attestation commits and `verifyExecutionAttestation` recomputes,
  so the absence of simulation is represented semantically in the consumed
  artifact, never as a side annotation. `buildEvidenceReceipt` requires a
  genuine simulation pin (`{blockNumber, blockHash}`) and throws without one
  (remediation A+2).

---

## 5. Intent → Authorization → Execution Binding

The adapter consumes **frozen PRE records** (never caller claims) as the
binding target set: `intentRef · manifestId · bindingRef · executionScope ·
decisionRef`. Binding checks are typed and individually reported:

### 5.1 B-EXEC-1 — chain pin
`evidence.chainId == intent.chainId == executionScope.chainId == decision.chainId`.
Mismatch ⇒ `NOT_PROVEN / CHAIN_MISMATCH`.

### 5.2 B-EXEC-2 — target/selector pin
When evidence permits: `tx.to == intent.target` and
`selector(tx.input) == intent.selector`. Both must be admissible; if a term
cannot be compared (e.g. input data absent), the check is `NOT_RUN`, not a pass.

### 5.3 B-EXEC-3 — value/asset pin
Compared **only** when a defined predicate maps amount/asset to an
on-chain-observable field (e.g. `value`); otherwise `NOT_RUN`. Never invent an
equivalence between `amount` and raw `value` without a policy-defined rule.

### 5.4 B-EXEC-4 — caller / attribution (strict)
- EOA path: `tx.from == signerBinding.address` is REQUIRED admissible evidence
  for `EXECUTED_BY_AUTHORIZER`. Missing sender/from ⇒ `NOT_RUN`.
- **Meta-transaction/relayer shape:** `tx.from != signerBinding.address` is
  **not** automatic failure AND is **not** an inference that "the authorizer
  executed". The check yields `NOT_PROVEN / CALLER_NOT_BOUND` unless a
  separately approved attribution mechanism exists. CoreGuard never fabricates
  a caller.
- `CONTRACT_EXECUTION_BINDING` (B-1) semantics are preserved: authorization ≠
  execution proof; EIP-1271 magic is never executor proof.

### 5.5 B-EXEC-5 — decision reference
`decisionRef` referenced by the attestation must recompute from the frozen
record; a caller-supplied mismatched ref ⇒ `INVALID`.

Every binding check contributes to the verification result; the strongest
state is `VERIFIED` only when **all required** checks PASS and no check FAILs
(`verification-levels.md` rules apply; required-profile defined per claimed
level, single source of truth in code at implementation).

---

## 6. Provider / Historical-State Requirements

- The adapter accepts an **injected provider** (read-only client) — it never
  owns transport, mirrors the Phase-D/B-1 injection boundary. No static
  imports of any RPC library in the zero-dep core.
- **Pinned historical state only**: every read occurs at an explicit
  `{blockNumber, blockHash}`. **No `latest` fallback** anywhere. Unavailable
  historical state ⇒ `NOT_RUN / STATE_UNAVAILABLE`.
- Provider/adapter missing ⇒ `NOT_RUN` for every dependent check — never an
  implicit pass.
- Trace-capable providers are detected and used **only** for the optional
  `TRACE` item; absence ⇒ `TRACE_UNAVAILABLE`.
- **Simulation semantics:** WS-4 executes NO simulation. Because the legacy
  receipt consumer (`verifyStatePinning()` in `packages/verifier`) treats the
  mere presence of `simulation.blockNumber/blockHash` as satisfied
  `STATE_PINNING` and never reads receipt annotations, WS-4 does NOT emit a
  legacy CGEP/1 receipt at all when no simulation was performed: its attestation
  carries `receiptId: null`, and the absence of simulation is represented
  semantically in the consumed artifact as `{ check: "SIMULATION", result:
  "NOT_RUN", label: "SIMULATION_NOT_PERFORMED" }` inside `verification.checks`,
  which the attestation commits (`attestationRef`) and
  `verifyExecutionAttestation` recomputes (T-W4-5). A legacy receipt is emitted
  ONLY via `buildEvidenceReceipt({ simulation: <genuine pin> })` — it requires
  real simulation evidence and throws otherwise (remediation A+2). A real
  simulation in a future workstream must carry its own distinct pin, per
  `execution-receipt.md` §5 state pinning.

---

## 7. Firewall PRE/POST Integration Boundary

```
PRE (decision-time, frozen, deterministic — Q-FW5/Q-FW7 unchanged)
 ├── intent
 ├── authorization (signerBinding; recomputed probe)
 ├── policy
 ├── authority
 ├── simulation
 └── ALLOW / DENY / REQUIRE_REVIEW
            │
            ▼
         EXECUTE
            │
            ▼
POST (WS-4, evidence-time — never feeds the PRE decision)
 ├── execution evidence (adapter, §3/§4)
 ├── attribution (B-EXEC-4)
 ├── binding (B-EXEC-1..3, B-EXEC-5)
 └── conformance annotation (CGEP/1:FW-CONFORMANCE record; decision NEVER mutated)
```

- **Seam (Q-FW10, held):** no POST evidence, verification result, or
  `executionRef` may be consumed by `POLICY/PROBE/BINDING/SIM` at decision
  time. WS-4 accepts a frozen PRE `decisionRef` as an input and writes a
  **separate** conformance/attestation record.
- **Non-mutation:** `DENY` stays `DENY` (Q-FW6); a POST observation cannot
  reclassify it.
- **ALLOW stays deterministic** per Q-FW5:
  `ALLOW ⇔ POLICY_SATISFIED ∧ AUTHORITY_PROBE_OK ∧ DECLARATION_BOUND ∧ SIMCONSISTENT ∧ ¬REVIEW_OBLIGATION`. WS-4 adds nothing to this predicate.
- `packages/firewall/*` remains frozen; WS-4 consumes its public seams only.
  Any integration needing an internal change requires a separate remediation GO.

---

## 8. Failure States & Fail-Closed Semantics

Unified verdict/status vocabulary (reusing `verification-levels.md` + WS-1 +
B-1 conventions):

| State | Meaning | Trigger |
|---|---|---|
| `VERIFIED` | execution conforms to intent/authorization at the claimed level | all required evidence/checks PASS, no FAIL |
| `INVALID` | contradiction | any admitted evidence fails recompute/equality, or required check FAILs |
| `INCONCLUSIVE` | partial disclosure only (L3; post-WS-4) | reserved; no runtime path here |
| `UNVERIFIED` | missing required evidence | any required evidence never ran / errored / absent |
| `NOT_PROVEN` | explicit binding/attribution failure | CHAIN/TARGET/CALLER/DECISION mismatch (§5) |
| `NOT_RUN` | capability or provider gap | missing provider/state/adapter/evidence item |
| `TRACE_UNAVAILABLE` | no internal trace, and none synthesized | provider lacks trace capability |

Rules (hard):
- Missing ANY required evidence ⇒ `UNVERIFIED` — never `VERIFIED`.
- ANY FAILing check ⇒ `INVALID` (dominates).
- Receipt alone NEVER yields a caller / execution path: `TRACE_UNAVAILABLE` /
  `NOT_RUN`/`NOT_PROVEN` are truthful terminal-or-blocking states.
- Results for UI/API: only `VERIFIED / INVALID / INCONCLUSIVE` (no misleading
  scores); machine states above map to these at the boundary.

---

## 9. Privacy / On-Chain Commitment Boundary

- **On-chain: commitments only.** The attestation/anchor records a
  cryptographic commitment (hash / receipt reference), never raw evidence,
  never IP/device fingerprint/behavior profile, never private execution data
  (consistent with `execution-receipt.md` anchoring: `proofId`,
  `commitIntent`, `anchorProof`).
- **Off-chain/local: full evidence** (receipt, logs, normalized items).
- **Selective disclosure (future, L3):** Merkle evidence tree over
  `executionEvidenceRef` enabling partial proof — DESIGNED for but NOT
  implemented in WS-4 (clearly deferred).
- A WS-4 execution-attestation commitment is domain-separated from
  `CGEP/1:RECEIPT` / `CGEP/1:ANCHOR` / `CGEP/1:PROOF` and never claims to be
  the P0 anchor.

---

## 10. Threat Model + Attack Classes

Trust model (unchanged): Core consensus/crypto/EVMD determinism trusted;
engine/provider/storage/dashboard NOT trusted. WS-4 adds the evidence
extraction + attestation surface.

| ID | Attack | Adversary | Consequence | Mitigation |
|---|---|---|---|---|
| T-W4-1 | **Fake trace / hallucinated trace** — attacker supplies a synthetic conformance trace when the chain produces none | caller | false `VERIFIED`/conformance | trace is optional admissible evidence ONLY from a trace-capable provider; otherwise `TRACE_UNAVAILABLE`; claims never accepted (§3.2) |
| T-W4-2 | **Caller injection** — attacker claims `from`=authorizer for a relayer-submitted tx | caller | false attribution | B-EXEC-4: require admissible `tx.from`; relayer shape ⇒ `CALLER_NOT_BOUND`/`NOT_PROVEN`; never inferred |
| T-W4-3 | **Receipt-only path inference** — asserting an execution path from the receipt alone | caller/verifier user | overstated verdict | no path inference; nested-call facts only from a real trace; otherwise `TRACE_UNAVAILABLE` |
| T-W4-4 | **Cross-chain replay** — execution evidence from chain X bound to intent/attestation for chain Y | caller | cross-chain `VERIFIED` | B-EXEC-1 chain pin + EIP-712 domain chainId + record chainId equality |
| T-W4-5 | **Block-time shift** — evidence pinned at a wrong/latest block | provider compromise / caller | state mismatch | pinned `{number, hash}` enforced; no `latest` fallback (§6); simulation vs execution state kept distinct |
| T-W4-6 | **Evidence tamper** — evidence object altered after commitment | intermediate | diverged recompute | `executionEvidenceRef` recompute ⇒ `INVALID` |
| T-W4-7 | **Attestation forgery / replay** — re-issuing an old attestation over new evidence | caller | stale/misbound attestation | attestation binds intentRef/manifestId/bindingRef/evidenceRef; recompute-equality on every leg; timestamps from engine, not caller |
| T-W4-8 | **PRE/POST cross-contamination** — execution evidence injected into a PRE decision | caller/engine bug | non-deterministic ALLOW | Q-FW10 seam + content-addressed records; fail-closed set unchanged; tests assert no execution token in PRE records |
| T-W4-9 | **Decision-ref substitution** — attestation pins to an unauthorized/different frozen decision | caller | wrong provenance claim | B-EXEC-5 recompute of `decisionRef`; mismatch ⇒ `INVALID` |
| T-W4-10 | **P-256 substitution / fake EIP-712** — swapping real secp/Keccak for cheaper crypto | impl | broken signatures | EVM crypto isolated behind existing adapter; no P-256 substitution; EIP-712 real (AD-2026-09-13) |
| T-W4-11 | **Privacy leak** — raw evidence pushed on-chain | impl/design drift | exposure of private data | §9 boundary: commitments only; evidence off-chain; enforcement test scans anchored records |

---

## 11. Security Invariants

| ID | Invariant | Must hold |
|---|---|---|
| IN-W4-1 | recompute closure | every digest (§4/§5) recomputes identically from the same trusted inputs |
| IN-W4-2 | no-fabrication | the adapter emits `TRACE_UNAVAILABLE`/`NOT_RUN` in every case where the truth is absent — never a synthesized trace or caller |
| IN-W4-3 | no-latest | no read or check ever uses un-pinned `latest` state |
| IN-W4-4 | seam non-leak | no POST execution token/verdict appears inside any PRE record (deep-scan) |
| IN-W4-5 | decision immutability | `decisionRef` content-addressed and never reclassified by POST observations |
| IN-W4-6 | authorization≠execution | magic/authorization result alone never produces `VERIFIED` execution binding |
| IN-W4-7 | fail-closed | any `NOT_RUN`/`UNVERIFIED` in the required set ⇒ blocking/`UNVERIFIED`, never implicit `VERIFIED` |
| IN-W4-8 | commitment-only | anchored/attested on-chain values are commitments/references only (no raw evidence, no personal data) |
| IN-W4-9 | determinism | identical trusted evidence ⇒ identical `executionEvidenceRef` and attestation commitment |

---

## 12. Q-Review Questions (individually approvable)

| ID | Question | Draft ruling |
|---|---|---|
| Q-WS4-1 | Does WS-4 build a new on-chain anchor/contract for attestation commitments? | **NO** — off-chain commitment + receipt/reference semantics; contract only behind separate GO |
| Q-WS4-2 | Is internal trace ever admitted from a non-trace-capable provider? | **NO** — `TRACE_UNAVAILABLE` (T-W4-1) |
| Q-WS4-3 | May `tx.from` alone ever prove the *semantic* caller? | **NO** — B-EXEC-4; relayer shape ⇒ `CALLER_NOT_BOUND` unless separately approved attribute mechanism |
| Q-WS4-4 | Does the ALLOW predicate change? | **NO** — Q-FW5/Q-FW7 unchanged; WS-4 is POST-only (§7) |
| Q-WS4-5 | May WS-4 edit `packages/firewall/*`? | **NO** — frozen; consume seams only; internal change = separate remediation GO |
| Q-WS4-6 | Is `VERIFIED` claimable without a receipt (receipt-level evidence)? | **NO** — per-level required profiles; lower evidence ⇒ lower/`UNVERIFIED` claim, never invented |
| Q-WS4-7 | Does WS-4 store raw evidence on-chain? | **NO** — commitments only (§9; T-W4-11) |
| Q-WS4-8 | Historical state unavailable — fallback to `latest`? | **NO** — `NOT_RUN` (IN-W4-3) |
| Q-WS4-9 | Does WS-4 introduce new crypto / P-256 substitution? | **NO** — real secp256k1+Keccak behind existing EVM adapter (T-W4-10) |
| Q-WS4-10 | Does WS-4 include L3 selective disclosure implementation? | **NO** — designed floor only; implementation deferred |
| Q-WS4-11 | Does WS-4 touch Verifier C, B-2 registry, SDK/API/DApp? | **NO** — each is out of scope (independent future workstreams) |
| Q-WS4-12 | Does WS-4 modify v0.2.x / frozen evidence / `run-tests.mjs` suites? | **NO** — additive new paths only; suite additions are a release-边界 decision when they land |
| Q-WS4-13 | Is the verification result a score? | **NO** — enumerated states only; UI/API present `VERIFIED/INVALID/INCONCLUSIVE` |

---

## 13. Gates

```
WS-4 SPECIFICATION        (this document, v0.1.0-design)     ── DRAFT (current)
    ↓
Q-REVIEW  (Q-WS4-1..13; threat model; invariants)             ── PENDING
    ↓
GO / NO-GO               (owner decision; NO-GO stops)       ── PENDING
    ↓
IMPLEMENTATION           (additive only; new paths)          ── BLOCKED
    ↓
Security + mutation gates (Attack Lab style, if approved)
    ↓
Clean-clone verification (npm ci · npm test · benchmark · WASM · SDK import · frozen hash)
    ↓
Release decision          (v0.x, owner; no automatic tag)
```

Hard constraints at every gate:
- **No implementation before GO.** This document is docs-only until then.
- **No edits to `packages/firewall/*`, frozen evidence, P0/P1, v0.2.x trees.**
- Any finding follows a reproduction-first remediation protocol (WS-1 §8
  pattern); it is never a silent patch inside ratification.

---

**End of v0.1.0-design. Docs-only. Q-REVIEW PENDING; GO/NO-GO PENDING; IMPLEMENTATION BLOCKED.**