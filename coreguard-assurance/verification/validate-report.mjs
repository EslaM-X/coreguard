#!/usr/bin/env node
// ============================================================================
// COREGUARD ASSURANCE - REPORT VALIDATOR (validate-report.mjs)
// ----------------------------------------------------------------------------
// Independent, zero-dependency validator for verification-report.json
// (schema cg41-report/2, findings cg41-finding/1).
//
// Three validation roles:
//   1. STRUCTURAL  - schema-equivalent checks (types, enums, patterns, refs)
//   2. SEMANTIC    - cross-checks: summary vs findings recomputation,
//                    duplicate ids, status-vs-blockers, supersedes ordering
//   3. EXPECTED    - argv --expect comparisons for CI / reviewer reproduction
//
// Modes:
//   node validate-report.mjs <report.json>
//   node validate-report.mjs <report.json> --expect '{"summary.pass":29,...}'
//   node validate-report.mjs <report.json> --verify-input-hashes
//
// Exit codes: 0 = valid (and expectations met) | 1 = invalid | 2 = usage error.
// Separation of duties: this validator NEVER writes and NEVER authorizes.
// ============================================================================
import { readFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPORT_SCHEMA = "cg41-report/2";
const RULE_VERSION = "cg41-policy-v1";
const STATUSES = ["PASS", "FAIL", "BLOCKED", "INCONCLUSIVE", "NOT_APPLICABLE"];
const SEVERITIES = ["BLOCKER", "MAJOR", "MINOR", "INFO"];
const NON_PASS_BLOCKING = ["FAIL", "BLOCKED", "INCONCLUSIVE"];
const ROLES = new Set([
  "kit", "cast", "manifest", "engine-self",
  "policy-core", "policy-rpc", "policy-roots", "policy-patterns", "policy-lock",
]);
const HEX64 = /^0x[0-9a-f]{64}$/;
const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const ID_RE = /^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*$/;

const errors = [];
let checks = 0;
function fail(msg) { errors.push(msg); }
function assert(cond, msg) { checks++; if (!cond) fail(msg); }

// ---- load ------------------------------------------------------------------
const argv = process.argv.slice(2);
const reportPath = argv.find((a) => !a.startsWith("--"));
const expectIdx = argv.indexOf("--expect");
const verifyHashes = argv.includes("--verify-input-hashes");
if (!reportPath || expectIdx === -1 && argv.includes("--expect")) {
  console.error("usage: node validate-report.mjs <report.json> [--expect '<json>'] [--verify-input-hashes]");
  process.exit(2);
}
let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} catch (e) {
  console.error(`[invalid] report is not parseable JSON: ${e.message}`);
  process.exit(1);
}

// ---- 1. STRUCTURAL ---------------------------------------------------------
for (const k of ["tool", "toolVersion", "schemaVersion", "supersedesVersion", "ruleVersion",
  "policyVersion", "policyId", "gate", "dateUtc", "status", "decision", "claim",
  "stages", "summary", "findings", "authorization", "inputHashes"]) {
  assert(report[k] !== undefined, `missing required field: ${k}`);
}
assert(report.schemaVersion === REPORT_SCHEMA, `schemaVersion must be ${REPORT_SCHEMA}`);
assert(SEMVER_RE.test(report.toolVersion || ""), "toolVersion must be semver x.y.z");
assert(SEMVER_RE.test(report.supersedesVersion || ""), "supersedesVersion must be semver x.y.z");
assert(report.ruleVersion === RULE_VERSION, `ruleVersion must be ${RULE_VERSION}`);
assert(UTC_RE.test(report.dateUtc || ""), "dateUtc must be ISO-8601 UTC (....Z)");
if (UTC_RE.test(report.dateUtc || "")) {
  const t = Date.parse(report.dateUtc);
  assert(Number.isFinite(t) && t <= Date.now() + 5 * 60 * 1000, "dateUtc is in the future");
}
assert(["BLOCKED", "FAILED", "INCONCLUSIVE", "VERIFIED-READONLY-ONLY"].includes(report.status),
  `status '${report.status}' outside closed set`);
