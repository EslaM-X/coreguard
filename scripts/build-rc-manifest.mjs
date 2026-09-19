/**
 * CoreGuard Gate 7 — RC manifest generator (zero-dep, Node builtins only).
 *
 * Produces a named release-candidate manifest with per-file SHA-256 of the
 * tracked + new working-tree files. The output is a DRAFT artifact: it is NOT
 * a release, does NOT push, and stays honest about its uncommitted status.
 * Generation via Node (never PowerShell) — encoding-hygiene rule.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, statSync, writeFileSync } from "node:fs";

function sha256File(p) {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

const candidate = process.argv[2] || "rc-2026-09-19-a";
const outPath = process.argv[3] || "docs/rc-manifest-2026-09-19.json";

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);

const rcFiles = [];
for (const f of tracked) {
  if (existsSync(f) && !lstatSync(f).isDirectory()) {
    rcFiles.push({
      file: f.replace(/\\/g, "/"),
      sha256: sha256File(f),
      bytes: statSync(f).size,
    });
  }
}

const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim().length > 0;

const manifest = {
  recordId: "coreguard-rc-manifest-001",
  candidate,
  status: dirty
    ? "DRAFT - working tree is DIRTY (uncommitted changes included above); not a release, pending commit + owner GO"
    : "DRAFT - clean working tree; not a release, pending owner GO",
  generatedBy: "scripts/build-rc-manifest.cjs (node, zero-dep)",
  generatedAtUtc: new Date().toISOString(),
  headCommit: head,
  headDirty: dirty,
  counts: { files: rcFiles.length },
  sha256: Object.fromEntries(rcFiles.map((r) => [r.file, r.sha256])),
  files: rcFiles,
};

writeFileSync(outPath, JSON.stringify(manifest, null, 2), "utf8");
console.log(`rc-manifest: ${candidate} → ${outPath} (${rcFiles.length} files, head=${head.slice(0, 12)}, dirty=${dirty})`);