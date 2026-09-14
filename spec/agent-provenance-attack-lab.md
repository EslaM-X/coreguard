# CoreGuard Attack / Mutation Lab — Adversarial Security Review of the Execution Firewall

**Version**: 0.1.2-design · **Status**: AWAITING FINAL SECURITY REVIEW
(resubmitted; initial blockers + remaining A1.7/A1.9 blocker closed) ·
**Parent**: CGEP/1:AGENT-PROVENANCE

**Subject under test (SUT):** `@coreguard/firewall` at release boundary
**e479caa** (Phase D CLOSED / RELEASE-READY). Firewall source is **frozen for
this workstream**: no `packages/firewall/*` edit is authorized by this design
(see §11 release-boundary protocol).

## 1. Purpose

Attempt to **intentionally break** the Execution Firewall by adversarial
submission to its released API surface, and encode every attempt + outcome as a
permanent, deterministic regression suite. The goal is *proof of resistance*,
not new features:

- Prove the closed critical set cannot be coaxed into `ALLOW`.
- Prove the temporal seam holds across every input channel.
- Prove the decision predicate is a pure, deterministic function of its canonical
  inputs (same canonical inputs ⇒ same decision, same `decisionRef`).
- Prove review resolution and conformance cannot be redirected, re-anchored, or
  upgraded.

Non-goals (explicitly out of scope):
- **No implementation** before GO — this document is the entire deliverable of the
  design phase.
- No modification of the SUT, of `packages/canonical|intent|policy|evm`, of the
  B-1 verifier, of `verify-live.json`, of the 73-case adversarial corpus, or of
  the benchmark.
- No re-definition of decision semantics that are already honest-scope
  (e.g. rubber-stamp EIP-1271 = `ALLOW` at decision, `NOT_PROVEN` post-hoc).

## 2. Pipeline (same as Phase D)

```
Design v0.1.2 (A1–A16, IN1–IN8)   ← THIS DOCUMENT (resubmitted, final)
        ↓
FINAL SECURITY REVIEW ← we are here (remaining A1.7/A1.9 blocker closed)
        ↓
GO/NO-GO
        ↓
Implementation (adversarial tests ONLY, additive under test/firewall/attack-lab/)
        ↓
Attack Lab review = PASS/FAIL
```

## 3. Adversary model & trust boundaries

The adversary is a **subversive integrator**: a caller of the released public API
(`decideFirewall`, `resolveReview`, `annotateConformance`) who controls
**caller-visible data only**:

- Every caller-supplied argument: `intent`, `declaration`, its `signature`
  envelope and `signerBinding`, `policy`, `policyTrust`, `simulation`,
  `reviewPath`, `writer`, `from`, `authorityAtState`, `blockTimestamp` — and the
  caller-side values of `expectedPolicyHash` / `activePolicyIds`.
- Representation and packaging of all inputs (key order, casing, hex-vs-decimal,
  extra keys, empty/zero/negative/huge values, type confusion, arrays vs strings).

**Harness-owned and frozen — the test oracle, NOT the attacker's (this split is
mandatory for the lab to be meaningful):**

- The harness owns and freezes the **injected `evm` / `contractAuth` adapter
  implementations**. The attacker may pass them, and may pass alternative
  fixtures exposing adapter *results*; it may **never mutate adapter behavior or
  code**. A falsified adapter is a B-1 infrastructure failure, tested there — a
  firewall-input attack must be distinguishable from an adapter attack.
- The **commitment anchor** from which the *true* `expectedPolicyHash` and
  `activePolicyIds` are derived is harness-derived. Caller-supplied values for
  these fields are **claims checked against the anchor (IN5)** — never trusted
  merely because they appear in the argument list.
- `packages/canonical` canonicalize/domainHash/hash* — the hash oracle every
  commitment is checked against; breaking it is a shared-core attack, separately
  tested.

**Trusted ground truth (outside this attack surface):**

| Ground truth | Why | Owner / role |
|---|---|---|
| Injected `evm` / `contractAuth` adapters | harness-owned & frozen; they ARE recovery / historical-state. The attacker controls fixtures exposing their *results*, never their code | B-1 infrastructure (oracle) |
| `packages/canonical` canonicalize/domainHash/hash* | the hash oracle every commitment is checked against; shared-core attack is separately tested | core (oracle) |
| Commitment anchor (true `expectedPolicyHash` / `activePolicyIds`) | the firewall's anti-rollback anchor; caller values are claims, not trusted by position | harness (B-2 layer concept, out of scope) |
| `packages/intent` / `packages/policy` consequence engines | reused primitives, not firewall-owned | core |

