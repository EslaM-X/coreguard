# CGEP/1 Phase B-1 — EIP-1271 Contract Authentication (Design)

**Version**: 1.2.0-design (not implemented) · **Parent**: CGEP/1:AGENT-PROVENANCE · **Status**: APPROVED — Final Design Review PASSED, **GO GRANTED (2026-09-13)** for implementation
**Rev 1.1 fixes**: Q-B1.3 execution binding grounded in independent evidence (not `tx.from`); Q-B1.1/§3 wording corrected to read-only `eth_call` (no STATICCALL-opcode claim, no on-chain wrapper in B-1); Q-B1.4 `signature.scheme` APPROVED with consistency rule.
**Rev 1.2 fixes**: Q-B1.3 strict admissible-evidence rule + Q10 invariant; Q-B1.2 explicit `eth_call` execution context (`from`) with no silent substitution; NOT_RUN for reachable-but-no-historical-state (no `latest` fallback); V9d negative vector + T9 added.
**Supersedes boundary in**: Q10 (agent-provenance-roadmap §EOA boundary; CGEP-1-AGENT-PROVENANCE §11 Q10)
**Additive only**: no changes to v0.1.1 semantics, P0/P1, `verify-live.json`, or anchored evidence.

---

## 1. Problem

Phase A (v0.1.1) verifies **EOA signer binding only**:
`secp256k1 EIP-712 recovery → declared signer → tx.from`.

Executor types whose authorization lives in a smart contract
(`MULTISIG`, `SMART_CONTRACT`) are currently capped at `NOT_PROVEN` (Q10) —
correctly, because an EOA signature of an associated party proves nothing about
the contract's own authorization.

Phase B-1 adds an **explicit contract-authentication path** so those types can
reach `VERIFIED` — but ONLY through a mechanism the verifier can independently
replay: **EIP-1271 `isValidSignature(bytes32,bytes)`** asked of the declared
owner contract, at the execution block's state, via a read-only call.

## 2. Design Decisions (Q-B1 set — proposed, need approval)

### Q-B1.1 — Contract-auth axis

Add a new verification axis **`CONTRACT_AUTHORIZATION`** beside
`MANIFEST_SIGNATURE`:

| signerBinding.kind | MANIFEST_SIGNATURE | CONTRACT_AUTHORIZATION |
|---|---|---|
| `EOA` (Phase A, unchanged) | EIP-712 recovery replay | `NOT_APPLICABLE` |
| `EIP1271` (new, Phase B-1) | `NOT_APPLICABLE` (signature field holds contract-supplied bytes) | **EIP-1271 check** |

Semantics of `CONTRACT_AUTHORIZATION`:

1. Verifier recomputes the manifest digest offline
   (`typedDataDigest("ManifestDeclaration", …, chainId)` — identical to Phase A).
