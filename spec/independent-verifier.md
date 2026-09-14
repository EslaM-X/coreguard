# Independent Verifier — WS-3 Design

**Version**: 0.1.0-design · **Status**: DESIGN REVIEWED — Q-W3-1..12 APPROVED BY OWNER (2026-09-14) · SECURITY REVIEW PASS · FINAL SECURITY REVIEW PASS · **GO / NO-GO — OWNER GO GRANTED (2026-09-14)** — additive implementation only; does NOT imply commit/tag/release · IMPLEMENTATION **COMPLETE** · **IMPLEMENTATION REVIEW PASS · RELEASE BOUNDARY REVIEW PASS (2026-09-14)** — artifact SHA-256 7CDA8E1B928DB3099579969FD614B8D8D5109988D24596550236537F9FD61C3D · build-gate regeneration byte-identical PASS · independent suite 58/58 · `npm test` 512/512 · 73/73 benchmark · `git diff --check` clean · **CLOSED — FROZEN WITHOUT COMMIT/TAG (OWNER DECISION 2026-09-14)**
**OWNER RULING (2026-09-14)**: ALL of Q-W3-1..12 approved as written. No edit to the decision texts or grounds is permitted without a new owner decision.
**Parent**: CGEP/1:AGENT-PROVENANCE · **Predecessors**: WS-1 (signed-intent-authorization.md, FROZEN WITHOUT TAG), WS-2 (signed-intent-sdk.md, CLOSED · FROZEN WITHOUT COMMIT/TAG)
**Boundary**: additive; docs-only until GO (GO granted 2026-09-14 → additive implementation only, no commit/tag/release). A Rust/WASM verifier INDEPENDENT of the JavaScript reference; re-derives the cryptographic/provenance chain from canonical inputs; never trusts JS-SDK results; any divergence from the reference = HOLD.
**Date**: 2026-09-14

---

## 0. Canon and Ground Rules (fixed before review)

1. **WS-3 begins the Three Verifiers Rule.** The protocol currently rests on one
   reference implementation (the JS zero-dep core + WS-1/WS-2 + Phase D).
   WS-3 adds a SECOND, independent re-derivation of the SAME protocol facts
   (canonicalization → refs → scope → authority) from raw canonical inputs,
   written in Rust and compiled to WASM. The goal is trust upgrade, not new
   features: "a protocol fact is only as trustworthy as the weakest independent
   verifier that confirms it".
2. **Independence is the product.** The WASM verifier performs the canonicalize
   + hashing + signer-recovery itself. The JS layer is transport/marshalling
   only: it loads the WASM binary and moves JSON bytes; it NEVER evaluates a
   protocol fact. The WASM verifier never imports, consults, or trusts
   `@coreguard/sdk` (or any JS result) as a source of truth.
3. **Same protocol semantics — pinned, not re-negotiated.** The exact
   canonicalization rules, hash domains, EIP-712 domain/type constants, status
   vocabulary, fail-closed behavior, and probe semantics of WS-1/WS-2 are the
   specification WS-3 must satisfy byte-for-byte.
4. **Divergence = HOLD, never reconciliation.** If the independent verifier
   disagrees with the reference on ANY input, the differential test FAILS and
   is treated as a security finding per §8. There is no automatic
   "harmonization" of the reference, no silent re-derivation, and no
   best-effort acceptance of the WASM output.
5. **no code before GO.** DESIGN → SECURITY REVIEW → FINAL SECURITY REVIEW →
   GO / NO-GO → IMPLEMENTATION (§7). Docs-only until then.
6. **Additive only.** New paths (`packages/independent-verifier/`,
   `test/independent-verifier/`). No edits to `packages/firewall/*` (Phase D
   semantics), WS-1/WS-2 sources or specs, the Attack Lab, frozen artifacts, or
   shared lockfiles other than the NEW Rust `Cargo.lock` and any new generation
   script. No on-chain anything.

---

## 1. Scope & Non-Goals

### 1.1 Owner decision (2026-09-14, recorded)

**PROCEED WITH WS-3 DESIGN — Independent Rust/WASM Verifier.** No code before
the design + Security Review + Final Security Review + OWNER GO. Commit/tag/
release remain a separate owner decision after Implementation + Release
Boundary Reviews.

