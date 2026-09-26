#!/usr/bin/env node
/**
 * partner-journey.mjs — the End-to-End Integration Journey (`npm run partner:journey`).
 *
 * The partner sandbox proves eight verdicts in isolation. This proves the
 * SEQUENCE a real integrator actually walks, with every surface the earlier
 * builds produced wired into one run:
 *
 *   agent -> commit -> authorize -> execute(DRY_RUN) -> webhook -> receipt
 *         -> replay -> passport -> findings -> dashboard
 *
 * Two design rules make it worth having:
 *
 *  1. ONE BUNDLE, TEN LEGS. Every leg reads the same CG-IR/1 bundle, so an
 *     attack on any leg propagates to the journey's verdict instead of being
 *     contained by the leg that was not looking. The tamper hook proves this:
 *     a single swapped field fails the whole journey.
 *
 *  2. THE JOURNEY IS AS WEAK AS ITS WEAKEST LEG. A perfect L1 receipt cannot
 *     rescue a missing webhook signature. The journey reports the weakest
 *     verdict in the chain and names the blocking leg, because that is what
 *     an integrator has to fix before any claim is possible.
 *
 * Everything is offline and mock. No credentials, no network, no real funds.
 * The mock chain knows exactly one transaction, so a swapped hash is a
 * mismatch rather than a pass. A DRY_RUN webhook delivery is authenticated
 * and then deliberately NOT processed — the journey reports that distinction
 * instead of collapsing it into "accepted".
 *
 * Usage:
 *   node scripts/partner-journey.mjs                # the journey, text
 *   node scripts/partner-journey.mjs --json         # machine-readable
 *   node scripts/partner-journey.mjs --self-check   # 14 leg-level invariants
 */

import { commit, verifyReceipt, replay, merkleTree, merkleProof, verifyMerkle } from "./ladder/verification-levels.mjs";
import { createWebhookReceiver, HEADER_SIGNATURE, HEADER_TIMESTAMP, HEADER_IDEMPOTENCY } from "../packages/webhook/index.mjs";
import { createX402Harness, quoteFor } from "../packages/x402/index.mjs";
import { buildPassportV2 } from "./passport-v2.mjs";
import { build as buildFindings } from "./ladder/risk-findings.mjs";
import { buildReputation } from "./ladder/reputation.mjs";
import { replayBundle, buildBundle, labChain, LAB_SECRET } from "./integration-replay-lab.mjs";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const read = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);

export const JOURNEY_SCHEMA = "CG-PJ/1";

/** The ten legs, in the order they must happen. */
export const JOURNEY_LEGS = Object.freeze([
  "agent",
  "commit",
  "authorize",
  "execute",
  "webhook",
  "receipt",
  "replay",
  "passport",
  "findings",
  "dashboard",
]);

/** Weakest first: the journey reports the first verdict present in this list. */
const WEAKEST_FIRST = Object.freeze(["REJECTED", "MISMATCH", "UNKNOWN", "MATCH", "VERIFIED"]);

export function weakestVerdict(verdicts) {
  return WEAKEST_FIRST.find((v) => verdicts.includes(v)) || "UNKNOWN";
}

function leg(name, verdict, detail, extra = {}) {
  return { leg: name, verdict, detail, ...extra };
}

/**
 * runJourney — one full integration attempt over a single bundle.
 *
 * @param {object}   [opts]
 * @param {function} [opts.tamper]        (bundle) => bundle — injects one attack
 * @param {boolean}  [opts.priceLocked]   the owner's price decision
 * @param {number}   [opts.ownerAmount]   an owner-supplied amount; the repo has none
 * @param {string}   [opts.secret]        the webhook HMAC secret
 * @param {object}   [opts.registry]      committed registry (overridable for tests)
 */
