# CoreGuard Execution Firewall — Design (v0.2, NO implementation in P2)

**Version**: 1.0.0-design · **Status**: Design only — not in P2 scope
**Parent**: CGEP/1:AGENT-PROVENANCE

---

## 1. Why It Exists

`verify-run` / `verify-provenance` tell you whether execution CONFORMED **after
the fact**. An Execution Firewall enforces BEFORE/AT execution: it gates
actions based on (a) the declared provenance of the executor and (b) CGEP/1
policy — fail-closed by default.

> Provenance without enforcement is a report. Firewall adds the enforcement
> boundary: **"only declared + proven executors may act, and only within their
> declared + proven scope."**

## 2. Core Invariant (fail-closed)

> **Deny-deny-deny.** A decision is DENY unless every required check for the
> claimed provenance and policy PASSes. The firewall NEVER upgrades a weak or
> missing state into a pass — a `DECLARED`-only executor cannot gain access
> through a rule that requires `VERIFIED`/`ATTESTED`.

## 3. Components (conceptual, design-time)

| Component | Role |
|---|---|
| Provenance Gate | evaluates the manifest → state per field (VERIFIED/ATTESTED/DECLARED/NOT_PROVEN/UNKNOWN) |
| Policy Evaluator | CGEP/1 policy rules (reuses `packages/policy`) against the proposed action |
| Enforcement Point | the boundary at which execution is allowed/denied (smart-account, relayer, SDK interceptor) |
| Audit Trail | every decision recorded (provenance states + policy + evidence refs) — never the bodies |

## 4. Decision Matrix (illustrative, not exhaustive)

| Rule requires | Executor state achieved | Decision |
|---|---|---|
| `VERIFIED_DELEGATION` | VERIFIED | ALLOW |
| `VERIFIED_DELEGATION` | ATTESTED | DENY |
| `VERIFIED_DELEGATION` | DECLARED | DENY |
| `ATTESTED_ORG` | ATTESTED | ALLOW |
| `ATTESTED_ORG` | DECLARED | DENY |
| any | NOT_PROVEN / UNKNOWN | DENY |
| any | conflicting (contradiction) | DENY + flag INVALID |

## 5. Assurance Requirements (for when it IS implemented)

1. Deterministic, offline-evaluable (no network dependency for the gate).
2. Same verdict semantics/exit-code discipline as the verifier (single source).
3. No side-effects on deny (pure decision + audit).
4. Enforcement point must be verifiable as actually-enforcing (contract-level
   event / SDK checksum) — otherwise "Allow without enforce" is worse than no
   firewall.
5. Every outcome is auditable with the same `verify-*` tools.

## 6. Explicit Non-Goals (v0.2 design)

- NOT a surveillance or profiling layer.
- NOT an "AI detector" gate — it does NOT infer executor type; it gates on
  declared + proven states.
- NOT a replacement for CGEP/1 policy (it composes with it).
- NOT a rule engine rewrite (reuses `packages/policy`).

## 7. Integration Points (Core-native, design-time)

- Smart-account / account-abstraction relayer as the enforcement boundary.
- SDK interceptor for agent-framework users (agent declares → SDK checks →
  submits or denies).
- `verify-provenance` as the independent audit tool for every firewall decision.

## 8. Open Design Decisions (deferred to implementation phase, after P2)

- Enforcement point choice (contract vs SDK vs both).
- Whether provenance state is cached or re-evaluated per execution.
- Which policy rule types gate on provenance state vs purely on action fields.

---

*End of Execution Firewall Design (design-only, not in P2).*