The firewall must never be able to (re)obtain trust from untrusted input: input
may *select* legitimate authorities (declared signer address is a choice, not a
bypass), but it may never *assert* a probe/policy/commitment outcome.

## 4. Invariant oracle (IN1–IN8)

Every adversarial case is judged against these; they are the lab's exit criteria
embedded as assertions.

| ID | Invariant | Source |
|---|---|---|
| IN1 | **No post-execution artifact anywhere in any PRE record** — a deep scan of the JSON of every decision record contains none of `executionRef`, `executionBinding`, `CONTRACT_AUTHORIZATION`, `CONTRACT_EXECUTION_BINDING`, `executionBlock` | I1/I4 + FW-10/FW-10b |
| IN2 | **Records deeply frozen & content-addressed** — mutation throws; `record.decisionRef` always equals a fresh `decisionRecordRef(record)` | I2 + Q-FW6a |
| IN3 | **NOT_RUN can never yield `ALLOW`** — any `NOT_RUN` in {POLICY, PROBE, BINDING, SIM} yields `DENY`, or `REQUIRE_REVIEW` **only on the review-eligible paths Phase D explicitly defines** (e.g. unmodelable SWAP semantics); the reason is always recorded. `ALLOW` under any `NOT_RUN` is a DEFEATED finding | I3 + Q-FW7a + §A5.2 |
| IN4 | **Determinism & representation invariance** — identical canonical inputs (any equivalent representation) ⇒ identical decision + record + `decisionRef`; different canonical inputs never share a `decisionRef` | I5 + FW-7 |
| IN5 | **Policy commitment** — a mismatch between recomputed hash/active set and the committed digest ⇒ `DENY`; no silent rollback | I6 + Q-FW3a |
| IN6 | **Authority by recompute only** — any substitution/malformation of the authority input ⇒ `NOT_PROVEN`/`NOT_RUN`; never `OK` without a real replay | I7 + Q-FW1a/Q-FW10 |
| IN7 | **Resolution integrity** — `REQUIRE_REVIEW → ALLOW` only for an authorized writer AND the *same* bound intent/manifest; `DENY → ALLOW` forbidden on any route | Q-FW2a/Q-FW9a + e479caa anchor |
| IN8 | **Predicate exactness** — `ALLOW` iff POLICY_SATISFIED ∧ AUTHORITY_PROBE_OK ∧ DECLARATION_BOUND ∧ SIMCONSISTENT ∧ ¬REVIEW_OBLIGATION; precedence DENY > REQUIRE_REVIEW > ALLOW | Q-FW5 + §9 |

## 5. Attack catalog — summary

A1–A5 mutation matrices · A6 smuggling channels · A7 probe substitution ·
A8 NOT_RUN coercion · A9 unauthorized review · A10 cross-intent resolution ·
A11 decisionRef tampering · A12 PRE-evidence injection · A13 same-input divergence ·
A14 numeric/representation adversarial · A15 envelope malformation ·
A16 duplication/replay under mutation.

## 6. Attack detail (each row = reproduction with an oracle verdict)

Notation: *oracle (O)* = invariant violated if exploited; *expected (E)* = the
outcome the lab must observe; a row is **HELD** when observed == expected, else
**DEFEATED** (requires a reproduction, §11).

### A1 — INTENT mutation matrix
**Strict rule (family-wide):** a mutated intent that breaks binding, authority,
or policy MUST NOT produce `ALLOW`. The only acceptable outcomes are the specific
fail-closed verdicts below; **any `ALLOW` without a recomputed binding/authority/
policy basis — i.e. without IN8 holding for the mutated input — is DEFEATED,
regardless of whether `decisionRef` changed.** A changed `decisionRef` never
rescues an unauthorized `ALLOW`.

**Post-signing principle:** any change to `intent` after signing that is not
backed by a freshly valid declaration/signature over the *changed* intent breaks
DECLARATION_BOUND ⇒ `DENY`, never `ALLOW` — **including a deadline mutation that
stays "inside" the previously declared window**. Re-deriving a consistent
signature/declaration for the changed intent is a **new authorization** to test
canonically (A13/A16), not a mutation of the original one.

