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

// ---------------------------------------------------------------------------
// Pages-settle guard contract: every workflow that invokes pages-settle.mjs
// must be able to SEE the Pages builds API and must PIN every settle call.
//
// Root-caused 2026-09-27: dde.yml granted `contents: write` only, so the
// workflow token got a bare 404 from the Pages builds API, which
// pages-settle.mjs reads as "no build yet" → the guard ran BLIND every cycle
// (`settled: true, reason: no-build-yet, waitedMs: 0` in the run log is the
// signature) and the median push kept killing the content build. C26 had
// given the guard a brain (the SHA pin) but the token left it without eyes.
// A settle call without PAGES_SETTLE_SHA after a push is the OTHER face of
// the same bug: with working eyes it sees the content build in flight and
// defers the median every cycle — the trend history starves.
// ---------------------------------------------------------------------------
const PAGES_SETTLE_CONTRACT = {
  // Only these workflows may invoke the guard — extend deliberately.
  dde: ".github/workflows/dde.yml",
};

test("pages-settle contract: guard callers carry pages:read and pin EVERY settle call to a SHA", () => {
  for (const [wf, rel] of Object.entries(PAGES_SETTLE_CONTRACT)) {
    const raw = readFileSync(join(REPO, rel), "utf8");
    const doc = parse(raw);
    assert.deepEqual(
      workflowShapeErrors(`${wf}.yml`, doc), [],
      `${rel} must still parse clean under the workflow schema walk`,
    );

    // (1) The token must be able to READ the Pages builds API. Without the
    // `pages: read` permission the API answers 404 and the guard reads the
    // 404 as "no build yet" — a settle that cannot see is worse than none.
    const perms = doc.permissions ?? {};
    assert.equal(perms.pages, "read",
      `${rel}: permissions.pages must be "read" — without it the Pages API 404s for the workflow token and pages-settle runs blind (no-build-yet at waitedMs:0 is the signature)`);
    assert.equal(perms.contents, "write",
      `${rel}: permissions.contents must stay "write" (the trend step pushes the median commit)`);

    // (2) EVERY invocation must pin PAGES_SETTLE_SHA. One unpinned call
    // after a push re-opens the race; the unpinned-call hazard is that the
    // guard settles on identity-less age while the content build is alive.
    const calls = [...raw.matchAll(/node scripts\/pages-settle\.mjs/g)];
    assert.ok(calls.length >= 2,
      `${rel}: expected the two settle calls (pre-commit + pre-push gate), found ${calls.length}`);
    const pinned = [...raw.matchAll(/PAGES_SETTLE_SHA[^\n]*node scripts\/pages-settle\.mjs/g)];
    assert.equal(pinned.length, calls.length,
      `${rel}: every pages-settle invocation must carry an explicit PAGES_SETTLE_SHA pin (${calls.length - pinned.length} unpinned call(s) — an unpinned settle after a push authorizes cancelling the live content build)`);
    // (3) SITE_REQUIRED: the caller's repo demonstrably HAS a Pages site, so
    // a 404 from the builds API must fail closed (unobservable ≠ empty) —
    // the blind-guard recurrence (C26, 2026-09-28) shipped because a bare
    // 404 was readable as "no build yet" even with pages:read granted.
    const siteReq = [...raw.matchAll(/PAGES_SETTLE_SITE_REQUIRED=1[^\n]*node scripts\/pages-settle\.mjs/g)];
    assert.equal(siteReq.length, calls.length,
      `${rel}: every pages-settle invocation must set PAGES_SETTLE_SITE_REQUIRED=1 (a 404 must fail closed, never read as "no build yet" — the blind-guard recurrence)`);
  }
});

// ---------------------------------------------------------------------------
// Runner-report artifacts contract (dde.yml): the SDK + wire perf reports
// upload as run artifacts with a PINNED 30-day retention. An artifact the
// workflow forgets to upload, uploads empty, or uploads with a drifted
// retention is evidence lost — and none of those failures shows in the run's
// exit code, so they need a contract of their own.
// ---------------------------------------------------------------------------

test("dde runner-report artifacts: SDK + wire reports upload with pinned retention and fail-closed emptiness", () => {
  const raw = readFileSync(join(REPO, ".github/workflows/dde.yml"), "utf8");
  assert.deepEqual(artifactContractViolations(raw), [],
    "dde.yml runner-report artifact contract drifted:\n  " + artifactContractViolations(raw).join("\n  "));
});

/** The artifact contract as a pure violations-collector over the raw YAML
 *  text, so the negative-control battery below can bite on mutated copies. */
