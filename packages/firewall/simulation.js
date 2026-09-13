/**
 * CoreGuard Firewall — Simulation Consistency Predicate (Q-FW5).
 *
 * Simulation is PRE-EXECUTION, NON-PERSISTENT, MODEL-ONLY. `SIMCONSISTENT`
 * compares the modeled envelope against the declared intent exactly (BigInt
 * comparisons where numeric). Any required model field that is absent/
 * `undefined`/un-modelable ⇒ `unmodelable` ⇒ REQUIRE_REVIEW (per Q-FW7) — never
 * ALLOW. Gas is additionally checked against the policy's own MAX_GAS ceiling.
 */

const TRANSFER_ACTIONS = ["TRANSFER", "DEPOSIT", "WITHDRAW", "WITHDRAWAL"];

function bigOrNull(value) {
  try {
    return BigInt(String(value));
  } catch {
    return null;
  }
}

/**
 * @param {object} args
 * @param {object} args.simulation  modeled summary (recipient/amount/received/
 *                                  target/selector/gasUsed/minOut/blockTimestamp)
 * @param {object} args.intent      bound canonical intent (declared envelope)
 * @param {object} [args.policy]    committed policy (used for MAX_GAS ceiling)
 * @returns {{ consistent: boolean, unmodelable: boolean, reason: string|null,
 *             comparisons: Array<object> }}
 */
export function evaluateSimulation({ simulation, intent, policy }) {
  const comparisons = [];
  let consistent = true;
  let unmodelable = false;
  let reason = null;

  if (!simulation || typeof simulation !== "object" || simulation.unmodelable === true) {
    return {
      consistent: false,
      unmodelable: true,
      reason: "simulation is un-modelable (no model summary provided)",
      comparisons,
    };
  }
  const sim = simulation;

  const requireField = (value, label) => {
    if (value === undefined || value === null || value === "") {
      unmodelable = true;
      comparisons.push({ field: label, ok: false, note: "un-modelable: required model field absent" });
    }
  };
  const compareEq = (declared, observed, label) => {
    if (observed === undefined || observed === null || observed === "") {
      unmodelable = true;
      comparisons.push({ field: label, ok: false, note: "un-modelable: required model field absent" });
      return;
    }
    const ok = String(observed).toLowerCase() === String(declared).toLowerCase();
    comparisons.push({ field: label, declared, observed, ok });
    if (!ok) consistent = false;
  };
  const compareBig = (declared, observed, op, label) => {
    if (observed === undefined || observed === null || observed === "") {
      unmodelable = true;
      comparisons.push({ field: label, ok: false, note: "un-modelable: required model field absent" });
      return;
    }
    const a = bigOrNull(observed);
    const b = bigOrNull(declared);
    if (a === null || b === null) {
      comparisons.push({ field: label, declared, observed, ok: false, note: "non-numeric value refuses comparison" });
      consistent = false;
      return;
    }
    const ok = op === "eq" ? a === b : a <= b;
    comparisons.push({ field: label, declared, observed, ok });
    if (!ok) consistent = false;
  };

  if (intent.target) {
    requireField(sim.target, "target");
    compareEq(intent.target, sim.target, "target");
  }
  if (intent.selector) {
    requireField(sim.selector, "selector");
    compareEq(intent.selector, sim.selector, "selector");
  }
  if (intent.recipient) {
    requireField(sim.recipient, "recipient");
    compareEq(intent.recipient, sim.recipient, "recipient");
  }

  const action = String(intent.action || "CUSTOM").toUpperCase();
  if (action === "SWAP") {
    // The swap model requires the simulated `received` quantity; an intent-side
    // minOut is not part of the canonical intent model, so a missing received
    // quantity is UN-MODELABLE (⇒ REQUIRE_REVIEW) — never silently consistent.
    requireField(sim.received, "received");
    if (sim.received !== undefined && sim.received !== null && sim.received !== "") {
      const rec = bigOrNull(sim.received);
      comparisons.push({ field: "received", declared: ">= committed min", observed: String(rec ?? sim.received), ok: rec !== null });
      if (rec === null) consistent = false;
    }
  } else if (TRANSFER_ACTIONS.includes(action)) {
    if (intent.amount !== undefined && intent.amount !== null) {
      requireField(sim.amount, "amount");
      compareBig(intent.amount, sim.amount, "eq", "amount");
    }
  } else if (action !== "CUSTOM") {
    unmodelable = true;
    comparisons.push({ field: "action", ok: false, note: "un-modelable: action model is not mapped" });
  }

  const maxGasRule = (policy && Array.isArray(policy.rules) ? policy.rules : []).find(
    (r) => r && r.type === "MAX_GAS" && r.params && r.params.maxGas !== undefined
  );
  if (maxGasRule) {
    requireField(sim.gasUsed, "gasUsed");
    compareBig(maxGasRule.params.maxGas, sim.gasUsed, "le", "gasUsed <= policy MAX_GAS");
  }

  const ts = sim.blockTimestamp;
  if (intent.validAfter !== undefined && intent.validAfter !== null) {
    if (ts === undefined || ts === null || ts === "") {
      unmodelable = true;
      comparisons.push({ field: "deadline(validAfter)", ok: false, note: "un-modelable: no decision timestamp" });
    } else {
      const ok = bigOrNull(ts) !== null && bigOrNull(ts) >= bigOrNull(intent.validAfter);
      comparisons.push({ field: "deadline(validAfter)", declared: intent.validAfter, observed: String(ts), ok });
      if (!ok) consistent = false;
    }
  }
  if (intent.validUntil !== undefined && intent.validUntil !== null) {
    if (ts === undefined || ts === null || ts === "") {
      unmodelable = true;
      comparisons.push({ field: "deadline(validUntil)", ok: false, note: "un-modelable: no decision timestamp" });
    } else {
      const ok = bigOrNull(ts) !== null && bigOrNull(ts) <= bigOrNull(intent.validUntil);
      comparisons.push({ field: "deadline(validUntil)", declared: intent.validUntil, observed: String(ts), ok });
      if (!ok) consistent = false;
    }
  }

  if (unmodelable) reason = "one or more required model fields are un-modelable (REQUIRE_REVIEW)";
  return { consistent: consistent && !unmodelable, unmodelable, reason, comparisons };
}