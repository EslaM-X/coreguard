#!/usr/bin/env node
/**
 * boundary-audit.mjs — machine-enforced boundary layer.
 *
 * Turns the project's "we will NOT claim / we will NOT do" contract into
 * fail-closed checks against the LIVE working tree (not just git history):
 *
 *   B1 SECRETS           no credential material anywhere in scanned text
 *   B2 STATUS_HONESTY    emitted statuses must stay within the honest set:
 *                        networkCall = NOT_PERFORMED · deployed = false ·
 *                        integrationStatus in {NOT_BUILT, DRY-RUN,
 *                        NOT_AUTHORIZED, UNKNOWN} · awardSlot.status = UNKNOWN
 *   B3 EXECUTION_REQ     no settlement/broadcast/release-execution request
 *                        fields in emitted JSON (true/executed/…)
 *
 * Excluded by design (reported in the audit, never silent): `.git`,
 * `node_modules` (third-party dependency copies), `legacy-quarantine/**`
 * (quarantined legacy broadcast/private-key scripts — byte-identical originals
 * by contract; the exclusion itself is asserted by the test suite), and local
 * environment secret files (basename `/^\.env(\.|$)/` except `*.example`) —
 * local untracked secrets stay out of scan scope, while a separate
 * git-tracking guard asserts they are never committed.
 *
 * Usage:
 *   node scripts/boundary-audit.mjs [--root <dir>] [--out <report.json>]
 *
 * Exit: 0 = clean, 1 = violations found (fail-closed), 2 = scanner error —
 * a root that does not exist, or a scan that yields zero in-scope files,
 * exits 2: an empty scan certifies nothing and must never report PASS.
 * Matched content is never echoed — only paths, check ids, and a redacted
 * SHA-256 prefix.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

const EXCLUDED_DIRS = new Set([".git", "node_modules", "legacy-quarantine"]);
const LOCAL_ENV_RE = /^\.env($|\.)/;
const MAX_TEXT_BYTES = 4 * 1024 * 1024;
const MAX_JSON_BYTES = 8 * 1024 * 1024;

const SECRET_PATTERNS = [
  { id: "PRIVATE_KEY_PEM", className: "private-key", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { id: "PRIVATE_KEY_LABELED", className: "private-key", re: /(?:private_?key|secret_?phrase|mnemonic)\s*[:=]\s*["']?[0-9a-zA-Z_\-]{16,}/i },
  { id: "AWS_ACCESS_KEY", className: "cloud-secret", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "GENERIC_API_TOKEN", className: "cloud-secret", re: /(?:api[_-]?key|api[_-]?token|access[_-]?token)\s*[:=]\s*["'][A-Za-z0-9_\-]{20,}["']/i },
  { id: "GOOGLE_API_KEY", className: "cloud-secret", re: /\bAIza[0-9A-Za-z_\-]{35}\b/ },
  { id: "GITHUB_TOKEN", className: "cloud-secret", re: /\bgh[pousr]_[0-9A-Za-z]{36,}\b/ },
  { id: "JWT_BEARER", className: "cloud-secret", re: /\beyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\./ },
  { id: "NPM_TOKEN", className: "cloud-secret", re: /\b_?npm_[0-9A-Za-z]{30,}\b/ },
];

const STATUS_ALLOWED = new Set(["NOT_BUILT", "DRY-RUN", "NOT_AUTHORIZED", "UNKNOWN"]);
const EXEC_KEYS = /^(?:deployed|broadcast|releaseFunds|released|settled|settlementExecuted|executed|transferExecuted)$/i;
const EXEC_VALUES = new Set(["true", "executed", "performed", "complete", "authorized", "succeeded", "accepted"]);

const prefixHash = (s) => createHash("sha256").update(String(s)).digest("hex").slice(0, 12);

function walk(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!EXCLUDED_DIRS.has(e.name)) stack.push(join(dir, e.name));
      } else if (e.isFile()) {
        if (LOCAL_ENV_RE.test(e.name) && !e.name.endsWith(".example")) continue;
        out.push(join(dir, e.name));
      }
    }
  }
  return out;
}

/** Structural walk of parsed JSON: status honesty (B2) + execution requests (B3). */
function inspectJson(obj, path, filePath, findings) {
  const stack = [{ value: obj, keyPath: "" }];
  while (stack.length) {
    const { value, keyPath } = stack.pop();
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) stack.push({ value: value[i], keyPath: `${keyPath}[${i}]` });
      continue;
    }
    if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        const childPath = keyPath ? `${keyPath}.${k}` : k;
        if (v !== null && typeof v === "object") {
          stack.push({ value: v, keyPath: childPath });
          continue;
        }
        if (typeof v === "boolean" || typeof v === "string" || typeof v === "number") {
          const sv = String(v);
          if (k === "networkCall" && sv !== "NOT_PERFORMED") {
            findings.push({ file: path, path: childPath, check: "B2/netcall", className: "status-honesty", prefix: prefixHash(sv) });
          }
          if (k === "integrationStatus" && !STATUS_ALLOWED.has(sv)) {
            findings.push({ file: path, path: childPath, check: "B2/integration", className: "status-honesty", prefix: prefixHash(sv) });
          }
          if (EXEC_KEYS.test(k) && (v === true || EXEC_VALUES.has(sv.toLowerCase()))) {
            findings.push({ file: path, path: childPath, check: "B3/exec-req", className: "execution-request", prefix: prefixHash(sv) });
          }
        }
      }
      // awardSlot status check at the object level
      if (Object.prototype.hasOwnProperty.call(value, "awardSlot") && value.awardSlot && typeof value.awardSlot === "object") {
        const st = value.awardSlot.status;
        if (st !== undefined && st !== "UNKNOWN") {
          findings.push({ file: path, path: `${keyPath ? keyPath + "." : ""}awardSlot.status`, check: "B2/award-slot", className: "status-honesty", prefix: prefixHash(st) });
        }
      }
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf("--root");
  const outIdx = args.indexOf("--out");
  const root = resolve(rootIdx >= 0 ? args[rootIdx + 1] : REPO);
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null;

  if (!existsSync(root) || !statSync(root).isDirectory()) {
    console.error(`BOUNDARY-AUDIT: ERROR  root does not exist or is not a directory: ${root}`);
    process.exit(2);
  }

  const files = walk(root);
  if (files.length === 0) {
    console.error(`BOUNDARY-AUDIT: ERROR  0 files in scan scope under ${root} — refusing to certify an empty scan (fail-closed)`);
    process.exit(2);
  }
  const findings = [];
  let scannedText = 0;
  let scannedJson = 0;

  for (const file of files) {
    let stat;
    try {
      stat = statSync(file);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size > MAX_TEXT_BYTES) continue;
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (text.includes("\u0000") || text.length > MAX_TEXT_BYTES) continue;
    const rel = relative(root, file);

    for (const p of SECRET_PATTERNS) {
      const m = text.match(p.re);
      if (m) findings.push({ file: rel, path: "content", check: `B1/${p.id}`, className: p.className, prefix: prefixHash(m[0]) });
    }

    if (/\.json$/i.test(file)) {
      scannedJson++;
      if (stat.size <= MAX_JSON_BYTES && text.trim().startsWith("{")) {
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }
        if (parsed && typeof parsed === "object") inspectJson(parsed, rel, rel, findings);
      }
    }
    if (!/\.json$/i.test(file)) scannedText++;
  }

  const report = {
    protocol: "CGEP/1:BOUNDARY-AUDIT",
    scannedRoot: root,
    excludedDirs: [...EXCLUDED_DIRS].sort(),
    localEnvFilesExcluded: "basename /^\\.env($|\\.)/ except *.example — untracked local secrets are out of scan scope; git-tracking guard asserts they are never committed",
    scannedFiles: files.length,
    scannedText,
    scannedJson,
    findingsCount: findings.length,
    findings,
    note: "Fail-closed boundary enforcement: paths, check ids, and redacted SHA-256 prefixes only — matched content is never echoed.",
  };

  if (outPath) writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  if (findings.length === 0) {
    console.log(`BOUNDARY-AUDIT: PASS (${files.length} files scanned, 0 violations)`);
    process.exit(0);
  }

  console.log(`BOUNDARY-AUDIT: FAIL (${findings.length} violation(s))`);
  for (const f of findings.slice(0, 40)) {
    console.log(`  ${f.file} :: ${f.path} :: ${f.check} (sha256:${f.prefix})`);
  }
  if (findings.length > 40) console.log(`  … and ${findings.length - 40} more`);
  process.exit(1);
}

try {
  main();
} catch (err) {
  console.error("BOUNDARY-AUDIT: ERROR", err.stack || err.message);
  process.exit(2);
}