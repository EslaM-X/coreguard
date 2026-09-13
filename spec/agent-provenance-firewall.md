# CGEP/1 Phase D — Execution Firewall (Design)

**Version**: 0.3.0-design (not implemented) · **Parent**: CGEP/1:AGENT-PROVENANCE · **Status**: DESIGN REVIEW COMPLETE — Q-FW1–Q-FW10 + amendments (1a/2a/3a/3b/3c/4a/6a/7a/8a/9a) ALL APPROVED → awaiting **FINAL DESIGN REVIEW → GO/NO-GO** (no code, no commit until GO)
**Rev 0.2 fixes**: pre-execution binding re-defined WITHOUT `executionRef` (an actual `executionRef` exists only post-execution); Q-FW10 splits B-1 authorization (decision-time input) from `CONTRACT_EXECUTION_BINDING` (post-execution verification evidence) so `ALLOW` is never gated on post-execution evidence (circular dependency removed); Q-FW5 adds an exact `ALLOW` decision predicate (`SIMCONSISTENT`) so "simulation consistent" is deterministic, not loose wording.
**Rev 0.3 additions**: Q-FW1a probe recomputation (never trust a probe flag) · Q-FW2a review-resolution is a new frozen record · Q-FW3a policy provenance/activation · Q-FW3b bound-context derivation · Q-FW3c Authority↔Policy scope OUT OF SCOPE · Q-FW6a content-derived `decisionRef` (canonical before hash) · Q-FW7a NOT_RUN reason recorded · Q-FW8a static-import boundary · Q-FW9a review-resolution writer authorization (CONTRADICTION_SCAN reuse).
**Method**: B-1 methodology — design only → Q decisions → threat model → vectors → red lines → GO/NO-GO → **only then** implementation (no code before GO).
**Review order (user-directed)**: Q-FW4 → Q-FW10 → Q-FW5 first; then Q-FW1–Q-FW3; then Q-FW6–Q-FW9; then FINAL DESIGN REVIEW → GO/NO-GO.
**Additive only**: no changes to v0.1.1 semantics, v0.2.0-released B-1 axes, P0/P1, `verify-live.json`, or anchored evidence. No on-chain contract/deployment in this phase (roadmap §D: "deferred design; no P2 contract").
**G-4 status (input)**: v0.2.0 release readiness PASS (2026-09-13, no tag) — the firewall is a **new** workstream after B-1; it does not repackage B-1.

---

## 1. Status / Version

| Item | Value |
|---|---|
| Spec version | v0.3.0-design (Q-FW1–Q-FW10 + amendments APPROVED; review complete) |
| Phase | D (roadmap Phase Map) — Execution Firewall design → impl (v0.2 boundary) |
| Blocking gates | Q-FW1…Q-FW10 approval → FINAL DESIGN REVIEW → **GO/NO-GO** |
| Code | **None yet — prohibition: no implementation before GO** |
| Depends on | Phase A (EOA provenance), Phase B-1 (EIP-1271 contract auth), existing `packages/intent` + `packages/policy` |
| Not required | B-2 Registry (still deferred) |

The firewall is positioned **after** AgentProof authority and **before** execution;
it is **not** a replacement for AgentProof and **not** a new verification axis.

## 2. Objective

Move CoreGuard from *"did this execution conform?"* to
*"should this execution be allowed to happen?"*, while keeping verification
honest:

- A **pre-execution enforcement layer** that turns verified authority
  (AgentProof) + committed policy + simulated expectation into a deterministic
  **ALLOW / DENY / REQUIRE_REVIEW** decision with a replayable decision record.
- A **post-execution conformance check** that observes what actually happened
  and compares against the declared intent / simulated expectation — and that
  can **never** upgrade a decision it already made.

The firewall is the enforcement counterpart to the verifier, not a substitute
for either.

## 3. Scope

**In scope (this phase):**
- Decision engine: deterministic `ALLOW / DENY / REQUIRE_REVIEW` from
  { authority status, policy evaluation, simulation summary, binding checks }.
- Decision record: self-describing, frozen at decision time, replayable.
- Policy commitment: `policyId`/hash binding; policy is evaluated against a
  committed hash, tamper-sensitive.
- Intent binding: intent → signed digest → policy → execution-ref chain
  (the "Signed Intent / Authorization Binding" gap closure).
- Cleartext hook contract for the Mutation / Attack Lab vectors (§11).
- Off-chain only: no P2 contract, no deployment surface added in this phase.

**Out of scope (this phase; stated again in §15):**
- Registry (B-2), prediction/market-making, behavioral human/AI inference,
  MEV-style mempool simulation parity, any on-chain enforcement inside the
  protocol engine, modifications to B-1 axes or frozen evidence.

## 4. Terminology