| # | Tamper | E (specific fail-closed verdict) |
|---|---|---|
| A1.1 | `intent.recipient` after signing | DENY (DECLARATION_NOT_BOUND) |
| A1.2 | `intent.amount` (string/bigint) | DENY (DECLARATION_NOT_BOUND) |
| A1.3 | `intent.selector` / calldata | DENY (DECLARATION_NOT_BOUND) |
| A1.4 | `intent.target` | DENY (DECLARATION_NOT_BOUND) |
| A1.5 | `intent.chainId` | DENY (DECLARATION_NOT_BOUND / chain mismatch) |
| A1.6 | `intent.nonce` (replay under mutation) | DENY (anti-replay / binding mismatch) |
| A1.7 | `intent.validAfter` / `validUntil` after signing | any mutation of the signed intent — including an in-window deadline mutation — breaks DECLARATION_BOUND and MUST NOT produce `ALLOW`; out-of-window values additionally fail the deadline predicate. A new valid signature/declaration over the mutated intent is a new authorization, not a mutation of the original authorization |
| A1.8 | `intent.signer` | NOT_PROVEN ⇒ DENY (authority substitution) |
| A1.9 | `intent.constraints` / `action` after signing | mutation breaks DECLARATION_BOUND unless accompanied by a newly valid declaration/signature over the mutated intent; consequence-engine effects MUST be derived, never asserted; no unauthorized mutation may produce `ALLOW` |
A1 O = IN4, IN6, IN8.

### A2 — MANIFEST/DECLARATION mutation matrix
| # | Tamper | E |
|---|---|---|
| A2.1 | `manifestId` to forged value | DECLARATION_NOT_BOUND (recompute mismatch) |
| A2.2 | `chainId`/`nonce` in declaration | binding mismatch |
| A2.3 | `version`/`kind` | DECLARATION_INVALID |
| A2.4 | `signerBinding.address` vs `intent.signer` | mismatch |
| A2.5 | `signerBinding.kind` EOA⇄EIP1271 | consistency/path change, recomputed |
| A2.6 | `signature.signer` field edited post-sign | recovery mismatch ⇒ NOT_PROVEN |
A2 O = IN4, IN6.

### A3 — BINDINGREF tampering
| # | Attack | E |
|---|---|---|
| A3.1 | Supply a forged/absent `bindingRef` claim | engine ignores any supplied ref; `record.binding.bindingRef` always == recomputed `computeBindingRef(...)` |
| A3.2 | Attempt collision: vary intentRef/manifestId/signature, expect distinct refs | distinct refs; hash-length domain separation (32-byte) |
| A3.3 | Mutate the closure *after* the record is produced | IN2: mutation **throws** and the frozen record **remains unchanged** (a frozen record cannot "re-derive" its ref) |
A3 O = IN2, IN4.

### A4 — POLICY-HASH/COMMITMENT mutation
| # | Attack | E |
|---|---|---|
| A4.1 | Tamper policy rules/args after `hashPolicy` | POLICY_HASH_MISMATCH ⇒ DENY |
| A4.2 | Swap `policyId` to one not in `activePolicyIds` | POLICY_NOT_ACTIVE ⇒ DENY |
| A4.3 | Empty/absent `activePolicyIds` | ACTIVATION_UNKNOWN (NOT_RUN) ⇒ DENY (IN3) |
| A4.4 | `policyTrust.anchors` forgery | POLICY_NOT_TRUSTED ⇒ DENY |
| A4.5 | Unknown rule type injected | falls closed ⇒ DENY |
A4 O = IN5, IN3, IN8.

### A5 — SIMULATION-field mutation
| # | Attack | E |
|---|---|---|
| A5.1 | Tamper each closed-model field (target/selector/recipient/amount/received/gasUsed/timestamp) vs declared scope | exact conformity ⇒ SIMCONSISTENT; violation ⇒ DENY; unmodelable ⇒ REQUIRE_REVIEW **only via a Phase-D-defined review-eligible path** (reason recorded), never ALLOW |
| A5.2 | SWAP without `received` / with non-numeric `received` | unmodelable ⇒ REQUIRE_REVIEW (review-eligible per Phase D, reason recorded) or DENY without a path; **never ALLOW** — consistent with IN3 |
| A5.3 | MAX_GAS: `gasUsed` above committed ceiling | sim gate fails ⇒ DENY |
| A5.4 | Missing required sim field | unmodelable (review-eligible per Phase D) ⇒ REQUIRE_REVIEW or DENY; never ALLOW |
| A5.5 | Any extra / non-model key on `simulation` | **invalid input** — rejected by the closed model (TypeError / FW-10b), NOT a representation-equivalent variant (see A13.2) |
A5 O = IN3, IN8.

