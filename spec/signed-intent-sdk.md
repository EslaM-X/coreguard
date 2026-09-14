# Signed Intent SDK / Integration Surface — WS-2 Design

**Version**: 0.1.0-design · **Status**: DESIGN LOCKED (2026-09-14: Q1–Q5 ruled; Q-SDK1..10 approved) · **SECURITY REVIEW CONDITIONAL PASS** — 9/10 Q-W2 APPROVED; Q-W2-3 required clarification applied (relayer never authorizes; EIP-1271 `from` is eth_call call context that MAY affect the probe result as probe semantics) · **FINAL SECURITY REVIEW PASS (2026-09-14)** — FSR-1 CLOSED (frozen decision record `record.binding.executionScope`, `decisionRef = H("CGEP/1:FW-DECISION", record)`) · FSR-2 CLOSED (`bindingRef` reference mismatch ⇒ deterministic `NOT_PROVEN` / label `BINDING_REFERENCE_MISMATCH`) · **GO / NO-GO — OWNER GO GRANTED (2026-09-14)** — construction open within the locked design only; does NOT imply commit/tag/release · IMPLEMENTATION **COMPLETE** · **IMPLEMENTATION REVIEW PASS · RELEASE BOUNDARY REVIEW PASS (2026-09-14)** — 454/454 regression (434 baseline + 20 WS-2), 73/73 benchmark, `git diff --check` clean, frozen integrity MATCH, `packages/firewall/*` = 0 changes · **CLOSED — FROZEN WITHOUT COMMIT/TAG (OWNER DECISION 2026-09-14)**
**Parent**: CGEP/1:AGENT-PROVENANCE · **Predecessor**: WS-1 (spec/signed-intent-authorization.md, IMPLEMENTED · REVIEWED · RELEASE-BOUNDARY PASS · FROZEN WITHOUT TAG)
**Boundary**: additive, docs-only. Exposes the WS-1 recomputable binding contract (§4.3) as a consumer surface. Does NOT redefine Phase D semantics. No code before GO.
**Date**: 2026-09-14

---

## 0. Canon and Ground Rules (fixed before review)

1. **WS-2 is a consumer surface, NOT a new source of truth.** It exposes and
   re-derives the WS-1 binding chain (intentRef → manifestId → bindingRef →
   executionScope → authority probe) for consumers. It never ratifies a
   caller-supplied authorization claim, and it never decides. The decision
   remains the Firewall's (`decideFirewall`); WS-2 integrates only through
   `authorizeForDecision`'s validated `{ intent, declaration }` pair.
2. **no code before GO.** DESIGN → SECURITY REVIEW → FINAL SECURITY REVIEW →
   GO / NO-GO → IMPLEMENTATION (§7).
3. **Additive only.** No edits to `packages/firewall/*` or frozen artifacts
   without a separately approved remediation. New code (post-GO) lives only
   under new WS-2 paths.
4. **Never trust a caller-supplied authorization claim.** No `bindingRef`, no
   `executionScope`, no boolean `authorized`, no recovered-signer / magic
   output is ever honored as-is; the full recompute pipeline in §4.0 runs
   every time (§4.1).
5. **AUTHORIZATION ≠ EXECUTION CONFORMANCE.** WS-2 binding is pre-execution;
   Q-FW10 stays the post-execution seam. No SDK binding call accepts
   `executionRef` / `txHash` / `receipt` / `CONTRACT_EXECUTION_BINDING` as
   input to any pre-execution path.
6. **relayer ≠ authorizer; EIP-1271 `from` is call context.** `from` / relayer
   never grants authorization by identity; the authorizer is
   `signerBinding.address` (Q-DP10/Q-SIA8). For EIP-1271, `from` MAY be
   supplied as explicit `eth_call` caller context and MAY affect the contract's
   returned probe result — that effect is EIP-1271 **probe semantics**, NOT
   relayer authorization.

---

## 1. Scope & Non-Goals

### 1.1 Owner scope rulings (locked, 2026-09-14)