| Term | Meaning |
|---|---|
| **AUTHORITY** | Is the actor cryptographically authorized? (AgentProof: EOA recovery / EIP-1271) |
| **POLICY** | Is the operation permitted? (committed rule set, evaluated deterministically) |
| **SIMULATION** | What is expected to happen if this executes? (pre-execution, non-persistent) |
| **EXECUTION** | What actually happened on-chain (the tx and its observable evidence) |
| **PROVENANCE** | Who declared/signed this execution intent (manifest + signature envelope) |
| **VERIFICATION** | Did actual execution conform to what was declared/simulated? (post-hoc, `verifyProvenance`) |
| **DECISION** | Pre-execution firewall output: `ALLOW / DENY / REQUIRE_REVIEW` |
| **DECISION RECORD** | Frozen, replayable output (inputs, block ref, writer, decision) |
| **CONFORMANCE** | Post-factum agreement of observed execution with declared intent/simulation |
| **DECLARATION BINDING** | Decision-time closure of intent↔authority↔policy envelope (Q-FW4, `bindingRef`); **no `executionRef` needed** |
| **EXECUTION BINDING** | Post-execution independent attribution of the executing contract to the observed tx (B-1 `CONTRACT_EXECUTION_BINDING`); **never an `ALLOW` input** |

These six (AUTHORITY / POLICY / SIMULATION / EXECUTION / PROVENANCE /
VERIFICATION) are **never conflated**. Section 5 shows the seam lines.

## 5. Architecture

```
PRE-EXECUTION (decision stage):

   Intent (packages/intent, canonical) ──► intentRef
       │
       ▼
   Authorization Probe (decision-time, labeled atState: decisionBlock)
       EOA recovery replay of intent digest
       | EIP-1271 isValidSignature(intentDigest, bytes) @ decision state
       (NOT the B-1 verdict; no execution binding here — Q-FW10)
       │
       ▼
   Declaration Binding (Q-FW4): bindingRef = intentDigest ↔ manifestId ↔ sig
       chainId + nonce + executionScope (predicted envelope — no executionRef)
       │
       ▼
   Policy (packages/policy, committed policyId/hash) + rules
       │
       ▼
   Simulation (expected effects: recipient / amount / calldata / gas /
       deadline / slippage — model-only, non-persistent; SIMCONSISTENT)
       │
       ▼
   CoreGuard Firewall ──►  ALLOW | DENY | REQUIRE_REVIEW
       (frozen decision record — contains NO executionRef)
                                   │
POST-EXECUTION (verification stage)│
       Execution (broadcast only if decision ≠ DENY) ◄──┘
       │
       ▼
   executionRef now exists ──► B-1 axes @ execution block:
       CONTRACT_AUTHORIZATION + CONTRACT_EXECUTION_BINDING (Q-B1.3)
       │
       ▼
   Conformance / Verification (observed executionRef ↔ declared intent/
       executionScope ↔ simulated; annotates only — never re-decides, never
       flips a DENY)
```

**Seam lines (non-conflation, hard):**

1. **Authority ≠ decision.** The decision-time **authority probe** (EOA
   recovery ∥ EIP-1271 at `authorityAtState`) is an **input** to the firewall.
   The B-1 execution-block verdicts (`CONTRACT_AUTHORIZATION`,
   `CONTRACT_EXECUTION_BINDING`) are post-execution verification results, NOT
   decision inputs (Q-FW10). A probe `OK` raises "does policy permit it?"; it
   is not the answer.
2. **Simulation ≠ guarantee.** Simulated effects describe a model of the
   intended execution, not a promise of what the chain will do. Divergence is
   caught by post-execution conformance, never by "fixing" the simulation.
3. **Verification ≠ retroactive approval.** The firewall emits its decision
   before execution. Post-hoc verification confirms or rejects conformance of
   what *actually happened*; it has no authority to change a frozen decision.

## 6. Q-FW Decisions

**Status: Q-FW1–Q-FW10 + amendments = ALL APPROVED.**
(Q-FW1a · Q-FW2a · Q-FW3a/3b/3c · Q-FW4a · Q-FW6a · Q-FW7a · Q-FW8a ·
Q-FW9a) — Q-FW3c boundary stands: Authority↔Policy scope = OUT OF SCOPE
(no B-2 / registry introduced to close it).
Next: **FINAL DESIGN REVIEW → GO/NO-GO.**

### Q-FW1 — Firewall relationship to verification
**Approved.** The firewall is a **pre-execution decision layer** layered on top
of the AgentProof verifier inputs. It introduces a NEW vocabulary
(`ALLOW/DENY/REQUIRE_REVIEW` + decision record) that is **not** a verification
verdict and **not** a summary string. The verifier's output grammar is
unchanged.

### Q-FW1a — Probe result recomputation (never trust a probe flag)
**Approved.** The firewall **recomputes** the decision-time authority probe
from the `bindingRef`-bound inputs (intent digest, declared authority,
`authorityAtState`) through the injected adapter. It NEVER accepts an opaque
boolean probe result supplied by a caller — a compromised caller must not be
able to fabricate `AUTHORITY_PROBE_OK`. Same "recompute, don't trust a flag"
discipline as B-1 (digest recomputed offline, never taken from the manifest).

### Q-FW2 — Decision vocabulary (exact semantics)
**Approved.**
- `ALLOW` — policy satisfied, authority recognized, simulation consistent ⇒
  launchable. **Never** a prediction/guarantee that execution will conform.
- `DENY` — one or more pre-execution checks fail ⇒ not launchable.
- `REQUIRE_REVIEW` — unambiguous decision cannot be formed with the evidence
  available (typically: isolation required by policy); a review path must be
  configured, otherwise it collapses to `DENY`.
