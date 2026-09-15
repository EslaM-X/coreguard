# C Verifier — CGEP/1 Independent Verifier (Verifier C)

**Version**: 0.1.0-design · **Status**: DESIGN APPROVED — Dec-C-1..11 APPROVED BY OWNER (2026-09-14) · SECURITY REVIEW PASS · FINAL SECURITY REVIEW PASS · **OWNER GO GRANTED (2026-09-14)** → IMPLEMENTATION DONE → IMPLEMENTATION REVIEW PASS → RELEASE BOUNDARY REVIEW PASS → **C VERIFIER CLOSED · FROZEN WITHOUT COMMIT/TAG** · RELEASE NOT AUTHORIZED
**OWNER RULING (2026-09-14)**: ALL of Dec-C-1..11 approved as written, with a single qualification on Dec-C-9 (reproducibility wording, stated verbatim below).No edit to the decision texts or grounds is permitted without a new owner decision.
**Parent**: CGEP/1:AGENT-PROVENANCE · **Predecessors**: WS-1 (signed-intent-authorization.md, FROZEN WITHOUT TAG) · WS-2 (signed-intent-sdk.md, CLOSED · FROZEN WITHOUT COMMIT/TAG) · WS-3 (independent-verifier.md, CLOSED · FROZEN WITHOUT COMMIT/TAG) · v0.2.0 release boundary FROZEN RELEASE-READY WITHOUT COMMIT/TAG
**Boundary**: additive, docs-only until GO. A THIRD, independent re-derivation of the SAME CGEP/1 protocol facts (canonicalize → refs → scope → authority), implemented in stdlib-only Python; never trusts any JS-SDK or WASM result; C never participates in a decision; any divergence from the reference = HOLD.
**Date**: 2026-09-14

---

## 0. Canon and Ground Rules (fixed before review)

1. **C completes the start of the Three Verifiers Rule.** Verifier A = JS
   reference (zero-dep core + WS-1/WS-2 + Phase D). Verifier B = WS-3 Rust/WASM
   (independent). Verifier C = this workstream: a third implementation in a
   third runtime. "A protocol fact is only as trustworthy as the weakest
   independent verifier that confirms it."
2. **Independence is the product.** C computes canonicalization, hashing,
   domain separation, and signer recovery itself. It never imports, consults,
   or trusts `@coreguard/sdk`, the WASM verifier, or any JS result as a source
   of truth. There is no shared code with A or B.
3. **Same protocol semantics — pinned, not re-negotiated.** The exact
   canonicalization rules, hash domains, EIP-712 domain/type constants, status
   vocabulary, fail-closed behavior, atState/reason envelope semantics, and
   probe semantics of WS-1/WS-2/WS-3 are the specification C must satisfy
   byte-for-byte.
4. **Divergence = HOLD, never reconciliation.** If C disagrees with the
   reference (A) or with B on ANY input, the three-way differential test FAILS
   and is treated as a security finding per §7. No automatic harmonization, no
   best-effort acceptance.
5. **no code before GO.** DESIGN → SECURITY REVIEW → FINAL SECURITY REVIEW →
   GO / NO-GO → IMPLEMENTATION (§6). Docs-only until then.
6. **Additive only.** New paths (`packages/verifier-c/`, `test/verifier-c/`),
   this spec, additive runner registration. No edits to `packages/firewall/*`,
   WS-1/WS-2/WS-3 sources or specs, the Attack Lab, frozen artifacts, or shared
   lockfiles. No on-chain anything. No commit/tag/release implied by any GO.
7. **Reproducibility, not runtime attestation (Dec-C-9, owner-required
   wording):** Python interpreter version + verifier source checksum provide
   *reproducibility metadata for the C implementation*; they do **not**
   constitute a cryptographic attestation of the interpreter/runtime itself.

---

## 1. Decision Record — Dec-C-1..11 (approved 2026-09-14)

