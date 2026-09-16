/**
 * CoreGuard — create-coreguard-integration generator (plan-90d-repo §2.2).
 *
 *   node scripts/create-integration.mjs <name>
 *
 * Materialises a standalone integration template under ./<name>/ containing
 * intent / policy / trace fixtures, a verifier script and a smoke test, using
 * the public @coreguard/sdk guard surface (authorize → verify → anchor).
 *
 * The generated project is intentionally NOT part of this workspace: it
 * consumes `@coreguard/sdk` like any external integrator would
 * (`npm install @coreguard/sdk` inside the generated directory).
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
    "usage: node scripts/create-integration.mjs <name>\n" +
      "  creates ./<name> from templates/integration (fixtures + verifier + tests)"
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
  const name = process.argv[2];
  if (!name || /[^a-z0-9._-]/i.test(name)) usage();

  const dest = resolve(process.cwd(), name);
  if (existsSync(dest)) {
    console.error(`create-integration: ${name} already exists — refusing to overwrite`);
    process.exit(1);
  }

  await mkdir(dest, { recursive: true });
  const entries = [];
  await walkAbsolute(templateDir, dest, name, entries);

  console.log(`CoreGuard integration created at ./${name}`);
  console.log(`  files:  ${entries.length}`);
  console.log(`  next:   cd ${name} && npm install @coreguard/sdk`);
  console.log(`  verify: node verify.mjs`);
  console.log(`  demo:   node example.mjs`);
  console.log(`  tests:  node --test`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`create-integration: ${err.message}`);
    process.exit(1);
  });
}