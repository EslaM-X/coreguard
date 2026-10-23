/**
 * refusal-audit.mjs — CG-RA/1, refusal audit log (fail-closed, no secrets).
 *
 * Purpose: record every REFUSED action (who/what/why) without keys, addresses,
 * tokens, payloads, or real money. Designed to prove "refuse-before-sign" with
 * an auditable trail. Cannot fabricate approvals; only records refusals.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

export const REFUSAL_AUDIT_VERSION = "CG-RA/1";

function ensureDir(p) { try { if (!existsSync(p)) mkdirSync(p, { recursive: true }); } catch {} }

function canonical(x) {
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (Array.isArray(x)) return "[" + x.map(canonical).join(",") + "]";
  const keys = Object.keys(x).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + canonical(x[k])).join(",") + "}";
}

export function refusalDigest(entry) {
  const payload = {
    ts: entry.ts,
    source: entry.source,
    reasonCode: entry.reasonCode,
    jobId: entry.jobId || null,
    scopeId: entry.scopeId || null,
    challengeId: entry.challengeId || null,
    action: entry.action || null,
  };
  return createHash("sha256").update(canonical(payload)).digest("hex");
}

export function createRefusalAuditor({ logDir = null } = {}) {
  const dir = logDir || join(process.cwd(), "var", "refusal-audit");
  ensureDir(dir);
  const logPath = join(dir, "refusals.jsonl");
  let count = 0;

  function record(event = {}) {
    if (!event || typeof event !== "object") throw new TypeError("refusal-audit: event object required");
    if (typeof event.reasonCode !== "string" || event.reasonCode.length === 0) throw new TypeError("refusal-audit: reasonCode required");
    if (typeof event.source !== "string" || event.source.length === 0) throw new TypeError("refusal-audit: source required");

    const ts = event.ts || new Date().toISOString();
    const entry = {
      v: REFUSAL_AUDIT_VERSION,
      ts,
      source: event.source,
      action: event.action || "SIGN",
      reasonCode: event.reasonCode,
      reason: typeof event.reason === "string" ? event.reason.slice(0, 200) : undefined,
      jobId: event.jobId ? String(event.jobId).slice(0, 64) : undefined,
      scopeId: event.scopeId ? String(event.scopeId).slice(0, 64) : undefined,
      challengeId: event.challengeId ? String(event.challengeId).slice(0, 64) : undefined,
      requestId: event.requestId ? String(event.requestId).slice(0, 64) : undefined,
      // Never log secrets/keys/payloads/amounts that could be sensitive in raw form
    };
    const digest = refusalDigest(entry);
    const line = JSON.stringify({ ...entry, digest }) + "\n";
    try {
      appendFileSync(logPath, line, "utf8");
    } catch (e) {
      throw new Error("refusal-audit: failed to write log: " + e.message);
    }
    count++;
    return { ok: true, logged: true, digest, logPath };
  }

  function list({ limit = 100 } = {}) {
    if (!existsSync(logPath)) return [];
    const txt = readFileSync(logPath, "utf8");
    const lines = txt.split(/\r?\n/).filter(Boolean);
    const out = [];
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
      try { out.push(JSON.parse(lines[i])); } catch {}
    }
    return out.reverse();
  }

  function stats() {
    const all = list({ limit: 10_000 });
    const byReason = {};
    const bySource = {};
    for (const e of all) {
      byReason[e.reasonCode] = (byReason[e.reasonCode] || 0) + 1;
      bySource[e.source] = (bySource[e.source] || 0) + 1;
    }
    return { ok: true, count: all.length, byReason, bySource, logPath };
  }

  return { version: REFUSAL_AUDIT_VERSION, logPath, record, list, stats };
}

export function selfCheck() {
  const cases = [];
  const auditor = createRefusalAuditor({ logDir: join(process.cwd(), "var", "refusal-audit-test-" + Date.now()) });
  const r1 = auditor.record({ source: "x402", reasonCode: "BUDGET_INSUFFICIENT", jobId: "j1", action: "SIGN" });
  cases.push(["record refusal", r1.ok && r1.logged && typeof r1.digest === "string"]);
  const r2 = auditor.record({ source: "budget", reasonCode: "CEILING_EXCEEDED", jobId: "j1", scopeId: "s1" });
  cases.push(["record second refusal", r2.ok]);
  const st = auditor.stats();
  cases.push(["stats count >= 2", st.count >= 2]);
  const d1 = refusalDigest({ ts: "2025-01-01T00:00:00Z", source: "x402", reasonCode: "X", jobId: "j1", scopeId: null, challengeId: null, action: "SIGN" });
  const d2 = refusalDigest({ ts: "2025-01-01T00:00:00Z", source: "x402", reasonCode: "X", jobId: "j1", scopeId: null, challengeId: null, action: "SIGN" });
  cases.push(["digest deterministic", d1 === d2]);
  const ok = cases.every(([, pass]) => pass);
  return { ok, cases };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-check") || args.length === 0) {
    const result = selfCheck();
    console.log(`REFUSAL AUDIT — ${REFUSAL_AUDIT_VERSION}`);
    for (const [label, pass] of result.cases) console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}`);
    console.log(`\nREFUSAL-AUDIT SELF-CHECK: ${result.ok ? "PASS" : "FAIL"}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  console.log("usage: node packages/refusal-audit/index.mjs --self-check");
  process.exitCode = 2;
}

if (process.argv[1] && process.argv[1].endsWith("index.mjs")) main();
