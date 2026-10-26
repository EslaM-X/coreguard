/**
 * CoreGuard — create-coreguard-integration generator (plan-90d-repo §2.2).
 *
 *   node scripts/create-integration.mjs <name>          # Phase-1 guard scaffold
 *   node scripts/create-integration.mjs <name> --dde    # DDE/1 payment-gate scaffold
 *   node scripts/create-integration.mjs <name> --dde \
 *        --fixture-real <candidate-dir>                 # DDE scaffold over REAL data
 *
 * Materialises a standalone integration template under ./<name>/ using the
 * public CoreGuard surfaces:
 *
 *   default — templates/integration: intent/policy/trace fixtures + verifier
 *             + smoke test over the @coreguard/sdk guard surface
 *             (authorize → verify → anchor).
 *   --dde   — templates/integration-dde: a working bilateral evidence fixture
 *             (ten DDE/1 records + SHA-256 pins), a standalone boundary engine,
 *             a one-command verifier, and a payment gate whose release law is
 *             engine VERIFIED **and** party ACCEPTED — a settled transaction
 *             alone releases nothing.
 *
 *   --fixture-real — like --dde, but the shipped dde-fixture/ is REPLACED by
 *             your real candidate's records, converted through the intake
 *             pipeline's own entry point (examples/real-fixture-intake/
 *             convert-to-fixture.mjs): the prelude gate must come back GATE
 *             GREEN (exit 0) or nothing scaffolds — fail-closed, no synthetic
 *             bytes are ever mixed with real ones. The candidate itself is
 *             never modified; the generator refuses to leave a half-built
 *             scaffold behind when the gate is red.
 *
 * The generated project is intentionally NOT part of this workspace: it
 * consumes CoreGuard the way an external integrator would.
 */

import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const templateDir = join(root, "templates", "integration");
const CONVERTER = join(root, "examples", "real-fixture-intake", "convert-to-fixture.mjs");

const TEXT_EXT = [".json", ".mjs", ".js", ".md", ".txt"];
const NAME_PLACEHOLDER = "{{NAME}}";

function usage() {
  console.error(
    "usage: node scripts/create-integration.mjs <name> [--dde]\n" +
      "  default  creates ./<name> from templates/integration (fixtures + verifier + tests)\n" +
      "  --dde    creates ./<name> from templates/integration-dde (evidence fixture + payment gate + tests)\n" +
      "  --fixture-real <candidate-dir>  --dde mode with dde-fixture/ converted from\n" +
      "             a REAL intake candidate through the prelude gate (fail-closed:\n" +
      "             a GATE RED candidate scaffolds nothing)"
  );
  process.exit(1);
}

