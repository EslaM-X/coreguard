/**
 * CoreGuard example — full intent lifecycle with guard.* (authorize → verify → anchor).
 *
 *   node example.mjs
 *
 * Uses ONLY public @coreguard/sdk surfaces.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createGuard } from "@coreguard/sdk";

const here = dirname(fileURLToPath(import.meta.url));
const load = (f) => readFile(resolve(here, f), "utf8").then(JSON.parse);

const guard = createGuard();

const intent = await load("intent.json");
const policy = await load("policy.json");
const trace = await load("trace.json");

// 1) PRE — firewall decision for the intent (needs a signed declaration; here
// we exercise the fail-closed NOT_RUN shape for a bare `guard.authorize(intent)`).
const pre = await guard.authorize(intent);
console.log(`authorize(intent) → status=${pre.status}, decision=${pre.decision}`);
if (pre.errors.length) console.log(`  (expected pre-signature) ${pre.errors[0]}`);

// 2) POST — derive + verify a receipt from the execution trace.
const v = await guard.verify({ chain: intent.chainId, intent, policy, trace });
console.log(`verify(...)      → ${v.verdict} (${v.verificationLevel})`);

// 3) ANCHOR — offline CGEP/1:PROOF commitment plan from the receipt payload.
const plan = await guard.anchor(v.receipt);
console.log(`anchor(...)      → commitment=${plan.commitment}`);
console.log(`                    proofId=${plan.proofId}`);

process.exit(v.verdict === "VERIFIED" ? 0 : 1);