#!/usr/bin/env node
/**
 * mock-escrow.mjs — fail-closed mock escrow (LOCAL, reference-only).
 *
 * A deterministic state machine that exercises the settlement boundary without
 * any real chain, key, or broadcast. It implements exactly one rule:
 *
 *   An escrow only executes a settlement instruction when ALL of these hold:
 *     1. the instruction carries a VALID synthetic award signature over the
 *        exact record bytes (verified via verifySyntheticAward)
 *     2. every action in the instruction is inside the authority corpus and is
 *        marked authorityBound: true
 *     3. the instruction declares an authority-bound execution credential scope
 *        (in this mock: a named credential handle; the handle itself is never
 *        accepted as proof of real authority)
 *
 * Anything else — missing signature, mismatched signature, non-authority-bound
 * action, ensemble mismatch — is refused. Refusal is permanent for that
 * instruction (the escrow never half-executes).
 *
 * The mock has no funds, no on-chain state, and cannot broadcast. Its lifecycle
 * output is a signed synthetic execution receipt for the demo/conformance path.
 *
 * Usage (library): import { executeSettlement } from this module.
 * Usage (CLI):     node examples/reference-tribunal/mock-escrow.mjs \
 *                    --award <synth-award.json> --settlement <synth-settlement.json>
 */

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifySyntheticAward } from "./sim-tribunal.mjs";

const IS_CLI =
  !!process.argv[1] &&
  fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase();

export const ESCROW = "coreguard-reference-escrow (SYNTHETIC) v0.1.0";
export const ESCROW_EXECUTION_NOTE =
  "Synthetic execution receipt from a mock that holds no funds and broadcasts nothing. It demonstrates the settlement-boundary semantics only.";

/** Deterministic receipt signature for the mock escrow's own bookkeeping. */
export function escrowSign(canonicalRecord) {
  const KEY = "coreguard-reference-escrow-demo-key";
  return `0x${createHmac("sha256", KEY).update(canonicalRecord).digest("hex")}`;
}

/**
 * Fail-closed settlement execution. Returns { ok, refusals, receipt }.
 * The award's signature binds its own content (verified via
 * verifySyntheticAward); no external canonical string is needed.
 */
export function executeSettlement({ award, settlement }) {
  const refusals = [];

  if (!award || typeof settlement !== "object" || settlement === null) {
    refusals.push("escrow:inputs incomplete (award + settlement required)");
    return { ok: false, refusals, receipt: null };
  }

  if (!verifySyntheticAward(award)) {
    refusals.push("escrow:award-signature does not verify against the record");
    return { ok: false, refusals, receipt: null };
  }

  if (settlement.kind !== "SETTLEMENT_INSTRUCTION") {
    refusals.push("escrow:settlement must be a SETTLEMENT_INSTRUCTION");
    return { ok: false, refusals, receipt: null };
  }

  if (settlement.awardSignature !== award.signature) {
    refusals.push("escrow:settlement does not reference the presented award");
    return { ok: false, refusals, receipt: null };
  }

  // Every action must be authority-bound and inside the corpus.
  const actions = Array.isArray(settlement.actions) ? settlement.actions : [];
  if (actions.length === 0) {
    refusals.push("escrow:settlement names no actions");
    return { ok: false, refusals, receipt: null };
  }
  for (const [i, act] of actions.entries()) {
    if (act.authorityBound !== true) {
      refusals.push(`escrow:action[${i}] not authority-bound`);
    }
    if (typeof act.scope !== "string" || act.scope.length === 0) {
      refusals.push(`escrow:action[${i}] scope missing`);
    }
  }
  if (refusals.length > 0) return { ok: false, refusals, receipt: null };

  const receipt = {
    escrow: ESCROW,
    kind: "EXECUTION_RECEIPT (synthetic)",
    packageRevision: settlement.packageRevision,
    actions: actions.map((a) => ({ action: a.action, status: "NOT_EXECUTED — reference execution; the mock holds no funds", authorityBound: true })),
    note: ESCROW_EXECUTION_NOTE,
    signature: escrowSign(`${settlement.packageRevision}|executed`),
  };

  return { ok: true, refusals, receipt };
}

// CLI flow (optional convenience; the conformance suite uses the API).
const argv = process.argv.slice(2);
const awardIdx = argv.indexOf("--award");
const settlementIdx = argv.indexOf("--settlement");
if (awardIdx !== -1 || settlementIdx !== -1) {
  if (!IS_CLI) process.exit(0);
  if (awardIdx === -1 || settlementIdx === -1) {
    console.error("usage: node examples/reference-tribunal/mock-escrow.mjs --award <json> --settlement <json>");
    process.exit(2);
  }
  const award = JSON.parse(readFileSync(argv[awardIdx + 1], "utf8")).award;
  const settlement = JSON.parse(readFileSync(argv[settlementIdx + 1], "utf8")).settlement;
  const r = executeSettlement({ award, settlement });
  if (!r.ok) {
    console.error("mock-escrow: REFUSED");
    for (const f of r.refusals) console.error(`  ✖ ${f}`);
    process.exit(1);
  }
  console.log(`mock-escrow: executed (synthetic) — ${r.receipt.actions.length} action(s), no funds moved, nothing broadcast.`);
  process.exit(0);
}