(three-state, no hidden states; `REQUIRE_REVIEW` pending ⇒ treated as `DENY`
for broadcast)

### Q-FW2a — Review resolution is a NEW decision record, never a mutation
**Approved.** Converting `REQUIRE_REVIEW → ALLOW` is permitted ONLY as a new,
fully-documented decision record (reason, decision, writer, inputs), never as a
mutation of the prior record. A review resolution cannot invent or override
authority/policy/simulation results (`ALLOW` still requires the §9 predicate).
The reverse direction is forbidden: a review must never convert `DENY → ALLOW`.

### Q-FW3 — Policy source & binding
**Approved.** Policies are committed objects
(`packages/policy.commitPolicy / hashPolicy`), identified by canonical hash.
Firewall evaluates **only** against the committed `policyId` supplied at
decision time; an un-committed or mismatched policy ⇒ `DENY`.
Policy updates are new committed versions, never in-place mutation.

### Q-FW3a — Policy commitment provenance + activation (anti rollback)
**Approved.** A `policyHash` is admissible ONLY when the commitment is:
(a) reachable from the firewall's configured trust anchor (attested/registered,
same trust pattern as `trustedAttestors` for ATTESTATION_RECOGNITION) or signed
by the policy owner; AND (b) **active at decision time** — no silent rollback:
re-using an older, not-`active` `policyId` for a new decision ⇒ `DENY`.

### Q-FW3b — Policy context derived from the bound intent only
**Approved.** The evaluation context for the policy is derived **exclusively**
from the `bindingRef`-bound intent plus the recorded simulation summary — never
from an independently-suppliable object. An unbound context (not tied to the
signed intent) ⇒ `DENY`.

### Q-FW3c — Authority ↔ Policy scope: explicitly OUT OF SCOPE this phase
**Approved (keep orthogonal).** *The Firewall does not establish
authority-to-policy-domain scope in this phase.* The firewall proves
decision-time authority for the digest and evaluates the policy against the
bound intent — but it does NOT claim that the authority is organizationally or
institutionally authorized for every domain a policy config touches. That
binding needs a later surface (B-2 registry / delegation), which is NOT
introduced now merely to close this design gap. This boundary is explicit, not
a hidden security guarantee.

### Q-FW4 — Pre-Execution Intent/Authorization Binding (temporal, NOT execution binding)

**Approved (rev 0.2):** the firewall's decision-time binding is a
**declaration binding** — it binds the *intent to be executed* to its declared
authority and policy envelope. It is NOT the execution binding, because at
decision time **no execution has happened and no `executionRef` exists**.

Pre-execution binding components (decision record, all available pre-broadcast):
- `intentRef` — canonical intent hash (`packages/intent`);
- `bindingRef` — self-consistent closure `intentDigest ↔ manifestId ↔ signature
  envelope` (the declared authority signed THIS intent, not a different one);
- `chainId` + `nonce` (replay separation);
- `executionScope` — the predicted envelope the decision is about: target chain,
  `validAfter`/`validUntil` block window, and the declared recipient/amount/
  calldata (NOT an actual tx reference).

`executionRef` (tx hash + observed block) is **post-execution only** — it is
produced by the broadcast and consumed by conformance verification. The
firewall MUST NOT require an actual `executionRef` to emit `ALLOW`; requiring it
would be a circular precondition (execution happens only after `ALLOW`). This is
the temporal seam fix.

The declaration binding guarantees that a later execution cannot **re-attribute
itself** to a different intent: conformance verification matches the observed
`executionRef` against the *same* declaration the firewall decided on. Any
mismatch ⇒ post-hoc `NOT_PROVEN`; the decision record (frozen) does not change.
**Approved.**

### Q-FW4a — Binding vocabulary (rev 0.2)
| Term | When | Role |
|---|---|---|
| `intentRef` / `bindingRef` | decision time (pre-execution) | what the decision is about; who declared/signed it |
| `executionScope` | decision time | expected envelope (chain, block window, recipient/amount/calldata) |
| `executionRef` | post-execution | observed tx reference for conformance |
| `CONTRACT_EXECUTION_BINDING` | post-execution | independent attribution of the executing contract to the observed execution |
| `CONFORMANCE` | post-execution | observed `executionRef` ↔ declared intent/scope agreement |

**Approved** (formalizes the split so design text can no longer
collide temporally).

### Q-FW5 — Simulation scope + deterministic `ALLOW` predicate

**Approved (rev 0.2):** simulation is **pre-execution, non-persistent,
model-only**. It MAY assert expected `recipient`, `amount`/`minOut`, `calldata`
(selector + args), `target`, `gasUsed`, `deadline`, `slippageBps`. It MUST NOT
assert post-execution state or chain guarantees.

**Decision predicate (`ALLOW` is a conjunction — fully deterministic):**

```
ALLOW  ⇔  POLICY_SATISFIED (P)
       ∧  AUTHORITY_PROBE_OK (A)
       ∧  DECLARATION_BOUND (B)
       ∧  SIMCONSISTENT (S)
       ∧  ¬REVIEW_OBLIGATION (R)
```

