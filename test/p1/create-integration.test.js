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
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

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