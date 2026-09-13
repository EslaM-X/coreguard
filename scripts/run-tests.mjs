/**
 * Cross-version test runner (Node >= 18).
 *
 * `node --test` only expanded glob patterns itself from Node 21+; on Node 18/20
 * quoted globs in package.json fail. This collects test files explicitly so the
 * suite runs identically on every supported Node version and OS.
 */

import { readdirSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

const suites = ["test/canonicalization", "test/tamper", "test/anchor", "test/p1", "test/evm", "test/provenance", "test/firewall"];
const files = [];

for (const dir of suites) {
  for (const entry of readdirSync(dir)) {
    if (entry.endsWith(".test.js")) files.push(join(dir, entry));
  }
}

if (files.length === 0) {
  console.error("No test files found");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);