| Ruling | Decision | Rationale |
|---|---|---|
| Q1 | **Library SDK only** (`@coreguard/sdk`) | Do not extend WS-2 into the CLI; `packages/cli` remains a future consumer |
| Q2 | **Python / Rust OUT** | WS-2 fixes the TypeScript/JS surface first; Rust verifier stays a separate future workstream; Python not needed now |
| Q3 | **No DApp** | DApp/renderer is a Phase E dependency, not an SDK contract |
| Q4 | **No `decideFirewall` wrapper** | SDK builds/verifies the authorization binding only; the decision stays the Firewall's; integration is via `authorizeForDecision` |
| Q5 | **ESM + runtime contract from actual metadata** | Exact Node minimum is resolved from the repository metadata actually present (`package.json`), never invented; zero-dep core boundaries are not erased or hidden behind a new dependency |

### 1.2 Scope (in)

- A new, additive library surface (`packages/sdk`) exposing:
  - `verifyBinding*` entrypoints that **independently recompute** the whole
    binding chain (§4.0 pipeline) — the recomputation contract of WS-1 §4.3.
  - Authorization-building/checking that reuses the WS-1 cores
    (`packages/intent/authorization.js`, `packages/provenance/authorization-probe.js`).
  - `executionScope` access that reads **only from the frozen record**.
  - Fail-closed defaults consistent with WS-1 (NOT_RUN / NOT_PROVEN / OK).
- WS-2 tests (additive, new paths only).
- A runbook/README documenting the consumer contract (§4.3) and the red line
  (§4.0), so an integrator cannot "opt out" of recomputation.

### 1.3 Non-Goals (out)

- **NO** changes to `packages/firewall/*`; no redefinition of Phase D
  decision, review, resolution, or conformance semantics.
- **NO** `decideFirewall` wrapper / re-export as a decision API (Q4).
- **NO** CLI extension, **NO** DApp surface (Q1, Q3).
- **NO** Python / Rust bindings (Q2).
- **NO** B-2: no registry, no nonce-burning store, no on-chain approval or
  revocation.
- **NO** on-chain changes of any kind.
- **NO** new cryptographic primitives.
- **NO** new verdict vocabulary (no new VERIFIED/ALLOW-like meaning; reuse
  existing status/label semantics).
- **NO** crossing the Q-FW10 seam in any SDK path.

---

## 2. Current-State Inventory

### 2.1 Repository runtime facts (for Q5)

- Root `package.json`: `"type": "module"`, `"engines": { "node": ">=18" }`.
  This is the repository-declared minimum — **WS-2 targets ESM on `node >=18`
  as declared; no stricter or invented minimum.**
- Workspace packages (`packages/*`): each `"type": "module"`, `"main":
  "index.js"`, no per-package `engines`; they inherit the root contract.
- No Python/Rust toolchain or bindings exist in the repo today.

### 2.2 Existing surfaces relevant to WS-2

- **WS-1 cores (new, additive, implemented):**
  - `packages/intent/authorization.js` — `buildAuthorization` (independent
    recompute → OK/BOUND | NOT_PROVEN/DECLARATION_NOT_BOUND | NOT_RUN),
    `authorizeForDecision` (binding ∧ probe gate; `decisionInputs: {intent,
    declaration}` only on OK; `null` on any failure), `computeIntentRef`,
    `computeManifestId`, `computeBindingRef`, `scopeOfIntent`.
  - `packages/provenance/authorization-probe.js` — `probeAuthorization`
    (EOA recover / EIP-1271 magic, injected adapters, NOT_RUN semantics).
- **Firewall (SUT, read-only for WS-2):** `decideFirewall` (decision owner;
  fail-closed closed critical set), `binding.js`, `authority.js`,
  `conformance.js` (FW-CONFORMANCE, post-execution).
- **Sole consumer surface today:** `packages/cli/src/index.js` — a CLI, out of
  WS-2 scope but a future consumer (Q1).
- **Canonical/primitives (zero-dep):** `packages/canonical/index.js`
  (`canonicalize`, `domainHash`, `hashIntent`), `packages/evm` (injected
  adapter boundary — dependency gate `docs/dependency-gate.md`).