`SIMCONSISTENT(S, I, P)` — every comparison BigInt, every field defined:
| Field | Predicate (exact) |
|---|---|
| `recipient` | `sim.recipient == declared.recipient` (address, case-insensitive) |
| `target` | `sim.target == declared.target` |
| `selector` | `sim.selector == declared.selector` |
| `amount` (TRANSFER/DEPOSIT) | `sim.amount == declared.amount` |
| `amount` (SWAP) | `sim.received >= declared.minOut` (from `slippageBps` vs modeled price) |
| `gasUsed` | `sim.gasUsed <= policy.gas.max` (else `MAX_GAS` FAIL ⇒ `DENY`) |
| `deadline` | `sim.blockTimestamp >= declared.validAfter ∧ <= declared.validUntil` |
| model availability | every required field produced; any field `undefined`/un-modelable ⇒ `REQUIRE_REVIEW` (per Q-FW7) |

`AUTHORITY_PROBE_OK` — decision-time authority probe (§Q-FW10) ok for EOA or
EIP-1271 path at the labeled `authorityAtState`.
`DECLARATION_BOUND` — `intentRef` + `bindingRef` + `chainId`/`nonce` +
`executionScope` all present and self-consistent (Q-FW4).
`REVIEW_OBLIGATION` — any rule asserting review, or simulation un-modelable
(absorbed above), or authority requiring review.

**The predicate makes `ALLOW` deterministic**: identical
{intent, policy, authority probe, simulation output, block context} ⇒ identical
decision. "Simulation consistent" is therefore not loose wording — it is the
table's exact field-wise conjunction. **Approved.**

### Q-FW6 — Decision record immutability (anti retroactive-upgrade)
**Approved.** The decision record is frozen at decision time with:
`{ decision, decisionRef, policyId + policyHash, authorityInputs, simSummary,
bindingRef, chainId, blockRef, writer }`. After broadcast, post-hoc verification
MAY annotate the conformance of the execution, but it MUST NOT change the
`decision` field of a record. A `DENY` stays `DENY` forever. (Machine-
enforcement of the §15 red line.)

### Q-FW6a — decisionRef = hash of canonical record content
**Approved.** `decisionRef = hash(canonicalize(recordContent))` — content-derived,
self-enforcing immutability: any mutation changes the ref, so no record with
different content can claim the same `decisionRef`. **Canonical/deterministic
serialization is REQUIRED before hashing** (reuse `packages/canonical.canonicalize`
— a repo invariant), so different representations of the same record never
produce different refs. Conformance annotation is a **separate linked record**
(keyed by `decisionRef`), append-only — never an in-place edit of the frozen
record.

### Q-FW7 — Fail-closed engine state
**Approved.** The **closed** critical-input set is **{ POLICY, PROBE, BINDING,
SIM }** — any of them `NOT_RUN` (unavailable policy engine, unavailable
authorization adapter, unavailable simulation) ⇒ **DENY** (default) /
`REQUIRE_REVIEW` only when a review path is explicitly configured and policy
calls for it. **ALLOW is NEVER emitted from a `NOT_RUN` input.** Mirrors Phase
A/B NOT_RUN semantics without introducing a new status. Advisory/non-critical
fields never gate `ALLOW`. The critical set cannot be silently extended by
downgrading a later-added input to advisory.

### Q-FW7a — NOT_RUN honesty in the record
**Approved.** Every `NOT_RUN` critical input MUST be recorded with its reason
in the decision record, so an auditor can distinguish "denied because it
failed" from "denied because it was unavailable". `NOT_RUN` is never silently
converted to `NOT_PROVEN` (B-1 red line kept) and never to `ALLOW`.

### Q-FW8 — Delivery surface
**Approved.** A new internal package `@coreguard/firewall` (ZERO-DEP CORE
decision path + optional injected adapters for simulation), additive on
existing `packages/policy` + `packages/intent`. No static imports across the
boundary; injected capability for any transport. No new external dependency.

### Q-FW8a — Static-import boundary
**Approved.** `@coreguard/firewall` imports statically ONLY from the local
zero-dep core (canonical/intent/policy). EVM capability (EIP-712 recovery for
the authority probe) and any transport are **injected per-call** — same pattern
as `options.contractAuth` in B-1, never a package dependency. The dependency
gate is re-checked at implementation: no new external deps, hermetic tests,
**gate stays 10/10**.

### Q-FW9 — Decision record admissibility for later verification
**Approved.** The frozen decision record is itself admissible evidence for
post-hoc review (it establishes *what was allowed*), but its existence does
NOT substitute for the evidence the verifier requires (Q-B1.3-style
independently-attributable execution evidence still governs `CONTRACT_
EXECUTION_BINDING`). A `DENY` record plus later `VERIFIED` claim is a
contradiction the reviewer MUST flag.

### Q-FW9a — Resolution admissibility requires an authorized writer
**Approved.** Review-resolution records (Q-FW2a: `REQUIRE_REVIEW → ALLOW`) are a
subclass of decision records with the same freeze semantics, and are admissible
ONLY when the writer is authorized by the policy's configured review-path.
An unauthorized writer's resolution is invalid ⇒ DENY-equivalent. Deny-verdict
contradiction detection reuses the existing CGEP/1 `CONTRADICTION_SCAN` surface
(vocabulary extension, no new verifier concept).

### Q-FW10 — Temporal separation: B-1 authorization vs B-1 execution binding

