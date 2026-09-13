/**
 * CoreGuard Firewall — public surface (CGEP/1 Phase D).
 *
 * Zero-dependency decision core (static imports ONLY from the local zero-dep
 * core: canonical/intent/policy — Q-FW8a). EVM cryptography and RPC transport
 * are INJECTED per call (`evm`, `contractAuth`), never a package dependency.
 *
 * Public API:
 *   decideFirewall(inputs)            -> frozen ALLOW/DENY/REQUIRE_REVIEW record
 *   resolveReview(...)                -> authorized REQUIRE_REVIEW resolution
 *   annotateConformance(...)          -> SEPARATE post-hoc annotation record
 *   contradictionScan(...)            -> DENY + VERIFIED contradiction flag
 *   evaluateDeclarationBinding / evaluateAuthorityProbe / evaluateSimulation
 *   freezeDecisionRecord / decisionRecordRef / canonicalRecord
 */

export { decideFirewall } from "./decision.js";
export {
  evaluateDeclarationBinding,
  computeDeclarationId,
  computeBindingRef,
  declarationCore,
  executionScopeOf,
} from "./binding.js";
export { evaluateAuthorityProbe } from "./authority.js";
export { evaluateSimulation } from "./simulation.js";
export { evaluatePolicyForDecision } from "./policy.js";
export { resolveReview } from "./resolution.js";
export { annotateConformance, contradictionScan, compareObserved } from "./conformance.js";
export {
  freezeDecisionRecord,
  freezeResolutionRecord,
  freezeConformanceRecord,
  decisionRecordRef,
  canonicalRecord,
  deepFreeze,
  DECISION_DOMAIN,
  RESOLUTION_DOMAIN,
  CONFORMANCE_DOMAIN,
  BINDING_DOMAIN,
  ALLOW,
  DENY,
  REQUIRE_REVIEW,
  DECISIONS,
  DECISION_RECORD_VERSION,
  RESOLUTION_RECORD_VERSION,
  CONFORMANCE_RECORD_VERSION,
} from "./decision-record.js";