| # | Decision | Ruling |
|---|---|---|
| Dec-C-1 | Runtime/language | **APPROVED**: Python 3.14 stdlib-only, zero pip dependencies, script-based (no compiled exe) — passes App Control and preserves the "self-contained" property of B. |
| Dec-C-2 | Scope of re-derivation | **APPROVED**: full CGEP/1 chain (canonicalize → refs → scope → authority) with byte-parity vs A and B; C never trusts A or B results. |
| Dec-C-3 | Crypto | **APPROVED**: Keccak-256 self-implemented (not in stdlib), secp256k1 recovery self-implemented (not in stdlib), SHA-256 via `hashlib` (platform primitive, not protocol logic). |
| Dec-C-4 | JSON engine | **APPROVED**: stdlib `json` as a third distinct serializer, with the CGEP/1 canonicalization rules themselves implemented in C (key order, number normalization, string escaping pinned to A/B). |
| Dec-C-5 | Authority / EIP-1271 | **APPROVED**: C re-derives EIP-1271 digest/calldata and magic decode from canonical inputs; the RPC witness (`transport`/provider, call context) is injected from outside. C performs no RPC and never decides. |
| Dec-C-6 | Interface | **APPROVED**: library-only `verify*` surface mirroring B's `verifyRaw` contract (envelope, atState, fail-closed, throw-on-invalid). No CLI. |
| Dec-C-7 | Differential | **APPROVED**: three-way differential A↔B↔C on the same corpus (WS-3 vectors + adversarial perturbations). At least two independent engines must equal A on every accepted input. |
| Dec-C-8 | Paths/naming | **APPROVED**: `packages/verifier-c/` + `test/verifier-c/` + additive runner registration. |
| Dec-C-9 | Determinism/artifact | **APPROVED, with qualification**: pinned Python version + source checksums recorded as **reproducibility metadata** (quoted wording in §0.7). No claim of interpreter/runtime attestation. |
| Dec-C-10 | Red lines | **CONFIRMED**: no edits to A/B/WS-1/WS-2/WS-3/firewall/frozen; no RPC/network; C never participates in any decision; no publish; no AI semantics. |
| Dec-C-11 | Lifecycle | **APPROVED**: DESIGN → SECURITY REVIEW → FINAL SECURITY REVIEW → OWNER GO / NO-GO → IMPLEMENTATION → IMPLEMENTATION REVIEW → RELEASE BOUNDARY REVIEW → CLOSE/FREEZE without commit/tag. |

---

## 2. Re-derivation pipeline (same chain as B, Python implementation)

```
canonicalize   (C's own implementation, byte-identical to A/B reference)
    ↓
refs           (domainHash / typedDataDigest / EIP-1271 selector+calldata;
                EIP-712 domain+type constants identical to A/B)
    ↓
scope          (executionScope byte-identical to the frozen record's
                binding.executionScope; separate scope never accepted)
    ↓
authority      (ECRECOVER-recovered signer from self-implemented recovery;
                EIP-1271 magic outcome vs injected witness; C never calls RPC)
```

---

## 3. Components

- **`keccak256`** — self-implemented Keccak-256 (pre-NIST padding); verified
  against the same test vectors as B (`""`, `"abc"`, selector bytes). No
  stdlib/`hashlib` raw Keccak exists — `hashlib.sha3_*` is NIST SHA3 and must
  NOT be substituted.
- **secp256k1 recovery** — self-implemented (no stdlib ECC): point arithmetic,
  modular inverse, recovery (`recid` 0/1 ⇒ `x = r`; parity rule; `v` 27/28;
  identical failure messages `recover: r out of range` / `recover: s out of
  range` / `recover: v must be 27 or 28` / `recovery id 2 or 3 invalid`).
- **SHA-256** — `hashlib.sha256` (platform primitive; a third distinct
  implementation). Documented: stdlib use is not "protocol logic".
- **JSON/canonicalize** — stdlib `json` for parsing/serialization + C's own
  CGEP/1 canonicalization rule logic (identical key order, number
  normalization, string escaping).
- **Envelope/state semantics** — identical to B: `{ok, reason?, kind?, result}`
  10-key canonical envelope; `reason` omitted on `OK`; `throw`/`input_error`
  kinds raise; `atState` passed through as raw value with `null` for
  `NO_AUTHORITY_STATE`; authority-at-state re-derived from canonical state
  inputs.

---

## 4. Threat model (C-specific)

C adds no new attacker capability; the threat set remains bounded by who can
produce a valid signed authorization. The added surface is:

