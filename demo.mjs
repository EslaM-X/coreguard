#!/usr/bin/env node
/**
 * demo.mjs — CoreGuard quick demo (no keys, no money)
 * 
 * Shows the exact flow: publish -> hold -> reserve -> deliver -> evaluate
 * When verdict is UNKNOWN, funds STAY HELD. Never auto-pay, never auto-refund.
 */

import { createJobFlow, budgetWaterfall, reservationTimeline, acceptanceEvidenceBundle, UNKNOWN_STAYS_HELD_EXPLAINER } from "./packages/job-integration/index.mjs";
import { createRefusalAuditor } from "./packages/refusal-audit/index.mjs";

console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║           COREGUARD — Job Economy Demo (Facts Only)         ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log("");

console.log("► Step 1: Open job with ceiling $10.00 (1000 cents)");
const flow = createJobFlow({ jobId: "demo-job-001", ceilingCents: 1000, holdAmountCents: 500 });
console.log(`  ✓ Job opened | Held: ${flow.snapshot().heldCents}c | Available: ${flow.snapshot().availableCents}c`);
console.log("");

console.log("► Step 2: Carve share for sub-agent (research)");
const scope = flow.openScope({ scopeId: "research-agent", shareCents: 300 });
console.log(`  ✓ Scope created | share: ${scope.scope?.shareCents}c`);
console.log("");

console.log("► Step 3: Reserve cost BEFORE signing (refuse-before-sign)");
const res = flow.reserve({ scopeId: "research-agent", amountCents: 100, source: "METERED" });
console.log(`  ✓ Reserved: ${res.ok ? "OK" : "REFUSED"} | Reserved: ${flow.snapshot().reservedCents}c`);
console.log("");

console.log("► Step 4: Deliver with NON-DETERMINISTIC work (requires human judgment)");
const spec = flow.buildSpec([
  { kind: "DIGEST_MATCH", args: { digest: "artifact-xyz" } },
  { kind: "HUMAN_JUDGMENT" }  // can't be checked mechanically
]);
console.log("  ✓ Acceptance spec built (machine + judgment)");
console.log("");

console.log("► Step 5: Evaluate against evidence");
const delivered = flow.deliver({ 
  spec: spec.spec, 
  evidence: { artifactSha256: "artifact-xyz" } 
});
console.log(`  ✓ Verdict: ${delivered.state} | Disposition: ${delivered.disposition}`);
console.log("");

console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║                        RESULT                                ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`  Verdict:        ${delivered.state}`);
console.log(`  Disposition:    ${delivered.disposition}`);
console.log(`  Held:           ${flow.snapshot().heldCents}c (LOCKED)`);
console.log(`  Released:       ${flow.snapshot().releasedCents}c`);
console.log(`  Refunded:       ${flow.snapshot().refundedCents}c`);
console.log("");
console.log("  ► FUNDS STAY HELD. NOT auto-paid. NOT auto-refunded.");
console.log("");

console.log("► Budget Waterfall:");
const wf = budgetWaterfall({ ledger: flow.ledger, jobId: "demo-job-001" });
for (const row of wf.rows) {
  console.log(`  [${row.level.toUpperCase()}] ${row.id} | held:${row.heldCents||0}c res:${row.reservedCents||0}c`);
}
console.log("");

console.log("► " + UNKNOWN_STAYS_HELD_EXPLAINER.rule);
console.log("  " + UNKNOWN_STAYS_HELD_EXPLAINER.why);
console.log("");

console.log("► Refusal Audit (proof of refuse-before-sign):");
const audit = createRefusalAuditor({ logDir: "./var/demo-refusals" });
const r = audit.record({ source: "x402", reasonCode: "BUDGET_INSUFFICIENT", jobId: "demo-job-001", action: "SIGN", reason: "insufficient job budget" });
console.log(`  ✓ Refusal logged | digest: ${r.digest.slice(0,16)}... | no keys/secrets logged`);
console.log("");

console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║  Proof: https://eslam-x.github.io/coreguard/PLAYGROUND.html ║");
console.log("║  Repo:  https://github.com/EslaM-X/coreguard                ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