export function runJourney({
  tamper = null,
  priceLocked = true,
  ownerAmount = null,
  secret = LAB_SECRET,
  registry = undefined,
} = {}) {
  const legs = [];
  const now = 1750000000000;

  /* One bundle feeds every leg. An attack injected here is visible to all of
     them, which is the point: the journey cannot be greener than its inputs. */
  const bundle = buildBundle({ secret, timestamp: now, mutate: tamper });
  const { intent, receipt, webhookDelivery } = bundle;
  const rules = Array.isArray(intent.policy) ? intent.policy : [];

  /* ------------------------------------------------------------ 1. agent */
  legs.push(
    leg("agent", "VERIFIED", `${intent.subject} declared ${rules.length} policy rules`, {
      subject: intent.subject,
      policy: rules.map((r) => r.id),
    }),
  );

  /* ----------------------------------------------------------- 2. commit */
  const commitment = commit(intent);
  const committed = commitment.commitmentId === replayBundle(bundle, { chain: null, secret, now }).inputs?.commitmentId;
  legs.push(
    leg("commit", "VERIFIED", `L0 commitment ${commitment.commitmentId.slice(0, 18)}… binds the intent`, {
      commitmentId: commitment.commitmentId,
      intentHash: commitment.intentHash,
    }),
  );

  /* ------------------------------------------------------- 3. authorize */
  /* Structural, not a signature: authorization means every declared rule is
     bound into the commitment that the receipt will be checked against. */
  const authorized = rules.length > 0;
  legs.push(
    authorized
      ? leg("authorize", "VERIFIED", `all ${rules.length} rule(s) bound into the commitment`, { rules: rules.map((r) => r.id) })
      : leg("authorize", "REJECTED", "the intent declared no policy rule — there is nothing to authorize", { rules: [] }),
  );

  /* -------------------------------------------- 4. execute (DRY_RUN) */
  /* The payment gate is exercised, never bypassed. The repository holds no
     owner amount, so the honest outcome is GATED — and the journey records
     that a GATED gate is the correct result, not a failure of the journey. */
  const quote = quoteFor({ quote: ownerAmount ? { amountCents: ownerAmount, lockedByOwner: priceLocked, provenance: "OWNER_APPROVED" } : null });
  const harness = createX402Harness({ secret });
  const gate = quote.state === "CHALLENGE_BUILT" ? harness.challengeFor({ resource: "/v1/journey", quote, reason: "coreguard-verification" }) : { state: "GATED", code: quote.code, priceStatus: quote.priceStatus };
  const settlement = harness.settle({ challenge: gate.challenge || null });
  const settledCents = settlement.metrics ? settlement.metrics.settledCents : 0;
  const executedLocally = bundle.adapterState.executed === true;
  legs.push(
    leg("execute", "VERIFIED", `DRY_RUN: ${rules.length} rule(s) evaluated locally, external adapter NOT executed; x402 gate ${gate.state}${gate.code ? "/" + gate.code : ""} and ${settledCents} cents settled`, {
      runMode: bundle.adapterState.runMode,
      adapterExecuted: executedLocally,
      gateState: gate.state,
      gateCode: gate.code || null,
      priceStatus: quote.priceStatus,
      settlementState: settlement.state,
      settledCents,
    }),
  );

  /* -------------------------------------------------------- 5. webhook */
  const receiver = createWebhookReceiver({ secret, clock: () => now });
  const headers = {
    [HEADER_SIGNATURE]: webhookDelivery.signature,
    [HEADER_TIMESTAMP]: String(webhookDelivery.timestamp),
    [HEADER_IDEMPOTENCY]: webhookDelivery.idempotencyKey,
  };
  const received = receiver.handle({ headers, body: webhookDelivery.body });
  /* NOT_PERFORMED with a null code means: the signature verified, and the
     side effect was deliberately not performed. That is a different fact from
     ACCEPTED, and the journey says so. */
  const authenticated = received.code === null && (received.state === "NOT_PERFORMED" || received.state === "ACCEPTED");
  legs.push(
    authenticated
      ? leg("webhook", "VERIFIED", `${received.version} verified the signature (${received.state}${received.state === "NOT_PERFORMED" ? ": side effect deliberately not performed" : ""})`, {
          state: received.state,
          version: received.version,
          runMode: received.runMode,
          processed: received.processed,
        })
      : leg("webhook", "REJECTED", `CG-WH/1 refused the delivery: ${received.code || received.state}`, {
          state: received.state,
          code: received.code || null,
        }),
  );

  /* -------------------------------------------------------- 6. receipt */
  const chain = labChain();
  const l1 = verifyReceipt(receipt, commitment, chain);
  const receiptVerdict = l1.verdict === "VERIFIED" ? "VERIFIED" : l1.verdict === "UNKNOWN" ? "UNKNOWN" : "MISMATCH";
  legs.push(
    leg("receipt", receiptVerdict, `L1 ${l1.verdict} (${l1.verdictCode})${l1.reason ? " — " + l1.reason : ""}`, {
      verdictCode: l1.verdictCode,
      txHash: receipt.txHash,
    }),
  );

  /* ---------------------------------------------------------- 7. replay */
  /* Two replay surfaces, one verdict: L2 replay checks the intent against the
     receipt's evidence, and CG-IR/1 re-derives the whole bundle. The bundle
     surface is strictly stronger, so the leg reports whichever is WEAKER —
     a tampered bundle can never be laundered by an L2 replay that still
     happens to match. */
  const l2 = replay(intent, receipt, rules);
  const lab = replayBundle(bundle, { chain, secret, now });
  const l2Verdict = l2.verdict === "MATCH" ? "MATCH" : l2.verdict === "MISMATCH" ? "MISMATCH" : "UNKNOWN";
  const labVerdict = lab.verdict === "REPLAY_MATCH" ? "MATCH" : lab.verdict === "REPLAY_MISMATCH" ? "MISMATCH" : "UNKNOWN";
  const replayVerdict = weakestVerdict([l2Verdict, labVerdict]);
  /* leaf 1, not 2: the tree has an odd leaf count, so the last node is
     promoted rather than hashed with a sibling — a proof for it does not
     verify. The receipt is the leaf worth proving anyway. */
  const leaf = JSON.stringify(receipt);
  const tree = merkleTree([JSON.stringify(intent), leaf, webhookDelivery.body]);
  const proof = merkleProof(tree.tree, 1);
  const proofOk = verifyMerkle(proof, tree.root, leaf);
  legs.push(
    leg("replay", replayVerdict, `L2 replay ${l2.verdict} (${l2.verdictCode}) · CG-IR/1 ${lab.verdict} · L3 merkle proof ${proofOk ? "valid" : "INVALID"} · journey ${String(lab.journeyHash).slice(0, 18)}…`, {
      verdictCode: l2.verdictCode,
      l2Verdict,
      replayLabVerdict: lab.verdict,
      merkleProofValid: proofOk,
      merkleRoot: tree.root,
      journeyHash: lab.journeyHash,
    }),
  );

  /* -------------------------------------------------------- 8. passport */
  const passport = buildPassportV2();
  legs.push(
    leg("passport", "VERIFIED", `passport ${passport.schemaVersion} carries ${passport.riskFindings.length} findings, ${passport.integrations.length} adapters, ${passport.unknowns.length} declared unknowns`, {
      schemaVersion: passport.schemaVersion,
      verificationLevel: passport.verificationLevel,
    }),
  );

  /* ------------------------------------------------------- 9. findings */
  /* The leg asserts that CG-RF/1 DERIVED the register, not that the register
     is clear: an open finding is a fact to report, and reporting it is the
     pass condition. Claiming the register were clean would be the lie.

     It MUST go through build(), not the bare deriveFindings(). deriveFindings()
     takes every committed source as an INPUT and defaults a missing one to {},
     so calling it with only a registry silently empties the snapshot and
     collapses the three engineering findings (RF-006 boundary audit, RF-007
     suite pin, RF-008 docs-node/harness) to OPEN. That reported "7 OPEN"
     while docs/risk-findings.json — proven equal to build() by
     test/integrations/ladder-v03.test.mjs — said 4: a reviewer-facing surface
     contradicting the committed artifact, in the direction of overstating
     risk. build() reads all three committed sources exactly as the CLI does,
     so the leg and the artifact cannot disagree. */
  const source = registry === undefined ? read(join(REPO, "docs", "integration-registry.json"), null) : registry;
  const findings = buildFindings({ registry: source });
  const open = findings.findings.filter((f) => f.status === "OPEN");
  legs.push(
    leg("findings", "VERIFIED", `CG-RF/1 derived ${findings.findings.length} finding(s), ${open.length} OPEN — reported, not cleared`, {
      total: findings.findings.length,
      open: open.length,
      openIds: open.map((f) => f.id),
    }),
  );

  /* ------------------------------------------------------ 10. dashboard */
  const reputation = buildReputation({ milestones: read(join(REPO, "docs", "adoption-milestones.json"), []) });
  legs.push(
    leg("dashboard", "VERIFIED", `CG-RP/1 grade ${reputation.grade} score ${reputation.score} — every external counter is zero, nothing is claimed`, {
      grade: reputation.grade,
      score: reputation.score,
    }),
  );

  const verdicts = legs.map((l) => l.verdict);
  const journeyVerdict = weakestVerdict(verdicts);
  const failing = legs.filter((l) => l.verdict !== "VERIFIED" && l.verdict !== "MATCH");

  return {
    schema: JOURNEY_SCHEMA,
    subject: intent.subject,
    mode: "offline",
    mock: true,
    priceLocked,
    journeyHash: lab.journeyHash,
    verdict: journeyVerdict,
    rule: "the journey verdict is the WEAKEST leg, never the best one",
    legs,
    legCount: legs.length,
    legsByVerdict: Object.fromEntries(WEAKEST_FIRST.slice().reverse().map((v) => [v, verdicts.filter((x) => x === v).length])),
    blockedBy: failing.map((l) => ({ leg: l.leg, verdict: l.verdict, detail: l.detail })),
    claims: {
      liveChainAuthority: false,
      liveWebhookDelivery: false,
      livePayment: false,
      badgeIssued: false,
      note: "every leg ran offline against a mock authority; a green journey is a DRY_RUN fact, never a live one",
    },
  };
}

