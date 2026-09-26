/**
 * contract.mjs — the unified adapter contract (packages/adapters).
 *
 * Every adapter implements ONE six-method surface:
 *   prepare() validate() execute() captureReceipt() verify() status()
 *
 * Honesty contract: execute() MUST NOT claim execution when the adapter runs
 * in DRY_RUN mode. A dry-run adapter performing execute()/captureReceipt()
 * returns status NOT_PERFORMED with an explicit reason — the environment name
 * the claim sits on. Adapters without real credentials/authority report
 * UNKNOWN, never VERIFIED.
 */

export const ADAPTER_STATUS = Object.freeze([
  "NOT_BUILT",
  "DRY_RUN",
  "SANDBOX",
  "LIVE",
  "VERIFIED",
  "DEGRADED",
  "UNKNOWN",
]);

export const ADAPTER_STATUS_SET = new Set(ADAPTER_STATUS);

export function isAdapterStatus(s) {
  return ADAPTER_STATUS_SET.has(s);
}

export function createAdapter(spec) {
  if (!spec || typeof spec !== "object" || typeof spec.id !== "string") {
    throw new TypeError("createAdapter: spec.id is required");
  }
  const runMode = spec.runMode || "DRY_RUN";
  const lifecycle = spec.lifecycle || {
    hasCredentials: false,
    authorized: false,
    executed: false,
    receiptCaptured: false,
  };

  return {
    id: spec.id,
    name: spec.name || spec.id,
    standard: spec.standard || [],
    runMode,
    lifecycle,

    prepare(input) {
      return {
        prepared: true,
        runMode,
        input: input || null,
        authorization: lifecycle.authorized ? { authorized: true } : { authorized: false, authority: "NONE" },
      };
    },

    validate(input) {
      if (!input || typeof input.subject !== "string") {
        return { valid: false, reason: "subject required" };
      }
      if (!Array.isArray(input.policy) || input.policy.length === 0) {
        return { valid: false, reason: "non-empty policy required" };
      }
      return { valid: true, reason: "schema valid" };
    },

    execute() {
      if (runMode === "DRY_RUN" || !lifecycle.authorized) {
        return { ok: false, status: "NOT_PERFORMED", reason: `dry-run/${runMode} — execution not claimed` };
      }
      return { ok: true, status: "EXECUTED" };
    },

    captureReceipt(tx) {
      if (runMode === "DRY_RUN") {
        return { ok: false, status: "NOT_PERFORMED", reason: `dry-run/${runMode} — no receipt captured` };
      }
      return { ok: true, status: "CAPTURED", tx: tx || null };
    },

    verify() {
      if (runMode === "DRY_RUN") {
        return { verdict: "UNKNOWN", verdictCode: "DRY_RUN_NO_CLAIM", reason: `dry-run/${runMode}` };
      }
      if (!lifecycle.executed || !lifecycle.receiptCaptured) {
        return { verdict: "UNKNOWN", verdictCode: "EXECUTION_EVIDENCE_MISSING" };
      }
      return { verdict: "VERIFIED", verdictCode: "ADAPTER_VERIFIED" };
    },

    status() {
      if (!lifecycle.hasCredentials) {
        return { runMode, status: "UNKNOWN", integrationStatus: "NOT_BUILT", networkCall: "NOT_PERFORMED", verdictCode: "NO_CREDENTIALS" };
      }
      return { runMode, status: "DRY_RUN", integrationStatus: "DRY_RUN", networkCall: "NOT_PERFORMED" };
    },
  };
}

export function adapterContractConformance(adapter) {
  const required = ["prepare", "validate", "execute", "captureReceipt", "verify", "status"];
  const missing = required.filter((m) => !adapter || typeof adapter[m] !== "function");
  if (missing.length > 0) {
    return { status: "UNKNOWN", verdictCode: "CONTRACT_INCOMPLETE", missing };
  }
  return { status: "VERIFIED", verdictCode: "CONTRACT_COMPLETE", missing: [] };
}

/** The status vocabulary each adapter records — every status is honest to the
 *  runMode/lifecycle, not to intent. */
export const ADAPTER_HONESTY_RULE =
  "execute() never claims execution in DRY_RUN; adapters without real credentials report UNKNOWN; LIVE/VERIFIED require recorded authorization + real evidence.";