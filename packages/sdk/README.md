<p align="center">
  <img src="../../assets/core-guard-logo.png" alt="CoreGuard" width="180">
</p>

# @coreguard/sdk — Signed Intent SDK (WS-2)

Consumer surface for the CoreGuard signed-intent authorization binding
(spec/signed-intent-sdk.md). **It is NOT a source of truth and it NEVER
decides.** The decision stays the Firewall's (`decideFirewall`); the SDK
re-derives and verifies the authorization binding so an integrator can consume
it without ever trusting a caller-supplied claim.

## The red line (§4.0)

`verifyBinding` is **NOT** an API that takes
`{ bindingRef, executionScope, authorized=true, from, relayer }` and ratifies
them. It runs the full recompute pipeline every call:

```
intentRef (H(CGEP/1:INTENT, intent))
  → manifestId (H(CGEP/1:AGENT-PROVENANCE, declarationCore(declaration)))
  → bindingRef (H(CGEP/1:FW-BINDING, {intentRef, manifestId, signature}))
  → executionScope (ONLY from the authoritative frozen decision record, FSR-1)
  → authority probe (EOA recover / EIP-1271 magic, injected adapters only)
  → independently derived result
```

Hard rules you cannot opt out of:

- Caller-supplied `bindingRef` / `executionScope` / `authorized` / `relayer`
  are **never honored** and never appear in the result. A caller-supplied
  `bindingRef`, if given via `callerBindingRef`, is *comparison metadata only*:
  a mismatch ⇒ deterministic `NOT_PROVEN` / `BINDING_REFERENCE_MISMATCH`,
  never OK/BOUND.
- `executionScope` is read only from the frozen DECISION record —
  `record.binding.executionScope`, whose `decisionRef =
  H("CGEP/1:FW-DECISION", record)` is independently recomputed (content
  address). No record ⇒ `NOT_RUN` / `DECISION_RECORD_MISSING`.
- Execution evidence (`executionRef`, `txHash`, `receipt`,
  `CONTRACT_AUTHORIZATION`, `CONTRACT_EXECUTION_BINDING`, `executionBlock`)
  into any PRE binding call is a `TypeError` (Q-FW10 seam).
- `from` / relayer never authorizes. For EIP-1271, `from` is the explicit
  `eth_call` caller context — it MAY affect the probe result (probe semantics
  only); it never redefines `signerBinding.address`.
- Anything missing/absent fails closed: `NOT_RUN`/`NOT_PROVEN`, never an
  implicit OK.

## Usage

```js
import { verifyBinding } from "@coreguard/sdk";
// or, in-repo: import { verifyBinding } from "../../packages/sdk/index.js";

const result = await verifyBinding({
  intent,            // canonical intent
  declaration,       // signed CGEP/1 INTENT_DECLARATION
  frozenRecord,      // authoritative frozen FW-DECISION record (from decideFirewall)
  callerBindingRef,  // OPTIONAL reference-only (FSR-2 comparison)
  authorityAtState,  // decimal block string at which the authority probe runs
  evm,               // injected EOA adapter (recoverSignerAddress, typedDataDigest)
  contractAuth,      // injected { ethCall, getCode } for EIP-1271
  from,              // OPTIONAL EIP-1271 eth_call caller context
});
```

## Result contract

```js
{
  status: "OK" | "NOT_PROVEN" | "NOT_RUN",
  label:            // failure label, or "BOUND" on OK
  reason?,          // failure detail
  stage?,           // "binding" | "reference" | "scope" | "authority" (null on OK)
  recomputed: { intentRef, manifestId, bindingRef },  // always independently re-derived
  semantics,        // { intentRef, manifestId, scope, chainId, nonce, signer } (WS-1)
  instance,         // { bindingRef, signature }                  (WS-1)
  executionScope,   // ONLY when OK — byte-identical to the frozen record's scope
  decisionRef,      // content-derived decisionRef of the verified record
  authority,        // { status, label, path, atState, reason? }  probe sub-result
}
```

Integration: forward an `OK` result's `{ intent, declaration }` to
`authorizeForDecision` / the Firewall — the SDK verifies the binding, it does
not decide.