| T-C | Threat | Mitigation |
|---|---|---|
| TC-1 | C crypto defect (keccak/recovery) | three-way differential A↔B↔C + fixed vector parity (same oracles as W3-I1/I2/I11); any drift = HOLD |
| TC-2 | Python numeric safety | arbitrary-precision ints must enforce the SAME fail-closed numeric bounds as B (uint256/chainId domains); exact-bound parity is an implementation gate; mismatch = HOLD |
| TC-3 | JSON/canonicalization divergence | byte-parity corpus vs A and B (W3-I3 style); perturbation matrix reused (W3-I10 style) |
| TC-4 | Runtime interposition (PYTHONSTARTUP/sitecustomize) | record interpreter + checksum as reproducibility metadata only (Dec-C-9); C's trust rests on the differential and the pinned semantics, not on runtime attestation |
| TC-5 | C never decides | no CLI, no RPC, no network, no Firewall/decision-engine coupling (Dec-C-5/6/10) |

---

## 5. Gates

```
DESIGN              (this document; Dec-C-1..11 ruled)          ── DONE (2026-09-14)
    ↓
SECURITY REVIEW     (design points individually re-checked)     ── PASS (2026-09-14; C-SR-1..6 = 6/6)
    ↓
FINAL SECURITY REVIEW (one-block re-check; findings CLOSED)     ── PASS (2026-09-14; FSR-C-1..6 = 6/6 CLOSED · 0 findings)
    ↓
GO / NO-GO          (owner decision; NO-GO stops here)          ── GO GRANTED (2026-09-14) — implementation only
    ↓
IMPLEMENTATION      (additive only; new paths; checksums)       ── DONE (53/53 C tests pass; 565/565 full suite; 73/73 benchmark; git diff --check clean)
    ↓
IMPLEMENTATION REVIEW   (three-way differential + adversarial)  ── PASS (2026-09-14; owner-reviewed evidence)
    ↓
RELEASE BOUNDARY REVIEW (additive only; A/B/WS-1..3/frozen untouched) ── PASS (2026-09-14; additive-only boundary verified)
    ↓
CLOSE / FREEZE          (without commit/tag)                    ── C VERIFIER CLOSED · FROZEN WITHOUT COMMIT/TAG (2026-09-14)
```

Hard constraints at every gate: **no implementation before GO**; **no edits to
`packages/firewall/*`, WS-1/WS-2/WS-3 sources+specs, the Attack Lab, or frozen
artifacts**; divergence from the reference is a §7 finding, never a silent
patch.

---

## 6. Delivery expectations (post-GO only; not now)

- `packages/verifier-c/`: stdlib-only Python package (no pip deps), library
  surface `verify*` mirroring B's `verifyRaw`.
- `test/verifier-c/`: three-way differential A↔B↔C + adversarial/mutation
  reuses; suites registered in `scripts/run-tests.mjs` (additive).
- Reproducibility metadata (Dec-C-9): recorded Python version + source
  checksums — **not** an interpreter/runtime attestation.
- Full `npm test` (existing suites unchanged and green), benchmark at frozen
  baseline, `git diff --check`, frozen-artifact hashes.
- NO commit/tag/release within the GO; decision engine untouched; C never
  participates in a decision.

---

## 7. Remediation Protocol

Same as WS-1/WS-2/WS-3 §8: deterministic reproduction → owner decision →
atomic remediation with a permanent regression test → full regression (`npm
test`, three-way differential corpus, benchmark, `git diff --check`,
frozen-integrity) → re-verify affected gates.

---

## The Three Verifiers Rule (framing, after C)

```
Verifier A  JS reference (zero-dep core + WS-1/WS-2 + Phase D)  [exists]
Verifier B  WS-3 independent Rust/WASM verifier                [closed, frozen]
Verifier C  Python stdlib-only independent verifier            [this workstream]
A protocol fact is trusted ≥ when the reference and every shipped verifier
AGREE on it. ANY divergence = HOLD + §7 investigation. C must agree with A on
every accepted input and with B on every shared input; B↔C disagreement alone
is a §7 finding regardless of agreement with A.
```

**End of v0.1.0-design. Docs-only until GO.**

**Gate record (2026-09-14):**
- DESIGN — drafted; environment facts observed (Python 3.14.6 + pip 26.2.1
  present; `hashlib` exposes sha256 but NOT raw Keccak-256; no secp256k1 in
  stdlib; Go 1.26.5 present but exe output is App-Control-blocked). Owner
  DESIGN REVIEW: **ALL Dec-C-1..11 APPROVED as written** with the Dec-C-9
  qualification recorded verbatim in §0.7 — design LOCKED at v0.1.0.
