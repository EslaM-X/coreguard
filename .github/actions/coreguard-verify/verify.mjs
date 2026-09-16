/**
 * CoreGuard Verification — GitHub Action verify step.
 *
 * Consumer-surface check (plan-90d-repo §2.4): resolves `@coreguard/sdk` the
 * same way an external integrator would (node_modules resolution walks up to
 * the consumer's node_modules), recomputes the receiptId, verifies against
 * intent/policy/trace, and prints `CoreGuard Verification: PASS` (exit 0).
 */

import { readFile } from "node:fs/promises";
import { createGuard } from "@coreguard/sdk";

const requireEnv = (name) => {
  const v = process.env[name];
  if (!v) {
    console.error(`coreguard-verify: missing ${name} input`);
    process.exit(1);
  }
  return v;
};

const receiptPath = requireEnv("CG_RECEIPT");
const intentPath = requireEnv("CG_INTENT");
const policyPath = requireEnv("CG_POLICY");
const tracePath = requireEnv("CG_TRACE");
const chainOverride = process.env.CG_CHAIN || "";

const load = async (p) => JSON.parse(await readFile(p, "utf8"));

const receiptDoc = await load(receiptPath);
if (!receiptDoc.receiptId || !receiptDoc.receipt) {
  console.error("coreguard-verify: expected { receiptId, receipt } payload");
  process.exit(1);
}
const receipt = { receiptId: receiptDoc.receiptId, ...receiptDoc.receipt };
const intent = await load(intentPath);
const policy = await load(policyPath);
const trace = await load(tracePath);

const guard = createGuard();
const result = await guard.verify({
  chain: chainOverride || receipt.chainId,
  receipt,
  intent,
  policy,
  trace,
});

console.log("CoreGuard Verification:");
console.log(`  receiptId:      ${result.receiptId}`);
console.log(`  verdict:        ${result.verdict}`);
console.log(`  verification:   ${result.verificationLevel}`);
for (const c of result.checks) {
  const mark = c.result === "PASS" ? "OK" : c.result === "NOT_RUN" ? "SKIP" : "FAIL";
  console.log(`    [${mark}] ${c.check} - ${c.detail ?? ""}`.trim());
}

if (result.verdict === "VERIFIED") {
  const plan = await guard.anchor(receipt);
  console.log(`  anchor plan:    commitment=${plan.commitment}`);
  console.log("CoreGuard Verification: PASS");
  process.exit(0);
}

console.error(`CoreGuard Verification: FAIL (${result.verdict})`);
process.exit(1);