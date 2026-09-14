# Signed Intent / Authorization Binding — WS-1 Design

**Version**: 0.1.0-design · **Status**: DESIGN PASS · **SECURITY REVIEW PASS (2026-09-14)** — conditional only on the terminology lock in §3.0 · **FINAL SECURITY REVIEW PASS (UNCONDITIONAL, 2026-09-14)** — after MIT-1..4 applied (docs-only) · implementation **BLOCKED** until GO
**Parent**: CGEP/1:AGENT-PROVENANCE
**Boundary**: additive, docs/review only. Does NOT redefine Phase D semantics. No code before GO.
**Date**: 2026-09-14

---

## 0. Canon and Ground Rules (fixed before review)

1. **WS-1 is NOT a new source of truth.** It defines and *binds* what a signer
   authorized precisely, then hands the Firewall a **recomputable / verifiable
   binding input**. It does not change what Phase D decides, only *how the
   decision input is established and audited*.
2. **no code before GO.** DESIGN → SECURITY REVIEW → FINAL SECURITY REVIEW →
   GO / NO-GO → IMPLEMENTATION (see §7).
3. **Additive only.** No edits to `packages/firewall/*` or frozen artifacts
   without a separately approved remediation, and only per §8.
4. **Never trust a caller-supplied authorization claim.** No `bindingRef`, no
   boolean `authorization`, no recovered-signer output, no magic-value output is
   ever honored as-is; every link of the chain is **recomputed** from trusted
   inputs (§4).
5. **AUTHORIZATION ≠ EXECUTION CONFORMANCE.** Signing *what may be attempted*
   never implies *what actually happened on-chain*. WS-1 covers the
   pre-execution side of the seam only.

---

## 1. Scope & Non-Goals

### Scope (in)
- Precisely define the **signed-intent object** and its **authorization binding**
  as the recomputable link: intent → canonical intent → intent digest → valid
  signature / EIP-1271 authorization → declaration/manifest → bindingRef →
  executionScope → Firewall decision (§2, §5).
- Enumerate and decide, one-by-one, the **security decision points** in §3.
- Define the **integration boundary** (§4): which values MUST be recomputable
  from trusted inputs vs. which remain caller-supplied *claims*.
- Define **oracles / invariants** for the follow-on security review and
  Attack/Mutation Lab extension (§6), preserving the global rule:
  **unauthorized mutation → never ALLOW**.
- Produce a numbered, individually approvable **Q-SIA set** (§5).

### Non-Goals (out)
- **NO changes to `packages/firewall/*`**; no redefinition of Phase D decision,
  review, resolution, or conformance semantics.
- **NO B-2**: no registry, no agent identity profile, no on-chain deployment,
  no nonce-burning store, no on-chain revocation registry.
- **NO on-chain changes** of any kind.
- **NO SDK / integration surface implementation** (deferred to WS-2; §4 only
  *sets the contract* the future SDK must satisfy).
- **NO DApp implementation.**
- **NO execution-time conformance changes** — the post-execution side is OUT;
  it is referenced only to mark the seam (AUTHORIZATION ≠ EXECUTION CONFORMANCE).
- **NO new cryptographic primitives** (sha256 / secp256k1 / Keccak-256 remain
  exactly as today).

---

## 2. Current-State Inventory

### 2.1 Implemented today (verified against source)

**Intent model** — `packages/intent/index.js`
- `createIntent({ chainId, signer, nonce="0", validAfter=0, validUntil, action,
  target, selector, asset, amount, recipient, constraints })` normalizes to a
  canonical shape: `version:"CGEP/1"`, all addresses lowercase,
  numerics coerced to decimal strings.
- `commitIntent(intent)` → `{ intent, canonical, hash }` where
  `hash = hashIntent(intent)`.

**Canonical encoding / domain separation** — `packages/canonical/index.js`
- `canonicalize(obj)` — sorted keys, lowercase `0x`-prefixed strings, integers
  → decimal strings; **unsafe JS Numbers (>2^53) FAIL CLOSED** (uint.js), hex
  with `0x` prefix is folded lowercase but **not** converted to decimal for
  hashing identity (hex-spelling vs decimal-spelling are distinct canonical
  strings — verified in Attack Lab A14.4[spelling-sub]).
