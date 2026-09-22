import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, YAMLParseError } from "yaml";

/**
 * Workflow YAML parse contract — every .github/workflows file (and the
 * composite action) must survive REAL YAML parsing before push, not after.
 *
 * Why this exists: scripts/check-workflows.mjs is a code-shape linter for one
 * documented failure mode ("Debugging Breakthroughs": two points inside a
 * multi-line plain `run:` scalar parse to zero jobs — GitHub accepts the file
 * and the push goes green with an empty workflow). A linter sees shapes; it
 * does not see YAML. This contract feeds every file through the `yaml`
 * parser (the same grammar class Actions uses) and asserts the parse TREE is
 * a valid GitHub Actions document — so any file GitHub would reject (or
 * silently mis-read) goes red here first, named by file and line.
 *
 * Probed behaviors this locks in (yaml@2, YAML 1.2):
 *   - the two-point trap throws YAMLParseError (nested mapping in a compact
 *     mapping) — parse, not shape, is the reliable detector;
 *   - duplicate map keys throw (silently collapsed in a JSON-shaped linter);
 *   - unquoted scalars are TYPED (`run: 42` is a number, not a string), so
 *     field-type assertions catch schema deviations a regex never can.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKFLOWS = join(REPO, ".github", "workflows");
const ACTIONS = join(REPO, ".github", "actions");

const WORKFLOW_FILES = readdirSync(WORKFLOWS)
  .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
  .sort();

/** Recursively collect every YAMLParseError-throwing file, named with its line. */
function collectParseErrors(root, files) {
  const errors = [];
  for (const f of files) {
    const p = join(root, f);
    try {
      parse(readFileSync(p, "utf8"));
    } catch (e) {
      errors.push(`${f}: ${e instanceof YAMLParseError ? e.message.split("\n")[0] : e.message}`);
    }
  }
  return errors;
}

/** Walk the parsed doc and report every map whose keys are not unique after parse. */
function duplicateKeys(node, path = "$") {
  const out = [];
  if (Array.isArray(node)) node.forEach((v, i) => out.push(...duplicateKeys(v, `${path}[${i}]`)));
  else if (node && typeof node === "object") {
    // yaml@2 collapses duplicates before we see them but throws at parse time;
    // this walk stays for container types coming from anchors/aliases.
    for (const [k, v] of Object.entries(node)) out.push(...duplicateKeys(v, `${path}.${k}`));
  }
  return out;
}

function workflowShapeErrors(file, doc) {
  const errs = [];
  const push = (m) => errs.push(`${file}: ${m}`);
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    return [`${file}: top-level document is not a mapping`];
  }
  if (typeof doc.name !== "string") push(`name must be a string, got ${doc.name === undefined ? "missing" : typeof doc.name}`);
  if (typeof doc.on !== "string" && typeof doc.on !== "object") push(`on must be a string or mapping, got ${doc.on === undefined ? "missing" : typeof doc.on}`);
  if (typeof doc.jobs !== "object" || doc.jobs === null || Array.isArray(doc.jobs) || Object.keys(doc.jobs).length === 0) {
    push("jobs must be a non-empty mapping — an empty or missing jobs block is the zero-jobs trap GitHub accepts silently");
    return errs;
  }
  for (const [jobName, job] of Object.entries(doc.jobs)) {
    if (typeof job !== "object" || job === null || Array.isArray(job)) { push(`jobs.${jobName} must be a mapping`); continue; }
    if (typeof job["runs-on"] !== "string") push(`jobs.${jobName}.runs-on must be a string, got ${job["runs-on"] === undefined ? "missing" : typeof job["runs-on"]}`);
    if (!Array.isArray(job.steps)) { push(`jobs.${jobName}.steps must be an array`); continue; }
    for (const [i, step] of job.steps.entries()) {
      if (step === null || typeof step !== "object" || Array.isArray(step)) { push(`jobs.${jobName}.steps[${i}] must be a mapping`); continue; }
      const hasRun = typeof step.run === "string";
      const hasUses = typeof step.uses === "string";
      if (!hasRun && !hasUses) {
        push(`jobs.${jobName}.steps[${i}] must have a string run: or uses: — an unquoted numeric run parses as a number and Actions will not run it`);
      }
    }
  }
  return errs;
}

