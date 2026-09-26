#!/usr/bin/env node
/**
 * release-gate.mjs — the Release Gate (`npm run release:gate`).
 *
 * The gate's job is to make "ready" mean something a machine decided, not
 * something a document asserted. It runs every proof surface in one process
 * and reports each leg as PASS/FAIL with its own exit status — so a red gate
 * names the surface that is red instead of stopping at the first one.
 *
 * Two properties are load-bearing:
 *
 *  1. THE BUILD DEPENDS ON NOTHING EXTERNAL. Every leg here is derived from
 *     committed sources or runs offline. No outreach result, partner, price,
 *     credential, or funding outcome is an input. The gate proves this about
 *     ITSELF: `--prove-independence` reads this file's own source and asserts
 *     that no leg's command touches a network, a secret, or an external
 *     outcome. If a future edit adds one, the gate fails its own audit.
 *
 *  2. A GATE IS NOT A RELEASE. This gate can only report that the committed
 *     tree is internally consistent and its claims are backed. It cannot
 *     authorize a release: the owner decisions stay GATED, the badge count
 *     stays 0, and an independent review stays UNKNOWN. The gate's own
 *     verdict is about the BUILD, and it says so in every output.
 *
 * Usage:
 *   node scripts/release-gate.mjs               # run every leg
 *   node scripts/release-gate.mjs --json        # machine-readable
 *   node scripts/release-gate.mjs --only <name> # one leg by name
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const read = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);

/**
 * tallyCases — counts a self-check's cases by their verdict field.
 *
 * The modules in this repository do not agree on one field name (`pass`, `ok`,
 * `valid`), so the first version of this gate hard-coded `c.pass`. The modules
 * that used `ok` therefore reported "0/8 invariants" and still came back PASS
 * — a broken counter inside a green result, which is the exact failure this
 * gate exists to catch in everything else. A case carrying no recognizable
 * boolean verdict is now counted as a FAILURE, not as a silent pass: an
 * assertion the gate cannot read is an assertion the gate cannot trust.
 */
const CASE_VERDICT_FIELDS = ["pass", "ok", "valid", "holds"];

function caseVerdict(c) {
  /* two shapes are in the tree: an object carrying a boolean field, and the
     [name, boolean] tuple the packages use. Both are read explicitly; a
     shape this gate does not recognize is refused, never assumed. */
  if (Array.isArray(c) && typeof c[1] === "boolean") return c[1];
  const field = CASE_VERDICT_FIELDS.find((f) => typeof c?.[f] === "boolean");
  return field === undefined ? undefined : c[field];
}

export function tallyCases(cases, legId) {
  const list = Array.isArray(cases) ? cases : [];
  let passed = 0;
  let failed = 0;
  let unreadable = null;
  for (const c of list) {
    const verdict = caseVerdict(c);
    if (verdict === undefined) {
      failed += 1;
      if (!unreadable) unreadable = c;
      continue;
    }
    if (verdict === true) passed += 1;
    else failed += 1;
  }
  if (unreadable) throw new Error(`leg ${legId}: a case has no readable verdict (${Array.isArray(unreadable) ? `tuple[${unreadable.length}]` : `keys: ${Object.keys(unreadable).join(", ") || "none"}`})`);
  return { total: list.length, passed, failed };
}

export const RELEASE_GATE_SCHEMA = "CG-RG/1";

/**
 * The gate legs. `command` is what a reviewer runs; `module` is imported
 * in-process by the self-check so the gate can assert on real results rather
 * than on exit codes alone.
 */