- `domainHash(domain, data)` = `SHA256(utf8(domain) || utf8(canonicalize(data)))`.
- **`intentRef` = `hashIntent(intent)` = `domainHash("CGEP/1:INTENT", intent)`**
  — the content digest of the canonical intent.

**Timers** — `packages/firewall/binding.js` (Q-FW4/Q-FW4a)
- `declarationCore(declaration)` strips `{ manifestId, signature, commit }`.
- `manifestId  = computeDeclarationId(declaration)`
  `= domainHash("CGEP/1:AGENT-PROVENANCE", declarationCore(declaration))`
  (recomputed locally — the declared `manifestId` is never trusted as-is).
- `bindingRef  = computeBindingRef({ intentRef, manifestId, signature })`
  `= domainHash("CGEP/1:FW-BINDING", { intentRef, manifestId, signature })`.
- `evaluateDeclarationBinding({ intent, declaration })` → `NOT_RUN` on missing
  intent/declaration; `NOT_PROVEN: DECLARATION_INVALID` on bad
  version/kind; fails `NOT_PROVEN: DECLARATION_NOT_BOUND` when any of:
  declared intent ≠ supplied intent (canonical mismatch), chainId mismatch,
  nonce mismatch, signerBinding.address ≠ intent.signer, malformed/inconsistent
  signature envelope, recomputed manifestId ≠ declared manifestId.
  On success → `{ status:"OK", label:"BOUND", intentRef, manifestId, bindingRef,
  executionScope, chainId, nonce }`.
- `executionScopeOf(intent)` → declared prediction `{ chainId, validAfter,
  validUntil, target, selector, asset, amount, recipient }` — **envelope, not a
  tx ref**.

**EIP-712 digest/signing** — `packages/evm/signer/eip712.js`
- Domain: `name="CoreGuard AgentProof"`, `version="1"`, **`chainId` only** —
  `verifyingContract` stays ABSENT.
- Primary type `ManifestDeclaration(bytes32 manifestId)`.
- `digest = keccak256(0x1901 || domainSeparator(chainId) || structHash)`
  (`typedDataDigest("ManifestDeclaration", TYPES, { manifestId }, chainId)`).
- ⇒ the **signer signs the manifested binding, not the raw intent bytes**; the
  chainId is inside the domain separator (chain separation at signature time).

**Authority probe** — `packages/firewall/authority.js` (Q-FW1a/Q-FW10)
- Decision-time, **recomputed**, never an opaque caller boolean.
- **EOA path**: recover EIP-712 digest(manifestId, chainId) with
  `r/s/v` → recovered == signerBinding.address ⇒ `OK/RECOVERED_SIGNER`;
  malformed r/s/v ⇒ `NOT_PROVEN/SIG_MALFORMED`; mismatch ⇒
  `NOT_PROVEN/SIGNER_MISMATCH`; missing adapter ⇒ `NOT_RUN`.
- **EIP-1271 path**: read-only `isValidSignature(digest, bytes)` at
  `authorityAtState` via injected `{ ethCall, getCode }`; magic ⇒ `OK`;
  revert / wrong magic / empty code ⇒ `NOT_PROVEN`; missing
  providers/state/adapter ⇒ `NOT_RUN` (no `latest` fallback).
- Magic is **never executor proof** (T-FW3): it authorizes the manifest, not an
  execution attribution.
- `authorityAtState` is consumed **only** on the EIP-1271 path (Attack Lab A8.3:
  EOA path is provably NON-EXPLOITABLE w.r.t. that input).

**Firewall decision** — `packages/firewall/decision.js` (downstream consumer)
- Binding OK and probe OK are necessary, not sufficient: policy commitment
  (Q-FW3), simulation consistency (Q-FW5), review obligation (Q-FW7) and the
  temporal seam (Q-FW10) gate ALLOW. Decision record frozen + content-addressed:
  `decisionRef = domainHash("CGEP/1:FW-DECISION", record)`.

**Execution conformance (OUT of WS-1, cited for the seam)** —
`packages/firewall/conformance.js`
- Separate record under `CGEP/1:FW-CONFORMANCE`; a decision record is never
  mutated by a post-hoc observation. This is where EXECUTION CONFORMANCE lives.