### 1.2 Scope (in)

- A new additive workspace package `@coreguard/independent-verifier`
  containing:
  - `rust/` — a pinned-toolchain Rust crate (Cargo.toml + committed Cargo.lock
    + rust-toolchain.toml) that compiles to a **self-contained WASM module**:
    no wasm function imports, `panic = "abort"`, arithmetic overflow
    protection, fixed-size interfaces.
  - A committed WASM build artifact (reviewable binary diff) that `npm test`
    consumes WITHOUT requiring a Rust toolchain (hermetic, Node >=18 only), and
    a build-gate that regenerates the artifact from source and FAILS on drift
    (= HOLD).
  - A thin ESM JS wrapper (`index.js`) that only loads the WASM bytes,
    instantiates, marshals JSON in/out, and rejects post-execution inputs —
    never evaluating a protocol fact.
- The independent re-derivation pipeline (§4), byte-identical to the reference:
  canonicalize → intentRef → manifestId → bindingRef → decisionRef/scope →
  authority (EOA recovery; EIP-1271 via an injected transport bound to the
  verifier's own digest+calldata).
- WS-3 tests (additive): differential parity corpus, adversarial/mutation
  suite against the WASM verifier, artifact-integrity and boundary checks.
- A documented consumer contract (README) stating the HOLD-on-divergence rule
  and the Three Verifiers Rule framing.

### 1.3 Non-Goals (out)

- **NO** re-execution, sim, or decision: the independent verifier reports
  PROTOCOL FACTS (status/label/refs/scope), never an ALLOW/DENY/REQUIRE_REVIEW
  decision. The Firewall stays the decision owner.
- **NO** edits to `packages/firewall/*`; no change to Phase D decision,
  review, resolution, or conformance semantics.
- **NO** edits to WS-1 (`packages/intent`, `packages/provenance`
  authorization surfaces) or WS-2 (`packages/sdk`), and their specs.
- **NO** reopening or editing of the Attack Lab.
- **NO** acquired trust of `@coreguard/sdk` results inside the verifier path.
- **NO** new JS dependencies; the existing zero-dep core boundaries survive.
- **NO** CLI extension, no DApp surface, no Python binding.
- **NO** B-2 registry / nonce-burning / on-chain approval or revocation.
- **NO** new cryptographic primitives — only re-implementations of exactly
  what the reference already uses (SHA-256, Keccak-256, secp256k1 recover,
  EIP-712 digest), behind the same isolated-adapter discipline.
- **NO** new verdict vocabulary; same `OK / NOT_PROVEN / NOT_RUN` statuses and
  existing failure labels.
- Commit/tag/release are NOT granted by any WS-3 GO.

---

## 2. Current-State Inventory (observed)

- Runtime: Node `>=18` (root `package.json`), `"type":"module"`, npm
  workspaces `packages/*`. Installed Node is v24.
- Rust toolchain present on this machine (`cargo`/`rustc`); **`wasm32` target
  is NOT installed** (`x86_64-pc-windows-msvc` only). Design rule: a pinned
  `rust-toolchain.toml` + `rustup target add wasm32-unknown-unknown` is a
  build-time requirement, and the COMMITTED artifact keeps the test-time path
  Rust-free.
- Foundry/Solidity tooling already exists (`foundry.toml`, `contracts/`) — a
  repo precedent for non-JS toolchains living beside npm.
- The cryptographic chain to re-derive (reference facts, pinned):
  - Domains: `CGEP/1:INTENT`, `CGEP/1:AGENT-PROVENANCE`, `CGEP/1:FW-BINDING`,
    `CGEP/1:FW-DECISION`.
  - `canonicalize`: `null`→`null`; boolean→`true/false`;
    safe-int numbers→decimal string (unsafe ⇒ fail); strings starting `0x`→
    lowercased JSON string; arrays→`[…]`; objects→keys sorted (all canonical
    keys are ASCII identifiers, so JS UTF-16 sort == byte sort); then
    `domainHash(d,x) = sha256(utf8(d) ‖ utf8(canonicalize(x)))` → `0x…`.
  - `intentRef = H(CGEP/1:INTENT, intent)`;
    `manifestId = H(CGEP/1:AGENT-PROVENANCE, declarationCore(declaration))`;
    `bindingRef = H(CGEP/1:FW-BINDING, {intentRef, manifestId, signature})`;
    `decisionRef = H(CGEP/1:FW-DECISION, recordWithoutDecisionRef)`.
  - EIP-712 (EOA): domain `{name:"CoreGuard AgentProof", version:"1",
    chainId}` — verify fields `EIP712Domain(string name,string version,uint256
    chainId)`; primary `ManifestDeclaration(bytes32 manifestId)`;
    `digest = keccak256(0x1901 ‖ domainSeparator ‖ structHash)`; signer via
    secp256k1 recovery.
  - EIP-1271: magic `0x1626ba7e…`; `isValidSignature` read at a PINNED block
    via an injected transport; NO `latest` fallback; `from` is caller context
    (probe semantics only).
- Reference verdict semantics: `OK/NOT_PROVEN/NOT_RUN`; fail-closed; a
  supplied authorization claim is never trusted; execution evidence is rejected
  at the pre-execution seam.

---

## 3. Security Decision Points (Q-W3-1..12 — for owner ruling)

Each point is ruled on as its own unit at the SECURITY REVIEW gate; a rejection
does not block the others.

- **Q-W3-1 — Surface & location.** A new additive workspace package
  `@coreguard/independent-verifier` (ESM wrapper + `rust/` crate + committed
  WASM + `Cargo.lock` + pinned `rust-toolchain.toml`). Proposed ruling:
  **approved** — library only, no CLI/DApp; the package is the verifier's home.
- **Q-W3-2 — Artifact & toolchain policy.** `npm test` runs against a COMMITTED
  WASM artifact (hermetic on Node >=18, no Rust required); a build script
  regenerates the artifact from pinned source and the build gate FAILS on any
  byte drift (= HOLD). Proposed ruling: **approved** — deterministic CI plus a
  tamper/refresh detector; the artifact diff is reviewable.
- **Q-W3-3 — Independence boundary.** The WASM module performs canonicalize +
  all hashes + signer recovery; the JS wrapper only loads/instantiates the
  WASM and moves JSON; it never computes a protocol fact and never imports or
  trusts `@coreguard/sdk` results. Test-harness imports of the reference
  (for differential comparison ONLY) do not touch the verifier path. Proposed
  ruling: **approved**.
- **Q-W3-4 — Semantics parity as a hard gate.** The verifier's every output
  (refs, scope, status/labels) must be identical to the reference for the
  committed differential corpus; ANY divergence fails the suite and is a §8
  finding — never silently reconciled. Proposed ruling: **approved**.
- **Q-W3-5 — Crypto dependencies.** Rust crates pinned via `Cargo.lock`:
  `sha2` (SHA-256), `sha3` (Keccak-256), `k256` (secp256k1 recovery), plus a
  minimal JSON parser; all MIT/Apache-2.0 AND-or-MIT compatible; the
  dependency-gate criteria (docs/dependency-gate.md, extended for crates) must
  be re-satisfied (10/10) before a crate is added. Proposed ruling:
  **approved**.
- **Q-W3-6 — Pre-execution seam.** The verifier is PRE-execution: execution
  evidence (`executionRef`, `txHash`, `receipt`, `CONTRACT_AUTHORIZATION`,
  `CONTRACT_EXECUTION_BINDING`, `executionBlock`) is rejected at the JS
  boundary (TypeError) and structurally refused inside WASM; results never
  carry execution or conformance artifacts. Proposed ruling: **approved**.
- **Q-W3-7 — EIP-1271 truth model.** The WASM verifier builds the digest and
  `isValidSignature` calldata ITSELF; the injected JS transport performs the
  read at the pinned block and returns the RAW response; WASM binds the
  response to {contract, block, its own digest/calldata} and checks the magic.
  Missing transport/state ⇒ `NOT_RUN`; no `latest` fallback; `from` = probe
  caller context only. Proposed ruling: **approved** (semantics identical to
  reference; the RPC witness is injected, exactly as in WS-1/WS-2).
- **Q-W3-8 — Fail-closed & determinism.** Same status vocabulary
  (`OK/NOT_PROVEN/NOT_RUN`), same labels, and pinned-state determinism: same
  inputs + same pinned authority state/context ⇒ identical result; no promise
  across different blockchain states. Proposed ruling: **approved**.
- **Q-W3-9 — Never a decision input.** WS-3's verifier is an outward protocol
  fact-checker; it is NOT wired into `decideFirewall`, does not replace the
  decision engine, and is not a dependency of the reference in any direction.
  Proposed ruling: **approved**.
- **Q-W3-10 — Differential corpus + adversarial suite.** Committed oracle
  fixtures (EOA + EIP-1271 + invalid/tampered) run through BOTH the reference
  and the WASM verifier with byte-equal expectations, plus a mutation suite
  against the WASM verifier (tampered intent/declaration/record/signature ⇒
  deterministic change or failure, never silent acceptance). No Attack Lab
  changes. Proposed ruling: **approved**.
- **Q-W3-11 — Memory & numeric safety.** Release profile sets
  `overflow-checks = true`, `panic = "abort"`, small/optimized codegen,
  bounded JSON depth/size, and a tested alloc/free ABI; malicious inputs can
  only produce `NOT_RUN`/`NOT_PROVEN` or a documented error, never UB, and
  never an invented success. Proposed ruling: **approved**.
- **Q-W3-12 — Artifact integrity & supply chain.** The committed WASM's SHA-256
  is recorded; the build gate recomputes and fails on drift; crate versions are
  pinned; licenses audited; `cargo audit`/`cargo deny` (or the 10-criterion
  gate) must be clean before the artifact is committed. Proposed ruling:
  **approved**.

---

## 4. Verification Pipeline (what the independent verifier re-derives)

Same shape as WS-2 §4.0, but computed in WASM from raw inputs:

```
input record   (canonical intent + signed declaration + frozen decision
                record + optional caller reference + injected witnesses —
                UNTRUSTED until recomputed and validated)
   ↓
canonicalize   (WS-3's own implementation, byte-identical to reference)
   ↓
intentRef      H("CGEP/1:INTENT", intent)
   ↓
manifestId     H("CGEP/1:AGENT-PROVENANCE", declarationCore(declaration))
   ↓
bindingRef     H("CGEP/1:FW-BINDING", {intentRef, manifestId, signature})
   ↓
decisionRef    H("CGEP/1:FW-DECISION", recordWithoutDecisionRef)
   executionScope  ← record.binding.executionScope ONLY (FSR-1 semantics);
                     byte-identity vs predicted scopeOfIntent (SIA-I3)
   ↓
authority      EOA: EIP-712 digest (own impl) + secp256k1 recovery
                EIP-1271: own digest+calldata → injected transport → magic (raw)
   ↓
return independently derived result   (same vocabulary, fail-closed)
```

Hard rules carried unchanged from WS-1/WS-2:
- Claim channels (`bindingRef`, `executionScope`, `authorized`, `relayer`) are
  never honored; a caller-supplied `bindingRef` is reference-only comparison —
  mismatch ⇒ deterministic `NOT_PROVEN` / `BINDING_REFERENCE_MISMATCH`.
- `executionScope` comes from the frozen decision record only (never a
  separately-supplied intent/scope object).
- `from`/relayer never authorize; `from` is EIP-1271 caller context.
- Missing anything ⇒ `NOT_RUN`/`NOT_PROVEN`; never an implicit OK.
- No `latest` fallback; pinned authority state required.

The reference (test harness only) and the WASM verifier consume IDENTICAL
fixture inputs; the differential oracle requires byte-identical refs and equal
statuses/labels/scope. Divergence ⇒ suite failure ⇒ §8 finding.

---

## 5. Threat Model (WS-3-specific)

WS-3 adds no new attacker capability — the threat set is still bounded by
"who can produce a valid authorization" (EOA key or EIP-1271 contract). The
WS-3 risk surface is:

- **Implementation drift**: an independent re-derivation that subtly differs
  (canonicalize coercion, sort order, padding, digest formula) would produce a
  "verifier" that agrees with a DIFFERENT protocol than the reference. Mitigated
  by W3-I2/W3-I4/W3-I11 differential parity and the HOLD rule.
- **Silent reconciliation**: a harness that "fixes" mismatches instead of
  failing. Mitigated by W3-I12 (drift ⇒ test failure) and §8.
- **JS-layer betrayal**: a wrapper that smuggles a trust decision or echoes an
  input into a "derived" output. Mitigated by W3-I9/W3-I13 (import graph +
  marshalling-only scan + seam rejection).
- **Adversarial numeric/structural inputs**: non-canonical integers, deep
  nesting, overflow, malformed 0x. Mitigated by W3-I10/W3-I11 (overflow-checks,
  bounded parse, panic=abort, fail-closed).
- **Artifact tampering**: a substituted WASM. Mitigated by W3-I12 (recorded
  hash + build-gate regeneration drift check).

---

## 6. Oracles / Invariants (for security review + tests)

| ID | Oracle / invariant | Must hold |
|---|---|---|
| W3-I1 | independent recompute closure | WASM outputs recompute to the same values from the same inputs, deep, every call — never memoized-on-claim |
| W3-I2 | differential parity (canonicalize) | canonicalize(record) bytes identical between reference and WASM for the whole committed corpus |
| W3-I3 | differential parity (refs/status) | intentRef/manifestId/bindingRef/decisionRef/executionScope/status/label identical between reference and WASM per fixture; ANY mismatch is a failing test (= HOLD), never reconciled |
| W3-I4 | red-line invariance (WASM) | feeding claims changes nothing the verifier returns; claim values never appear in outputs |
| W3-I5 | scope-from-record | executionScope byte-identical to the frozen record’s `binding.executionScope`; a separate scope is never accepted |
| W3-I6 | seam deep-scan | WASM/JS boundaries reject execution evidence; no result carries execution or conformance artifacts |
| W3-I7 | fail-closed | missing/absent leg ⇒ NOT_RUN/NOT_PROVEN — identical to reference; never implicit OK |
| W3-I8 | determinism | same inputs + same pinned state/context ⇒ identical result (same promise as reference, no cross-state promise) |
| W3-I9 | dependency boundary | WASM declares zero function imports; JS wrapper imports no SDK/firewall/evm module (transport only) |
| W3-I10 | adversarial robustness | tampered intent/declaration/record/signature inputs ⇒ deterministic change or NOT_RUN/NOT_PROVEN, never silent acceptance, never UB/panic-to-OK |
| W3-I11 | authority parity | EOA recovered signer equality and EIP-1271 magic outcome equality vs reference when witnesses equal |
| W3-I12 | artifact integrity | committed WASM SHA-256 == recorded hash; build-gate regeneration produces identical bytes (same pinned toolchain+lock) or FAILS (= HOLD) |
| W3-I13 | non-widening & non-participation | re-signed identical intent keeps semantic identity (new bytes = detectable instance change); the verifier never participates in a decision |

---

## 7. Gates

```
DESIGN              (this document; Q-W3-1..12 for owner ruling)      ── DONE (owner ruling 2026-09-14)
    ↓
SECURITY REVIEW     (Q-W3-1..12 individually approvable)          ── PASS (all approved as written)
    ↓
FINAL SECURITY REVIEW (one-block re-check; findings CLOSED)       ── PASS (0 open findings)
    ↓
GO / NO-GO          (owner decision; NO-GO stops here)            ── GO GRANTED (2026-09-14)
    ↓
IMPLEMENTATION      (additive only; new paths; artifact + build gate) ── COMPLETE (2026-09-14)
    ↓
IMPLEMENTATION REVIEW   (oracles W3-I1..13; differential + adversarial) ── PASS (2026-09-14)
    ↓
RELEASE BOUNDARY REVIEW (additive only; firewall/WS-1/WS-2/Attack Lab
                         /frozen untouched)                         ── PASS (2026-09-14)
    ↓
release decision    (owner; commit/tag separately authorized)
```

Hard constraints at every gate: **no implementation before GO**; **no edits to
`packages/firewall/*`, WS-1/WS-2 sources+specs, the Attack Lab, or frozen
artifacts**; divergence from the reference is a §8 finding, never a silent
patch.

---

## 8. Remediation Protocol

Same as WS-1/WS-2 §8: deterministic reproduction → owner decision → atomic
remediation with a permanent regression test → full regression (`npm test`,
differential corpus, benchmark, `git diff --check`, frozen-integrity) →
re-verify affected gates.

---

## 9. Delivery expectations (post-GO only; not now)

- `packages/independent-verifier/` with `rust/` (pinned toolchain + committed
  `Cargo.lock`), committed WASM artifact, ESM wrapper, README consumer
  contract.
- Differential parity corpus + adversarial/mutation suite under
  `test/independent-verifier/`; suites registered in `scripts/run-tests.mjs`
  (additive).
- Build/artifact gate script with drift = HOLD; recorded WASM hash.
- Full `npm test` (existing suites unchanged and green), benchmark at frozen
  baseline, `git diff --check`, frozen-artifact hashes.
- NO commit/tag/release within the GO; decision engine untouched.

---

## The Three Verifiers Rule (framing)

```
Verifier A  JS reference (zero-dep core + WS-1/WS-2 + Phase D)  [exists]
Verifier B  WS-3 independent Rust/WASM verifier                [WS-3]
Verifier C  future (separate affirmative workstream)           [TBD]
A protocol fact is trusted ≥ when the reference and every shipped verifier
AGREE on it. ANY divergence = HOLD + §8 investigation. WS-3 moves the system
from single-verifier dependence to the start of the Three Verifiers Rule —
the prerequisite for integrations and a public release.
```

**End of v0.1.0-design.** "Docs-only" is superseded as of GO-on-2026-09-14; the gate record below is authoritative for post-GO status.

**Gate record (2026-09-14):**
- DESIGN — v0.1.0-design drafted; runtime facts observed (Rust present,
  wasm32 target NOT installed, Foundry precedent exists). Owner DESIGN REVIEW:
  **ALL Q-W3-1..12 APPROVED as written** — design LOCKED.
- SECURITY REVIEW — PASS: decision points Q-W3-1..12 individually approvable,
  all ruled by the owner; Three Verifiers Rule framing recorded; HOLD-on-
  divergence and §8 remediation binding.
- FINAL SECURITY REVIEW — PASS: one-block re-check, **0 open findings**. All
  decision points approved; differential parity (W3-I2/I3/I11), fail-closed
  (W3-I7), seam/boundary (W3-I6/I9/I13), memory/numeric safety (W3-I11), and
  artifact integrity (W3-I12) are binding as implementation gates (§7).
- GO / NO-GO — **OWNER GO GRANTED (2026-09-14)**. Scope opened by this GO:
  additive implementation only — `packages/independent-verifier/`,
  `test/independent-verifier/`, new `scripts/build-verifier.mjs`, this gate
  record. No commit/tag/release implied by any GO.
- IMPLEMENTATION — COMPLETE (2026-09-14). Zero-dep Rust crate → WASM;
  self-implemented SHA-256, Keccak-256, secp256k1 recovery, and JSON engine
  (zero function imports; pinned toolchain 1.97.1; committed zero-dep
  `Cargo.lock`). WASM artifact SHA-256 = `7CDA8E1B928DB3099579969FD614B8D8D5109988D24596550236537F9FD61C3D`;
  `scripts/build-verifier.mjs` regeneration byte-identical → PASS (W3-I12).
- IMPLEMENTATION REVIEW — PASS (2026-09-14). Independent suite **58/58**
  (differential 30, adversarial 10, artifacts 9, canonicalize 9) covering
  W3-I1..I13; full `npm test` **512/512** (454 baseline + 58 WS-3); benchmark
  **73/73** baseline unaffected; `git diff --check` clean. Three crypto defects
  found during implementation — keccak χ row indexing, `add_mod` carry branch,
  `sub_mod` borrow branch — fixed with permanent regression coverage; the
  divergence was treated as a §8 finding, the reference framework untouched.
- RELEASE BOUNDARY REVIEW — PASS (2026-09-14). Additive new paths only;
  `packages/firewall/*`, WS-1/WS-2 sources+specs, Attack Lab, shared
  lockfiles = 0 changes; shared `package-lock.json` untouched; no Python
  helpers/imports exist in the repo (N/A). Decision engine untouched; the
  verifier never participates in a decision.
- CLOSED — **FROZEN WITHOUT COMMIT/TAG (OWNER DECISION 2026-09-14)**. Release,
  commit, and tag remain separately authorized by the owner.