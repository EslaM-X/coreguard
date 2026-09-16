#!/usr/bin/env node
/**
 * CoreGuard — create-coreguard-integration bin.
 *
 * Thin wrapper over scripts/create-integration.mjs so the generator is
 * reachable from a package bin (`npx create-coreguard-integration <name>`).
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const generator = join(repoRoot, "scripts", "create-integration.mjs");

const run = spawnSync(process.execPath, [generator, ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(run.status ?? 1);