### 2.2 NOT yet implemented / out of scope for WS-1 implementation

| Item | Gap | Relation to WS-1 |
|---|---|---|
| Single-use nonce enforcement / replay registry | No nonce-burning store today (B-2/on-chain is a non-goal) | WS-1 documents semantics; a store is NOT buildable here (Q-SIA6) |
| Key rotation registry | No key history; rotation today = new signerBinding/new manifest | WS-1 decides the *predicate* for what counts as a new authorization (Q-SIA4) |
| Relayer/executor attribution at decision time | Phase D decision has no `tx.from`; B-1 execution binding lives post-hoc | WS-1 keeps relayer vs authority as a Q item for the WS-2 SDK boundary (Q-SIA8) |
| SDK surface | None | WS-2 (post-this-design) exposes the recomputable binding contract from §4 |
| On-chain revocation | None (frozen P0/P1 untouched) | Out; only affects execution-side attestation, not pre-execution authorization |

---

## 3. Security Decision Points

### 3.0 Terminology lock (recorded at SECURITY REVIEW PASS; MIT-4 structural
clarification applied at FINAL SECURITY REVIEW PASS)

- **TL-1 (Q-DP3) — signature instance ≠ authorization identity (structural
  split, MIT-4).** Distinguish **semantic authorization identity** from the
  **binding instance fingerprint**:
  - *Semantic identity* = {intent, manifest scope, signer}: same intent +
    same manifest + same signer ⇒ **same authorization identity and scope**,
    even when a *new signature instance* is produced. A re-signature is a
    fresh **signature instance**, never a new authorization. Only a change
    to intent, signer, or any scope/binding-**semantic** term yields a
    DIFFERENT authorization.
  - *bindingRef* = closure / instance fingerprint:
    `H(CGEP/1:FW-BINDING, {intentRef, manifestId, signature})` — the
    signature is an **instance leg** of the closure, not a semantic term.
    New signature bytes ⇒ a different `bindingRef` (A3.2 preserved: a byte
    change stays **detectable tampering / binding change**) with **identical**
    semantic identity and scope — never a scope widening, never a new
    authorization. `bindingRef` is stable across re-sign only when the
    signature bytes are identical (this codebase's RFC-6979 signer is
    deterministic ⇒ true here), but the rule must NOT depend on signer
    determinism.
- **TL-2 (Q-DP5/Q-SIA5) — nonce is an authorization-binding term, NOT a
  nonce-burning mechanism.** WS-1 does **NOT** enforce replay prevention and
  does **NOT** spend/burn authorizations. Same intent + same signer + same
  manifest + same signature/binding ⇒ **same authorization scope**, which
  **MAY be replayable** — and WS-1 does not prevent that. "Nonce reuse ⇒ no
  wider scope" is a *binding-semantics* statement, never a claim that replay
  protection exists (registry/burn = B-2, separate GO).

Each point states the **decision to be ruled on** individually. Positions in
**bold** are the draft ruling — the owner approves/rejects each item.

- **Q-DP1 — "signed intent" identity.** The authoritative signed-intent object
  is the **`declaration.intent`** (canonical intent embedded in the
  declaration), NOT any separately-typed "signed intent" document. The
  decision-time `intent` input must be **canonically equal** to it
  (enforced today: `canonicalize(declaredIntent) !== canonicalize(intent)`
  fails). Draft ruling: **keep the dual (declared/input) equality check; never
  introduce a second, independent signed-intent type.**

- **Q-DP2 — linking intentDigest → manifestId → bindingRef.** The three digests
  are distinct, domain-separated and ordered:
  `intentRef = H(CGEP/1:INTENT, intent)`, `manifestId = H(CGEP/1:AGENT-PROVENANCE,
  declCore(intent…))` (embeds the intent object), `bindingRef =
  H(CGEP/1:FW-BINDING, {intentRef, manifestId, signature})`. Draft ruling:
  **the signer's authorization is over `manifestId`; `bindingRef` is the
  firewall closure; nothing downstream may consume one in place of another.**

