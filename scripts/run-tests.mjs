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

const suites = ["test/canonicalization", "test/tamper", "test/anchor", "test/p1", "test/p2", "test/evm", "test/provenance", "test/delivery", "test/pricing", "test/ci", "test/firewall", "test/firewall/attack-lab", "test/firewall/ws1", "test/sdk", "test/independent-verifier", "test/recovery", "test/verifier-c", "test/eol", "test/encoding", "test/conformance/live"];
const files = [];

for (const dir of suites) {
  for (const entry of readdirSync(dir)) {
    if (entry.endsWith(".test.js") || entry.endsWith(".test.mjs")) files.push(join(dir, entry));
  }
}

if (files.length === 0) {
  console.error("No test files found");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...concurrencyArgs(), ...files], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);

// [C20] CI parity for load-sensitive assertions: node --test sizes file
// concurrency from availableParallelism()-1, so a many-core dev box runs the
// heavy suites side by side while the 2-core CI runs them essentially
// sequentially. The local contention storms then fail the adversarial
// runner's `over budget: 0` perf thresholds (control cycle 575ms vs ~150ms
// quiet) that CI never sees — a local-red/CI-green split in the OPPOSITE
// direction of [C17]. Pin to 1 (CI-equivalent); NODE_TEST_CONCURRENCY=N opts
// back into parallelism for quick sweeps at the caller's own risk.
function concurrencyArgs() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  const supportsFlag = major > 18 || (major === 18 && minor >= 17);
  if (!supportsFlag) return []; // pre-18.17: no --test-concurrency, keep old behavior
  return [`--test-concurrency=${process.env.NODE_TEST_CONCURRENCY || "1"}`];
}