2. Builds the `isValidSignature(digest, sigBytes)` call payload (a `view`
   function per EIP-1271's no-state-mutation requirement).
3. Executes read-only `eth_call {to: signerBinding.address, data}, executionBlock`
   via an **injected RPC provider** (same injection pattern as the evm adapter).
   `eth_call` is non-persistent by RPC semantics: no transaction, no state
   persistence. The verifier does **not** claim that a `STATICCALL` opcode was
   executed — that claim would require an on-chain wrapper contract, which is
   intentionally **out of scope** for Phase B-1 (no contract/deployment/trust
   surface added).
4. `VERIFIED`/`OK` ⇔ return == `0x1626ba7e` (EIP-1271 magic value).
5. Revert / wrong magic / out-of-gas ⇒ the call RAN ⇒ `NOT_PROVEN` (never `NOT_RUN`).
6. Provider unavailable / no RPC ⇒ `NOT_RUN` (never fabricated, mirrors Phase A
   rule).
7. Provider reachable but CANNOT serve the required execution-block state
   (historical state unavailable) ⇒ `NOT_RUN` — the verifier MUST NOT fall
   back to current/latest state: `execution @ block N` verified against
   `eth_call @ latest` is NOT the same authorization state.

### Q-B1.2 — Block-state + execution-context binding (anti state/caller drift)

**Invariant:** `tx.from` identifies the transaction initiator; it does NOT, by
itself, identify the contract executor (Q10-preserving).

The `eth_call` MUST be pinned to the **execution block's state** and an
**explicit execution context**. Verdict records `atBlock` (and, when relevant,
the caller context) from execution evidence.

**RPC call context MUST be defined, never silently substituted:**
- The verifier MUST define the `eth_call` execution context, including the
  `from` field when supplied.
- The verifier MUST NOT silently substitute the current/latest block or an
  unspecified caller context.
- If the contract's signature validation depends on caller context and the
  required execution context cannot be reproduced from evidence/profile ⇒
  **`NOT_PROVEN`** (fail-closed).
- Phase B-1 does **NOT** mandate `from = signerBinding.address` (that would
  reintroduce an unsafe architectural assumption, since a contract's valid
  `isValidSignature` may legitimately depend on its own caller context). The
  caller context is part of the execution evidence / verification profile, and
  the verification profile MUST state the caller context it relies on.

### Q-B1.3 — Contract execution binding (independent evidence, NOT `tx.from`)

`0x1626ba7e` proves ONLY: "the contract at this address, at this state,
authorizes this digest." It does **NOT** prove the contract was linked to the
execution. `tx.from == signerBinding.address` is **not** a general-safe rule:
for most contract wallets the on-chain shape is
`EOA/relayer → Smart Account → target`, so `tx.from` is the relayer/EOA,
not the signing contract. Using `tx.from` equality as a *necessary* condition
would reject the legitimately-bound majority, and using it as *sufficient*
would overclaim.

`VERIFIED` requires **both** independently-sourced:

```
CONTRACT_AUTHORIZATION     = OK   (EIP-1271 magic @ execution-block state)
+
CONTRACT_EXECUTION_BINDING = OK   (signerBinding.address was the contract
                                   account that AUTHORIZED/EXECUTED the
                                   relevant execution path)
```

**Strict admissible-evidence rule (Q-B1.3):**
`CONTRACT_EXECUTION_BINDING = OK` ONLY when the supplied execution evidence
establishes that `signerBinding.address` was the contract account that
authorized/executed the relevant execution path. Acceptable evidence MUST be
**independently attributable to that contract**, for example:

1. execution trace showing the signing contract as caller/`msg.sender` on the
   relevant execution path; or
2. a protocol-specific state-transition/evidence rule that cryptographically
   or deterministically attributes the relevant transition to that contract.

**Receipt-only evidence, arbitrary logs, or `tx.from` equality alone MUST NOT
establish `CONTRACT_EXECUTION_BINDING`.** `tx.from == contract` MAY be cited as
supporting evidence when true, but is neither necessary nor sufficient.

**If the verifier cannot establish the binding from the supplied evidence ⇒
`CONTRACT_EXECUTION_BINDING = NOT_PROVEN`** — an `OK` contract-auth is never
upgraded by weak evidence; **authorization ≠ execution proof** (fail-closed).

### Q-B1.4 — Schema (additive, v0.1.1-compatible)

`declared.signerBinding` gains:

```
"signerBinding": { "address": "0x…", "kind": "EIP1271" }
```

- `EOA` remains default and the ONLY kind tolerated in Phase A semantics.
- Executor types `MULTISIG` / `SMART_CONTRACT` may use it; `EOA` stays required
  for the EOA path. A `MULTISIG`/`SMART_CONTRACT` manifest whose `kind` is not
  `EIP1271` ⇒ `NOT_PROVEN` (fail-closed, no EOA-vs-contract confusion).
- `signature` object is **self-describing** (APPROVED): EOA path keeps
  `{ r, s, v }` under `scheme: "EIP-712"`; contract path is
  `{ "scheme": "EIP-1271", "bytes": "0x…" }` (malleable arbitrary bytes, so
  never mixed with `{r,s,v}`).
- **Consistency rule:** `kind: "EIP1271"` ⇔ `scheme: "EIP-1271"`; any mismatch
  (`kind: EIP1271` with `"EIP-712"`, or `kind: EOA` with `"EIP-1271"`) ⇒
  `NOT_PROVEN`. (`signature.scheme` is a deliberate, APPROVED schema delta
  beyond v0.1.1's closed set — making the manifest self-describing.)

### Q-B1.5 — Package placement & dependency gate (unchanged guarantees)

- Pure primitives live in `packages/evm` (extension, still zero new deps):
  - `erc1271.js`: `ERC1271_SELECTOR = 0x1626ba7e`, calldata builder,
    return decoder — deterministic pure encoding (like `eip712.js`).
- The **transport** is injected (`ethCall = async ({to, data, block}) ⇒ bytes`),
  never a package dependency. `packages/canonical/chain-adapter.js` already
  provides this shape for the read-only `verify-run` bindings — reuse, don't
  re-implement.
- **Dependency gate is unaffected**: no new external deps; noble remains
  confined to `packages/evm`; tests remain hermetic/offline (fake injected RPC).

### Q-B1.6 — Verdict vocabulary

Reuses the closed Phase A set `OK | NOT_PROVEN | NOT_RUN` and summary grammar.
New axis adds exactly these suffixes:
`CONTRACT_AUTHORIZATION: … (EIP1271_MAGIC / NOT_MAGIC / REVERTED / NOT_RUN / NOT_APPLICABLE)`.
No change to existing axis meanings.

---

## 3. Threat Model — Phase B-1 additions (diff vs v0.1.1 threat-model)

| ID | Attack | Misleading result | Mitigation |
|---|---|---|---|
| T1 | Malicious/rubber-stamp contract returns `0x1626ba7e` for **any** digest | Fake contract auth | EIP-1271 is NOT proof of executor authority; **Q-B1.3** requires an independent `CONTRACT_EXECUTION_BINDING` (trace/state-transition evidence linking the signing contract to this execution) + executionRef match. Digest is recomputed offline by the verifier, never taken from the manifest. |
| T2 | State/caller-dependent `isValidSignature` (true only under non-execution storage or an unreproducible caller context) | Auth for the wrong block/state/context | **Q-B1.2**: `eth_call` pinned to execution block AND explicit caller context; `atBlock`/context recorded; non-pinned, silently-substituted, or unreproducible-context calls are `NOT_PROVEN`. |
| T3 | Attacker sets `signerBinding.address` to an **EOA** but claims contract auth | EOA smuggled as "contract VERIFIED" | `kind: EIP1271` requires code at address non-empty at execution block; `CONTRACT_EXECUTION_BINDING` requires the signing contract itself to appear as caller/authorizer in the execution evidence (never assumed from `tx.from`). EOA-only path stays `NOT_PROVEN` (Q10 preserved). |
| T4 | Compromised RPC returns magic for any input | Fabricated pass | Read-only `eth_call` only (non-persistent; no signed transaction); provider is injectable; outstanding result remains "this code, at this state, returns magic" — same trust model as existing `crossRpc`; optional cross-RPC corroboration is `NOT_RUN` when absent, never `NOT_FAIL`. |
| T5 | Replayed 1271 signature across chains | Cross-chain replay | Digest already domain-separated with chainId (Phase A unchanged); `eth_call` executed on the evidence chainId's RPC; chain mismatch ⇒ `NOT_PROVEN` (existing chainId guards). |
| T6 | Valid-at-state, revoked contract logic (stale auth) | Post-hoc authorization | Same §5b rule: in-envelope revocation is `DECLARED` at most; `PROVEN` revocation needs authoritative evidence — unchanged; contract-auth result is bound at execution block, honor revoked circuits as `NOT_PROVEN`. |
| T7 | Reentrancy/mutation attempt during verification | State change by verifier | Read-only `eth_call` — non-persistent by RPC semantics, no signed transaction, no state persistence; the verifier never issues a state-changing call to a contract under test. (An exact `STATICCALL` opcode guarantee would require an on-chain wrapper — out of scope for Phase B-1.) |
| T8 | `isValidSignature` throws/reverts on every input | DoS the VERIFIED path | Revert is a genuine result ⇒ `NOT_PROVEN` (fail-closed), not an error/`NOT_RUN`. Never upgradable to `VERIFIED`. |
| T9 | Historical state unavailable → verifier falls back silently to `latest` | Auth re-evaluated under the WRONG state | **Not allowed**: reachable-but-no-historical-state ⇒ `NOT_RUN` (Q-B1.1.7); `eth_call @ latest` NEVER substitutes `eth_call @ executionBlock` — `execution @ N` vs `latest` is not the same authorization state. |

**Out of scope (unchanged from v0.1.1):** key compromise, consensus attacks,
EVM determinism itself, proxy *upgrade* policies between blocks (a proxy whose
logic changes between execution and verification is caught by block-state
binding in Q-B1.2 and yields `NOT_PROVEN` at best).

---

## 4. Test Vectors (pre-code; to be codified during implementation)

All values deterministic, offline, in-repo (no network). Reuse Phase A
constants where available.

### V1 — Magic value & selector stability
- `bytes4(keccak256("isValidSignature(bytes32,bytes)"))` **==** `0x1626ba7e`.

### V2 — Calldata determinism (digest known from Phase A)
Known AgentProof manifest digest on chain 1116:
`0x9405da1aebd20c2e652140f5cbbd0b5dea8974458dad85396279b2df23766754`

`isValidSignature(digest, "")` calldata (selector + 32B digest + offset
`0x40` + empty bytes: `0x00` len + `0` bytes):
`0x1626ba7e` ‖ digest ‖ `0000…0040` ‖ `0000…0000` — exact full hex locked
in implementation test.

### V3 — Return decode
`0x1626ba7e00000000000000000000000000000000000000000000000000000000`
⇒ magic, `VERIFIED`/`OK`. `0xffffffff…` ⇒ `NOT_PROVEN/NOT_MAGIC`.

### V4 — EOA-as-contract (T3 regression)
`signerBinding = {address, kind: "EIP1271"}` where address is an **EOA**
(chain reports **empty code** at the execution block) ⇒
`CONTRACT_AUTHORIZATION: NOT_PROVEN` — never reaches `VERIFIED`.
Must hold regardless of any signature bytes.

### V5 — No RPC / adapter absent
No RPC provider injected ⇒ `CONTRACT_AUTHORIZATION: NOT_RUN` —
mirrors Phase A NOT_RUN; no fabricated bytes, no P-256-like substitution.

### V6 — Revert / wrong magic / out-of-gas
Provider returns revert / `0xffffffff…` ⇒ `NOT_PROVEN` (ran, not NOT_RUN).

### V7 — Block-state drift (T2)
Recording `atBlock=execBlock`; result changes at a later block ⇒ verdict for
the execution stays `NOT_PROVEN` unless the execution-block call returns magic.

### V8 — Q10 regression (must NOT regress)
With **no** `EIP1271` kind (vendor-only EOA signature) and executor
`MULTISIG`/`SMART_CONTRACT`, summary must never include `VERIFIED`
(Phase A boundary test stays green: `EXECUTOR_STRONGEST = NOT_PROVEN`).

### V9 — Happy path (strict binding)
`kind: EIP1271` + `scheme: EIP-1271` + contract code present at execution block
+ `eth_call` returns magic + **independently attributable execution evidence**
(protocol-specific state-transition/evidence rule deterministically
attributing the transition to the signing contract; or trace where the signing
contract is caller/`msg.sender` of the relevant path) ⇒
`CONTRACT_AUTHORIZATION = OK` + `CONTRACT_EXECUTION_BINDING = OK` ⇒ summary
`MANIFEST_ID_PROVEN + CONTRACT_AUTHORIZED + CONTRACT_EXECUTION_BOUND` (exact
labels TBD at implementation), never overclaiming executor proof.

### V9b — EIP-1271 OK but no execution binding (Q-B1.3)
`eth_call` returns magic but the supplied execution evidence does NOT
establish that the signing contract authorized/executed this execution ⇒
**`CONTRACT_AUTHORIZATION = OK`** + **`CONTRACT_EXECUTION_BINDING =
NOT_PROVEN`** ⇒ overall **`NOT_PROVEN`** — magic alone never upgrades
authoritativeness (authorization ≠ execution proof).

### V9c — Relayer-shape execution (Q-B1.3)
`tx.from` is an EOA/relayer (`EOA → Smart Account → target`); execution trace
shows the signing contract as internal caller ⇒ `CONTRACT_EXECUTION_BINDING = OK`
(rejects the flawed `tx.from == contract` rule as *necessary*; invariant
`tx.from` ≠ executor holds).

### V9d — Magic without execution attribution (negative, Q-B1.3)
`kind: EIP1271` + `scheme: EIP-1271` + contract exists at execution block +
`eth_call` returns `0x1626ba7e`, but the supplied execution evidence does NOT
establish that the signing contract authorized/executed this execution:
- `CONTRACT_AUTHORIZATION = OK`
- `CONTRACT_EXECUTION_BINDING = NOT_PROVEN`
- **overall `NOT_PROVEN`**

The definitive B-1 negative test — prevents exactly the
`magic == executor proof` collapse the design rejects.

### V10 — Cross-chain replay (T5)
Digest for chain 1114 self-signs; `eth_call` on 1116 ⇒ mismatch
`NOT_PROVEN` (existing chainId digest guard).

---

## 5. Implementation gate (post-approval, adds no v0.1.1 change)

1. `packages/evm/erc1271.js` (pure) + tests in `test/evm/`.
2. `packages/provenance` axis wiring `CONTRACT_AUTHORIZATION` + schema
   additions (`kind`, digest variant) + orchestrator glue.
3. Injected-provider signature documented in `docs/dependency-gate.md`
   (gate re-check: still 10/10, no new deps).
4. Full suite additive growth: baseline `184/184` preserved, new axes add
   their own suite on top (commit discipline unchanged).
5. Tag boundary: this becomes **v0.2.0** (new independent release), NOT an
   edit of v0.1.1.

---

*End of CGEP/1 Phase B-1 EIP-1271 Contract Authentication — Design.*