- **Q-DP3 — re-signing:** re-issuing a signature over the *same* canonical
  intent, envelope and manifest reproduces the **same authorization identity
  and scope**: `manifestId` and the scope are unchanged **always**; `bindingRef`
  is unchanged **iff** the new signature bytes are identical (deterministic
  re-sign — true for this codebase's RFC-6979 signer, not guaranteed by the
  protocol). The signature instance is new; the authorization is **not** (TL-1).
  Signing a *different* intent yields a different `manifestId`/`bindingRef` =
  **new authorization**.
  Draft ruling: **semantic authorization identity = {intent, manifest scope,
  signer}; `bindingRef` is the instance fingerprint and the signature is an
  instance leg; a "refreshed signature instance" never upgrades, duplicates,
  or changes scope (Q-SIA3/SIA-I10); different bytes ⇒ different bindingRef
  with identical semantics (A3.2 preserved: still detectable tampering).**

- **Q-DP4 — key rotation / signer substitution.** `intent.signer` and
  `declaration.signerBinding.address` must be equal (today); changing the
  signer key means a **different authorization** under a different signer.
  Draft ruling: **rotate-the-key ⇒ rotate-the-authorization; no shadow keys at
  binding time. Key *history* (if ever needed) is a B-2 concept — non-goal here.**

- **Q-DP5 — nonce/replay semantics.** `declaration.nonce == intent.nonce` is
  enforced; nonce participates in `hashIntent` (⇒ nonce change = new
  intentRef/manifestId = new authorization). Per **TL-2**, nonce is an
  authorization-**binding term**, not a nonce-burning mechanism: the same
  signed authorization **MAY be replayable with the same scope**, and WS-1 does
  not prevent that. "Mark spent" is out of WS-1 and would require registry
  infrastructure (B-2, separate GO). Draft ruling: **replay of an *identical*
  authorization is a deterministic, accepted semantic (I5), never a scope
  widening; no spend/burn semantics exist in WS-1.**

- **Q-DP6 — chain separation.** Enforced at three independent layers: EIP-712
  domain `chainId`, `declaration.chainId == intent.chainId`, and
  `executionScope.chainId`. Cross-chain signature replay is provably detected
  (Attack Lab A7.3/A16.3). Draft ruling: **keep all three; the digest layer is
  the first line, the equality checks the second; never drop chainId from the
  EIP-712 domain.**

- **Q-DP7 — validAfter/validUntil.** They are declared in the envelope and
  compared at decision time (simulation deadline checks + policy DEADLINE). The
  **decision blockTimestamp is the controller's, not the caller's** (Attack Lab A8.5:
  caller cannot widen the window). Draft ruling: **deadline semantics are
  enforced by the engine from controller timestamps; a signed intent without
  deadlines inherits the canonical defaults (0 / +100000) as today.**

- **Q-DP8 — executionScope boundary.** `executionScopeOf(intent)` is the
  closed set `{chainId, validAfter, validUntil, target, selector, asset,
  amount, recipient}`. Draft ruling: **any future SDK must read the scope ONLY
  from the frozen record (never from a caller-supplied bindingRef), and must
  not add scope fields without a design change; "intent" extra keys cannot
  assert anything (Attack Lab A6.3).**

- **Q-DP9 — EOA vs EIP-1271.** Path is decided solely by
  `signerBinding.kind`; envelope must be consistent (`EIP-712` with EOA kind,
  `EIP-1271` with EIP1271 kind, else `CONSISTENCY_MISMATCH`). Draft ruling:
  **kind is the deterministic selector; authorityAtState is mandatory on the
  EIP-1271 path and inert on the EOA path; the magic value is contract
  authorization only, never executor proof.**

- **Q-DP10 — relayer vs authority.** At decision time the authorizer is
  `signerBinding.address`. `tx.from`/relayer attribution belongs to the
  EXECUTION side (B-1 binding, conformance) and does not exist at Phase D
  decision time. Draft ruling: **WS-1 models "who authorized" =
  signerBinding; WS-2 SDK must never let `from`/relayer authorize anything.**

- **Q-DP11 — authorization ≠ execution proof.** No pre-execution record
  (including this WS) ever embeds `executionRef`/`txHash`/`receipt` or a
  conformance verdict; the temporal seam is the Q-FW10 boundary. Draft ruling:
  **the WS-1 binding is a PRE-execution authorization; conformance is a
  separate FW-CONFORMANCE record; the two are never merged.**