**Approved (rev 0.2):** resolve the circular dependency by splitting the B-1
concepts across the two temporal stages:

```
PRE-EXECUTION (decision inputs)
  Intent → IntentDigest → Authorization/Manifest → Policy + Simulation
    → Firewall Decision (ALLOW/DENY/REQUIRE_REVIEW)
      → Execution
POST-EXECUTION (verification inputs)
  executionRef + independent attribution
    → CONTRACT_EXECUTION_BINDING
      → Conformance / Verification
```

- **Smart-executor AUTHORITY input at decision time = a decision-time
  authorization probe**, NOT the B-1 verdict-with-the-same-name:
  - set the `authorityAtState` explicitly (the decision block — honest label,
    NOT "execution block");
  - EOA path: EIP-712 recovery replay of the intent digest on the declared
    signer (no block dependence);
  - EIP-1271 path: read-only `isValidSignature(intentDigest, bytes)` against
    **decision-time state**, labeled `authorityProbe (atState: decisionBlock)`;
  - the probe is a weaker, decision-scoped assertion than B-1's
    `CONTRACT_AUTHORIZATION` (which is `eth_call` pinned to the **execution
    block's state**). It does NOT pre-judge the later B-1 verdicts.
- **`CONTRACT_EXECUTION_BINDING` is NOT an `ALLOW` precondition.** It is
  post-execution verification evidence (independent attribution of the
  executing contract to the observed execution). `ALLOW` therefore never
  depends on post-execution evidence.
- **Post-execution verification runs the authoritative B-1 axes**: execution-
  block `CONTRACT_AUTHORIZATION` + `CONTRACT_EXECUTION_BINDING`. If binding is
  not established ⇒ post-hoc `NOT_PROVEN`, **without altering the frozen
  decision**. Authority recognition at decision time and verified binding after
  execution are two different claims and stay two different statuses.
- A contract whose `authorityProbe` returns magic at decision time but whose
  post-execution binding fails ⇒ pre-execution `ALLOW` + post-hoc `NOT_PROVEN`
  — this is honest, not a retroactive upgrade (I2 intact).

**Approved.**

## 7. Policy Model

Policies are deterministic rule sets (extend `packages/policy`:

```
createPolicy({ policyId, name, rules }) → { version: "CGEP/1", policyId, name, rules }
commitPolicy(policy) → { canonical, hash }
```

Rules reference the existing atomic rule types
(`VALUE_LIMIT`, `TARGET_ALLOWLIST/DENYLIST`, `RECIPIENT_ALLOWLIST/DENYLIST`,
`SELECTOR_ALLOWLIST/DENYLIST`, `MAX_GAS`, `DEADLINE`, `SLIPPAGE_BPS`,
`ORACLE_BOUND`), plus — for the firewall context — the binding rules in §8.

A policy:
- is immutable by identification: any semantic change ⇒ new `policyId`/hash;
- MAY reference a review-path config (which states/actors trigger
  `REQUIRE_REVIEW`);
- is evaluated against the **decision context** collected at pre-execution time
  (source: intent + simulation output + authority inputs);
- never contains behavioral/AI inference (repo guardrail).

## 8. Intent → Policy → Simulation → Authorization → Execution

The pipeline executes strictly in decision order, with inputs frozen at the
decision block. **Temporal rule (rev 0.2): pre-execution inputs never include
post-execution evidence (`executionRef`, `CONTRACT_EXECUTION_BINDING`).**

**PRE-EXECUTION (decision stage):**

1. **INTENT** — canonical intent produced (`packages/intent`), with
   `chainId`, `nonce`, `action`, `target`, `selector`, `asset`, `amount`,
   `recipient`, `validAfter/Until`, `constraints`.
2. **POLICY** — committed `policyId` loaded; evaluated against the intent.
   Violation ⇒ `DENY` (Q-FW3).
3. **SIMULATION** — expected effects modeled (recipient/amount/calldata/gas/
   deadline/slippage) against decision block context; field-wise predicate
   `SIMCONSISTENT` evaluated (Q-FW5). Un-modelable ⇒ `REQUIRE_REVIEW`.
4. **AUTHORIZATION PROBE** — decision-time authority: EOA recovery replay of
   the intent digest, or EIP-1271 `isValidSignature` at `authorityAtState`
   (rev 0.2 split; labeled probe, not the B-1 verdict). Unrecognized ⇒ `DENY`;
   `NOT_RUN` ⇒ fail-closed path (Q-FW7/Q-FW10).
5. **DECLARATION BOUND** — `intentRef` + `bindingRef` + `chainId`/`nonce` +
   `executionScope` self-consistent (Q-FW4). Missing ⇒ `DENY`.
6. **DECISION** — `ALLOW | DENY | REQUIRE_REVIEW` per §9 predicate + frozen
   decision record (no `executionRef` in it).

**POST-EXECUTION (verification stage):**

7. **EXECUTION** — broadcast only on `ALLOW` (or review-approved `REQUIRE_
   REVIEW`). A `DENY` is never broadcast by the engine.
8. **BINDING + CONFORMANCE** — `executionRef` now exists; B-1 axes run at the
   execution block: `CONTRACT_AUTHORIZATION` + `CONTRACT_EXECUTION_BINDING`
   (independent attribution, Q-B1.3 rule). Binding failure ⇒ post-hoc
   `NOT_PROVEN`. Conformance compares observed vs declared
   intent/`executionScope`.
9. **VERIFICATION** — annotates conformance of the executed tx. It does **not**
   re-decide nor mutate the frozen decision (I2).

Fail-closed note: every step that cannot produce a result defers to Q-FW7
(`DENY` default), and every step's output is recorded in the decision record
for replayability.

## 9. Firewall Decision States

| State | Meaning | Emitted when | Retroactivity |
|---|---|---|---|
| `ALLOW` | launchable: authority probe + policy + simulation all satisfy the §9 predicate | predicate satisfied, no review obligation (Q-FW5) | **No**; conformance still verified post-hoc, divergence reported |
| `DENY` | not launchable: policy violation, authority probe failure, declaration-binding failure, or any `NOT_RUN` critical input (Q-FW7) | any gate fails | **Permanent**; post-hoc verification can never flip it (Q-FW6) |
| `REQUIRE_REVIEW` | an unambiguous decision is not determinable from available evidence; review path configured | sim un-modelable, or policy explicitly calls for review, or evidence-isolation requested | Review resolution recorded; pending review ⇒ treated as `DENY` for broadcast |

Failure precedence: `DENY` > `REQUIRE_REVIEW` > `ALLOW`. Any single
un-satisfiable or `NOT_RUN` input forces the decision below `ALLOW`.

## 10. Threat Model

| ID | Attack | Misleading result | Mitigation |
|---|---|---|---|
| T-FW1 | Policy forgery / swap (decision evaluated against an uncommitted or tampered policy) | Allowed under the wrong rules | Q-FW3 — evaluation only against committed `policyHash`; mismatch ⇒ `DENY`; policy identified by hash, not name. |
| T-FW2 | Unsigned / unbound intent (no bindingRef, mismatched chainId/nonce) | Decision on a different intent than executed | Q-FW4 — **declaration binding**: intent digest ↔ manifestId ↔ signature envelope (chainId/nonce-bound); any hole ⇒ `DENY`; observed `executionRef` is matched at conformance, never assumed at decision. |
| T-FW3 | Rubber-stamp EIP-1271 contract (return magic for any digest) | Decision-time authority where execution authority may not exist | **Honest scope, no overclaim:** EIP-1271 magic at decision time ≠ proof that the contract will execute. The decision-time authority probe establishes only "this contract, at `authorityAtState`, returns magic for this digest". The firewall records the probe result; it cannot — and does not claim to — prevent the rubber stamp pre-execution, because `isValidSignature` itself returns magic. Post-execution **independent attribution remains required** for `CONTRACT_EXECUTION_BINDING` (Q-B1.3); a contract whose only merit is a permissive `isValidSignature` fails that attribution and lands `NOT_PROVEN` — a decision-time probe `ALLOW` is never evidence that execution conformed (I1/I2). |
| T-FW4 | Simulation vs actual divergence (price/oracle shift, recipient mutation at exec time) | Decision stands on expectations that never materialized | Q-FW5/Q-FW6 — sim is model-only; post-hoc conformance compares observed vs declared and reports divergence; record frozen. |
| T-FW5 | Replay: same decision record reused for a different execution | Fresh-looking ALLOW for a stale/other execution | Decision record includes `bindingRef` (nonce-bound) + immutable `decision`; post-execution conformance requires observed `executionRef` ↔ declared `intentRef`/scope; reuse across a different declaration ⇒ mismatch ⇒ post-hoc `NOT_PROVEN`. |
| T-FW6 | Context-evasion mutation (amount split, calldata tampering that resets rule-visible context) | Policy satisfied while semantically exceeding it | Mutations are caught by binding (intent-digest) + post-hoc conformance (observed != declared); listed in §11 Mutation Lab. |
| T-FW7 | `NOT_RUN` inferred as `ALLOW` | Fail-open decisions | Q-FW7 — `NOT_RUN` ⇒ `DENY`/`REQUIRE_REVIEW`, never `ALLOW`. |
| T-FW8 | Post-hoc verification of a denied execution presented as approval | Retroactive upgrade of a `DENY` | Q-FW6 red line (machine-enforced) — `decision` field immutable; `DENY` stays `DENY`; conflict ⇒ reviewer flag. |
| T-FW9 | Missing provenance / evidence (silent clip) | Decision accepted with no authority trace | Q-B1.3 evidence-admissibility carried over: missing evidence ⇒ `DENY`/`NOT_PROVEN`, and the decision record must cite the authority inputs used. |

## 11. Attack / Mutation Vectors (Mutation Lab — proposed corpus)

Pre-code, deterministic, offline. Each vector has (a) the intended mutation,
(b) the expected **decision**, (c) the expected **post-hoc verification**
outcome, (d) the invariant it protects. The corpus is generated independently
of the implementation tests (like the adversarial benchmark corpus).

| ID | Mutation | Expected decision | Expected post-hoc | Invariant |
|---|---|---|---|---|
| M1 | Altered recipient | DENY (policy/recipient checks or bindingRef mismatch) | NOT_PROVEN conformance | declared == executed |
| M2 | Altered amount | DENY | NOT_PROVEN | value integrity |
| M3 | Altered calldata | DENY | NOT_PROVEN | calldata integrity |
| M4 | Wrong chainId | DENY (Q-FW4 binding / chainId digest guard) | NOT_PROVEN | chain separation |
| M5 | Wrong signer | DENY (authority) | NOT_PROVEN | authority |
| M6 | Replay (same intent, different nonce/executionRef) | DENY | NOT_PROVEN | nonce/ref binding |
| M7 | Missing provenance (no manifest/evidence) | DENY (Q-FW4 declaration-binding / T-FW9 evidence requiredness) | — | evidence requiredness |
| M8 | Broken delegation (B-1 chain invalid) | DENY | NOT_PROVEN | delegation |
| M9 | Fake EIP-1271 (rubber stamp, magic for any digest) | **ALLOW at decision** (probe CANNOT detect rubber-stamp pre-execution — T-FW3 honest scope; `isValidSignature` returns magic) | **NOT_PROVEN** (CONTRACT_EXECUTION_BINDING fails — Q-B1.3) | magic ≠ executor |
| M10 | Authorization without execution binding (OK-1271 probe, no post-hoc attribution) | **ALLOW at decision** (probe OK; no execution evidence exists yet — Q-FW10) | **NOT_PROVEN** (independent attribution absent) | magic ≠ executor |
| M11 | Simulation divergence (modeled X, tx executed Y) | ALLOW (at decision: model was consistent) | NOT_PROVEN (observed != declared) | post-hoc honesty |
| M12 | Policy swap (uncommitted policy) | DENY (policyHash mismatch) | — | policy commitment |
| M13 | Deny-upgrade (verification result on a DENY'd execution) | record stays DENY | contradiction flagged | Q-FW6 immutability |

## 12. Security Invariants

- **I1 — ALLOW is pre-execution only:** `ALLOW` asserts "launchable under
  committed policy + recognized authority + consistent simulation". It never
  asserts that execution will conform.
- **I2 — Decisions are frozen:** `decision` in a decision record is immutable;
  post-hoc annotation only. **Verification after execution MUST NOT convert a
  denied execution into an allowed one.**
- **I3 — Fail-closed:** any critical input `NOT_RUN` ⇒ `DENY` (or configured
  `REQUIRE_REVIEW`); **never `ALLOW`**.
- **I4 — Binding (temporal):** at decision time the **declaration binding** is
  closed (`intentRef` + `bindingRef` + `chainId`/`nonce` + `executionScope`,
  Q-FW4); an actual `executionRef`/`CONTRACT_EXECUTION_BINDING` is NOT required
  for `ALLOW` (it does not exist yet — Q-FW10). Post-execution, conformance
  matches the observed `executionRef` against the *same* declaration. Missing
  link at either stage ⇒ `DENY` / post-hoc `NOT_PROVEN`.
- **I5 — Determinism:** identical {intent, policy, authority probe, simulation
  output, block context} ⇒ identical decision + identical record.
- **I6 — Policy commitment:** evaluation against committed `policyHash` only;
  tampered/uncommitted policy ⇒ `DENY`.
- **I7 — Authority is input, not outcome (temporal):** the pre-execution
  decision consumes the decision-time authority probe; it never feeds
  verification truth. Post-execution B-1 axes (`CONTRACT_AUTHORIZATION`,
  `CONTRACT_EXECUTION_BINDING`) evaluate from execution-block evidence
  independently — no feedback loop between decision and verification.

## 13. Evidence Requirements

**At decision time (pre-execution):**
- `intentRef` + canonical intent hash; `bindingRef` (intent digest + manifestId);
- `executionScope` (chain, `validAfter`/`validUntil`, declared recipient/
  amount/calldata) — the predicted envelope, NOT an actual tx reference;
- committed `policyId` + `policyHash`; the rule results;
- simulation summary (asserted recipient/amount/calldata/gas/deadline/
  slippage) or "un-modelable";
- authority probe results with labeled state: `authorityProbe`
  (`authorityAtState: decisionBlock`) for EOA recovery or EIP-1271 readiness at
  decision time — **NOT** the B-1 execution-block verdicts (Q-FW10);
- `chainId`, `blockRef`, decision timestamp, writer.
- **No `executionRef` and no `CONTRACT_EXECUTION_BINDING` appear here** — they
  do not exist pre-broadcast (Q-FW4/Q-FW10 temporal rule).

**Post-execution (conformance):**
- observed `executionRef` (tx hash + block) now exists;
- observed execution evidence identical in rigor to B-1 (receipt/logs alone are
  NOT sufficient for binding/conformance claims; independently-attributable
  evidence required — Q-B1.3 rule carried over);
- authoritative B-1 axes at the execution block: `CONTRACT_AUTHORIZATION` +
  `CONTRACT_EXECUTION_BINDING`;
- replayable comparison: observed `executionRef` vs declared intent/
  `executionScope` vs simulated.

## 14. Fail-Closed Rules

1. Missing/`NOT_RUN` policy ⇒ `DENY`.
2. Missing/`NOT_RUN` authority probe ⇒ `DENY` (or configured review).
3. Un-modelable simulation ⇒ `REQUIRE_REVIEW` (never `ALLOW`).
4. Missing declaration binding (`intentRef`/`bindingRef`/`executionScope`) ⇒
   `DENY`. (An actual `executionRef` is NOT a decision-time requirement —
   Q-FW4.)
5. `ALLOW` requires ALL of (Q-FW5 predicate): policy satisfied + authority
   probe OK + simulation `SIMCONSISTENT` + declaration bound + no review
   obligation. Post-execution B-1 axes are NOT `ALLOW` inputs (Q-FW10).
6. Failure precedence (§9): `DENY` > `REQUIRE_REVIEW` > `ALLOW`.
7. Post-hoc verification MAY NOT change a `decision` (Q-FW6); a `DENY` stands.

## 15. Red Lines / Out of Scope

- **"Firewall ALLOW is a pre-execution policy decision, not proof that
  execution will or did conform."**
- **"Verification after execution MUST NOT retroactively convert a denied
  execution into an allowed execution."** (machine-enforced in the decision
  record, Q-FW6)
- No "AI detector"/behavioral human-AI inference semantics anywhere (repo
  guardrail).
- No modification of frozen P0/P1, `verify-live.json`, anchored evidence, or
  v0.1.1 (and no re-opening of B-1 axes).
- No on-chain contract/deployment/P2 in this phase (roadmap §D); decisions and
  records live off-chain.
- `ALLOW` is not a safety guarantee beyond policy/scope; it is a policy-range
  enabler, and conformance is still verified post-hoc.
- No merging of firewall vocabulary into verification verdicts (no new
  `VERIFIED`-style meaning introduced).

## 16. Compatibility with CGEP/1 + B-1

- The firewall **consumes** AgentProof/B-1 outputs; it never re-defines them
  (verdict grammar, NOT_RUN semantics, EIP-1271 execution-binding rule all
  unchanged).
- Authority, temporally scoped (Q-FW10): the decision consumes the
  **decision-time authority probe**; the authoritative B-1 axes
  (`CONTRACT_AUTHORIZATION` at execution block, `CONTRACT_EXECUTION_BINDING`,
  `DELEGATION_CHAIN`, `REVOCATION`, `ATTESTATION_*`) remain verifier semantics
  for post-execution verification — unchanged, never re-defined.
- New, additive surfaces allowed by this design: the decision engine
  (`@coreguard/firewall`), the decision record schema, and the Mutation Lab
  corpus. v0.2.0 (B-1) release-boundary content is NOT re-characterized.
- Policy/intent reuse existing packages: `packages/intent` (ActionType,
  ConstraintType, `createIntent`), `packages/policy` (rule types,
  `evaluatePolicy`, `commitPolicy`, `hashPolicy`).
- Evidence-admissibility for post-hoc conformance inherits Q-B1.3 (receipt/
  log-only insufficient; independent attribution required).

## 17. Test Matrix (pre-code)

| Entry | Purpose | Expected |
|---|---|---|
| FW-1 | Happy path decision | `ALLOW` + frozen record, replayable |
| FW-2 | Policy violation | `DENY`, rule result cited |
| FW-3 | `NOT_RUN` authority input | `DENY` (never `ALLOW`) |
| FW-4 | Un-modelable simulation | `REQUIRE_REVIEW` (→ `DENY` without review path) |
| FW-5 | Missing binding | `DENY` |
| FW-6 | Deny-upgrade attempt | record stays `DENY`; contradiction flagged |
| FW-7 | Decision determinism | same input ⇒ same record |
| FW-8 | Policy tamper | `DENY` (policyHash mismatch) |
| FW-9 | M1–M13 corpus sweep (Mutation Lab) | decision + post-hoc outcome per §11 |
| FW-10 | B-1 regression guard | all B-1 vectors still pass (214/214 maintained) |
| FW-11 | Frozen-artifact guard | `verify-live.json` hash unchanged; `git diff --check` clean |

Implementation gate (post-GO only): all above are codified as hermetic tests
(fake injected providers, no network); full suite grows additively on
**214/214**; benchmark stays **73/73**; commit discipline unchanged (atomic
commits: `npm test` → `git diff --check` → frozen-artifacts review → commit).

## 18. GO / NO-GO Gate

**No implementation is written before this gate.**

Gate sequence:

```
Q-FW1…Q-FW10 → reviewer approval (this document v0.3.0)
        ↓
FINAL DESIGN REVIEW (threat model §10 + vectors §11 + invariants §12 reviewed)
        ↓
GO / NO-GO  ← user decision (recorded in roadmap, like B-1 GO GRANTED)
        ↓
Implementation (separate atomic commits per logical unit, additive on 214/214)
```

Exit criteria for GO confirmation after implementation (per B-1 discipline):
every FW-1…FW-11 matrix entry green, `npm test` full-suite additive,
`npm run benchmark` 73/73, `git diff --check` clean, frozen artifacts
byte-identical, and the §12 invariants asserted by tests — including I1/I2/I3
(the two red lines machine-enforced as tests).

**NO-GO (design) if unresolved:** simulation scope (Q-FW5), review-path
governance (Q-FW2/Q-FW7), or delivery surface (Q-FW8) remain ambiguous.
**NO-GO (implementation) if:** any B-1 axis is re-opened, any frozen artifact
changes, or any fail-open path is introduced.

---

*End of CGEP/1 Phase D — Execution Firewall — Design (v0.3.0-design).*