assert(["CONDITIONAL NO-GO", "NO-GO"].includes(report.decision),
  `decision '${report.decision}' outside closed set (engine never emits GO)`);
assert(typeof report.claim === "string" && report.claim.includes("NOT a proof of absence of such a path"),
  "claim must carry the bounded-claim wording (spec section 7)");

const s = report.summary || {};
for (const k of ["pass", "fail", "blocked", "inconclusive", "notApplicable", "total", "failClosedFailures"]) {
  assert(Number.isInteger(s[k]) && s[k] >= 0, `summary.${k} must be a non-negative integer`);
}
assert(Array.isArray(report.findings) && report.findings.length >= 1, "findings must be a non-empty array");
assert(Array.isArray(report.inputHashes) && report.inputHashes.length >= 1, "inputHashes must be a non-empty array");

const auth = report.authorization || {};
for (const k of ["signing", "commitIntent", "anchorProof", "mainnetBroadcast"]) {
  assert(auth[k] === "NOT AUTHORIZED", `authorization.${k} must be 'NOT AUTHORIZED' (got '${auth[k]}')`);
}

// findings structural
const seenIds = new Map();
(report.findings || []).forEach((f, i) => {
  const at = `findings[${i}]`;
  for (const k of ["id", "status", "severity", "ruleVersion", "description", "failClosed", "evidence"]) {
    assert(f[k] !== undefined, `${at}: missing required field '${k}'`);
  }
  assert(typeof f.id === "string" && ID_RE.test(f.id), `${at}: bad id '${f.id}'`);
  assert(STATUSES.includes(f.status), `${at}: status '${f.status}' outside closed vocabulary`);
  assert(SEVERITIES.includes(f.severity), `${at}: severity '${f.severity}' outside closed set`);
  assert(f.ruleVersion === RULE_VERSION, `${at}: ruleVersion must be ${RULE_VERSION}`);
  assert(typeof f.description === "string" && f.description.trim().length >= 8,
    `${at}: description too short / not a statement`);
  assert(typeof f.failClosed === "boolean", `${at}: failClosed must be boolean`);
  assert(f.evidence !== null && typeof f.evidence === "object" && !Array.isArray(f.evidence)
    && Object.keys(f.evidence).length >= 1, `${at}: evidence must be a non-empty object (M7)`);
  if (seenIds.has(f.id)) {
    fail(`${at}: duplicate finding id '${f.id}' (M1 violation; first at findings[${seenIds.get(f.id)}])`);
    checks++;
  } else {
    seenIds.set(f.id, i);
    checks++;
  }
  if (["MINOR", "INFO"].includes(f.severity) && f.status !== "PASS"
    && !(f.evidence && f.evidence.reason)) {
    fail(`${at}: non-PASS ${f.severity} finding needs evidence.reason (D5)`);
    checks++;
  } else {
    checks++;
  }
});

// inputHashes structural
(report.inputHashes || []).forEach((h, i) => {
  const at = `inputHashes[${i}]`;
  for (const k of ["file", "sha256", "bytes", "role"]) {
    assert(h[k] !== undefined, `${at}: missing '${k}'`);
  }
  assert(HEX64.test(h.sha256 || ""), `${at}: sha256 must be 0x + 64 lowercase hex`);
  assert(Number.isInteger(h.bytes) && h.bytes >= 0, `${at}: bytes must be a non-negative integer`);
  assert(ROLES.has(h.role), `${at}: role '${h.role}' outside closed role set`);
  checks++;
});