export const GATE_LEGS = Object.freeze([
  { id: "tests", command: "npm test", surface: "the full suite + the snapshot total enforcement", kind: "external" },
  { id: "boundary", command: "npm run boundary:audit", surface: "committed-tree boundary scan", kind: "external" },
  { id: "levels", command: "npm run verify:levels", surface: "L0-L4 verification levels", kind: "library", module: "scripts/ladder/verification-levels.mjs", tests: ["test/integrations/verification-platform.test.mjs", "test/integrations/developer-kit.test.mjs"] },
  { id: "states", command: "npm run integration:states", surface: "the 13 integration states", kind: "library", module: "scripts/ladder/integration-states.mjs", tests: ["test/integrations/verification-platform.test.mjs", "test/integrations/developer-kit.test.mjs"] },
  { id: "adapters", command: "npm run adapters:status", surface: "adapter DRY_RUN posture", kind: "external" },
  { id: "sandbox", command: "npm run partner:sandbox", surface: "8 offline integration scenarios", kind: "module", module: "scripts/partner-sandbox.mjs" },
  { id: "journey", command: "npm run partner:journey -- --self-check", surface: "the 10-leg integration journey", kind: "module", module: "scripts/partner-journey.mjs", flag: "--self-check" },
  { id: "replay", command: "npm run integration:replay", surface: "CG-IR/1 bundle replay", kind: "module", module: "scripts/integration-replay-lab.mjs", flag: "--self-check" },
  { id: "attack", command: "npm run attack-lab", surface: "10 fail-closed tamper cases", kind: "module", module: "scripts/attack-lab.mjs" },
  { id: "observability", command: "npm run observability", surface: "the event sink contract", kind: "library", module: "scripts/observability.mjs", tests: ["test/integrations/verification-platform.test.mjs", "test/integrations/developer-kit.test.mjs"] },
  { id: "passport", command: "npm run passport:v2", surface: "the portable evidence passport", kind: "module", module: "scripts/passport-v2.mjs" },
  { id: "conformance", command: "npm run conformance:report", surface: "CG-CS/1 suite + CG-CR/1 report", kind: "external" },
  { id: "quickstart", command: "npm run quickstart", surface: "the offline developer quickstart", kind: "external" },
  { id: "webhook", command: "npm run webhook", surface: "CG-WH/1 receiver", kind: "module", module: "packages/webhook/index.mjs", flag: "--self-check" },
  { id: "x402", command: "npm run x402", surface: "X402/1 gated payment harness", kind: "module", module: "packages/x402/index.mjs", flag: "--self-check" },
  { id: "commercial", command: "npm run commercial:packaging", surface: "the commercial packaging contract", kind: "module", module: "scripts/ladder/commercial-packaging.mjs", flag: "--self-check" },
  { id: "claims", command: "npm run claims:audit", surface: "CG-CL/1 claim ceiling", kind: "module", module: "scripts/ladder/claim-registry.mjs", flag: "--audit" },
  { id: "badge", command: "npm run badge:verify", surface: "CG-BDG/1 self-verifying artwork", kind: "module", module: "packages/badge/index.mjs", flag: "--verify" },
]);

/**
 * proveIndependence — the gate audits its own inputs.
 *
 * It reads this file's source and asserts that no leg reaches outside the
 * committed tree: no fetch/http/net, no environment secret as an input, and
 * no leg id that names an external outcome (outreach, partner, pilot,
 * payment, badge issuance, funding, price). A gate that quietly depended on
 * an external result would be the exact failure this repository exists to
 * prevent, so the check is mechanical and it runs on every gate invocation.
 */