### 2.3 Inherited constraints (from WS-1, all binding)

- WS-1 §4.3 contract (verifyBinding* / re-derivation; no caller-supplied
  `bindingRef` as trusted; scope from frozen record; no Q-FW10 crossing).
- WS-1 Q-DP8 (SDK reads scope only from the frozen record, never adds scope
  fields without a design change), Q-DP10/Q-SIA8 (relayer never authorizes),
  Q-DP11 (authorization ≠ execution proof).
- WS-1 SIA-I1..I10 oracles (recompute closure, binding-completeness,
  authorization-scope, signer-mandate, chain/scope separation, seam
  integrity, determinism, fail-closed, non-widening).

---

## 3. Security Decision Points (Q-SDK1..10 — owner-approved)

Each point states the decision to be ruled on. All ten were **approved by the
owner at the framework gate (2026-09-14)**, with Q-SDK9 and Q-SDK10 wording as
edited by the owner.

- **Q-SDK1 — surface identity.** The surface is a new additive package
  `@coreguard/sdk` (library only, Q1) that consumes the WS-1 cores and never
  introduces new decision vocabulary. Draft ruling: **approved — library
  consumer surface; reuses `packages/intent/authorization.js` and
  `packages/provenance/authorization-probe.js`; no new verdict meaning.**
- **Q-SDK2 — `verifyBinding*` recompute contract.** Every binding-related
  output of every SDK call is independently recomputed from trusted inputs
  (`intent`, `declaration`); opaque/trusted tokens never exist. Draft ruling:
  **approved — the §4.0 pipeline is the only way an output is produced.**
- **Q-SDK3 — caller-supplied `bindingRef` / boolean.** A consumer may pass a
  `bindingRef` or `authorized` value **as reference only**; the SDK recomputes
  the chain and never returns/ratifies the caller value. Draft ruling:
  **approved — reference-only inputs are explicitly rejected when a mismatch
  would silently change meaning; the returned result is always the derived
  one.**
- **Q-SDK4 — scope source.** `executionScope` for downstream logic is read
  from the frozen record, never from an intent-shaped object the consumer
  passes separately. Draft ruling: **approved — WS-1 Q-DP8 enforced; a
  separately-supplied scope is not a recognized input.**
- **Q-SDK5 — seam integrity.** No SDK path accepts execution evidence
  (`executionRef`, `txHash`, `receipt`, `CONTRACT_EXECUTION_BINDING`) into a
  pre-execution binding call. Draft ruling: **approved — typed shape
  rejection (A6/A12 pattern); Q-FW10 stays post-execution.**
- **Q-SDK6 — authority via injected adapters.** EOA recovery and EIP-1271
  magic run only through injected adapters/providers; NOT_RUN is preserved;
  no `latest` fallback. Draft ruling: **approved — mirrors WS-1/Phase D
  semantics unchanged.**
- **Q-SDK7 — relayer/from never authorizes.** `from` / relayer never grants
  authorization by identity; the authorizer is `signerBinding.address`. For
  EIP-1271, `from` MAY be supplied as explicit `eth_call` caller context and
  MAY affect the contract's returned probe result — that effect is EIP-1271
  probe semantics, never relayer authorization. Draft ruling: **approved —
  Q-DP10/Q-SIA8; probe-semantic effects of `from` never redefine
  `signerBinding.address` or the authorization identity.**
- **Q-SDK8 — not a source of truth.** WS-2 only builds/verifies the binding;
  it never overrides or replaces `decideFirewall`. Draft ruling: **approved —
  integration via `authorizeForDecision`-validated `{intent, declaration}`;
  the decision stays the Firewall's.**
- **Q-SDK9 (owner-edited) — Runtime/Module Contract.** A TypeScript/JavaScript
  ESM surface compatible with the runtime target actually installed in the
  repository; exact minimum Node version is settled from actual metadata
  (present: `engines.node >=18`, ESM), not by a new assumption; zero-dependency
  core boundaries are not erased and are not hidden behind a new dependency.
  Draft ruling: **approved.**
