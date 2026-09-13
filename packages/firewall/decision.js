/**
 * CoreGuard Firewall — Decision Engine (Q-FW2 / Q-FW5 / Q-FW7 / Q-FW9/Q-FW10).
 *
 * Deterministic pre-execution decision:
 *
 *   ALLOW ⇔ POLICY_SATISFIED ∧ AUTHORITY_PROBE_OK ∧ DECLARATION_BOUND
 *         ∧ SIMCONSISTENT ∧ ¬REVIEW_OBLIGATION
 *
 * Failure precedence (Q-FW2, §9): DENY > REQUIRE_REVIEW > ALLOW. Any critical
 * input NOT_RUN — the closed set { POLICY, PROBE, BINDING, SIM } (Q-FW7a) —
 * forces DENY; NOT_RUN is never ALLOW and never silently converted to
 * NOT_PROVEN. Un-modelable simulation or a policy review rule ⇒ REQUIRE_REVIEW,
 * collapsing to DENY when no review path is configured.
 *
 * TEMPORAL SEAM (Q-FW4/Q-FW10): this engine NEVER accepts a post-execution
 * input. Supplying `executionRef`, `executionBinding`, `CONTRACT_EXECUTION_*
 * or an execution block as a decision input is a programming error and throws —
 * ALLOW is never gated on post-execution evidence (I4/I7).
 *
 * The authority probe is recomputed (Q-FW1a); the manifest/declaration id and
 * policy hash are recomputed (never trusted); the policy context comes only
 * from the bound intent + simulation (Q-FW3b).
 */

import { evaluateDeclarationBinding, executionScopeOf } from "./binding.js";
import { evaluateAuthorityProbe } from "./authority.js";
import { evaluatePolicyForDecision } from "./policy.js";
import { evaluateSimulation } from "./simulation.js";
import { freezeDecisionRecord, DECISION_RECORD_VERSION, ALLOW, DENY, REQUIRE_REVIEW } from "./decision-record.js";

const POST_EXECUTION_INPUTS = [
  "executionRef",
  "executionBinding",
  "CONTRACT_AUTHORIZATION",
  "CONTRACT_EXECUTION_BINDING",
  "executionBlock",
];

/**
 * Reject post-execution inputs at the decision boundary (Q-FW10 temporal seam;
 * I4/I7). Throws on programming error — an ALLOW must never be gated on
 * evidence that only exists after broadcast.
 */
function guardNoPostExecutionInputs(inputs) {
  const present = POST_EXECUTION_INPUTS.filter((k) => k in inputs);
  if (present.length > 0) {
    throw new TypeError(
      `firewall: decision-time inputs must NOT include post-execution evidence (${present.join(", ")}) — Q-FW10 temporal seam`
    );
  }
}

/**
 * Produce a frozen pre-execution decision.
 *
 * @param {object} inputs
 * @param {object} inputs.intent             canonical intent (packages/intent)
 * @param {object} inputs.declaration        signed declaration (binding, Q-FW4)
 * @param {object} inputs.policy             committed policy (Q-FW3)
 * @param {string} [inputs.expectedPolicyHash] declared policy hash to verify
 * @param {string[]} inputs.activePolicyIds  currently-active policy ids (Q-FW3a)
 * @param {object} [inputs.policyTrust]      { anchors: string[] }
 * @param {object} [inputs.simulation]       modeled summary (Q-FW5)
 * @param {string} inputs.authorityAtState   decision block (decimal string)
 * @param {string} [inputs.blockTimestamp]   decision-time timestamp (fallback to simulation)
 * @param {string} [inputs.writer]           decision writer identity
 * @param {object} [inputs.reviewPath]       { configured, states?, writers? }
 * @param {object} [inputs.evm]              injected @coreguard/evm adapter
 * @param {object} [inputs.contractAuth]     injected { ethCall, getCode }
 * @param {string} [inputs.from]             optional EIP-1271 caller context
 * @returns {Promise<{decision, record, canonical, decisionRef, predicate, errors}>}
 */