export function proveIndependence() {
  const source = readFileSync(join(HERE, "release-gate.mjs"), "utf8");
  /* The credential-name pattern is assembled from fragments on purpose: this
     file is its own audit target, so a pattern written as a contiguous
     literal would match the line that defines it and the gate would fail
     itself forever. The other patterns contain backslashes, so their source
     text cannot match the pattern they define. */
  const credential = new RegExp(["PRIVATE", "MNEMONIC", "API"].map((w) => `${w}_${"KEY"}`).join("|"));
  const banned = [
    { pattern: /\bfetch\s*\(/, why: "an HTTP call" },
    { pattern: /from\s+"node:https?"/, why: "an HTTP import" },
    { pattern: /process\.env\.[A-Z_]*(KEY|SECRET|TOKEN|PASSWORD)/, why: "a credential from the environment" },
    { pattern: credential, why: "a credential name" },
  ];
  const violations = banned.filter((b) => b.pattern.test(source)).map((b) => `source: ${b.why}`);

  const externalWords = ["outreach", "partner-signed", "pilot", "funding", "raised", "payment-received", "badge-issued", "price-unlocked"];
  for (const leg of GATE_LEGS) {
    for (const w of externalWords) {
      if (leg.id === w) violations.push(`leg ${leg.id}: depends on the external outcome "${w}"`);
    }
  }

  /* every leg must name a command a reviewer can run, and an in-repo surface
     or a committed-source check — never a URL and never a live endpoint */
  for (const leg of GATE_LEGS) {
    if (!leg.command || !leg.surface) violations.push(`leg ${leg.id}: missing command or surface`);
    if (/https?:\/\//.test(leg.command)) violations.push(`leg ${leg.id}: the command reaches a URL`);
    /* module paths are repo-relative: most live under scripts/, the packages
       under packages/ — resolving everything against scripts/ is how a gate
       ends up auditing a path that was never there */
    if (leg.module && !existsSync(join(REPO, leg.module))) violations.push(`leg ${leg.id}: module ${leg.module} does not exist`);
    /* a library leg is only as real as the tests it leans on: a leg that
       names no committed test file can never be proven, and must not be
       allowed to look like it is */
    if (leg.kind === "library" && (!Array.isArray(leg.tests) || leg.tests.length === 0)) violations.push(`leg ${leg.id}: a library leg must name the committed tests that prove it`);
  }

  return { ok: violations.length === 0, violations, checkedLegs: GATE_LEGS.length };
}

/**
 * runGate — runs the in-process legs and reports each verdict. The
 * `external` legs (npm test, boundary audit) are spawned as child processes
 * because they own their own reporting; the rest are imported so the gate can
 * assert on the RESULT, not merely on a zero exit code.
 */
export async function runGate({ only = null } = {}) {
  const legs = only ? GATE_LEGS.filter((l) => l.id === only) : GATE_LEGS;
  if (legs.length === 0) throw new Error(`release-gate: unknown leg "${only}"`);

  const results = [];
  for (const leg of legs) {
    const started = Date.now();
    let status = "PASS";
    let detail = null;
    try {
      if (leg.kind === "module") {
        /* imported by absolute file URL: a relative specifier would resolve
           against this file's directory, which is how a gate ends up loading
           a path that does not exist */
        const mod = await import(pathToFileURL(join(REPO, leg.module)).href);
        if (typeof mod.selfCheck === "function") {
          const r = mod.selfCheck();
          const tally = tallyCases(r.cases, leg.id);
          status = r.ok && tally.total > 0 && tally.passed === tally.total ? "PASS" : "FAIL";
          detail = `${tally.passed}/${tally.total} invariants`;
        } else if (leg.module.endsWith("partner-sandbox.mjs")) {
          const r = mod.runSandbox();
          const ok = r.scenarios.every((s) => ["VERIFIED", "MISMATCH", "UNKNOWN", "REJECTED"].includes(s.verdict));
          status = r.scenarios.length > 0 && ok ? "PASS" : "FAIL";
          detail = `${r.scenarios.length} scenarios classified`;
        } else if (leg.module.endsWith("passport-v2.mjs")) {
          const p = mod.buildPassportV2();
          status = p && p.schemaVersion && p.integrations && p.receipts ? "PASS" : "FAIL";
          detail = `${p.schemaVersion} · ${p.integrations.length} adapters · ${p.receipts.length} receipts`;
        } else if (leg.module.endsWith("attack-lab.mjs")) {
          const r = mod.runAttackLab();
          const tally = tallyCases(r.sequence, leg.id);
          status = tally.total > 0 && tally.passed === tally.total ? "PASS" : "FAIL";
          detail = `${tally.passed}/${tally.total} tamper cases, ${tally.failed} unexpected`;
        } else if (leg.module.endsWith("claim-registry.mjs")) {
          const r = mod.auditRegistry(mod.buildRegistry());
          status = r.ok ? "PASS" : "FAIL";
          detail = r.ok ? `${r.total} claims, ${r.violations.length} violations` : `${r.violations.length} violations`;
        } else {
          /* A module that exposes nothing to assert is NOT a pass. "It loaded"
             was the gate's own worst habit: it reported PASS for a module it had
             not asked a single question, which is a green light with no bulb
             behind it. Say so, and fail. */
          status = "FAIL";
          detail = "the module exposes no machine-checkable self-check, so this leg proves nothing on its own";
        }
      } else if (leg.kind === "library") {
        /* a pure library is proven by the committed tests that exercise it —
           but only if those tests exist AND actually import it. Naming a file
           that does not import the module is the same empty pass. */
        const missing = leg.tests.filter((t) => !existsSync(join(REPO, t)));
        const referencing = leg.tests.filter((t) => {
          if (missing.includes(t)) return false;
          return readFileSync(join(REPO, t), "utf8").includes(basename(leg.module));
        });
        status = missing.length === 0 && referencing.length > 0 ? "PASS" : "FAIL";
        detail = missing.length
          ? `missing committed test ${missing.join(", ")}`
          : `${referencing.length} committed test file${referencing.length === 1 ? "" : "s"} import ${basename(leg.module)}`;
      } else {
        /* the two heavy legs run as real commands: this is the gate proving
           the reviewer's own entry points work, not a re-implementation */
        const out = execFileSync(process.execPath, [join(REPO, "scripts", "release-gate-child.mjs"), leg.id], {
          cwd: REPO,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 900000,
        });
        status = "PASS";
        detail = out.trim().split("\n").slice(-1)[0] || "ok";
      }
    } catch (error) {
      status = "FAIL";
      const msg = error && error.message ? String(error.message) : "unknown failure";
      detail = msg.length > 300 ? msg.slice(0, 300) + "…" : msg;
    }
    results.push({ leg: leg.id, command: leg.command, surface: leg.surface, status, detail, ms: Date.now() - started });
  }

  const independence = proveIndependence();
  const failed = results.filter((r) => r.status === "FAIL");
  return {
    schema: RELEASE_GATE_SCHEMA,
    verdict: failed.length === 0 && independence.ok ? "GATE_PASS" : "GATE_FAIL",
    scope: "the committed tree is internally consistent and its claims are backed — this is NOT a release authorization",
    legs: results,
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    independence: { ok: independence.ok, violations: independence.violations, checkedLegs: independence.checkedLegs },
    notClaimed: {
      releaseAuthorized: false,
      badgeIssued: false,
      ownerSignOff: false,
      independentReview: false,
      liveChainAuthority: false,
      note: "the gate reports the BUILD. Every commercial, legal, and external outcome stays GATED or UNKNOWN regardless of this verdict.",
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  const onlyIdx = args.indexOf("--only");
  const only = onlyIdx !== -1 ? args[onlyIdx + 1] : null;

  if (args.includes("--prove-independence")) {
    const r = proveIndependence();
    console.log(`RELEASE GATE INDEPENDENCE — ${r.checkedLegs} legs audited against external inputs`);
    for (const v of r.violations) console.log(`  VIOLATION ${v}`);
    console.log(`\nGATE INDEPENDENCE: ${r.ok ? "PASS" : "FAIL"}`);
    if (!r.ok) process.exitCode = 1;
    return;
  }

  runGate({ only }).then((gate) => {
    if (args.includes("--write")) {
      /* Committed so the control plane can read the gate the same way it reads
         every other truth. Deliberately timestamp-free and `ms`-free: an
         artifact that churns on every run trains reviewers to ignore its
         diffs, which is the same failure the conformance report avoids. */
      const artifact = {
        schema: gate.schema,
        scope: gate.scope,
        verdict: gate.verdict,
        total: gate.total,
        passed: gate.passed,
        failed: gate.failed,
        independence: gate.independence,
        legs: gate.legs.map(({ leg, command, surface, status, detail }) => ({ leg, command, surface, status, detail })),
        notClaimed: gate.notClaimed,
      };
      writeFileSync(join(REPO, "docs", "release-gate.json"), JSON.stringify(artifact, null, 2) + "\n", "utf8");
      console.log(`RELEASE GATE: wrote ${join(REPO, "docs", "release-gate.json")} (${gate.verdict})`);
    }
    if (args.includes("--json")) {
      console.log(JSON.stringify(gate, null, 2));
    } else {
      console.log(`COREGUARD RELEASE GATE — ${RELEASE_GATE_SCHEMA} (scope: ${gate.scope})`);
      for (const l of gate.legs) {
        console.log(`  ${l.status.padEnd(5)} ${l.leg.padEnd(14)} ${l.detail}`);
      }
      console.log(`\n  legs: ${gate.passed}/${gate.total} passed · independence: ${gate.independence.ok ? "PASS" : "FAIL " + gate.independence.violations.join("; ")}`);
      console.log(`  not claimed: release authorized, badge issued, owner sign-off, independent review, live chain — all remain GATED or UNKNOWN`);
      console.log(`\nRELEASE GATE: ${gate.verdict}`);
    }
    if (gate.verdict !== "GATE_PASS") process.exitCode = 1;
  });
}

if (process.argv[1] && process.argv[1].endsWith("release-gate.mjs")) main();
