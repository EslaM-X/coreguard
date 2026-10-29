#!/usr/bin/env node
/**
 * self-conformance.mjs — first-party CG-CS/1 record for CoreGuard itself.
 *
 * What this is: an offline, deterministic evaluator that runs the COMMITTED
 * conformance evidence (real-fixture conformance + SDK binding tests) and
 * re-derives the six CG-CS/1 criteria from what those tests just reported.
 * Its output is one record file, docs/conformance/records/coreguard-self.cgcs1.json,
 * which the owner issuance gate (npm run badge --issue ...) can mint a badge
 * from — the first-party badge that proves the issuance machine works end to
 * end, honest that it is issued by the project to itself and never to a third
 * party.
 *
 * What this is NOT:
 *   - it is NOT third-party validation. The subject is FIRST-PARTY by design
 *     and the record says so on its face.
 *   - it is NOT a substitute for an external conformance run: CG-CS/1 evidence
 *     from real third-party integrations still produces zero badge issuers.
 *   - it is NOT hand-authored prose. Every boolean is read back from TAP
 *     lines of a named committed test file, and the record embeds the map
 *     (file + test-name prefixes) so any reader can re-run and compare.
 *
 * Deterministic: no Date, no random, no locale. Same committed evidence in,
 * same record bytes out.
 */

import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SUITE = "CG-CS/1";
export const SUBJECT = "COREGUARD SELF · FIRST-PARTY";

/* The six criteria and the committed evidence each one is derived from.
   Each entry: { file, prefixes } — prefixes are TAP test-name matchers
   matched case-sensitively against the reporter output. A criterion passes
   only if EVERY prefix matched at least one `ok` line. */
export const CRITERIA_EVIDENCE = Object.freeze({
  evidenceContractPass: { file: "test/conformance/live/conformance.test.mjs", prefixes: ["C-L-1 chainId", "C-L-2 block-pin", "C-L-3 transaction", "C-L-4 receipt/log", "C-L-5b attestation"] },
  determinismPass: { file: "test/conformance/live/conformance.test.mjs", prefixes: ["C-L-7 determinism double-run", "determinism over Path B"] },
  replayPass: { file: "test/conformance/live/conformance.test.mjs", prefixes: ["C-L-5 extraction end-to-end", "C-L-6 independent recomputation", "C-L-8 read-only guard"] },
  tamperDetectionPass: { file: "test/conformance/live/conformance.test.mjs", prefixes: ["A-W5-1 wrong block hash", "A-W5-3 altered logs", "A-W5-8 target/selector/value"] },
  securityCheckPass: { file: "(inline: tracked secrets scan)", prefixes: ["no tracked .env in git", "no credential pattern in code tree"] },
  compatibilityPass: { file: "test/sdk/sdk-binding.test.js", prefixes: ["W2-I"] },
});

/* Evidence prefixes carried INSIDE the conformance file additionally feed
   compatibility — run as part of the conformance file below. */
const CONFORMANCE_COMPAT_PREFIXES = ["vocabulary guard", "canonicalizer casing parity"];

/** Credential denylist for the inline security criterion (code tree only). */
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
  /npm_[A-Za-z0-9]{36}/,
  /ghp_[A-Za-z0-9]{36}/,
];

function runTAP(file) {
  const res = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "--test-concurrency=1", file], {
    cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  const out = (res.stdout || "") + (res.stderr || "");
  if (res.status !== 0) return { ok: false, names: [], error: out.slice(-600) };
  // TAP lines: `ok 5 - name` / `not ok 9 - name`
  const names = [];
  for (const m of out.matchAll(/^(?:not )?ok \d+(?: - (.*))?$/gm)) {
    if (!m[0].startsWith("not ok")) names.push(m[1] || "");
  }
  return { ok: true, names, error: null };
}

/** Match a TAP test name against one prefix (case-sensitive substring). */
function matchedAny(name, prefixes) {
  return prefixes.some((p) => name.includes(p));
}

/** Inline security criterion over the tracked code tree (no docs: docs teach). */
function runSecurityChecks() {
  const checks = [
    ["no tracked .env in git", () => {
      const ls = spawnSync("git", ["ls-files"], { cwd: REPO, encoding: "utf8" });
      if (ls.status !== 0) return false;
      const files = (ls.stdout || "").split(/\r?\n/).filter(Boolean);
      // a real .env tracked in git is a leak; .env.example-style templates may ship
      return !files.some((f) => f.startsWith(".env") && !/\.(example|sample|template)$/.test(f));
    }],
    ["no credential pattern in code tree", () => {
      const ls = spawnSync("git", ["ls-files", "scripts", "packages"], { cwd: REPO, encoding: "utf8" });
      if (ls.status !== 0) return false;
      for (const f of (ls.stdout || "").split(/\r?\n/).filter(Boolean)) {
        let buf;
        try { buf = readFileSync(join(REPO, f), "utf8"); } catch { return false; }
        for (const p of SECRET_PATTERNS) if (p.test(buf)) return false;
      }
      return true;
    }],
  ];
  return checks.map(([label, check]) => ({ label, pass: check() }));
}

