#!/usr/bin/env node
/**
 * sim-tribunal.mjs — LOCAL reference-tribunal simulator (offline, deterministic).
 *
 * NOT People's Court. This is a named, synthetic local stand-in that exercises
 * CoreGuard's fail-closed semantics against a dispute package and produces a
 * clearly-labeled SYNTHETIC award + settlement instruction when, and only when,
 * the record permits. It exists so the conformance suite and demos have a
 * complete, deterministic execution path without any real adjudicator,
 * credential, or network call.
 *
 * Fail-closed cases:
 *   A  FULL assent + verified pins            → SYNTHETIC award (external),
 *                                               settlement instruction permitted
 *                                               (mock escrow may execute it)
 *   B  PARTIAL assent (B UNKNOWN)             → NO award, NO settlement
 *                                               (bilateral consent not evidenced)
 *   C  settlement evidence UNKNOWN            → stays UNKNOWN; the adjudicator
 *                                               refuses any UNKNOWN→NOT_SETTLED
 *                                               conversion (blocked)
 *   D  award signature invalid                → reject the award entirely
 *   E  package hash tampered                  → reject at the verifier stage
 *
 * Usage:
 *   node examples/reference-tribunal/sim-tribunal.mjs --case <pkg-dir> --scenario A [--out <dir>]
 * Exit: 0 = tribunal-ready record produced · 1 = fail-closed · 2 = usage
 */

import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const VERIFY = join(
  REPO,
  "examples",
  "delivery-fixture",
  "pairs",
  "dispute-package",
  "verify-dispute-package.mjs",
);

export const SIMULATOR = "coreguard-reference-tribunal (SYNTHETIC ADJUDICATOR) v0.1.0";
export const SYNTHETIC_SIGNING_NOTE =
  "Signatures here are deterministic HMAC-SHA256 over the record, produced with a public demo key, and are NOT a real adjudicator's award. They exercise transport/integrity semantics only.";

const IS_CLI =
  !!process.argv[1] &&
  fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase();

/** Deterministic synthetic signature over a canonical record string. */
export function syntheticSign(canonicalRecord) {
  const DEMO_KEY = "coreguard-reference-tribunal-demo-key";
  return `0x${createHmac("sha256", DEMO_KEY).update(canonicalRecord).digest("hex")}`;
}

/**
 * Verifier for synthetic awards: the signature binds the award's own content
 * (everything except the signature field), so any tampering with the award
 * breaks verification. Deterministic for a given award object.
 */
export function verifySyntheticAward(award) {
  if (typeof award?.signature !== "string") return false;
  if (award?.simulator !== SIMULATOR) return false;
  const { signature, ...rest } = award;
  return signature === syntheticSign(JSON.stringify(rest));
}

/**
 * Pure, deterministic adjudication. Returns ok:false (fail-closed) for every
 * scenario that must block, with scenario-specific failures. Only scenario A
 * produces an award + settlement instruction.
 */
export function adjudicate(scenario, pkg, manifest) {
  const failures = [];
  const fail = (name, detail) => failures.push(`${name}: ${detail}`);
  const decide = (name, ok, detail) => {
    if (!ok) fail(name, detail);
  };

  if (scenario === "E") {
    fail("verify", "package hash tampered — rejected before any tribunal processing");
    return { ok: false, stage: "verify", failures, award: null, settlement: null };
  }
  if (scenario === "D") {
    fail("award-signature", "presented award does not verify against the record bytes — rejected");
    return { ok: false, stage: "award-signature", failures, award: null, settlement: null };
  }
  if (scenario === "C") {
    fail("settlement-UNKNOWN-not-converted", "settlement status is UNKNOWN — blocked; UNKNOWN is never converted to NOT_SETTLED");
    return { ok: false, stage: "settlement-blocked", failures, award: null, settlement: null };
  }
  if (scenario === "B") {
    fail("consent-GATE", "modeled assent is PARTIAL — no bilateral consent evidence; the UNKNOWN party stays UNKNOWN. Fail-closed.");
    fail("escrow-reference-only", "escrow must remain reference-only while consent is incomplete");
    return { ok: false, stage: "tribunal", failures, award: null, settlement: null };
  }

  // Scenario A — the only path that may produce a record. Gates run fail-closed.
  const c = pkg.evidence?.consent;
  const agg = c?.modeledAssent;
  const pA = c?.parties?.principalA?.assent;
  const pB = c?.parties?.principalB?.assent;

  decide("consent:aggregate-triState", ["FULL", "PARTIAL", "MISSING", "UNKNOWN"].includes(agg), `aggregate ${agg} is not a tri-state`);
  decide("consent:noBooleanAssent", typeof agg === "string", "aggregate assent must be a string, never a boolean");
  decide("consent:bilateral", pA === "ASSENTED" && pB === "ASSENTED", "FULL bilateral modeled assent required for scenario A");

  const st = pkg.evidence?.execution?.compensationSettlement;
  decide("settlement:evidenceStatus", typeof st?.evidenceStatus === "string", "settlement evidenceStatus missing");
  decide("settlement:noBoolean", !("status" in (st ?? {})), "boolean settlement status forbidden");
  decide("settlement:UNKNOWN-preserved", st?.actualStatus === "UNKNOWN", "settlement actualStatus must stay UNKNOWN in an unadjudicated record");

  decide("award:slot-UNKNOWN", pkg.awardSlot?.status === "UNKNOWN" && pkg.awardSlot?.adjudicator === "NONE", "award slot must be UNKNOWN/NONE");
  decide("escrow:reference-only", pkg.escrowRef?.deployed === false && pkg.escrowRef?.chain === "none", "escrow must be reference-only");
  decide("adapter:NOT_BUILT", pkg.adapter?.integrationStatus === "NOT_BUILT", "adapter integrationStatus must remain NOT_BUILT");

  if (failures.length > 0) {
    return { ok: false, stage: "tribunal", failures, award: null, settlement: null };
  }

  const remedy = "PROCEED_PERFORMANCE — record closed, no remedy awarded. Settlement permitted only up to the authority corpus and only with an authority-bound execution credential.";

  const awardBase = {
    simulator: SIMULATOR,
    signatureType: "SYNTHETIC_DEMO_HMAC",
    case: pkg.caseRef,
    packageRevision: manifest.files?.["dispute-package.json"] ?? null,
    outcome: "record admitted; settlement permitted as modeled",
    signedReasonedAward: remedy,
    note: SYNTHETIC_SIGNING_NOTE,
  };

  const award = {
    ...awardBase,
    signature: syntheticSign(JSON.stringify(awardBase)),
  };

  const settlement = {
    simulator: SIMULATOR,
    kind: "SETTLEMENT_INSTRUCTION",
    packageRevision: manifest.files?.["dispute-package.json"] ?? null,
    awardSignature: award.signature,
    executionBoundary:
      "Execution requires a separately scoped settlement adapter credential; this instruction does not and cannot execute anything by itself.",
    actions: [
      { action: "RELEASE/NO-OP (reference)", scope: "authority corpus of the pinned agreement", authorityBound: true },
    ],
  };

  return { ok: true, stage: "tribunal-ready", failures, award, settlement };
}