- **Q-SDK10 (owner-edited) — scope.** `@coreguard/sdk` library only in WS-2;
  no CLI extension; no DApp surface. Draft ruling: **approved.**

---

## 4. Integration Boundary

### 4.0 RED LINE — the verifyBinding* pipeline (owner-set)

`verifyBinding*` is **NOT** an API that takes
`{ bindingRef, executionScope, authorized=true, from, relayer }` and ratifies
them. The only acceptable shape:

```
input record                (canonical intent + signed declaration, supplied inputs —
        untrusted until recomputed and validated)
   ↓
recompute intentRef         H("CGEP/1:INTENT", canonicalize(intent))
   ↓
recompute manifestId        H("CGEP/1:AGENT-PROVENANCE", declarationCore(declaration))
   ↓
recompute bindingRef        H("CGEP/1:FW-BINDING", {intentRef, manifestId, signature})
   ↓
derive executionScope       from the frozen record (never a caller-supplied scope)
   ↓
verify authority            where applicable (EOA recover / EIP-1271 magic, injected)
   ↓
return independently derived result
```

Hard rules:
- `from` / relayer **never** becomes an authorizer.
- A caller-supplied `bindingRef`, `executionScope`, or `authorized` boolean is
  a **reference/debris to detect**, never something to return or trust.
- Q-FW10 is the **POST-execution seam**: the SDK binding never pulls
  `executionRef` or `CONTRACT_EXECUTION_BINDING` into a PRE authorization.
- **`executionScope` source is pinned (FSR-1).** It MUST be derived from the
  authoritative frozen **decision record** — the content-addressed record
  whose `decisionRef = H("CGEP/1:FW-DECISION", record)` carries the
  `binding.executionScope` field (derived at decision time from `scopeOfIntent(intent)`,
  byte-identical per WS-1 SIA-I3). A separately supplied intent-shaped object
  or scope object is **never** authoritative.
- **`bindingRef` reference mismatch is deterministic (FSR-2).** A
  caller-supplied `bindingRef`, if provided, is comparison/reference metadata
  only; it can never change the derived result. A mismatch ⇒ deterministic
  `NOT_PROVEN` with label `BINDING_REFERENCE_MISMATCH` (existing status
  vocabulary — a failure label, NOT a new verdict); never OK/BOUND, never
  forwarded. An absent reference performs no comparison; a matching reference
  changes nothing.

### 4.1 Must be recomputed from trusted inputs (never trusted from caller)

| Value | Derived from | Trusted source |
|---|---|---|
| `intentRef` | `H(CGEP/1:INTENT, canonicalize(intent))` | recompute over the canonical intent |
| `manifestId` | `H(CGEP/1:AGENT-PROVENANCE, declarationCore(declaration))` | recompute; declared `manifestId` is only a claimed equality target |
| `bindingRef` | `H(CGEP/1:FW-BINDING, {intentRef, manifestId, signature})` | recompute from the recomputed refs + envelope |
| `executionScope` | the `binding.executionScope` field of the authoritative **frozen decision record** (`decisionRef = H("CGEP/1:FW-DECISION", record)`) — derived at decision time from `scopeOfIntent(intent)`, byte-identical per WS-1 SIA-I3 | the frozen decision record, never a separately supplied intent-shaped or scope object (FSR-1) |
| recovered signer / magic | EIP-712 `recover` (EOA) / `ethCall` magic at `authorityAtState` (1271) | injected adapters only |

### 4.2 Remains caller-supplied and is never a verdict

- `declaration.signature` bytes — always re-validated (envelope + recovery/call).
- `authorityAtState` — labeled input; absence/failure ⇒ `NOT_RUN`/`NOT_PROVEN`.
- Any boolean "authorization ok", pre-shared `executionScope`, `from`, `relayer`
  — **never honored** (§4.0 red line).
- A caller-supplied `bindingRef` is **comparison/reference metadata only**
  (FSR-2): it can never change the derived result; a mismatch ⇒ deterministic
  `NOT_PROVEN` (label `BINDING_REFERENCE_MISMATCH`) — never OK/BOUND, never
  forwarded; an absent reference performs no comparison.

