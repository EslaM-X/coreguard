/**
 * CoreGuard CLI — verify-provenance (CGEP/1:VERIFY-PROVENANCE §10)
 *
 * Companion to `verify-run`: takes an untrusted AgentProof manifest plus
 * execution evidence and returns ONE verdict with the same exit-code
 * discipline:
 *
 *   0 = verified         summary reaches MANIFEST_ID_PROVEN
 *   1 = cli/input error  files missing/unreadable, evidence incomplete
 *   2 = invalid          manifest contradicts (schema/mismatch/tamper/rejected)
 *   3 = not proven       valid manifest but its claim is not established
 *   4 = inconclusive     critical check NOT_RUN (adapter/provider unavailable)
 *
 * Honest badge rendering (agent-provenance-dapp.md truth table): a HUMAN
 * executor is NEVER shown as VERIFIED — human-ness renders DECLARED or
 * ATTESTED at most; personality is never guessed. Bodies are never re-printed
 * (commitments/states only, VERIFY-RUN privacy rule).
 */

import { verifyProvenance } from "../../provenance/index.js";

export const CONTRACT = "CGEP/1:VERIFY-PROVENANCE";
export const VERIFIER_VERSION = "0.1.0";

const INVALID_COMMITMENT_LABELS = new Set(["SCHEMA_INVALID", "MANIFEST_ID_MISMATCH"]);
const INVALID_SIGNATURE_LABELS = new Set([
  "NO_SIGNATURE",
  "SIG_MALFORMED",
  "SIGNER_MISMATCH",
  "RECOVERY_THREW",
  "CONTRACT_CONSISTENCY_MISMATCH",
]);

/**
 * Map an orchestrator result to the §10 exit code (see header).
 */
export function exitCodeForProvenance(out) {
  if (!out || !out.verdicts || !out.summary) return 1;
  const v = out.verdicts;

  const criticalStatuses = [
    v.PROVENANCE_COMMITMENT,
    v.MANIFEST_SIGNATURE,
    v.CONTRACT_AUTHORIZATION,
    v.CONTRACT_EXECUTION_BINDING,
    v.DECLARER_EXECUTION_BINDING,
    v.DELEGATION_CHAIN,
  ].filter(Boolean);

  const inconclusive = criticalStatuses.some((c) => c.status === "NOT_RUN");
  if (inconclusive) return 4;

  const commitment = v.PROVENANCE_COMMITMENT || {};
  const signature = v.MANIFEST_SIGNATURE || {};
  const contractAuth = v.CONTRACT_AUTHORIZATION || {};
  const contractBinding = v.CONTRACT_EXECUTION_BINDING || {};

  const contradiction =
    INVALID_COMMITMENT_LABELS.has(commitment.label) ||
    INVALID_SIGNATURE_LABELS.has(signature.label) ||
    (contractAuth.status === "NOT_PROVEN") ||
    (contractBinding.status === "NOT_PROVEN");
  if (contradiction) return 2;

  if (out.summary.startsWith("MANIFEST_ID_PROVEN")) return 0;

  return 3;
}

const EXECUTOR_BADGE = {
  UNKNOWN: ["❓", "Unknown"],
  HUMAN: ["👤", "Human"],
  AI_AGENT: ["🤖", "Automated Agent"],
  BOT: ["🤖", "Automated Agent"],
  AUTOMATION: ["🤖", "Automated Agent"],
  ORGANIZATION: ["🏢", "Organization"],
  MULTISIG: ["🔑", "Authorized signer"],
  CUSTODIAN: ["🔑", "Authorized signer"],
  SMART_CONTRACT: ["🔑", "Authorized signer"],
  PROTOCOL: ["🤖", "Automated Agent"],
};

const HUMAN_STATES = ["DECLARED", "ATTESTED", "NOT_PROVEN"];

/**
 * Advisory badge state for an executor type, honouring the truth table:
 * human-ness is only ever DECLARED/ATTESTED/NOT_PROVEN — never VERIFIED.
 */
