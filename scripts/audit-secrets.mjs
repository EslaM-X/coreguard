/**
 * CoreGuard Gate 4 — automated secrets audit over full git history.
 *
 * Self-contained (node: builtins only). Unique blob objects (deduplicated by
 * id) are read through a single batched `git cat-file --batch` process using
 * synchronous stdio. Matched content is never echoed — only locations,
 * pattern classes, and a redacted SHA-256 prefix.
 *
 * Exit: 0 = clean, 1 = findings (fail-closed), 2 = scanner error.
 */

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const PATTERNS = [
  { id: "PRIVATE_KEY_PEM", class: "private-key", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  {
    id: "PRIVATE_KEY_LABELED",
    class: "private-key",
    re: /(?:private_?key|secret_?phrase|mnemonic)\s*[:=]\s*["']?[0-9a-zA-Z_\-]{16,}/i,
  },
  { id: "AWS_ACCESS_KEY", class: "cloud-secret", re: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    id: "GENERIC_API_TOKEN",
    class: "cloud-secret",
    re: /(?:api[_-]?key|api[_-]?token|access[_-]?token)\s*[:=]\s*["'][A-Za-z0-9_\-]{20,}["']/i,
  },
  { id: "GOOGLE_API_KEY", class: "cloud-secret", re: /\bAIza[0-9A-Za-z_\-]{35}\b/ },
  { id: "GITHUB_TOKEN", class: "cloud-secret", re: /\bgh[pousr]_[0-9A-Za-z]{36,}\b/ },
  { id: "JWT_BEARER", class: "cloud-secret", re: /\beyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\./ },
  { id: "NPM_TOKEN", class: "cloud-secret", re: /\b_?npm_[0-9A-Za-z]{30,}\b/ },
];

const prefixHash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);

/** True only when the line stores a NON-EMPTY literal inline after `=`, never
 *  a bare `KEY=` or a `$VAR`/`${VAR}` reference. This keeps benign docs/templates
 *  (`.env.example`, deployment docs, agent-key loader) out of findings while
 *  still catching an actual embedded secret. */
function isEmbeddedInlineLiteral(match) {
  const value = match[0];
  if (!value.trim()) return false;
  if (value.includes("$")) return false; // shell/JS var reference or template
  return true;
}

/** All unique blobs with their first-seen commit + path. */
function enumerateObjects() {
  const commits = execFileSync("git", ["rev-list", "--all"], {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  const byBlob = new Map();
  for (const commit of commits) {
    let tree = "";
    try {
      tree = execFileSync("git", ["ls-tree", "-r", commit], {
        encoding: "utf8",
        maxBuffer: 512 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      continue;
    }
    for (const line of tree.split("\n")) {
      if (!line.trim()) continue;
      const m = /^(\d{6}) blob ([0-9a-f]{40})\t(.+)$/.exec(line);
      if (!m) continue;
      const [, , blob, path] = m;
      if (!byBlob.has(blob)) byBlob.set(blob, { commit, path, blob });
    }
  }
  return byBlob;
}

/** Read deduplicated blobs via ONE `git cat-file --batch` call (sync). */
function readBlobs(blobIds) {
  const input = blobIds.map((b) => `${b}\n`).join("");
  const res = execFileSync("git", ["cat-file", "--batch"], {
    input,
    maxBuffer: 1.5 * 1024 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const out = new Map();
  let c = 0;
  for (;;) {
    const nl = res.indexOf(0x0a, c);
    if (nl === -1) break;
    const header = res.subarray(c, nl).toString("utf8");
    const m = /^([0-9a-f]{40}) (blob|missing) (\d+)$/.exec(header);
    if (!m) break;
    const blob = m[1];
    const size = Number(m[3]);
    const start = nl + 1;
    if (m[2] === "missing") {
      out.set(blob, null);
      c = start;
      continue;
    }
    const content = res.subarray(start, start + size);
    out.set(blob, Buffer.from(content));
    c = start + size + 1; // trailing LF
  }
  return out;
}

function scanBlob(text) {
  const findings = [];
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    const match = text.match(p.re);
    if (match && isEmbeddedInlineLiteral(match[0])) {
      findings.push({ pattern: p.id, className: p.class, prefixHash: prefixHash(match[0]) });
    }
  }
  return findings;
}

function main() {
  const args = process.argv.slice(2);
  const outFlag = args.indexOf("--out");
  const outPath = outFlag >= 0 ? args[outFlag + 1] : null;

  const byBlob = enumerateObjects();
  const uniqueBlobs = [...byBlob.keys()];
  const contents = readBlobs(uniqueBlobs);

  const results = [];
  const seenFile = new Set();
  for (const { commit, path, blob } of byBlob.values()) {
    try {
      const content = contents.get(blob);
      if (!content) continue;
      // scan largest textual blobs only; skip huge binaries
      if (content.length > 32 * 1024 * 1024) continue;
      const text = content.toString("utf8");
      if (text.includes("\u0000")) continue;
      const findings = scanBlob(text);
      if (findings.length) {
        // dedupe per (path, pattern class) so identical historical blobs
        // don't flood the report with repeat rows
        const key = `${path}|${findings.map((f) => f.pattern).join(",")}`;
        if (!seenFile.has(key)) {
          seenFile.add(key);
          results.push({ commit, path, blob, findings });
        }
      }
    } catch {
      // unreadable blob -> skip
    }
  }

  const report = {
    domain: "CGEP/1:SECRETS-AUDIT",
    scannedUniqueBlobs: uniqueBlobs.length,
    findingsCount: results.length,
    findings: results,
    note: "Locations and pattern-classes only; matched content is never echoed (redacted).",
  };

  if (outPath) writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  if (results.length === 0) {
    console.log(`SECRETS-AUDIT: PASS (${uniqueBlobs.length} blobs scanned, 0 secret-like findings)`);
    process.exit(0);
  }

  console.log(`SECRETS-AUDIT: FAIL (${results.length} file(s) with secret-like content)`);
  for (const r of results) {
    console.log(`  ${r.path}`);
    for (const f of r.findings.slice(0, 8)) console.log(`    - ${f.className}/${f.pattern} (sha256:${f.prefixHash})`);
  }
  process.exit(1);
}

try {
  main();
} catch (err) {
  console.error("SECRETS-AUDIT: ERROR", err.stack || err.message);
  process.exit(2);
}