/**
 * evaluateSelfConformance — run the committed evidence and derive the record.
 * Offline (fixtures only), deterministic, fail-closed: any failed or missing
 * evidence makes the relevant criterion false and the verdict NOT_CONFORMANT.
 */
export function evaluateSelfConformance() {
  const files = [...new Set(Object.values(CRITERIA_EVIDENCE).map((e) => e.file.replace("(inline: tracked secrets scan)", "__inline__")))];
  const tapRuns = {};
  for (const f of files) {
    if (f === "__inline__") continue;
    if (!tapRuns[f]) tapRuns[f] = runTAP(f);
  }
  const inline = runSecurityChecks();
  const inlineAllPass = inline.every((c) => c.pass);

  const criteria = Object.entries(CRITERIA_EVIDENCE).map(([id, ev]) => {
    if (ev.file.includes("inline")) {
      return { id, pass: inlineAllPass, evidence: inline.map((c) => ({ kind: "inline-scan", label: c.label, pass: c.pass })) };
    }
    const run = tapRuns[ev.file];
    const ok = run.ok ? ev.prefixes.every((p) => run.names.some((n) => n.includes(p))) : false;
    return {
      id,
      pass: run.ok && ok,
      evidence: [{
        kind: "committed-test-file",
        file: ev.file,
        prefixes: ev.prefixes,
        testFileExitZero: run.ok,
        matched: run.ok ? ev.prefixes.map((p) => (run.names.some((n) => n.includes(p)) ? p : null)).filter(Boolean) : [],
      }],
    };
  });

  /* compatibility also consumes the in-file compatibility prefixes so the
     adapter-contract criterion is stronger than one SDK file alone */
  const run0 = tapRuns[CRITERIA_EVIDENCE.replayPass.file];
  const compatExtra = run0.ok ? CONFORMANCE_COMPAT_PREFIXES.every((p) => run0.names.some((n) => n.includes(p))) : false;
  const compat = criteria.find((c) => c.id === "compatibilityPass");
  compat.pass = compat.pass && compatExtra;
  compat.evidence.push({ kind: "committed-test-file", file: CRITERIA_EVIDENCE.replayPass.file, prefixes: CONFORMANCE_COMPAT_PREFIXES, matched: run0.ok ? CONFORMANCE_COMPAT_PREFIXES.filter((p) => run0.names.some((n) => n.includes(p))) : [] });

  const allPass = criteria.every((c) => c.pass);
  const record = {
    schema: SUITE,
    subject: SUBJECT,
    party: "FIRST-PARTY",
    firstPartyNote: "Issued by CoreGuard to itself to prove the issuance machine end to end. This is NOT third-party validation and never a badge for a counterparty; the badge system issues nothing to any third party (issuerCount 0).",
    suite: SUITE,
    party: "FIRST-PARTY",
    criteria,
    results: Object.fromEntries(criteria.map((c) => [c.id, c.pass])),
    verdict: allPass ? "CONFORMANT" : "NOT_CONFORMANT",
    infrastructure: {
      offline: true,
      deterministic: true,
      runCommand: "node scripts/ladder/self-conformance.mjs",
      badgeGate: "npm run badge -- --issue --record docs/conformance/records/coreguard-self.cgcs1.json --i-am-the-owner-and-competent-to-issue",
    },
  };
  return record;
}

export function writeSelfRecord() {
  const record = evaluateSelfConformance();
  const path = "docs/conformance/records/coreguard-self.cgcs1.json";
  mkdirSync(join(REPO, dirname(path)), { recursive: true });
  writeFileSync(join(REPO, path), JSON.stringify(record, null, 2) + "\n", "utf8");
  return { record, file: path, conformant: record.verdict === "CONFORMANT" };
}

function main() {
  const out = writeSelfRecord();
  const { record } = out;
  console.log(`SELF-CONFORMANCE ${SUITE} — ${record.subject}`);
  for (const c of record.criteria) {
    console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${c.id}${c.evidence.filter((e) => e.file).map((e) => `  ← ${e.file}`).join("")}`);
  }
  console.log(`verdict: ${record.verdict}`);
  console.log(`record:  ${out.file}`);
  process.exit(out.conformant ? 0 : 1);
}

if (process.argv[1] && process.argv[1].endsWith("self-conformance.mjs")) main();