// walkAbsolute copies the template tree; `skipDirs` prunes whole top-level
// directories by name (used to replace the static dde-fixture with a real
// conversion — a synthetic fixture must never ride along next to real data).
async function walkAbsolute(absDir, destBase, name, entries, skipDirs) {
  const items = await readdir(absDir, { withFileTypes: true });
  for (const item of items) {
    if (skipDirs.has(item.name) && item.isDirectory()) continue;
    const from = join(absDir, item.name);
    const to = join(destBase, item.name);
    if (item.isDirectory()) {
      await mkdir(to, { recursive: true });
      await walkAbsolute(from, to, name, entries, skipDirs);
      continue;
    }
    const isText = TEXT_EXT.includes(item.name.slice(item.name.lastIndexOf(".")));
    if (isText) {
      let text = await readFile(from, "utf8");
      if (text.includes(NAME_PLACEHOLDER)) text = text.split(NAME_PLACEHOLDER).join(name);
      await writeFile(to, text);
    } else {
      await cp(from, to);
    }
    entries.push(item.name);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dde = args.includes("--dde");
  const fixtureRealIdx = args.indexOf("--fixture-real");
  const fixtureReal = fixtureRealIdx !== -1;
  // The candidate path is the token right after the flag — never take it as
  // the scaffold <name>, even when the operator wrote the args in the other
  // order (`--dde --fixture-real <dir> <name>`).
  const candidateArg = fixtureReal ? args[fixtureRealIdx + 1] : undefined;
  const name = args.find((a, i) => !a.startsWith("--") && !(fixtureReal && candidateArg && i === fixtureRealIdx + 1));
  if (!name || /[^a-z0-9._-]/i.test(name)) usage();
  if (fixtureReal) {
    if (!dde) {
      console.error("create-integration: --fixture-real implies --dde — the real-fixture path exists for the DDE evidence template");
      process.exit(1);
    }
    if (!candidateArg) {
      console.error("create-integration: --fixture-real requires a candidate directory");
      process.exit(1);
    }
  }

  const sourceDir = dde ? join(root, "templates", "integration-dde") : templateDir;
  if (!existsSync(sourceDir)) {
    console.error(`create-integration: template missing: ${sourceDir}`);
    process.exit(1);
  }

  const candidateDir = candidateArg ? resolve(candidateArg) : null;
  if (candidateDir && !existsSync(candidateDir)) {
    console.error(`create-integration: --fixture-real candidate directory not found: ${candidateDir}`);
    process.exit(1);
  }

  const dest = resolve(process.cwd(), name);
  if (existsSync(dest)) {
    console.error(`create-integration: ${name} already exists — refusing to overwrite`);
    process.exit(1);
  }

  await mkdir(dest, { recursive: true });
  const entries = [];
  const skipDirs = fixtureReal ? new Set(["dde-fixture"]) : new Set();
  await walkAbsolute(sourceDir, dest, name, entries, skipDirs);

  // REAL bridge: the candidate → fixture conversion runs on the intake
  // pipeline's own entry point (gate → faithful packaging → engine verdict
  // over the written bytes). Same bytes any operator or reviewer replay —
  // the scaffold generator never re-types the conversion.
  if (fixtureReal) {
    const conv = spawnSync(process.execPath, [CONVERTER, candidateDir, join(dest, "dde-fixture")], { cwd: root, encoding: "utf8" });
    if (conv.stdout?.trim()) console.log(conv.stdout.trim());
    if (conv.error || conv.status !== 0) {
      await rm(dest, { recursive: true, force: true });
      if (conv.error) console.error(`create-integration: --fixture-real conversion failed to start: ${conv.error.message}`);
      else console.error(`create-integration: --fixture-real conversion refused (exit ${conv.status}) — the scaffold was removed; fix the candidate and re-run. No half-real scaffold is ever left behind.`);
      process.exit(1);
    }
  }

  console.log(`CoreGuard ${fixtureReal ? "DDE payment-gate scaffold over a REAL fixture" : dde ? "DDE payment-gate" : "integration"} scaffold created at ./${name}`);
  console.log(`  files:  ${entries.length}`);
  if (dde) {
    console.log(`  verify: node verify-dde.mjs      # re-verify the evidence fixture (VERIFIED expected)`);
    console.log(`  gate:   node payout-gate.mjs     # release/hold loop over the fixture's dispute record`);
    console.log(`  tests:  node --test`);
    if (fixtureReal) {
      console.log(`  real:   dde-fixture/ holds YOUR candidate's records (origin REAL, prelude gate green, engine-verified)`);
      console.log(`  next:   replace the execution-attestation placeholder with your settled on-chain truth, then re-run the gate`);
    } else {
      console.log(`  next:   replace the OWNER-DECLARED execution placeholder and the synthetic records with your real evidence`);
    }
  } else {
    console.log(`  next:   cd ${name} && npm install @coreguard/sdk`);
    console.log(`  verify: node verify.mjs`);
    console.log(`  demo:   node example.mjs`);
    console.log(`  tests:  node --test`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`create-integration: ${err.message}`);
    process.exit(1);
  });
}