### A6 — POST-EXECUTION SMUGGLING CHANNELS (A6 = mapped from earlier FW-10b)
Probe EVERY input object for injection of `executionRef`, `executionBinding`,
`CONTRACT_EXECUTION_BINDING`, `CONTRACT_AUTHORIZATION`, `executionBlock`
(plus equivalents: `blockNumber`, `txHash`, `receipt`, `trace`, `storageChanges`).

| # | Channel | Expected |
|---|---|---|
| A6.1 | top-level inputs | TypeError (guard) |
| A6.2 | `simulation` object | TypeError (closed model, FW-10b) |
| A6.3 | `intent` extra keys | decisionRef-relevant only if canonicalized into intent; must never assert; attempt must not produce ALLOW upgrade |
| A6.4 | `declaration` extra keys | hashed into manifestId (content-derived); no ALLOW upgrade |
| A6.5 | `policy` extra keys | POLICY_HASH_MISMATCH ⇒ DENY |
| A6.6 | `reviewPath` / `writer` / `from` extra keys | ignored or rejected; never recorded |
| A6.7 | deep JSON text scan of ANY produced PRE record | IN1 (no token) |
A6 O = IN1, IN2.

### A7 — AUTHORITY-PROBE SUBSTITUTION
| # | Attack | E |
|---|---|---|
| A7.1 | Sign with a different key than declared signer | SIGNER_MISMATCH ⇒ NOT_PROVEN |
| A7.2 | Recover-substitution: signerBinding.address ≠ actual signer | NOT_PROVEN |
| A7.3 | Cross-chain: signature over 1114 digest submitted on 1116 | SIGNER_MISMATCH (EOA) / NOT_MAGIC (EIP-1271) |
| A7.4 | EIP-1271 kind with EIP-712 scheme (and converse) | consistency ⇒ NOT_PROVEN/binding mismatch |
| A7.5 | malformed r/s/v, zero r/s | SIG_MALFORMED |
| A7.6 | EIP-1271: omit `evm` / `contractAuth` / `authorityAtState` | NOT_RUN ⇒ DENY (IN3; never ALLOW, no REVIEW coercion) |
| A7.7 | EIP-1271: revert / wrong magic / empty code | NOT_PROVEN |
| A7.8 | Omitting `evm` on EOA path | NOT_RUN ⇒ DENY |
A7 O = IN6, IN3.

### A8 — NOT_RUN → ALLOW COERCION (omission matrix over the closed critical set)
Enumerate single and combinatorial omissions: `evm`, `contractAuth`,
`authorityAtState`, `activePolicyIds`/`expectedPolicyHash`, `policy`,
`intent`/`declaration`/`signature`. Expected: **EVERY** omission that zeroes a
critical member ⇒ `DENY` (reason recorded); NONE yields `ALLOW`;
`REQUIRE_REVIEW` may appear **only on the review-eligible paths Phase D defines**
(e.g. unmodelable sim), never as a route past a missing authority/policy/binding.
A8 O = IN3.

### A9 — UNAUTHORIZED REVIEW
| # | Attack | E |
|---|---|---|
| A9.1 | `writer` not in `reviewPath.writers` | rejected |
| A9.2 | `writer` malformed (wrong length, mixed-case exploit, 0x prefix abuse) | rejected |
| A9.3 | empty/absent writers list | rejected (no path) |
| A9.4 | reviewPath `configured:true` with empty writers | rejected |
A9 O = IN7.

### A10 — CROSS-INTENT / CROSS-MANIFEST RESOLUTION
| # | Attack | E |
|---|---|---|
| A10.1 | resolve parent(X) by re-deciding unrelated intent Y | refused (e479caa anchor) |
| A10.2 | resolve with tampered `inputs.declaration` (different manifestId) | refused |
| A10.3 | resolve with re-decided `bindingRef` differing from parent | refused |
| A10.4 | resolve a **forged parent** — a parent object that fails content-address (`decisionRef` ≠ `decisionRecordRef(body)`), freeze, or binding validation | rejected at the boundary | **Note:** "forged" means the object fails those validations — NOT merely "a new object". A distinct object that passes every validation is a legitimate independent record (maps to A10.1/A10.2), not a forgery |
A10 O = IN7.