function artifactContractViolations(raw) {
  const v = [];
  let doc;
  try {
    doc = parse(raw);
  } catch (e) {
    return [`dde.yml no longer parses as YAML: ${e.message}`];
  }
  const steps = doc.jobs?.dde?.steps ?? [];
  if (steps.length === 0) return ["dde.yml lost its dde job steps"];

  const uploads = steps.filter((s) => typeof s.uses === "string" && s.uses.startsWith("actions/upload-artifact@"));
  if (uploads.length !== 1) {
    v.push(`dde.yml must carry exactly one artifact-upload step (found ${uploads.length}) — a second uploader splits the evidence surface without a contract, and zero means the evidence never leaves the runner`);
    return v;
  }
  const up = uploads[0];
  const with_ = up.with ?? {};

  // Both runner reports ride ONE artifact — the run's evidence bundle.
  if (!(with_.path ?? "").includes("/tmp/bench-sdk.json")) {
    v.push("the upload's path must include the SDK report (/tmp/bench-sdk.json)");
  }
  if (!(with_.path ?? "").includes("/tmp/bench-wire.json")) {
    v.push("the upload's path must include the wire report (/tmp/bench-wire.json)");
  }

  // Retention is PINNED (30): unpinned, it silently defaults and drifts.
  if (String(with_["retention-days"]) !== "30") {
    v.push(`the upload must pin retention-days: 30 (found "${with_["retention-days"]}") — an unpinned retention silently defaults and the evidence window drifts without a diff`);
  }

  // Evidence is fail-closed: a green-shaped run whose reports went missing
  // must go red, not upload an empty artifact nobody notices.
  if (with_["if-no-files-found"] !== "error") {
    v.push(`the upload must set if-no-files-found: error (found "${with_["if-no-files-found"]}") — missing reports are a failure, not an empty artifact`);
  }

  // The action stays major-pinned like every other action in the repo.
  if (!/^actions\/upload-artifact@v\d+$/.test(up.uses)) {
    v.push(`the upload action must be major-pinned (uses: "${up.uses}")`);
  }

  // Ordering: AFTER both benchmarks ran (the files exist) and BEFORE the
  // trend step's first pages-settle call — the evidence must land even when
  // the gate defers or goes red.
  const idx = (pred, what) => {
    const i = steps.findIndex(pred);
    if (i < 0) v.push(`dde.yml lost the step ${what} — the artifact ordering contract cannot hold`);
    return i;
  };
  const sdkAt = idx((s) => typeof s.run === "string" && s.run.includes("benchmark-dde.mjs"), "running the SDK benchmark");
  const wireAt = idx((s) => typeof s.run === "string" && s.run.includes("benchmark-dde-http.mjs"), "running the wire benchmark");
  const upAt = steps.indexOf(up);
  const settleAt = idx((s) => typeof s.run === "string" && s.run.includes("pages-settle.mjs"), "calling pages-settle (the trend gate)");
  if (sdkAt >= 0 && wireAt >= 0 && upAt <= sdkAt) {
    v.push("the upload step must sit after the SDK benchmark step — artifacts cannot upload files that do not exist yet");
  }
  if (wireAt >= 0 && upAt <= wireAt) {
    v.push("the upload step must sit after the wire benchmark step — artifacts cannot upload files that do not exist yet");
  }
  if (settleAt >= 0 && upAt > settleAt) {
    v.push("the upload step must sit before the trend gate — evidence lands even when the gate defers or goes red");
  }

  // The bundle names both runners, so a reviewer pulling one artifact gets
  // the whole story (SDK and wire medians together).
  for (const marker of ["sdk", "wire"]) {
    if (!(up.name ?? "").toLowerCase().includes(marker)) {
      v.push(`the upload step name "${up.name}" must mention "${marker}" — the artifact names its contents`);
    }
  }
  return v;
}

// Negative controls — mutated dde.yml copies, applied-and-bites ([C32]):
// each staleness of the evidence surface must fail the contract BY NAME.
test("dde artifact contract negative controls: each mutation applies AND bites, by name", () => {
  // CRLF-normalized ([C3]): the raw checkout is CRLF on Windows, so
  // newline-terminated `from` needles would silently never apply — a
  // control that never lands is a control that proves nothing.
  const raw = readFileSync(join(REPO, ".github/workflows/dde.yml"), "utf8").replaceAll("\r\n", "\n");
  const cases = [
    {
      label: "retention silently drifts off 30",
      from: "retention-days: 30",
      to: "retention-days: 5",
      expect: /retention-days: 30/,
    },
    {
      label: "the retention pin is removed entirely",
      from: "          retention-days: 30\n",
      to: "",
      expect: /retention-days: 30/,
    },
    {
      label: "emptiness stops failing closed",
      from: "          if-no-files-found: error\n",
      to: "",
      expect: /if-no-files-found: error/,
    },
    {
      label: "the wire report drops off the bundle",
      from: "            /tmp/bench-wire.json\n",
      to: "",
      expect: /must include the wire report/,
    },
    {
      label: "the SDK benchmark step is renamed away",
      from: "benchmark-dde.mjs",
      to: "benchmark-dde-renamed.mjs",
      expect: /lost the step running the SDK benchmark/,
    },
    {
      label: "the uploader loses its version pin",
      from: "actions/upload-artifact@v4",
      to: "actions/upload-artifact",
      expect: /exactly one artifact-upload step/,
    },
  ];
  let applied = 0;
  for (const c of cases) {
    if (!raw.includes(c.from)) continue;
    applied++;
    const out = raw.replaceAll(c.from, c.to);
    const violations = artifactContractViolations(out);
    assert.ok(violations.length > 0,
      `negative control did not bite: "${c.label}" — the artifact contract stayed green over a corrupted evidence surface`);
    assert.match(violations.join("\n"), c.expect,
      `negative control "${c.label}" bit with the wrong message: ${violations.join(" | ")}`);
  }
  assert.ok(applied >= 6, `expected all 6 artifact controls to apply, only ${applied} did — the battery is not testing what it thinks`);
});