---

## 4. Integration Boundary

### 4.1 Must be recomputed from trusted inputs (never trusted from caller)

| Value | Derived from | Trusted source |
|---|---|---|
| `intentRef` | `H(CGEP/1:INTENT, canonicalize(intent))` | recompute over the canonical intent |
| `manifestId` | `H(CGEP/1:AGENT-PROVENANCE, declarationCore(declaration))` | recompute; the declared `manifestId` is only a *claimed* equality target |
| `bindingRef` | `H(CGEP/1:FW-BINDING, {intentRef, manifestId, signature})` | recompute from the recomputed refs + envelope |
| recovered signer | EIP-712 `recover` (EOA) / `ethCall` magic at `authorityAtState` (1271) | injected adapters only |
| `executionScope` | `executionScopeOf(intent)` | frozen decision record |
| `decisionRef` | `H(CGEP/1:FW-DECISION, record)` | frozen record content |

### 4.2 Remains caller-supplied claim (never authorized by acceptance of a claim)

- `declaration.signature` bytes — always re-validated semantically and/or by
  recovery/call.
- `authorityAtState` — a labeled *input*, never a verdict; absence/failure ⇒
  `NOT_RUN`/`NOT_PROVEN` (fail-closed).
- Any boolean "authorization ok" or a pre-shared `bindingRef` from the caller —
  **never honored as-is**; the whole chain in §4.1 re-derives it.

### 4.3 Contract the future SDK (WS-2) must satisfy

1. Every binding-related output of an SDK call **must be recomputable**
   (supported by a `verifyBinding*` entrypoint or re-derivation) — no opaque
   token the consumer must trust.
2. The SDK **must not** return a caller-supplied `bindingRef` as trusted value;
   if a consumer passes one for reference, the SDK still recomputes.
3. `executionScope` for downstream logic **must** come from the frozen record,
   never from an intent-looking object the consumer passes separately.
4. No SDK path may cross the Q-FW10 seam (no execution evidence into a
   pre-execution binding).

---

## 5. Threat Model + Q Questions (individually approvable)

Rule for approval: each **Q-SIA** is approved or rejected as its own unit;
rejecting one does not block the others.

| ID | Question | Draft ruling (owner may replace) |
|---|---|---|
| Q-SIA1 | Can a caller present a signed declaration whose embedded intent ≠ the decision `intent`, yet have the binding accepted? | NO — canonical equality is mandatory (`DECLARATION_NOT_BOUND`) |
| Q-SIA2 | Can `intentRef`, `manifestId`, or `bindingRef` be crossed (one substituted for another)? | NO — three domain-separated values; never interchangeable (Q-DP2) |
| Q-SIA3 | Does a re-signed identical intent upgrade scope (fresh signature ⇒ broader authorization)? | NO — semantic identity stable; `bindingRef` is instance-level; never widens (Q-DP3/TL-1) |
| Q-SIA4 | Does rotating the signer key keep the old authorization alive? | NO — new signer = new authorization; no shadow keys (Q-DP4) |
| Q-SIA5 | Does nonce reuse create cross-transaction authorization? | NO — nonce is an authorization-*binding term*, not a spend/burn mechanism (TL-2): reuse is the **same** scope, never *wider*; WS-1 does **not** prevent replay (registry = B-2, separate GO) |
| Q-SIA6 | Do we build a nonce-burn/spend registry in WS-1? | NO — out of scope (registry = B-2, separate GO) |
| Q-SIA7 | Can a cross-chain replay of a signature authorize on another chain? | NO — EIP-712 domain chainId + binding chain equality (Q-DP6) |
| Q-SIA8 | Can `tx.from` / relayer identity authorize anything at decision time? | NO — relayer is execution-side; authorizer is signerBinding (Q-DP10) |
| Q-SIA9 | Can `authorityAtState` be omitted/garbled on EOA path to widen anything? | NO — inert on EOA (A8.3); mandatory on EIP-1271 (Q-DP9) |
| Q-SIA10 | Can a caller-provided `bindingRef`/boolean authorization shortcut validation? | NO — full §4.1 recompute always (integration boundary §4) |
| Q-SIA11 | Can execution evidence (executionRef/txHash/receipt) ride into a pre-execution binding? | NO — Q-FW10 temporal seam; typos in the seam are defects (A6/A12) |
| Q-SIA12 | Can a magic value alone be treated as executor proof? | NO — T-FW3; magic authorizes the manifest, never attribution |
| Q-SIA13 | Does WS-1 create a second source of truth vs Phase D? | NO — it binds and re-derives; Phase D decision semantics unchanged (Canon §0.1) |
| Q-SIA14 | Are hex-spelling and decimal-spelling of the *same value* interchangeable inside a binding? | NO for identity — distinct canonical strings → distinct intentRef/manifestId/bindingRef (A14.4[spelling-sub]) |
| Q-SIA15 | Is an unsigned or signature-less declaration ever authorizing? | NO — `NO_SIGNATURE`/envelope consistency are fail-closed (binding.js) |