export function badgeState(out) {
  const v = out.verdicts || {};
  const executorType = (v.EXECUTOR_TYPE || {}).executorType || "UNKNOWN";

  const attested = (v.ATTESTATION_RECOGNITION || {}).status === "OK";
  const verified = out.summary && out.summary.startsWith("MANIFEST_ID_PROVEN");

  if (executorType === "HUMAN") {
    if (attested) return "ATTESTED";
    if (verified) return "DECLARED"; // signer verified, human-ness declared only
    return "NOT_PROVEN";
  }
  if (attested) return "ATTESTED";
  if (verified) return "VERIFIED";
  return "NOT_PROVEN";
}

/**
 * Render a single honest badge line (dapp §2 truth table).
 */
export function renderBadge(out) {
  const v = out.verdicts || {};
  const executorType = (v.EXECUTOR_TYPE || {}).executorType || "UNKNOWN";
  const [emoji, label] = EXECUTOR_BADGE[executorType] || EXECUTOR_BADGE.UNKNOWN;
  const state = badgeState(out);

  const copyByState = {
    VERIFIED: '"Automated agent — delegation verified"',
    ATTESTED: '"Attestation verified by trusted issuer"',
    DECLARED: '"Declared (not independently provable)"',
    NOT_PROVEN: '"Not proven — fail-closed"',
    UNKNOWN: '"Unknown — no provenance declared (fail-closed)"',
  };
  const copy = executorType === "HUMAN" && state === "VERIFIED"
    ? '"Human — cannot be inferred unless cryptographically attested"'
    : state === "DECLARED" && executorType === "HUMAN"
      ? '"Human — declared by signer, not inferred"'
      : copyByState[state] || copyByState.NOT_PROVEN;

  return `  ${emoji} ${label} — ${state}: ${copy}`;
}

/**
 * Print the human-readable report to stdout and return the exit code.
 */
export function printProvenanceReport(out) {
  const v = out.verdicts || {};
  const exitCode = exitCodeForProvenance(out);

  console.log(`\nCoreGuard Verify-Provenance (${CONTRACT} v${VERIFIER_VERSION})`);
  console.log(`${"─".repeat(56)}`);
  console.log(`Summary:       ${out.summary}`);
  console.log(`Exit code:     ${exitCode}`);
  console.log(`${"─".repeat(56)}`);
  console.log("Badge:");
  console.log(renderBadge(out));
  console.log(`${"─".repeat(56)}`);
  console.log("Checks (state-only; commitments only, never bodies):");
  for (const [check, verdict] of Object.entries(v)) {
    let state;
    let label = "";
    if (Array.isArray(verdict)) {
      state = verdict.length ? `COUNT_${verdict.length}` : "NONE";
    } else if (verdict && typeof verdict === "object") {
      state = verdict.status ? String(verdict.status) : "NOT_SET";
      label = verdict.label ? String(verdict.label) : "";
    } else {
      state = "NOT_SET";
    }
    if (check === "EXECUTOR_TYPE" && v.EXECUTOR_TYPE && v.EXECUTOR_TYPE.executorType) {
      label = label ? `${label} (${v.EXECUTOR_TYPE.executorType})` : `(${v.EXECUTOR_TYPE.executorType})`;
    }
    console.log(`  ${state.padEnd(16)} ${check}${label ? ` — ${label}` : ""}`);
  }
  if (out.errors.length > 0) {
    console.log(`${"─".repeat(56)}`);
    console.log("Errors:");
    for (const err of out.errors) console.log(`  ! ${err}`);
  }
  console.log(`${"─".repeat(56)}`);
  return exitCode;
}

/**
 * Run the CLI surface. `manifest`/`evidence` are already-parsed JSON objects;
 * exit code 1 when evidence lacks the required chainId/executionFrom fields.
 */
export async function runVerifyProvenanceCli({ manifest, evidence = {}, json = false }) {
  const chainIdValid = typeof evidence.chainId === "string" && /^[0-9]+$/.test(evidence.chainId);
  const fromValid = typeof evidence.executionFrom === "string" && /^0x[0-9a-fA-F]{40}$/.test(evidence.executionFrom);
  if (!chainIdValid || !fromValid) {
    console.error("Error: evidence must contain decimal chainId and 0x executionFrom");
    return 1;
  }

  const out = await verifyProvenance(manifest, evidence);
  const exitCode = exitCodeForProvenance(out);

  if (json) {
    console.log(JSON.stringify({ contract: CONTRACT, version: VERIFIER_VERSION, exitCode, ...out }, null, 2));
  } else {
    printProvenanceReport(out);
  }

  return exitCode;
}