// ---- 2. SEMANTIC -----------------------------------------------------------
const recount = { PASS: 0, FAIL: 0, BLOCKED: 0, INCONCLUSIVE: 0, NOT_APPLICABLE: 0 };
let fcFailures = 0;
for (const f of report.findings || []) {
  recount[f.status] = (recount[f.status] || 0) + 1;
  if (f.failClosed && NON_PASS_BLOCKING.includes(f.status)) fcFailures++;
}
assert(s.pass === recount.PASS, `summary.pass ${s.pass} != recomputed ${recount.PASS}`);
assert(s.fail === recount.FAIL, `summary.fail ${s.fail} != recomputed ${recount.FAIL}`);
assert(s.blocked === recount.BLOCKED, `summary.blocked ${s.blocked} != recomputed ${recount.BLOCKED}`);
assert(s.inconclusive === recount.INCONCLUSIVE, `summary.inconclusive ${s.inconclusive} != recomputed ${recount.INCONCLUSIVE}`);
assert(s.notApplicable === recount.NOT_APPLICABLE, `summary.notApplicable ${s.notApplicable} != recomputed ${recount.NOT_APPLICABLE}`);
assert(s.total === (report.findings || []).length, `summary.total ${s.total} != findings length`);
assert(s.failClosedFailures === fcFailures, `summary.failClosedFailures ${s.failClosedFailures} != recomputed ${fcFailures}`);

const blockersNonPass = (report.findings || []).filter(
  (f) => f.severity === "BLOCKER" && NON_PASS_BLOCKING.includes(f.status));
const expectedStatus = blockersNonPass.length > 0 ? "BLOCKED"
  : (recount.FAIL > 0 ? "FAILED"
    : (recount.INCONCLUSIVE > 0 ? "INCONCLUSIVE" : "VERIFIED-READONLY-ONLY"));
assert(report.status === expectedStatus,
  `status '${report.status}' inconsistent with findings (expected '${expectedStatus}')`);

// supersedes ordering (M5): toolVersion must be >= supersedesVersion
function semverLt(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const A = a.split(".").map(Number);
  const B = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (A[i] !== B[i]) return A[i] < B[i];
  }
  return false;
}
if (report.supersedesVersion !== undefined) {
  assert(!semverLt(report.toolVersion, report.supersedesVersion),
    `toolVersion ${report.toolVersion} must be >= supersedesVersion ${report.supersedesVersion} (M5)`);
  checks++;
}

// ---- 3. INPUT HASH VERIFICATION (optional) ---------------------------------
if (verifyHashes) {
  const baseDirs = [dirname(reportPath), process.cwd()];
  for (const h of report.inputHashes || []) {
    let p = h.file;
    if (!existsSync(p)) {
      const alt = baseDirs.map((b) => join(b, h.file)).find(existsSync);
      if (alt) p = alt;
    }
    if (!existsSync(p)) { fail(`inputHashes: file not found on disk: ${h.file}`); checks++; continue; }
    const buf = readFileSync(p);
    const sha = "0x" + createHash("sha256").update(buf).digest("hex");
    assert(sha === h.sha256, `inputHashes: ${h.file} sha256 mismatch (disk ${sha} vs report ${h.sha256})`);
    assert(buf.length === h.bytes, `inputHashes: ${h.file} bytes mismatch (disk ${buf.length} vs report ${h.bytes})`);
  }
}

// ---- 4. EXPECTATIONS (optional) --------------------------------------------
if (expectIdx !== -1) {
  let exp;
  try { exp = JSON.parse(argv[expectIdx + 1]); } catch (e) {
    console.error(`[invalid] --expect is not valid JSON: ${e.message}`);
    process.exit(1);
  }
  for (const [path, want] of Object.entries(exp)) {
    let got = report;
    let ok = true;
    for (const part of path.split(".")) {
      const m = part.match(/^(\w+)\[(\d+)\]$/);
      const key = m ? m[1] : part;
      if (got === undefined || got === null) { ok = false; break; }
      got = m ? got[key][Number(m[2])] : got[key];
    }
    const eq = got === want || String(got) === String(want);
    assert(ok && eq, `expect ${path}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}

// ---- verdict ----------------------------------------------------------------
const valid = errors.length === 0;
console.log(`validate-report: ${valid ? "PASS" : "FAIL"} (${checks} checks, ${errors.length} errors)`);
for (const e of errors) console.log(`[invalid] ${e}`);
process.exit(valid ? 0 : 1);