### Threat notation

- The WS-1 threat set is bounded by *who can produce a valid authorization*:
  the signer (EOA key holder or EIP-1271 contract). The attacker model for the
  Lab is "*caller-controlled inputs + adapters, signer capabilities not
  delegated from a private key / un-authorized contract*". Anything requiring
  the actual key or contract magic is out of model (M4/M9 in Mutation Lab).

---

## 6. Oracles / Invariants (for security review + Attack Lab extension)

Global rule (unchanged): **unauthorized mutation → never ALLOW.**

| ID | Oracle / invariant | Must hold |
|---|---|---|
| SIA-I1 | recompute closure | Given decision inputs, every digest in §4.1 recomputes to the same value stored/returned |
| SIA-I2 | binding-completeness | `bindingRef` changes iff at least one of {intentRef, manifestId, signature} changes (collision-stable); the signature leg is an *instance leg* — its change is detectable tampering / binding change, never a scope or semantic change (TL-1/MIT-4) |
| SIA-I3 | authorization-scope | An accepted authorization's `executionScope` is byte-identical to the frozen record's scope |
| SIA-I4 | signed-intent canonical closure | `canonicalize(declaration.intent) == canonicalize(intent input)` for every BOUND result |
| SIA-I5 | signer-mandate | Every BOUND result's probe is recomputed OK (RECOVERED_SIGNER or EIP1271_MAGIC at the labeled state) — never a pass-through boolean |
| SIA-I6 | chain/scope separation | Mutation of chainId/nonce/scope term ⇒ either DENY or a DIFFERENT binding — never ALLOW on the original binding |
| SIA-I7 | seam integrity | No pre-execution binding record contains an execution token or conformance verdict (deep-scan, A6/A12 pattern) |
| SIA-I8 | determinism | Identical trusted inputs ⇒ identical intentRef/manifestId/bindingRef/scope and stable decisionRef (I5) |
| SIA-I9 | fail-closed | Missing/absent binding leg ⇒ DENY/NOT_RUN; never an implicit ALLOW |
| SIA-I10 | non-widening | Re-sign identical intent ⇒ identical authorization semantics & scope; `bindingRef` identical **iff** the signature bytes are also identical; new intent ⇒ new binding; nothing ever *widens* a previous authorization |

The follow-on Lab extension (if approved) must use the §0.1.2 `attackCheck`
harness style: family oracles inline, explicit artifact scans, and
`unauthorized mutation → never ALLOW` enforced inside each oracle.

> **Terminology note (§6, per TL-1/TL-2):** "replayable / deterministic" in
> SIA-I8/SIA-I10 means an *identical* authorization reproduces identically —
> an **accepted semantic, not a protection claim**; *identical* here includes
> identical signature bytes (TL-1). WS-1 provides no
> spend/burn; a Lab replay row therefore asserts *same scope + same identity*
> (HELD) or *scope widening* (DEFEATED) — never "replay prevented".

---

## 7. Gates

