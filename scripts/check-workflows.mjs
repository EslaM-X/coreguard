#!/usr/bin/env node
/**
 * Workflow-YAML guard — the "zero jobs" trap.
 *
 * If a `run:` step is written as a PLAIN (unquoted, non-block) scalar that
 * continues on the next, more-indented line, and any continuation contains
 * ": ", the whole workflow file is unparseable. GitHub then reports the run as
 * `failure` with ZERO jobs built — no logs, nothing to bisect. That signature
 * *is* the unparseable-file signature.
 *
 * History (why this exists): red run 35480761761 (commit 6c4ca1d) added a
 * multiline plain `run:` whose body contained `{ port: 0 }` → zero jobs.
 *
 * A valid `run:` value is therefore exactly one of:
 *   - a single-line plain scalar   run: node x.js
 *   - a quoted scalar              run: "node x.js \"$Y\""
 *   - a block scalar               run: |   (or >, |-, |+, >2, ...)
 * A plain scalar followed by a more-indented, non-comment line is always a
 * defect here and is rejected with file + line.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Return [{ line, indent, value, continuationLine }] for every plain-scalar
 *  multi-line `run:` in the given workflow text. Pure + testable. */
export function findPlainContinuations(text) {
  const lines = text.split(/\r?\n/);
  const problems = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)(?:-\s+)?run:\s*(.*)$/);
    if (!m) continue;
    const hasDash = /^\s*-\s+run:/.test(lines[i]);
    const indent = m[1].length + (hasDash ? 2 : 0);
    const trimmed = m[2].trim();
    if (trimmed === "") continue;          // value is on following block lines
    if (/^[|>]/.test(trimmed)) continue;   // block scalar is safe
    if (/^['"]/.test(trimmed)) continue;   // quoted scalar is safe
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      if (next.trim() === "" || next.trim().startsWith("#")) continue;
      const nextIndent = next.match(/^\s*/)[0].length;
      if (nextIndent > indent) {
        problems.push({ line: i + 1, indent, value: trimmed.slice(0, 60), continuationLine: j + 1 });
      }
      break;
    }
  }
  return problems;
}

export function checkWorkflows(root = ROOT) {
  const dir = join(root, ".github", "workflows");
  const files = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    : [];
  const results = files.map((f) => ({ file: f, problems: findPlainContinuations(readFileSync(join(dir, f), "utf8")) }));
  return { ok: results.every((r) => r.problems.length === 0), results };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]).toLowerCase() : "";
if (invokedPath && resolve(fileURLToPath(import.meta.url)).toLowerCase() === invokedPath) {
  const res = checkWorkflows();
  if (res.ok) {
    console.log(`workflow-guard OK: ${res.results.length} workflow file(s) free of the multi-line plain run: trap`);
    process.exit(0);
  }
  console.error("workflow-guard FAILED: multi-line plain `run:` scalar(s) — these make GitHub build ZERO jobs:");
  for (const r of res.results) {
    for (const p of r.problems) {
      console.error(`  - ${r.file}:${p.line} plain run scalar continues at line ${p.continuationLine}  («${p.value}…»)`);
    }
  }
  console.error("Fix: make the value a single line, or use a block scalar (`run: |`) / quoted scalar.");
  process.exit(1);
}