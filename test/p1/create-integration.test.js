/**
 * CoreGuard — create-coreguard-integration smoke test.
 *
 * Materialises the template into a temp dir and asserts: all expected files
 * are produced, {{NAME}} placeholders were resolved, and binary/copy paths
 * work. The generated project is NOT executed here (it consumes
 * @coreguard/sdk from npm like an external integrator would).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { mkdir, cp } from "node:fs/promises";
import { RECORDS, makeCandidate } from "../../test/delivery/intake-candidate.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const generator = join(repoRoot, "scripts", "create-integration.mjs");

const EXPECTED_FILES = [
  "package.json",
  "README.md",
  "intent.json",
  "policy.json",
  "trace.json",
  "verify.mjs",
  "example.mjs",
  "test/smoke.test.js",
];

const EXPECTED_DDE_FILES = [
  "package.json",
  "README.md",
  "engine-dde.mjs",
  "verify-dde.mjs",
  "payout-gate.mjs",
  "dde-fixture/agreement.json",
  "dde-fixture/acceptance-criteria.json",
  "dde-fixture/parties.json",
  "dde-fixture/authorization.json",
  "dde-fixture/execution-attestation.json",
  "dde-fixture/delivery-manifest.json",
  "dde-fixture/acceptance-record.json",
  "dde-fixture/dispute-record.json",
  "dde-fixture/consent-and-disclosure.json",
  "dde-fixture/retention-policy.json",
  "dde-fixture/hashes.json",
  "test/dde.test.js",
];

test("create-integration: generates a fully-resolved template", async () => {
  const work = await mkdtemp(join(tmpdir(), "cg-integration-"));
  const dest = join(work, "my-dapp");
  try {
    const run = spawnSync(process.execPath, [generator, "my-dapp"], {
      cwd: work,
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr);

    for (const rel of EXPECTED_FILES) {
      const full = join(dest, ...rel.split("/"));
      const stat = await readFile(full, "utf8").then(() => true, () => false);
      assert.ok(stat, `expected generated file ${rel}`);
    }

    const pkg = JSON.parse(await readFile(join(dest, "package.json"), "utf8"));
    assert.equal(pkg.name, "my-dapp");
    assert.ok(!JSON.stringify(pkg).includes("{{NAME}}"));

    const example = await readFile(join(dest, "example.mjs"), "utf8");
    assert.ok(example.includes("@coreguard/sdk"), "example uses the public SDK");
    assert.ok(!example.includes("{{NAME}}"), "placeholders fully resolved");

    const smoke = await readFile(join(dest, "test/smoke.test.js"), "utf8");
    assert.ok(smoke.includes("createGuard"), "smoke test uses createGuard");
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test("create-integration --dde: generates the DDE payment-gate scaffold", async () => {
  const work = await mkdtemp(join(tmpdir(), "cg-integration-dde-"));
  const dest = join(work, "escrow-dapp");
  try {
    const run = spawnSync(process.execPath, [generator, "escrow-dapp", "--dde"], {
      cwd: work,
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr);

    for (const rel of EXPECTED_DDE_FILES) {
      const full = join(dest, ...rel.split("/"));
      const stat = await readFile(full, "utf8").then(() => true, () => false);
      assert.ok(stat, `expected generated file ${rel}`);
    }

    const pkg = JSON.parse(await readFile(join(dest, "package.json"), "utf8"));
    assert.equal(pkg.name, "escrow-dapp");
    assert.ok(!JSON.stringify(pkg).includes("{{NAME}}"), "placeholders fully resolved");

    // The evidence fixture ships static (no {{NAME}} anywhere): its hashes.json
    // pins are computed over the exact template bytes, so byte-preserving
    // generation guarantees the pins hold in every generated project.
    for (const rel of EXPECTED_DDE_FILES) {
      const text = await readFile(join(dest, ...rel.split("/")), "utf8");
      assert.ok(!text.includes("{{NAME}}"), `${rel} must not carry the name placeholder`);
    }

    // The scaffold teaches the boundary: README states it, the gate is a
    // release/hold loop, and the execution record is an honest placeholder.
    const readme = await readFile(join(dest, "README.md"), "utf8");
    assert.match(readme, /does not decide delivery conformity/);
    const gate = await readFile(join(dest, "payout-gate.mjs"), "utf8");
    assert.match(gate, /releaseWhen/);
    const exec = JSON.parse(await readFile(join(dest, "dde-fixture/execution-attestation.json"), "utf8"));
    assert.equal(exec.origin, "OWNER-DECLARED");
    assert.equal(exec.paymentSettled, false, "the shipped execution placeholder settles nothing");
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test("create-integration --dde: the generated fixture verifies against the REAL engine in-repo", async () => {
  const work = await mkdtemp(join(tmpdir(), "cg-integration-dde-"));
  const dest = join(work, "escrow-dapp");
  try {
    const gen = spawnSync(process.execPath, [generator, "escrow-dapp", "--dde"], { cwd: work, encoding: "utf8" });
    assert.equal(gen.status, 0, gen.stderr);
    // In-repo check: verify the generated fixture through the public DDE SDK
    // surface (packages/delivery/sdk). This is the live cross-check CI runs —
    // the template fixture must satisfy the authoritative engine as-is.
    const { verifyFixture } = await import(
      pathToFileURL(join(repoRoot, "packages", "delivery", "sdk.js")).href
    );
    const report = await verifyFixture({ fixtureDir: join(dest, "dde-fixture") });
    assert.equal(report.status, "VERIFIED");
    assert.equal(report.decision, "EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE");
    assert.equal(report.summary.notRun, 1, "E5 NOT_RUN — consent replay never fabricated");
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- --fixture-real

const generatorArgv = (name, flags) => [generator, ...(name ? [name] : []), ...flags];

async function makeModeledCandidate(work) {
  // The intake pipeline's own builder — the same shape CI's surveillance run
  // exercises, not a test-private copy.
  return makeCandidate(join(work, "candidate"));
}

test("create-integration --fixture-real: scaffolds the DDE project over the candidate's REAL converted fixture", async () => {
  const work = await mkdtemp(join(tmpdir(), "cg-fixture-real-"));
  const dest = join(work, "real-case");
  try {
    const candidate = await makeModeledCandidate(work);
    const run = spawnSync(process.execPath, generatorArgv("real-case", ["--dde", "--fixture-real", candidate]), {
      cwd: work,
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr);

    // Same skeleton as --dde (the engine, gate and verifier templates ride
    // along untouched), but the fixture directory is the CONVERTED candidate.
    for (const rel of EXPECTED_DDE_FILES) {
      const full = join(dest, ...rel.split("/"));
      const stat = await readFile(full, "utf8").then(() => true, () => false);
      assert.ok(stat, `expected generated file ${rel}`);
    }

    // Provenance flips: the fixture is the candidate's REAL truth, never the
    // template's synthetic copy mixed into real files.
    const manifest = JSON.parse(await readFile(join(dest, "dde-fixture", "hashes.json"), "utf8"));
    assert.equal(manifest.fixture?.origin, "REAL");
    assert.equal(manifest.fixture?.realDisputeExists, true);
    // Faithful packaging: every generated record equals the candidate's own
    // record (JSON-identical) — conversion never edits a field, it only
    // re-serializes and pins bytes (the prelude rejected synthetic origin).
    for (const name of RECORDS) {
      const generated = JSON.parse(await readFile(join(dest, "dde-fixture", name), "utf8"));
      const candidate = JSON.parse(await readFile(join(work, "candidate", name), "utf8"));
      assert.deepEqual(generated, candidate, `${name} must be the candidate's own record, not an edited copy`);
    }

    // Exactly the bytes the converter wrote: pins re-hash against the disk
    // and the REAL engine verifies the generated fixture as-is.
    const { verifyFixture } = await import(
      pathToFileURL(join(repoRoot, "packages", "delivery", "sdk.js")).href
    );
    const report = await verifyFixture({ fixtureDir: join(dest, "dde-fixture") });
    assert.equal(report.status, "VERIFIED", report.decision);

    // The gate's green verdict (and engine report) is echoed into the run.
    assert.match(run.stdout, /GATE GREEN/, "the prelude gate output must surface in the scaffold run");
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test("create-integration --fixture-real: without --dde it is a usage error — the real-fixture path is DDE-only", async () => {
  const work = await mkdtemp(join(tmpdir(), "cg-fixture-real-"));
  try {
    const candidate = await makeModeledCandidate(work);
    const run = spawnSync(process.execPath, generatorArgv("wrong-mode", ["--fixture-real", candidate]), {
      cwd: work,
      encoding: "utf8",
    });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /implies --ddd|implies --dde/);
    assert.ok(!(await readFile(join(work, "wrong-mode"), "utf8").then(() => true, () => false)), "nothing scaffolds");
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test("create-integration --fixture-real: red candidate → nothing scaffolds, no half-real scaffold left behind", async () => {
  const work = await mkdtemp(join(tmpdir(), "cg-fixture-real-"));
  const dest = join(work, "red-case");
  try {
    // The STATIC template fixture is the honest non-candidate: origin SYNTHETIC
    // with realDisputeExists false — prelude must call it red.
    const redCandidate = join(work, "red-candidate");
    await cp(join(repoRoot, "templates", "integration-dde", "dde-fixture"), redCandidate, { recursive: true });

    const run = spawnSync(process.execPath, generatorArgv("red-case", ["--dde", "--fixture-real", redCandidate]), {
      cwd: work,
      encoding: "utf8",
    });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /GATE RED|conversion refused/);
    assert.match(run.stderr, /removed.*No half-real scaffold/, "the refusal must promise a clean removal by name");
    const left = await readFile(dest, "utf8").then(() => true, () => false);
    assert.ok(!left, "fail-closed: a gate-red candidate must not leave a scaffold directory behind");
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test("create-integration: refuses to overwrite an existing directory", async () => {
  const work = await mkdtemp(join(tmpdir(), "cg-integration-"));
  try {
    const existing = join(work, "taken");
    await import("node:fs/promises").then((fsp) => fsp.mkdir(existing));
    const run = spawnSync(process.execPath, [generator, "taken"], {
      cwd: work,
      encoding: "utf8",
    });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /refusing to overwrite/);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test("create-integration: invalid name is rejected", async () => {
  const work = await mkdtemp(join(tmpdir(), "cg-integration-"));
  try {
    const run = spawnSync(process.execPath, [generator, "Bad Name../x"], {
      cwd: work,
      encoding: "utf8",
    });
    assert.notEqual(run.status, 0);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});