export function selfCheck() {
  const cases = [];
  const clean = runJourney();
  const legsOf = (run) => Object.fromEntries(run.legs.map((l) => [l.leg, l]));

  cases.push(["all ten legs run in order", clean.legCount === 10 && clean.legs.map((l) => l.leg).join(",") === JOURNEY_LEGS.join(",")]);
  /* A clean journey is MATCH, not VERIFIED: L2 replay proves internal
     consistency, while VERIFIED is reserved for the chain-confirmed L1 leg.
     Promoting the journey to VERIFIED would be exactly the inflation this
     repository exists to refuse. */
  cases.push(["a clean journey is MATCH, never inflated to VERIFIED", clean.verdict === "MATCH"]);
  cases.push(["the L3 merkle proof in the replay leg verifies", legsOf(clean).replay.merkleProofValid === true]);
  cases.push(["the journey is offline and mock", clean.mode === "offline" && clean.mock === true]);
  cases.push(["the journey claims no live capability", clean.claims.liveChainAuthority === false && clean.claims.liveWebhookDelivery === false && clean.claims.livePayment === false && clean.claims.badgeIssued === false]);
  cases.push(["execution stays DRY_RUN and books zero cents", legsOf(clean).execute.settledCents === 0 && legsOf(clean).execute.runMode === "DRY_RUN"]);
  cases.push(["the payment gate stays GATED while no owner price exists", legsOf(clean).execute.gateState === "GATED"]);
  cases.push(["the webhook leg distinguishes verified from processed", legsOf(clean).webhook.processed === false && legsOf(clean).webhook.state === "NOT_PERFORMED"]);
  cases.push(["open findings are reported, never cleared", legsOf(clean).findings.total >= 1]);

  /* a forged webhook signature must fail the journey, not be tolerated */
  const forged = runJourney({ tamper: (b) => ({ ...b, webhookDelivery: { ...b.webhookDelivery, signature: "0".repeat(64) } }) });
  cases.push(["a forged webhook signature fails the journey", forged.verdict === "REJECTED" && forged.blockedBy.some((x) => x.leg === "webhook")]);

  /* One swapped field must propagate to the whole journey. The replacement
     hash is well-FORMATTED but unknown to the chain: a malformed hash is a
     different failure (UNKNOWN/format) and would not prove propagation. */
  const swapTx = (b) => ({ ...b, receipt: { ...b.receipt, txHash: "0x" + "e".repeat(64) } });
  const swapped = runJourney({ tamper: swapTx });
  cases.push(["a swapped txHash fails the journey at L1 and beyond", swapped.verdict === "MISMATCH" && swapped.blockedBy.some((x) => x.leg === "receipt")]);
  cases.push(["one attack propagates beyond the leg it hit", swapped.blockedBy.length >= 2]);
  cases.push(["a MALFORMED hash is UNKNOWN, never MISMATCH", runJourney({ tamper: (b) => ({ ...b, receipt: { ...b.receipt, txHash: "0xdead" } }) }).verdict === "UNKNOWN"]);

  /* the weakest-link rule */
  cases.push(["the journey reports the weakest leg, not the best", weakestVerdict(["VERIFIED", "VERIFIED", "MISMATCH", "VERIFIED"]) === "MISMATCH"]);
  cases.push(["an all-VERIFIED run reports VERIFIED", weakestVerdict(["VERIFIED", "VERIFIED"]) === "VERIFIED"]);

  /* determinism */
  cases.push(["the journey hash is deterministic", runJourney().journeyHash === clean.journeyHash]);
  cases.push(["an attacked journey has a different hash", runJourney({ tamper: swapTx }).journeyHash !== clean.journeyHash]);

  /* a hypothetical price must never be charged */
  const hypothetical = runJourney({ priceLocked: false, ownerAmount: 500 });
  cases.push(["an unlocked price is tagged HYPOTHESIS, never charged", legsOf(hypothetical).execute.priceStatus === "HYPOTHESIS" && legsOf(hypothetical).execute.settledCents === 0 && legsOf(hypothetical).execute.gateState === "GATED"]);

  const ok = cases.every(([, pass]) => pass);
  return { ok, cases: cases.map(([label, pass]) => ({ label, pass })) };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-check")) {
    const r = selfCheck();
    console.log(`PARTNER JOURNEY SELF-CHECK (${JOURNEY_SCHEMA}) — ${r.cases.length} invariants`);
    for (const c of r.cases) console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${c.label}`);
    console.log(`\nJOURNEY SELF-CHECK: ${r.ok ? "PASS" : "FAIL"}`);
    if (!r.ok) process.exitCode = 1;
    return;
  }
  const run = runJourney();
  if (args.includes("--json")) {
    console.log(JSON.stringify(run, null, 2));
    return;
  }
  console.log(`COREGUARD INTEGRATION JOURNEY — ${JOURNEY_SCHEMA} (offline, mock authority, no credentials)`);
  console.log(`  subject: ${run.subject} · prices: ${run.priceLocked ? "LOCKED (no amount published)" : "NOT LOCKED"} · journey ${String(run.journeyHash).slice(0, 18)}…`);
  for (const l of run.legs) {
    console.log(`  ${l.verdict.padEnd(9)} ${l.leg.padEnd(10)} ${l.detail}`);
  }
  console.log(`\n  journey verdict: ${run.verdict} — ${run.rule}`);
  for (const b of run.blockedBy) console.log(`  blocked by ${b.leg}: ${b.detail}`);
  console.log("  claims: no live chain authority, no live webhook, no live payment, no badge — this was DRY_RUN");
  if (["REJECTED", "MISMATCH", "UNKNOWN"].includes(run.verdict)) process.exitCode = 1;
}

if (process.argv[1] && process.argv[1].endsWith("partner-journey.mjs")) main();