### 4.3 SDK output contract (fulfils WS-1 §4.3)

1. Every binding-related output of an SDK call is recomputable (`verifyBinding*`
   or re-derivation) — no opaque token the consumer must trust.
2. The SDK never returns a caller-supplied `bindingRef` as a trusted value; a
   consumer-provided ref is a derivation/reference value only, and the SDK
   still recomputes. If supplied, a mismatch with the recomputed `bindingRef`
   ⇒ deterministic `NOT_PROVEN` (label `BINDING_REFERENCE_MISMATCH`); it never
   produces an OK/BOUND result (FSR-2).
3. `executionScope` for downstream logic comes from the frozen record, never
   from an intent-shaped object passed separately.
4. No SDK path crosses the Q-FW10 seam.

---

## 5. Threat Model + Q Questions (individually approvable)

Rule for approval: each **Q-W2** is approved or rejected as its own unit at the
SECURITY REVIEW gate; rejecting one does not block the others.

| ID | Question | Draft ruling (owner may replace) |
|---|---|---|
| Q-W2-1 | Can a caller supply a `bindingRef` and have it treated as trusted? | NO — comparison/reference metadata only; full §4.0 recompute always; a supplied ref can never change the derived result, and a mismatch ⇒ deterministic `NOT_PROVEN` (label `BINDING_REFERENCE_MISMATCH`) — never OK/BOUND (WS-1 Q-SIA10; FSR-2) |
| Q-W2-2 | Can `verifyBinding*` accept `{executionScope, authorized=true}` and ratify them? | NO — the pipeline derives scope from the frozen record and never accepts an authorization verdict (red line §4.0) |
| Q-W2-3 | Can `from`/relayer grant authorization **by identity alone** through the SDK? | NO — relayer never grants authorization by identity; the authorizer is `signerBinding.address`. For EIP-1271, `from` MAY be supplied as explicit `eth_call` caller context and MAY affect the contract's returned probe result — that effect is EIP-1271 **probe semantics**, never relayer authorization (WS-1 Q-SIA8/Q-DP10) |
| Q-W2-4 | Can execution evidence (`executionRef`/`txHash`/`receipt`/`CONTRACT_EXECUTION_BINDING`) enter a pre-execution SDK binding? | NO — Q-FW10 seam; typed rejection (A6/A12 pattern) (WS-1 Q-SIA11) |
| Q-W2-5 | Can the SDK derive scope from a separately-passed intent-shaped object? | NO — frozen record only (Q-SDK4/WS-1 Q-DP8) |
| Q-W2-6 | Can the SDK wrap or replace `decideFirewall`? | NO — Q4/Q-SDK8/Q-SDK10; decision stays the Firewall's; integration via `authorizeForDecision` |
| Q-W2-7 | May the SDK hide zero-dep cores behind new dependencies (erasing boundaries)? | NO — Q-SDK9; static imports only from local zero-dep cores; dependency gate re-checked |
| Q-W2-8 | Is NOT_RUN preserved on missing adapters/providers/state, without `latest` fallback? | YES — Q-SDK6; fail-closed semantics unchanged from WS-1 |
| Q-W2-9 | Does the SDK introduce a new verdict vocabulary? | NO — Q-SDK1; reuses existing status/label semantics |
| Q-W2-10 | Is every SDK binding output deterministic and re-derivable (same inputs ⇒ same refs)? | YES — **APPROVED WITH CONDITION**: recompute closure holds for identical trusted inputs; determinism means *identical trusted inputs + identical pinned authority state/context ⇒ identical result*. For EIP-1271, provider/state/block/call-context are part of the probe semantics; the SDK does not promise a constant result across different blockchain states |

### Threat notation

- WS-2 adds no new attacker capability: its threat set is still bounded by
  *who can produce a valid authorization* (signer EOA key or EIP-1271
  contract). WS-2's specific risk surface is **consumer misuse**: a caller
  pattern that turns an acceptance of a *claim* into authority. Every
  Q-W2 row targets that surface; the §4.0 red line is the invariant that
  closes it.