function verifyPackageDir(caseDirParam) {
  const r = spawnSync(process.execPath, [VERIFY], { cwd: caseDirParam, encoding: "utf8" });
  const ok = r.status === 0 && /DISPUTE_PACKAGE OK/.test(r.stdout ?? "");
  return { ok, status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

if (IS_CLI) {
  const argv = process.argv.slice(2);
  const caseIdx = argv.indexOf("--case");
  const scenarioIdx = argv.indexOf("--scenario");
  const outIdx = argv.indexOf("--out");
  const CASE_ARG = caseIdx === -1 ? null : argv[caseIdx + 1];
  const SCENARIO_ARG = scenarioIdx === -1 ? null : argv[scenarioIdx + 1];
  const OUT_ARG = outIdx === -1 ? null : argv[outIdx + 1];

  if (!CASE_ARG || !["A", "B", "C", "D", "E"].includes(SCENARIO_ARG)) {
    console.error("usage: node examples/reference-tribunal/sim-tribunal.mjs --case <pkg-dir> --scenario A|B|C|D|E [--out <dir>]");
    process.exit(2);
  }

  const caseDir = resolve(CASE_ARG);

  // CLI flow: real fail-closed verifier first, then pure adjudication.
  const v = verifyPackageDir(caseDir);
  if (!v.ok) {
    console.error(`reference-tribunal: FAIL-CLOSED at verify (status ${v.status}) — nothing produced.`);
    console.error(v.out.trim());
    process.exit(1);
  }

  const pkg = JSON.parse(readFileSync(join(caseDir, "dispute-package.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(caseDir, "dispute-hashes.json"), "utf8"));
  const result = adjudicate(SCENARIO_ARG, pkg, manifest);

  if (!result.ok) {
    console.error(`reference-tribunal: FAIL-CLOSED at ${result.stage}`);
    for (const f of result.failures) console.error(`  ✖ ${f}`);
    process.exit(1);
  }

  const outDir = resolve(OUT_ARG ?? dirname(caseDir));
  mkdirSync(outDir, { recursive: true });
  const caseName = basename(caseDir);
  writeFileSync(
    join(outDir, `tribunal-${caseName}-synth-award.json`),
    JSON.stringify({ scenario: SCENARIO_ARG, simulator: SIMULATOR, award: result.award }, null, 2) + "\n",
  );
  writeFileSync(
    join(outDir, `tribunal-${caseName}-synth-settlement.json`),
    JSON.stringify({ scenario: SCENARIO_ARG, settlement: result.settlement }, null, 2) + "\n",
  );

  console.log("CoreGuard — reference-tribunal simulator (LOCAL, SYNTHETIC)");
  console.log("─".repeat(72));
  console.log(`case      : ${caseDir} (scenario ${SCENARIO_ARG})`);
  console.log(`verdict   : tribunal-ready`);
  console.log(`award     : SYNTHETIC (${result.award.signatureType}) — not a real adjudicator's award`);
  console.log(`settlement: permitted only within the authority corpus; requires a separately scoped execution credential`);
  console.log(`boundary  : local synthetic stand-in; NOT People's Court; no live call, no credential, no broadcast.`);
  process.exit(0);
}