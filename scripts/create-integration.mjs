/**
 * CoreGuard — create-coreguard-integration generator (plan-90d-repo §2.2).
 *
 *   node scripts/create-integration.mjs <name>          # Phase-1 guard scaffold
 *   node scripts/create-integration.mjs <name> --dde    # DDE/1 payment-gate scaffold
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
 * The generated project is intentionally NOT part of this workspace: it
 * consumes CoreGuard the way an external integrator would.
 */

import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const templateDir = join(root, "templates", "integration");

const TEXT_EXT = [".json", ".mjs", ".js", ".md", ".txt"];
const NAME_PLACEHOLDER = "{{NAME}}";

function usage() {
  console.error(
    "usage: node scripts/create-integration.mjs <name> [--dde]\n" +
      "  default  creates ./<name> from templates/integration (fixtures + verifier + tests)\n" +
      "  --dde    creates ./<name> from templates/integration-dde (evidence fixture + payment gate + tests)"
  );
  process.exit(1);
}

async function walkAbsolute(absDir, destBase, name, entries) {
  const items = await readdir(absDir, { withFileTypes: true });
  for (const item of items) {
    const from = join(absDir, item.name);
    const to = join(destBase, item.name);
    if (item.isDirectory()) {
      await mkdir(to, { recursive: true });
      await walkAbsolute(from, to, name, entries);
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
  const name = args.find((a) => !a.startsWith("--"));
  if (!name || /[^a-z0-9._-]/i.test(name)) usage();

  const sourceDir = dde ? join(root, "templates", "integration-dde") : templateDir;
  if (!existsSync(sourceDir)) {
    console.error(`create-integration: template missing: ${sourceDir}`);
    process.exit(1);
  }

  const dest = resolve(process.cwd(), name);
  if (existsSync(dest)) {
    console.error(`create-integration: ${name} already exists — refusing to overwrite`);
    process.exit(1);
  }

  await mkdir(dest, { recursive: true });
  const entries = [];
  await walkAbsolute(sourceDir, dest, name, entries);

  console.log(`CoreGuard ${dde ? "DDE payment-gate" : "integration"} scaffold created at ./${name}`);
  console.log(`  files:  ${entries.length}`);
  if (dde) {
    console.log(`  verify: node verify-dde.mjs      # re-verify the evidence fixture (VERIFIED expected)`);
    console.log(`  gate:   node payout-gate.mjs     # release/hold loop (held: party REJECTED in the fixture)`);
    console.log(`  tests:  node --test`);
    console.log(`  next:   replace the OWNER-DECLARED execution placeholder and the synthetic records with your real evidence`);
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