```
DESIGN              (this document, v0.1.0-design)           ── PASS
    ↓
SECURITY REVIEW     (Q-DP1..11 ruled ✅; Q-SIA1..15 ruled ✅;
                     TL-1/TL-2 terminology lock recorded)    ── PASS (conditional on lock)
    ↓
FINAL SECURITY REVIEW (release of this phase's findings)     ── PASS
    ↓
GO / NO-GO          (owner decision; NO-GO stops here)       ── PENDING
    ↓
IMPLEMENTATION      (additive only; new files/paths; §8 applies)  ── BLOCKED
```

Two hard constraints at every gate:
- **No implementation before GO** (this spec remains docs-only until then).
- **No edits to `packages/firewall/*` or frozen artifacts** unless a §8
  remediation is separately approved.

Any finding the design review produces follows §8; it is never a silent
patch inside this document's ratification.

---

## 8. Remediation Protocol

Applies to ANY security finding, in review or later in the field:

1. **Deterministic reproduction** — a minimal, repeatable reproduction (test or
   harness row) must be produced and confirmed first. The finding is not a
   finding without it.
2. **Owner decision** — yes/no/when to remediate, chosen explicitly (the owner
   may fold or reject).
3. **Atomic remediation** — one logical change, additive where possible;
   includes the reproduction as a permanent regression test.
4. **Full regression** — `npm test` (baseline + prior suites), benchmark at the
   frozen baseline, `git diff --check`; frozen `verify-live.json`/P0/P1
   unchanged by hash.
5. **Re-verify** the affected gates; an approved remediation does NOT reopen the
   CLOSED / PASS boundary of prior phases — it is recorded as its own commit
   with its own rationale.

## The Full Chain (WS-1 scope, AUTHORIZATION side)

```
        authorized by signing (EIP-712 digest over manifestId, domain chainId)
                  │
Intent ──canonicalize──▶ canonical intent ──H(CGEP/1:INTENT)──▶ intentRef
                                                                    │
Declaration (embeds intent, kind, signerBinding, signature) ────────┤
   │                                                                 │
   │ H(CGEP/1:AGENT-PROVENANCE, declCore)                            │
   ▼                                                                 │
manifestId ─────────────────────────────────────────────────┐        │
   │                                                         │        │
   │ H(CGEP/1:FW-BINDING, {intentRef, manifestId, signature})◀─┘        │
   ▼                                                         │         │
bindingRef ──────────────────────────────────────────────────┘         │
   │                                                                   │
   ▼  (probe recomputed: recover / EIP-1271 magic at labeled state)    │
executionScope ──── REFUSES entry to ALLOW unless *_all* of:            │
        binding OK ∧ probe OK ∧ policy committed/satisfied ∧           │
        sim consistent ∧ ¬review obligation (IN8)                      │
   │                                                                   │
   ▼                                                                   │
Firewall DECISION  ◀────── intentRef contributes to the record ────────┘
```

```
AUTHORIZATION          (this document: signed intent → binding → scope)
     ≠
EXECUTION CONFORMANCE  (post-hoc FW-CONFORMANCE record; OUT of WS-1)
```

---

**End of v0.1.0-design. Docs-only.**

**Gate record (2026-09-14):**
- DESIGN — PASS
- SECURITY REVIEW — PASS, **conditional on the terminology lock** (§3.0 TL-1/TL-2: Q-DP3 signature-instance ≠ authorization-identity; Q-DP5/Q-SIA5 nonce = binding term, not replay/burn enforcement). All Q-DP1..11 approved; all Q-SIA1..15 approved (Q-SIA5 with the same TL-2 clarification). §4 Integration Boundary and §6 Oracles approved as stated.
- FINAL SECURITY REVIEW — PASS · UNCONDITIONAL (2026-09-14). MIT-1..4 applied (docs-only): (1) A14.4[spelling-sub] citation corrected (was "A14.6"); (2) Q-DP7 blockTimestamp typo ("1" removed); (3) §7 phrasing repaired; (4) TL-1/Q-DP3/Q-SIA3/SIA-I2/SIA-I10 structural split — semantic authorization identity vs `bindingRef` instance fingerprint; signature = instance leg; new bytes ⇒ new bindingRef with identical semantics (A3.2 tamper-evidence preserved). No SUT change, no Attack Lab re-run, no `packages/firewall/*` edit.
- GO / NO-GO — PENDING OWNER DECISION
- IMPLEMENTATION — BLOCKED (correctly; no code before GO)