### A11 — DECISIONREF TAMPERING
| # | Attack | E |
|---|---|---|
| A11.1 | mutate frozen `record.decisionRef` | throws (frozen) |
| A11.2 | freeze a body that already contains a `decisionRef` | freeze recomputes over the body minus ref; supplied ref ignored |
| A11.3 | present record whose claimed ref ≠ `decisionRecordRef(record)` | assertion fails (content-address divergence) |
| A11.4 | collision attempt: many distinct records, unique refs | all refs distinct (domain separation) |
A11 O = IN2, IN4.

### A12 — EXECUTION EVIDENCE INTO PRE (harness-level)
Reproduce the adversarial scenario `A6` end-to-end *through* the sub-engines too:
`evaluateDeclarationBinding`, `evaluateAuthorityProbe`, `evaluatePolicyForDecision`,
`evaluateSimulation` with the same forbidden tokens. **The oracle is NOT
"TypeError at a specific layer"** — a channel may legitimately be rejected by a
fail-closed verdict instead of an exception (both rejections are HELD). The only
oracle: **no channel may upgrade a verdict toward `ALLOW`** and no forbidden
token may persist into any produced PRE record. Sub-engines stay pure fact
computers (they produce facts; the boundary mints verdicts).
A12 O = IN1, IN8.

### A13 — SAME-INPUT DIVERGENCE
| # | Attack | E |
|---|---|---|
| A13.1 | identical deep-equal input, called repeatedly | same decision, same `record`, same `decisionRef` (deepEqual) |
| A13.2 | representation variants **that `packages/canonical` actually treats as equivalent** — its normalization is the definition of equivalence, never an assumption | same decision + same ref (canonicality) |
| A13.3 | distinct canonical decision records (inputs whose canonical decision bodies differ, whatever their surface similarity) | MUST NOT share a `decisionRef` |
A13 O = IN4.

**Notes on A13 scope:**
- (i) An extra key on `simulation` is NOT a representation-equivalent variant — it
  is **invalid input** and must be rejected as such (A5.5), never folded into an
  equivalence/divergence case.
- (ii) Casing, hex-vs-decimal, leading zeros etc. are equivalent **only if
  `packages/canonical` normalizes them**; otherwise they are *distinct canonical
  inputs* and belong to the A13.3 class, not A13.2.
- (iii) The A13.3 universe is inputs that actually enter the decision domain:
  fields outside the canonical decision record (harness metadata, test IDs) are
  irrelevant to `decisionRef`.

### A14 — NUMERIC / REPRESENTATION ADVERSARIAL
Negative, zero, `2^256` boundary, overflow, `0x` prefixed vs bare, leading zeros,
float/`"1e18"` strings, `-0`, `NaN`/`Infinity`, BigInt/Number/string confusion —
injected into `amount`, `minOut`, `received`, `validAfter/Until`,
`blockTimestamp`, `gasUsed`, `slippageBps`, `priceBps`, `authorityAtState`,
nonce. Expected: deterministic BigInt handling; unparseable ⇒ fail-closed
(unmodelable/deny by rule), never inconsistent verdict ordering. **Do NOT presume
hex-vs-decimal or mixed-case are equivalent**: only the variants the
canonical/intent layer actually normalizes as equivalent (established via
`packages/canonical`) count as equivalence cases (A13.2); every other form is a
distinct canonical input.
A14 O = IN4, IN3.

### A15 — ENVELOPE MALFORMATION MATRIX
Malformed EIP-712/EIP-1271 envelopes: missing fields, wrong `v`, invalid length
r/s, non-address signer, non-hex `bytes`, kind/scheme mismatches, unknown scheme.
Expected: `NOT_PROVEN`/binding mismatch everywhere; no path to `OK` without a
real replay.
A15 O = IN6.