---

## 6. Oracles / Invariants (for security review + Lab extension)

Global rule (unchanged): **unauthorized mutation → never ALLOW.**

| ID | Oracle / invariant | Must hold |
|---|---|---|
| W2-I1 | sdk-recompute closure | Given the inputs, every output ref/scope of every `verifyBinding*` call recomputes to the same value (deep re-derivation, never memoized-on-claim) |
| W2-I2 | red-line inversion | Feeding `{bindingRef, executionScope, authorized:true, from, relayer}` as *inputs to ratify* changes NOTHING the SDK returns (the caller-supplied values never appear as outputs) |
| W2-I3 | scope-from-record | `executionScope` returned/used is byte-identical to the frozen record's scope; a separately-passed scope is never accepted |
| W2-I4 | relayer-inert authorization | Mutating `from`/relayer MUST NOT cause the SDK to treat that address as the authorizer. For EIP-1271, `from` MAY affect the read-only contract probe as explicit caller context; such effects MUST be reported as probe semantics and MUST NOT redefine `signerBinding.address` or the authorization identity |
| W2-I5 | seam deep-scan | No pre-execution SDK binding result contains `executionRef`/`txHash`/`receipt`/`CONTRACT_EXECUTION_BINDING` or a conformance verdict (A6/A12 pattern) |
| W2-I6 | fail-closed | Missing/absent binding leg or authority input ⇒ `NOT_RUN`/`NOT_PROVEN`; never an implicit OK/ALLOW |
| W2-I7 | determinism | Identical trusted inputs **+ identical pinned authority state/context** ⇒ identical intentRef/manifestId/bindingRef/scope and status; EIP-1271 status reflects the probe at that pinned state/context (no promise across different blockchain states) |
| W2-I8 | non-widening | The SDK never widens an authorization set; re-signed identical intent stays the same semantic identity (WS-1 TL-1), different bytes stay a detectable instance change |
| W2-I9 | boundary-conserved | No SDK import/export erases a zero-dep boundary; dependency gate checks stay green |
| W2-I10 | reference-mismatch determinism | If a caller-supplied `bindingRef` mismatches the recomputed value, the SDK outcome is deterministically `NOT_PROVEN` (label `BINDING_REFERENCE_MISMATCH`) — never OK/BOUND; an absent reference performs no comparison (FSR-2) |

---

## 7. Gates

```
DESIGN              (this document, v0.1.0-design; framework Q1–Q5 + Q-SDK1..10
                     ruled by owner)                                ── LOCKED
    ↓
SECURITY REVIEW     (Q-W2-1..10: 9 APPROVED; Q-W2-3 required clarification
                     applied — relayer ≠ authorizer vs EIP-1271 `from` call
                     context)                                       ── CONDITIONAL PASS
    ↓
FINAL SECURITY REVIEW (FSR-1/FSR-2 CLOSED; re-checked as one block)    ── PASS
    ↓
GO / NO-GO          (OWNER GO GRANTED — 2026-09-14; construction open
                     within the locked design only; no commit/tag/
                     release implied)                                 ── GO
    ↓
IMPLEMENTATION      (additive only; new files/paths; §8 applies)     ── COMPLETE
    ↓
IMPLEMENTATION REVIEW   (red line/RST/SDK oracles; full chain re-derived) ─── PASS
    ↓
RELEASE BOUNDARY REVIEW (additive only; firewall/frozen untouched)   ── PASS
    ↓
CLOSURE             (OWNER DECISION — 2026-09-14; frozen without commit/
                     tag; release and commit remain separate owner
                     decisions)                                      ── CLOSED
```

Two hard constraints at every gate:
- **No implementation before GO** (this spec remains docs-only until then).
- **No edits to `packages/firewall/*` or frozen artifacts** unless a §8
  remediation is separately approved.

Any finding the design review produces follows §8; it is never a silent patch
inside this document's ratification.

---

## 8. Remediation Protocol

Applies to ANY security finding, in review or later in the field (mirrors
WS-1 §8):

