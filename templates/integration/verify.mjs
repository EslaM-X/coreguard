/**
 * CoreGuard verify — verify a receipt against intent/policy/trace (offline).
 *
 *   node verify.mjs
 *
 * Uses the public @coreguard/sdk guard.verify surface. Every receiptId is
 * recomputed from the receipt payload — never ratified from the caller.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { createGuard } from "@coreguard/sdk";

const here = dirname(fileURLToPath(import.meta.url));
const load = (f) => readFile(resolve(here, f), "utf8").then(JSON.parse);

const guard = createGuard();

const intent = await load("intent.json");
const policy = await load("policy.json");
const trace = await load("trace.json");

// Derive + verify a fresh receipt from the execution record (no receipt input).
const result = await guard.verify({ chain: intent.chainId, intent, policy, trace });

console.log(`\nCoreGuard Verification (guard.verify)`);
console.log(`  receiptId:      ${result.receiptId}`);
console.log(`  verdict:        ${result.verdict}`);
console.log(`  verification:   ${result.verificationLevel}`);
for (const c of result.checks) {
  const mark = c.result === "PASS" ? "OK" : c.result === "NOT_RUN" ? "SKIP" : "FAIL";
  console.log(`    [${mark}] ${c.check}`);
}
console.log(`\nverdict=${result.verdict}`);
process.exit(result.verdict === "VERIFIED" ? 0 : 1);