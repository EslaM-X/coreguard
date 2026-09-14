/**
 * Attack / Mutation Lab — harness foundations (spec §6 / v0.1.2).
 *
 * BOUNDARY CONTRACT (design §3): the harness owns injected adapter
 * implementations and the commitment anchor. The "adversary" in this suite
 * mutates ONLY caller-visible data and adapter RESULTS (exposed as fixtures),
 * never adapter behavior/code.
 *
 * ORACLE ARCHITECTURE: `attackCheck` is a pure measurement/comparison layer.
 * It knows NOTHING about A1/A7/A10 internals or firewall security logic.
 * Each attack family defines its OWN oracle inline, describing what that
 * family's invariant requires.  attackCheck normalizes the observed outcome
 * (including throws), passes it to the oracle, and classifies the result as
 * HELD / DEFEATED / NON-EXPLOITABLE.  On DEFEATED it throws an assertion
 * error with reproduction details.
 *
 * ALLOW-WITHOUT-IN8 GLOBAL RULE: any ALLOW whose predicate fails all five
 * IN8 terms (DECLARATION_BOUND ∧ AUTHORITY_PROBE_OK ∧ POLICY_SATISFIED ∧
 * SIMCONSISTENT ∧ ¬REVIEW_OBLIGATION) is DEFEATED on sight.  This is
 * enforced inside each oracle, NOT inside attackCheck.
 */

import assert from "node:assert/strict";

import * as EVM from "../../../packages/evm/index.js";
import { computeDeclarationId } from "../../../packages/firewall/binding.js";
import {
  makeAddress,
  makeDeclaration,
  makeIntent,
  makePolicy,
  makeSimulation,
  seedKey,
  signDeclaration,
  DEFAULT_REVIEW_PATH,
} from "../helpers.js";

// ── Prohibited tokens (decision.js POST_EXECUTION_INPUTS) ────────────────
export const FORBIDDEN_TOKENS = Object.freeze([
  "executionRef",
  "executionBinding",
  "CONTRACT_AUTHORIZATION",
  "CONTRACT_EXECUTION_BINDING",
  "executionBlock",
]);

export const FORBIDDEN_EQUIVALENTS = Object.freeze([
  "blockNumber",
  "txHash",
  "receipt",
  "trace",
  "storageChanges",
  "blockTimestamp-execution",
]);

export const CHAIN = "1116";
export const WRITER = makeAddress(0x77);
export const UNAUTHORIZED_WRITER = makeAddress(0x66);
export const CONTRACT_ADDR = "0x2222222222222222222222222222222222222222";

const MAGIC = "0x1626ba7e" + "00".repeat(28);
const WRONG_MAGIC = "0xffffffff" + "00".repeat(28);
const TYPES = { ManifestDeclaration: [{ name: "manifestId", type: "bytes32" }] };

// ── Baseline builder ─────────────────────────────────────────────────────

/**
 * Build a canonical EOA-ALLOW baseline.  The harness's controlled, frozen
 * ground truth — callers (the adversary) mutate only copies.
 *
 * `overrides.intent` is a PATCH applied to a freshly created canonical intent
 * and the declaration is re-signed over the RESULT, so the baseline is always
 * internally consistent (caller intent overrides can never desync it).
 */
export async function allowedInputs(overrides = {}) {
  const intent = makeIntent(overrides.intent || {});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), seedKey(1).priv);
  const { intent: _intent, ...rest } = overrides;
  return {
    intent,
    declaration,
    policy: makePolicy(rest.rules ?? []),
    activePolicyIds: ["pol-default"],
    simulation: makeSimulation({}, intent),
    authorityAtState: "1024",
    blockTimestamp: "1",
    evm: EVM,
    writer: WRITER,
    ...rest,
  };
}

// ── Central measurement primitive ─────────────────────────────────────────

/**
 * Pure observation / comparison layer — no security logic, no SUT knowledge.
 *
 * @param {object} opts
 * @param {string}  opts.id      — Attack family identifier (e.g. "A1.1")
 * @param {Function} opts.attempt — async () => SUT result or throws
 * @param {Function} opts.oracle  — async ({decision?, record?, predicate?,
 *                                   errors?, _thrown?}) =>
 *                                   { verdict: "HELD"|"DEFEATED"|"NON-EXPLOITABLE",
 *                                     reason?: string }
 *
 * Verdicts:
 *   HELD            — oracle satisfied; attack was correctly defended
 *   DEFEATED        — oracle violated; observation contradicts the invariant
 *   NON-EXPLOITABLE — attempt executed without deterministic violation
 *
 * On DEFEATED, attackCheck throws so the test runner marks the row as failed.
 */
export async function attackCheck({ id, attempt, oracle }) {
  let observed = null;
  let _thrown = null;
  try {
    observed = await attempt();
  } catch (e) {
    _thrown = e;
  }

  const result = await oracle({ ...observed, _thrown });

  if (!result || typeof result.verdict !== "string") {
    throw new Error(`attackCheck [${id}]: oracle returned invalid result: ${JSON.stringify(result)}`);
  }

  if (result.verdict === "DEFEATED") {
    const parts = [`DEFEATED [${id}]: ${result.reason || "oracle violation"}`];
    if (_thrown) parts.push(`  thrown: ${_thrown.constructor?.name}: ${_thrown.message}`);
    if (observed) parts.push(`  observed.decision: ${observed.decision}`);
    throw new Error(parts.join("\n"));
  }

  return { id, verdict: result.verdict, observed };
}

// ── Explicit artifact scan (used in A6/A12/IN1) ──────────────────────────

/**
 * Deep-scan a (possibly frozen) record for any forbidden post-execution
 * token.  Called explicitly — never implicit — in A6/A12/IN1 tests.
 *
 * @returns {string[]} tokens found (empty = clean)
 */
export function assertNoPostExecutionArtifacts(record) {
  const text = JSON.stringify(record);
  const found = [...FORBIDDEN_TOKENS, ...FORBIDDEN_EQUIVALENTS].filter((t) => text.includes(t));
  assert.deepEqual(found, [], `post-execution artifact(s) in record: ${found.join(", ")}`);
}

// ── EIP-1271 fixtures ────────────────────────────────────────────────────

export function providersFor(acceptChain, manifestId, code = "0x60806040") {
  const expected = Buffer.from(EVM.typedDataDigest("ManifestDeclaration", TYPES, { manifestId }, acceptChain))
    .toString("hex")
    .toLowerCase();
  return {
    ethCall: async ({ data }) => {
      const digestIn = String(data).toLowerCase().slice(10, 74);
      return { ok: true, data: digestIn === expected ? MAGIC : WRONG_MAGIC };
    },
    getCode: async () => code,
  };
}

export async function contractDeclaration() {
  const intent = makeIntent({ signer: CONTRACT_ADDR });
  const declaration = await makeDeclaration({
    intent,
    signerBinding: { address: CONTRACT_ADDR, kind: "EIP1271" },
  });
  declaration.signature = { scheme: "EIP-1271", signer: CONTRACT_ADDR, bytes: "0xdeadbeef" };
  declaration.manifestId = await computeDeclarationId(declaration);
  return { intent, declaration };
}