### A16 — DUPLICATION / REPLAY UNDER MUTATION
Re-submit an earlier ALLOW with one field mutated anywhere in the superset of
A1/A2/A5. **Strict rule (same as A1): a mutation that breaks binding/authority/
policy MUST NOT reproduce an ALLOW** — a replayed `ALLOW` with a fresh
`decisionRef` is DEFEATED, not acceptable. The observable for a mutated replay is
a fail-closed verdict, or — for genuinely equivalent canonical inputs — the
*identical* record + ref (determinism, A13). Also re-run `resolveReview` of an
already-resolved parent (idempotence/termination: second resolution re-validates,
never double-upgrades beyond ALLOW, and never flips a DENY).
A16 O = IN4, IN8.

## 7. Finding & verdict semantics (the reproduction red line)

- **HELD** — observed == expected for the whole row (green).
- **DEFEATED** — observed violates an oracle (red). A DEFEATED entry is only
  valid when it carries: (a) minimal exact input set, (b) exact call sequence,
  (c) actual vs expected diff, (d) the invariant violated. **No DEFEATED finding
  opens the release boundary without this reproduction being reviewed.**
- **NON-EXPLOITABLE** — attempt performed; no deterministic reproduction found;
  recorded with the attempt so it is not re-tried blindly.

**Unauthorized-ALLOW rule (applies to every row):** any `ALLOW` returned without
IN8 holding for the *given* input — i.e. missing binding, authority, or policy
basis — is DEFEATED on sight. A freshly derived `decisionRef` never rescues an
unauthorized `ALLOW`; there is no "changed decisionRef" accommodation (A1/A16).

Green exit: every row HELD or NON-EXPLOITABLE; zero DEFEATED without an approved
fix that re-lands as its own atomic commit (SUT edit at that point authorized by
a user decision, after reproduction review).

## 8. Lab structure & integration (implementation-phase plan — NOT built here)

- New path `test/firewall/attack-lab/` mirroring group naming
  (`a01-intent.test.js`, `a02-manifest.test.js`, `a04-policy.test.js`,
  `a07-authority.test.js`, `a08-notrun.test.js`, `a09-resolution.test.js`,
  `a11-decisionref.test.js`, `a13-determinism.test.js`, `a14-numeric.test.js`,
  `a15-envelope.test.js`, `a16-replay.test.js`, ...).
- Fixtures reuse `test/firewall/helpers.js`; a shared `attackCheck` helper encodes
  the verdict contract (HELD vs DEFEATED with mandated reproduction fields).
- `scripts/run-tests.mjs` gains one suite entry `"test/firewall/attack-lab"`
  (lightweight `npm run attack` alias optional at GO). **Zero SUT changes.**
- Determinism uses a canonical-replay harness: serialize → re-parse → re-run →
  deepEqual record + equal ref.

## 9. Traceability to Phase D artefacts

A1–A16 terminate in §4 oracles that trace to: §12 invariants I1–I7 ·
Q-FW1a/2a/3a/3b/4/5/6a/7a/8a/9a/10 · T-FW1–T-FW9 · §17 FW-1..FW-11 ·
M1–M13 corpus · the e479caa release-review fixes (closed simulation model +
resolution parent-binding anchor). IN3 herein restates, it does not redefine,
Phase D's review-eligibility semantics (DENY on any blocked critical member;
REQUIRE_REVIEW only on the paths Phase D marks review-eligible).

## 10. Explicit non-goals (locked)

- No SDK / B-2 / registry / on-chain work in this workstream.
- No new firewall capability; the SUT is a black box with reconstructible inputs.
- No modification of `verify-live.json`, the 73-case adversarial corpus, the
  benchmark, or `packages/*` outside the allowed new test path.
- No reopening of the Phase D design: a finding changes behavior **only** through
  the §11 protocol.

## 11. Release-boundary protocol

1. The SUT stays at **e479caa** unless a DEFEATED reproduction is user-reviewed.
2. A reproduction must be deterministic (rerun ⇒ same diff) before it counts.
3. If a reproduction is approved, remediation = one atomic commit
   (`feat(firewall): …`) re-running: `npm test` → `npm run benchmark` →
   `git diff --check` → frozen-artifacts review → dedicated commit.
4. Cosmetic/anticipated hardening with no reproduction is deferred to the next
   workstream — the current lab never "polishes" the SUT (matches the Phase D
   closure rule: *no additional fix without a clear reproduction*).

---
*End of Attack / Mutation Lab design v0.1.2 (AWAITING FINAL SECURITY REVIEW —
resubmitted; blockers 1–5, minor notes a–d, and the remaining A1.7/A1.9 blocker
closed).*