- SECURITY REVIEW — PASS (2026-09-14): C-SR-1..6 = **6/6 PASS · 0 findings** —
  numeric fail-closed parity with B (TC-2) · envelope/atState/reason/raise
  semantics identical to B's `verifyRaw` · Keccak-256 + secp256k1 self-implemented
  (no `hashlib.sha3_*` substitute; recovery messages verbatim) · stdlib `json`
  serializer only with C-owned canonicalization rules + byte-parity differential ·
  Dec-C-9 wording preserved (reproducibility metadata, NOT runtime attestation) ·
  C independence + B↔C divergence = §7 finding. No redesign required.
- FINAL SECURITY REVIEW — PASS (2026-09-14): FSR-C-1..6 = **6/6 CLOSED ·
  0 FINDINGS** — self-contained re-derivation · pinned envelope/atState/reason/
  raise semantics · numeric fail-closed parity (TC-2) · red lines (no edits to
  A/B/WS-1..3/firewall/frozen, no RPC/network, C never decides, no publish, no
  AI semantics) · Dec-C-9 wording preserved · lifecycle (no implementation
  before GO; closure = freeze without commit/tag). No open gap ⇒ no HOLD, no
  redesign.
- GO / NO-GO — **GO GRANTED (2026-09-14)** — implementation ONLY, additive:
  `packages/verifier-c/` + `test/verifier-c/` + additive runner registration.
  No commit/tag/push/publish; no edits to A/B/WS-1..3/firewall/frozen; no pip
  deps; no `hashlib.sha3_*` as Keccak substitute; no RPC/network; C never
  participates in a decision; no AI semantics. RELEASE NOT AUTHORIZED.
- IMPLEMENTATION — DONE (2026-09-14): additive only — `packages/verifier-c/` (9
  files: `_json`, `_keccak`, `_secp`, `_canon`, `_pipeline`, `__init__`,
  `bridge.py`, `index.js`, `METADATA.json`, `README.md`) + `test/verifier-c/`
  (5 files: `helpers.js` + `differential` + `adversarial` + `canonicalize` +
  `metadata` tests — 53 total) + additive runner registration in
  `scripts/run-tests.mjs`. Full `npm test` = **565/565 pass** (512 baseline + 53
  C); benchmark = **73/73 pass**; `git diff --check` clean; frozen hashes
  untouched; A/B/WS-1..3/Firewall/frozen evidence untouched; no external pip
  deps; no RPC/network; no decision participation; no AI semantics; C keccak
  independently implemented (no `hashlib.sha3_*`); C secp256k1 independently
  implemented; `guardSeam` limited to `run()` only; `verifyRaw` + `txHash` →
  `refused` preserved; Dec-C-9 wording preserved (reproducibility metadata, NOT
  runtime attestation).
- IMPLEMENTATION REVIEW — PASS (2026-09-14): owner-reviewed evidence. A↔B↔C
  envelope/canon parity demonstrated across full differential (16 scenarios),
  adversarial mutations (16 scenarios), canonicalization corpus (14 reference
  values + full intent/declaration/binding), and metadata/bridge integrity.
  All 53 C-specific tests pass; all baseline gates unchanged at 512/565 + 73/73.
  No deviation found; no §7 finding; no redesign required.
- RELEASE BOUNDARY REVIEW — PASS (2026-09-14): owner-ruled, no findings.
  Tracked-change set vs HEAD verified additive-only: `package-lock.json` (+30,
  pre-existing WS-1..3 regen), `scripts/run-tests.mjs` (+1 additive suite),
  spec docs (gate records). Protected/frozen paths untouched (`packages/sdk/`,
  `packages/independent-verifier/` incl. WASM + sha256, `packages/firewall/`,
  Attack Lab, `verify-live.json`, P0/P1/anchor); `git diff --check` clean. No
  runtime/pip dependencies; no RPC/network; no decision participation; no AI
  semantics; Dec-C-9 wording preserved. no deviation, no §7 finding. `after`
  close hooks in C test files are test-process cleanup only — protocol
  semantics unchanged.
- CLOSE / FREEZE (2026-09-14) — **C VERIFIER CLOSED · FROZEN WITHOUT
  COMMIT/TAG** per owner ruling. This does NOT authorize release and does NOT
  change v0.2.0 state; the commit/tag/push/publish decision remains separate
  and RELEASE NOT AUTHORIZED stands.