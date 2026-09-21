import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * npm publish gate — the two scripts that stand between the repo and the
 * registry are contract-tested:
 *
 *   scripts/publish-check.mjs  — refuse-to-publish defects: missing tarball
 *                                files, escaped relative imports, undeclared
 *                                or unused dependencies, install parity
 *   scripts/release-please.mjs — credential gate + plan + dependency-ordered
 *                                publishes (dry-run here; nothing ships)
 *
 * These tests are offline and in-repo: they assert the scripts exist, are
 * executable, refuse to publish without NPM_TOKEN, produce a full 13-package
 * plan in dependency order, and never publish in dry-run mode.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PUBLISH_CHECK = join(REPO, "scripts", "publish-check.mjs");
const RELEASE = join(REPO, "scripts", "release-please.mjs");

test("publish gate scripts exist and parse", () => {
  assert.ok(existsSync(PUBLISH_CHECK), "scripts/publish-check.mjs missing");
  assert.ok(existsSync(RELEASE), "scripts/release-please.mjs missing");
  for (const f of [PUBLISH_CHECK, RELEASE]) {
    const run = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
  }
});

test("release-please refuses to run without NPM_TOKEN (fail-closed)", () => {
  const env = { ...process.env };
  delete env.NPM_TOKEN;
  const run = spawnSync(process.execPath, [RELEASE, "--dry-run"], {
    cwd: REPO,
    encoding: "utf8",
    env,
  });
  assert.equal(run.status, 1, "absent token must exit 1");
  assert.match(String(run.stderr), /NPM_TOKEN is not set/);
});

test("release-please --dry-run: full 13-package plan, dependency-ordered, nothing published", () => {
  const run = spawnSync(process.execPath, [RELEASE, "--dry-run"], {
    cwd: REPO,
    encoding: "utf8",
    env: { ...process.env, NPM_TOKEN: "contract-test-dummy" },
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(run.status, 0, String(run.stderr));
  const out = String(run.stdout);
  const expected = [
    "@coreguard/canonical@", "@coreguard/crypto@", "@coreguard/policy@", "@coreguard/trace@",
    "@coreguard/evidence@", "@coreguard/replay@", "@coreguard/evm@", "@coreguard/provenance@",
    "@coreguard/intent@", "@coreguard/verifier@", "@coreguard/firewall@",
    "@coreguard/delivery@", "@coreguard/sdk@",
  ];
  for (const e of expected) assert.ok(out.includes(e), `plan missing ${e}`);
  assert.ok(out.includes("dependency order"));
  assert.ok(out.includes("nothing was published"));
  // the plan must end with the two headline packages after their dependencies
  assert.ok(out.indexOf("@coreguard/delivery@") < out.indexOf("@coreguard/sdk@"), "delivery must precede sdk");
  assert.ok(out.indexOf("@coreguard/canonical@") < out.indexOf("@coreguard/delivery@"), "canonical must precede delivery");
});

test("the release workflow publishes through the gate, never directly", () => {
  const wfPath = join(REPO, ".github", "workflows", "release.yml");
  assert.ok(existsSync(wfPath), ".github/workflows/release.yml missing");
  const wf = readFileSync(wfPath, "utf8");
  assert.match(wf, /release-please\.mjs/);
  assert.match(wf, /NPM_TOKEN/);
  assert.ok(!/npm publish(?!.*release-please)/.test(wf), "the workflow must not bypass the gate with a raw npm publish");
});