1. **Deterministic reproduction** — a minimal, repeatable reproduction (test or
   harness row) confirmed first; a finding is not a finding without it.
2. **Owner decision** — yes/no/when, chosen explicitly.
3. **Atomic remediation** — one logical change, additive where possible;
   includes the reproduction as a permanent regression test.
4. **Full regression** — `npm test`, benchmark at the frozen baseline,
   `git diff --check`; frozen `verify-live.json`/P0/P1 unchanged by hash.
5. **Re-verify** the affected gates; an approved remediation does NOT reopen a
   CLOSED / PASS boundary of prior phases — it is recorded as its own unit.

---

## 9. Delivery expectations (post-GO only; not now)

- New package `@coreguard/sdk`, ESM, within the repo's declared runtime
  contract (`type: module`, `engines.node >=18` from actual metadata).
- Reuses the WS-1 cores; static imports only local zero-dep; no new runtime
  dependencies.
- Tests additive under new WS-2 paths; full `npm test`, benchmark at frozen
  baseline, `git diff --check`, frozen-artifact hash checks.
- CLI integration and DApp surface remain future, separately gated work (Q1/Q3).

---

## The Full Chain (WS-2 scope, AUTHORIZATION side — consumer view)

```
              ┌─────────────────────────────────────────────────┐
consumer ────▶│ @coreguard/sdk verifyBinding*                   │
inputs:       │   input record                                   │
 {intent,     │   → recompute intentRef   → recompute manifestId │
  declaration}│   → recompute bindingRef  → derive scope (frozen)│
              │   → verify authority       → derived result      │
              └───────────────┬─────────────────────────────────┘
                              ▼
          validated {intent, declaration}  (decisionInputs; never a verdict)
                              ▼
                    decideFirewall  (the DECISION owner; OUT of WS-2)
```

```
AUTHORIZATION (WS-1/WS-2: signed intent → binding → scope)
     ≠
EXECUTION CONFORMANCE (post-hoc FW-CONFORMANCE; OUT of WS-1 and WS-2)
```

---

**End of v0.1.0-design. Docs-only.**

**Gate record (2026-09-14):**
- DESIGN — framework approved by owner: Q1 (library only), Q2 (Python/Rust
  deferred), Q3 (no DApp), Q4 (no decideFirewall wrapper), Q5 (ESM/runtime from
  actual metadata: `engines.node >=18`, `type: module`) locked. Q-SDK1..10
  approved (Q-SDK9/Q-SDK10 with owner edits). Full draft written docs-only.
- SECURITY REVIEW — CONDITIONAL PASS (2026-09-14). Conducted as a real review:
  Q-W2-1..6, Q-W2-7, Q-W2-8, Q-W2-9 APPROVED; **Q-W2-3 APPROVED WITH REQUIRED
  CLARIFICATION** and **Q-W2-10 APPROVED WITH CONDITION**. Required
  clarification applied (docs-only): relayer ≠ authorizer (never by identity)
  vs EIP-1271 `from` = explicit `eth_call` caller context that MAY affect the
  probe result — that effect is EIP-1271 probe semantics, never relayer
  authorization. Aligned wording: §0 rule 6, Q-SDK7, W2-I4; W2-I7 pinned-state
  determinism condition added for Q-W2-10. Re-check of Q-W2-1..10 as ONE block
  precedes FINAL SECURITY REVIEW.
