#!/usr/bin/env node
/**
 * verify-assent-pair.mjs — fail-closed checker for the A/B assent pair.
 *
 * Reads assent-a.json, assent-b.json, expected-field-map.json and
 * pair-hashes.json from cwd. Exits:
 *   0  ASSENT_PAIR OK
 *   1  one or more invariants FAIL (reject)
 *   2  usage / missing files
 */

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const CWD = process.cwd();
const FILES = ["assent-a.json", "assent-b.json", "expected-field-map.json", "pair-hashes.json"];
const checks = [];
const add = (id, name, pass, reasons = []) => checks.push({ id, name, result: pass ? "PASS" : "FAIL", reasons });

const MISSING = FILES.filter((f) => !existsSync(join(CWD, f)));
if (MISSING.length) {
  console.error(`verify-assent-pair: missing ${MISSING.join(", ")} (run from the pair directory)`);
  process.exit(2);
}

const bytes = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(CWD, f))]));
const A = JSON.parse(bytes["assent-a.json"].toString("utf8"));
const B = JSON.parse(bytes["assent-b.json"].toString("utf8"));
const map = JSON.parse(bytes["expected-field-map.json"].toString("utf8"));
const manifest = JSON.parse(bytes["pair-hashes.json"].toString("utf8"));

// ------------------------------------------------------------- PIN INTEGRITY
let pinOk = true;
const pinProblems = [];
for (const f of ["assent-a.json", "assent-b.json", "expected-field-map.json"]) {
  const want = manifest.files?.[f];
  const got = "0x" + createHash("sha256").update(bytes[f]).digest("hex");
  const ok = want === got;
  if (!ok) pinProblems.push(`${f}: manifest ${want} · file ${got}`);
  pinOk = pinOk && ok;
}
add("V1", "pin integrity — emitted files match pair-hashes.json", pinOk, pinProblems);

// ------------------------------------------------------------- sharing checks
const execSame = JSON.stringify(A.execution) === JSON.stringify(B.execution);
const delivSame = JSON.stringify(A.delivery) === JSON.stringify(B.delivery);
add("V2", "execution identical in A and B", execSame);
add("V3", "delivery identical in A and B", delivSame);

// ------------------------------------------------------------- consent checks
const aA = A.consent?.parties?.principalA?.assent;
const aB = A.consent?.parties?.principalB?.assent;
const bA = B.consent?.parties?.principalA?.assent;
const bB = B.consent?.parties?.principalB?.assent;
add("V4", "party-A modeled assent present in both A and B", aA === "ASSENTED" && bA === "ASSENTED", [`A=${aA} · B=${bA}`]);
add("V5", "party-B modeled assent present in A", aB === "ASSENTED", [`A=${aB}`]);
add("V6", "party-B modeled assent missing in B (recorded UNKNOWN, never filled from the receipt)", bB === "UNKNOWN", [`B=${bB}`]);
add(
  "V7",
  "missing party-B assent preserved as an explicit unknown in B",
  Array.isArray(B.consent?.unknownFields) && B.consent.unknownFields.includes("principalBAssentForThisObligation"),
  B.consent?.unknownFields ?? []
);

// ------------------------------------------------------------- unknowns
const wantA = ["realWorldAuthority", "modeledCompensationSettlement", "meritsOutcome"];
const wantB = ["principalBAssentForThisObligation", "realWorldAuthority", "modeledCompensationSettlement", "meritsOutcome"];
const hasA = Array.isArray(A.unknowns) && wantA.every((u) => A.unknowns.includes(u));
const hasB = Array.isArray(B.unknowns) && wantB.every((u) => B.unknowns.includes(u));
add("V8", "unknowns explicit in both cases (authority · compensation · merits · B-assent)", hasA && hasB, [`A=${A.unknowns ?? []} · B=${B.unknowns ?? []}`]);

// ------------------------------------------------------------- synthetic / settle
add("V9", "both cases declared synthetic (overall package is synthetic; execution layer is a REAL public anchor)", A.synthetic === true && B.synthetic === true, [`A=${A.synthetic} · B=${B.synthetic}`]);
const settleA = A.execution?.compensationSettlement;
const settleB = B.execution?.compensationSettlement;
const settleSplitOk =
  settleA?.evidenceStatus === "NOT_EVIDENCED_AS_SETTLED" &&
  settleB?.evidenceStatus === "NOT_EVIDENCED_AS_SETTLED" &&
  settleA?.actualStatus === "UNKNOWN" &&
  settleB?.actualStatus === "UNKNOWN" &&
  settleA?.settledByExecutionCoupon === false &&
  settleB?.settledByExecutionCoupon === false &&
  !("status" in (settleA ?? {})) &&
  !("status" in (settleB ?? {}));
add(
  "V10",
  "settlement separates evidence status from actual status: NOT_EVIDENCED_AS_SETTLED + actualStatus UNKNOWN in both; no boolean NOT_SETTLED 'verified nonpayment' claim",
  settleSplitOk,
  [`A=ev:${settleA?.evidenceStatus} act:${settleA?.actualStatus} · B=ev:${settleB?.evidenceStatus} act:${settleB?.actualStatus}`]
);

const agrA = A.consent?.modeledAssent;
const agrB = B.consent?.modeledAssent;
const agrOk =
  typeof agrA === "string" && typeof agrB === "string" &&
  agrA === "FULL" && agrB === "PARTIAL" && agrB !== "FULL" &&
  !("modeledAssentStatus" in (B.consent ?? {})) &&
  B.consent?.parties?.principalB?.assent === "UNKNOWN";
add(
  "V11",
  "aggregate modeledAssent is a derived tri-state (never a boolean): A=FULL / B=PARTIAL; B's party-B UNKNOWN stays at party level",
  agrOk,
  [`A=${agrA} · B=${agrB} · partyB.assent(B)=${B.consent?.parties?.principalB?.assent}`]
);

const passed = checks.filter((c) => c.result === "PASS").length;
const failed = checks.filter((c) => c.result === "FAIL");

const div = "─".repeat(72);
console.log(`assent pair verify — ${CWD.replace(join(resolve("."), "\\"), "")}`);
console.log(div);
for (const c of checks) {
  console.log(`${c.result === "PASS" ? "✓" : "✗"} [${c.id}] ${c.name}`);
  for (const r of c.reasons) console.log(`    · ${r}`);
}
console.log(div);
console.log(`summary: ${passed}/${checks.length} passed · ${failed.length} failed`);
console.log(`decision: ${failed.length ? "REJECTED" : "ASSENT_PAIR OK — execution+delivery identical in A/B · consent separation preserved · unknowns explicit"}`);
console.log(`boundary: this pair is a synthetic modeling exercise; it does not establish real-world authority, settlement of the modeled compensation, or a merits outcome.`);
process.exit(failed.length ? 1 : 0);