export async function decideFirewall(inputs) {
  guardNoPostExecutionInputs(inputs || {});

  const {
    intent,
    declaration,
    policy,
    expectedPolicyHash,
    activePolicyIds,
    policyTrust,
    simulation,
    authorityAtState,
    blockTimestamp,
    writer,
    reviewPath,
    evm,
    contractAuth,
    from,
  } = inputs;

  const errors = [];
  const revPath = reviewPath && reviewPath.configured ? reviewPath : { configured: false };
  const chainId = declaration ? String(declaration.chainId || "") : "";
  const nonce = declaration ? String(declaration.nonce ?? "") : "";

  // ── 1. Declaration binding (Q-FW4) ──────────────────────────────────────
  const binding = await evaluateDeclarationBinding({ intent, declaration });

  // ── 2. Authority probe (Q-FW1a/Q-FW10) — recomputed, never trusted ───────
  let probe = { status: "NOT_RUN", label: "NOT_EVALUATED", path: "UNKNOWN", atState: null };
  if (binding.status === "OK" && binding.manifestId) {
    probe = await evaluateAuthorityProbe({
      declaration,
      manifestId: binding.manifestId,
      chainId: binding.chainId,
      authorityAtState,
      evm,
      contractAuth,
      from,
    });
  }

  // ── 3. Policy commitment + evaluation (Q-FW3/3a/3b) ──────────────────────
  const ts = simulation && simulation.blockTimestamp !== undefined ? String(simulation.blockTimestamp) : String(blockTimestamp ?? "");
  const policyEval = await evaluatePolicyForDecision({
    policy,
    expectedPolicyHash,
    activePolicyIds,
    policyTrust,
    intent,
    simulation,
    blockTimestamp: ts || undefined,
  });

  // ── 4. Simulation consistency (Q-FW5) ────────────────────────────────────
  const sim = evaluateSimulation({ simulation, intent, policy });

  // ── 5. Review obligation ─────────────────────────────────────────────────
  const reviewObligation = Boolean(policyEval.reviewObligation || sim.unmodelable);

  const terms = {
    DECLARATION_BOUND: binding.status === "OK",
    AUTHORITY_PROBE_OK: probe.status === "OK",
    POLICY_SATISFIED: policyEval.status === "SATISFIED",
    SIMCONSISTENT: sim.consistent === true && !sim.unmodelable,
    REVIEW_OBLIGATION: reviewObligation,
  };

  // Q-FW2/§9 failure precedence: DENY > REQUIRE_REVIEW > ALLOW.
  let decision;
  let reason = null;

  const probeFailed = probe.status !== "OK";
  const probeNotRun = probe.status === "NOT_RUN";
  const bindingFailed = binding.status !== "OK";
  const policyFailed = policyEval.status !== "SATISFIED";
  const policyNotRun = policyEval.status === "NOT_RUN";
  const simViolates = sim.unmodelable === true ? false : sim.consistent !== true;
  const simUnmodelable = sim.unmodelable === true;

  if (bindingFailed || probeFailed || policyFailed || simViolates) {
    decision = DENY;
    reason = [
      binding.status !== "OK" ? `binding:${binding.label}` : null,
      probeNotRun ? `probe:${probe.label} (NOT_RUN, fail-closed)` : probeFailed ? `probe:${probe.label}` : null,
      policyNotRun ? `policy:${policyEval.label} (NOT_RUN, fail-closed)` : policyFailed ? `policy:${policyEval.label}` : null,
      simViolates ? (sim.unmodelable ? `sim:un-modelable` : `sim:inconsistent`) : null,
    ].filter(Boolean).join("; ");
    errors.push(reason);
  } else if (reviewObligation) {
    // Q-FW7: an un-modelable simulation (or a policy review rule) is a review
    // obligation — not a silent DENY — collapsing to DENY only when no review
    // path is configured.
    if (!revPath.configured) {
      decision = DENY;
      reason = "REVIEW_NOT_CONFIGURED: review obligation without a configured review path collapses to DENY";
      errors.push(reason);
    } else {
      decision = REQUIRE_REVIEW;
      reason = "REVIEW_OBLIGATION: unambiguous decision not determinable; review path configured";
      errors.push(reason);
    }
  } else {
    decision = ALLOW;
  }

  const recordBody = {
    version: DECISION_RECORD_VERSION,
    kind: "DECISION",
    decision,
    reason,
    writer: writer || "UNKNOWN",
    chainId,
    nonce,
    decisionBlock: typeof authorityAtState === "string" ? authorityAtState : null,
    blockTimestamp: ts || null,
    policy: {
      policyId: policyEval.policyId || (policy ? policy.policyId : null),
      policyHash: policyEval.policyHash || null,
      label: policyEval.label || null,
    },
    authorityInputs: {
      path: probe.path || null,
      atState: probe.atState ?? null,
      status: probe.status,
      label: probe.label,
      reason: probe.reason || null,
    },
    binding: {
      intentRef: binding.intentRef || null,
      manifestId: binding.manifestId || null,
      bindingRef: binding.bindingRef || null,
      executionScope: binding.executionScope || executionScopeOf(intent || {}),
    },
    simSummary: simulation || null,
    simConsistent: !sim.unmodelable && sim.consistent,
    unmodelable: sim.unmodelable,
    reviewObligation,
    reviewPathConfigured: revPath.configured,
  };

  const { record, canonical, decisionRef } = await freezeDecisionRecord(recordBody);

  return { decision, record, canonical, decisionRef, predicate: terms, errors };
}