- FINAL SECURITY REVIEW — PASS (2026-09-14). Re-checked as ONE full block.
**FSR-1 CLOSED:** `executionScope` source pinned to the authoritative frozen
   **decision record** — `decisionRef = H("CGEP/1:FW-DECISION", record)`,
   authoritative field `record.binding.executionScope` (derived at decision time from
  `scopeOfIntent(intent)`, byte-identical per WS-1 SIA-I3). The three ambiguity
  paths are closed: no SDK-side derivation from intent, no internal/ad-hoc
  record as source, no caller-provided `executionScope` as authoritative; an
  intent-shaped/scope object is never the source of truth.
  **FSR-2 CLOSED:** caller-supplied `bindingRef` = comparison/reference
  metadata only; the SDK recomputes it; a mismatch ⇒ deterministic
  `NOT_PROVEN` (label `BINDING_REFERENCE_MISMATCH`, existing status
  vocabulary, failure label only) — never OK/BOUND, never forwarded; absence ⇒
  no comparison; a matching reference does not change the result.
  Whole-document consistency verified (§4.0/§4.1/§4.2/§4.3/Q-W2-1/W2-I10/§7/
  review history). Wording note applied: §4.0 entry inputs are "supplied
  inputs — untrusted until recomputed and validated", not "trusted inputs".
  No code; no `packages/firewall/*` change. **This PASS is a design
  ratification only** — owner GO/NO-GO remains the separate gate before any
  implementation; it does not delegate anything.
- GO / NO-GO — **OWNER GO GRANTED (2026-09-14)**. Scope opened by this GO:
  construct `@coreguard/sdk` (library consumer surface), independent
  re-derivation of intentRef → manifestId → bindingRef → executionScope
  (authoritative frozen decision record, FSR-1), authority probing via the
  specified injected adapters, NOT_RUN/NOT_PROVEN preservation, FSR-2
  reference-mismatch determinism, additive WS-2 tests, ESM/Node >=18,
  zero-dep boundaries preserved, WS-1 integration only as designed.
  Explicitly NOT opened: edits to `packages/firewall/*`, frozen Mainnet
  evidence, CLI, DApp, B-2/registry, on-chain changes, new crypto
  primitives, new verdict vocabulary, execution-conformance changes, any
  scope expansion beyond this spec. This GO does NOT authorize commit or
  tag or release; those remain a separate owner decision after
  Implementation Review + Release Boundary Review.
- IMPLEMENTATION — OPEN (2026-09-14, per GO). Additive new paths only;
  §8 applies to any finding.
- IMPLEMENTATION — COMPLETE (2026-09-14). `@coreguard/sdk` constructed
  (`packages/sdk`: `index.js`, `verify-binding.js`, `package.json`, `README.md`);
  WS-2 tests (`test/sdk`, 20 tests) covering W2-I1..I10; `scripts/run-tests.mjs`
  suite added (one additive line). 454/454 regression (434 baseline + 20 WS-2);
  73/73 benchmark; `git diff --check` clean; frozen `verify-live.json` hash
  `7424…F21DDC` MATCH; `packages/firewall/*` = 0 changes. No commit; no tag.
- IMPLEMENTATION REVIEW — PASS (2026-09-14). §4.0 red-line pipeline enforced:
  FSR-1 (authoritative scope = `record.binding.executionScope`, content-address
  `decisionRef = H("CGEP/1:FW-DECISION", record)` recomputed), FSR-2
  (reference mismatch ⇒ deterministic `NOT_PROVEN` / `BINDING_REFERENCE_MISMATCH`),
  Q-SDK5 seam (typed `TypeError` on execution evidence), Q-SDK7 (`from` = EIP-1271
  call-context only; relayer/claims never honored, never echoed W2-I2), no new
  verdict vocabulary, zero-dep boundaries preserved (Q-SDK9), no `decideFirewall`
  wrapper (Q4/Q-SDK8), fail-closed `NOT_RUN`/`NOT_PROVEN` (W2-I6), determinism
  within pinned state/context (W2-I7).
- RELEASE BOUNDARY REVIEW — PASS (2026-09-14). Additive new paths only
  (`packages/sdk` + `test/sdk` + one line in `scripts/run-tests.mjs`); 0 changes
  under `packages/firewall`, `canonical`, `evm`, `intent`, `provenance`; frozen
  artifacts unchanged; no lockfile change.
- CLOSURE — OWNER DECISION (2026-09-14). **WS-2 CLOSED · IMPLEMENTED ·
  REVIEWED · FROZEN WITHOUT COMMIT/TAG** (same philosophy as WS-1). No commit,
  no tag, no release, no on-chain transaction, no firewall/lockfile change, no
  feature addition — each remains a separate owner decision. Next step is a new
  workstream or an independent release decision, not further WS-2 edits.