function actionShapeErrors(file, doc) {
  const errs = [];
  const push = (m) => errs.push(`${file}: ${m}`);
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) return [`${file}: top-level document is not a mapping`];
  if (doc.runs?.using !== "composite") push(`runs.using must be "composite" for this repo's composite action, got ${doc.runs?.using}`);
  if (!Array.isArray(doc.runs?.steps)) { push("runs.steps must be an array"); return errs; }
  for (const [i, step] of doc.runs.steps.entries()) {
    if (step === null || typeof step !== "object" || Array.isArray(step)) { push(`runs.steps[${i}] must be a mapping`); continue; }
    if (typeof step.uses !== "string" && typeof step.run !== "string") push(`runs.steps[${i}] must have string uses: or run:`);
  }
  return errs;
}

test("contract: every workflow file survives real YAML parsing (fail-closed, named by file+line)", () => {
  assert.ok(WORKFLOW_FILES.length >= 4, `expected the known workflow set, found: ${WORKFLOW_FILES.join(", ")}`);
  assert.deepEqual(collectParseErrors(WORKFLOWS, WORKFLOW_FILES), []);
});

test("contract: the composite action survives real YAML parsing", () => {
  const found = ["action.yml", "action.yaml"].map((f) => join(ACTIONS, "coreguard-verify", f)).filter((p) => existsSync(p));
  assert.ok(found.length === 1, "exactly one composite action definition expected");
  const errors = collectParseErrors(join(ACTIONS, "coreguard-verify"), found.map((p) => p.split(/[/\\]/).pop()));
  assert.deepEqual(errors, []);
});

test("contract: parse trees are valid GitHub Actions documents (schema-typed)", () => {
  for (const f of WORKFLOW_FILES) {
    const doc = parse(readFileSync(join(WORKFLOWS, f), "utf8"));
    const errs = workflowShapeErrors(f, doc);
    assert.deepEqual(errs, [], `${f} failed the Actions schema walk`);
    assert.deepEqual(duplicateKeys(doc), []);
  }
  const actionPath = join(ACTIONS, "coreguard-verify", "action.yml");
  if (existsSync(actionPath)) {
    const doc = parse(readFileSync(actionPath, "utf8"));
    assert.deepEqual(actionShapeErrors("coreguard-verify/action.yml", doc), []);
  }
});

test("detector proof: the documented two-point trap THROWS at parse time (not shape-guessed)", () => {
  const trap = [
    "name: CI",
    "on:",
    "  push:",
    "    branches: [main]",
    "jobs:",
    "  engine:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - name: policy gate",
    "        run: echo gate",
    "          ...: two points",
  ].join("\n");
  assert.throws(() => parse(trap), YAMLParseError);
});

test("detector proof: duplicate top-level keys THROW instead of silently collapsing", () => {
  const dup = "name: A\nname: B\non: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo\n";
  assert.throws(() => parse(dup), YAMLParseError);
});

test("detector proof: an untyped numeric run: violates the schema walk, named by step", () => {
  const numericRun = parse("on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: 42\n");
  const errs = workflowShapeErrors("numeric.yml", numericRun);
  assert.ok(errs.some((e) => e.includes("steps[0]") && e.includes("string run")),
    `expected a named steps[0] violation, got: ${JSON.stringify(errs)}`);
});

test("detector proof: a well-formed workflow with `${{ }}` expressions and block scalars parses clean", () => {
  const ok = [
    "name: 'It''s fine'",
    "on:",
    "  push:",
    "    branches: [main]",
    "permissions:",
    "  contents: write",
    "jobs:",
    "  j:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v7",
    "        with:",
    "          fetch-depth: 0",
    "      - name: block scalar with colon",
    "        run: |",
    "          echo 'a: b'",
    "          echo '${{ github.ref }}'",
  ].join("\n");
  const doc = parse(ok);
  assert.deepEqual(workflowShapeErrors("ok.yml", doc), []);
  assert.equal(doc.jobs.j.steps[1].run.includes("a: b"), true, "block scalar content must survive verbatim");
});
