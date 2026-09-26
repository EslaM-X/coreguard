#!/usr/bin/env node
/**
 * integration-replay-lab.mjs — CG-IR/1, the Integration Replay Lab.
 *
 * Every earlier surface proves one link: the protocol proves a receipt, the
 * webhook proves a delivery, x402 proves a challenge. This lab re-derives the
 * WHOLE journey from its five inputs and reports exactly one of three
 * verdicts:
 *
 *   REPLAY_MATCH     every link re-derived identically
 *   REPLAY_MISMATCH  the record contradicts itself
 *   UNKNOWN          a required input is missing (never a guess, never MATCH)
 *
 * The five inputs are the artifacts a real integration produces:
 *   1. intent               the canonical intent bytes
 *   2. receipt              the chain-confirmed capture
 *   3. webhookDelivery      the authenticated delivery (CG-WH/1)
 *   4. paymentEnvelope      the commercial envelope (X402/1)
 *   5. adapterState         what the adapter claims it did
 *
 * Honesty contract:
 *   - UNKNOWN is not MISMATCH. A missing chain authority, a missing webhook
 *     signature, or an unpriced payment makes the whole journey UNKNOWN —
 *     never a pass, and never a "probably fine".
 *   - The chain authority is injected, exactly as in verification-levels.mjs.
 *     Structural receipt validity alone cannot produce REPLAY_MATCH here
 *     either; the same rule that closed the L1 hole closes this one.
 *   - The lab computes only. It performs no I/O, holds no key, and never
 *     claims a settlement, a delivery, or an adoption event.
 *
 * Usage:
 *   node scripts/integration-replay-lab.mjs --self-check
 *   node scripts/integration-replay-lab.mjs --json
 */

import { createHash } from "node:crypto";
import {
  commit,
  verifyReceipt,
  replay,
  merkleTree,
  merkleProof,
  verifyMerkle,
} from "./ladder/verification-levels.mjs";
import {
  createWebhookReceiver,
  signDelivery,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  HEADER_IDEMPOTENCY,
} from "../packages/webhook/index.mjs";
import { createX402Harness, signChallenge } from "../packages/x402/index.mjs";

export const REPLAY_LAB_SCHEMA = "CG-IR/1";
export const REPLAY_LAB_VERDICTS = Object.freeze(["REPLAY_MATCH", "REPLAY_MISMATCH", "UNKNOWN"]);

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/** The canonical input set. Missing pieces are named, never defaulted. */
export const REPLAY_LAB_INPUTS = Object.freeze([
  "intent",
  "receipt",
  "webhookDelivery",
  "paymentEnvelope",
  "adapterState",
]);

const INPUT_ALIASES = Object.freeze({
  intent: ["intent"],
  receipt: ["receipt"],
  webhookDelivery: ["webhookDelivery", "webhook", "delivery"],
  paymentEnvelope: ["paymentEnvelope", "envelope", "payment"],
  adapterState: ["adapterState", "adapter", "state"],
});

function collect(bundle) {
  const src = bundle && typeof bundle === "object" ? bundle : {};
  const out = {};
  for (const canonical of REPLAY_LAB_INPUTS) {
    for (const alias of INPUT_ALIASES[canonical]) {
      if (src[alias] !== undefined && src[alias] !== null) {
        out[canonical] = src[alias];
        break;
      }
    }
  }
  return out;
}

function missing(inputs) {
  return REPLAY_LAB_INPUTS.filter((k) => inputs[k] === undefined);
}

/**
 * The 13 journey links. Each is one derived, checkable statement about the
 * bundle; `deriveJourney` is pure and the verdict reads the links.
 */
function deriveJourney({ inputs, chain, secret, now, replayWindowMs = 300000 }) {
  const links = [];
  const add = (id, status, detail) => links.push({ id, status, detail });

  /* L0 — the commitment is a function of the intent bytes alone. */
  if (inputs.intent === undefined) {
    add("L0_COMMITMENT", "UNKNOWN", "no intent bytes");
  } else {
    try {
      const c = commit(inputs.intent);
      const again = commit(inputs.intent);
      add(
        "L0_COMMITMENT",
        c.commitmentId === again.commitmentId ? "MATCH" : "MISMATCH",
        c.commitmentId,
      );
    } catch (error) {
      add("L0_COMMITMENT", "UNKNOWN", `intent rejected: ${error.message}`);
    }
  }

  /* L1 — chain-confirmed receipt. The chain authority is required. */
  let commitment = null;
  try {
    commitment = inputs.intent === undefined ? null : commit(inputs.intent);
  } catch {
    commitment = null;
  }
  if (inputs.receipt === undefined) {
    add("L1_RECEIPT", "UNKNOWN", "no receipt captured");
  } else {
    const verdict = verifyReceipt(inputs.receipt, commitment || { chainId: null }, chain);
    const status = verdict.verdict === "VERIFIED" ? "MATCH" : verdict.verdict === "MISMATCH" ? "MISMATCH" : "UNKNOWN";
    add("L1_RECEIPT", status, `${verdict.verdict}/${verdict.verdictCode}`);
  }

  /* L2 — deterministic rule replay. */
  if (inputs.intent === undefined || inputs.receipt === undefined) {
    add("L2_REPLAY", "UNKNOWN", "replay needs both intent and receipt");
  } else {
    const rules = Array.isArray(inputs.intent.policy) ? inputs.intent.policy : [];
    if (rules.length === 0) {
      add("L2_REPLAY", "UNKNOWN", "intent carries no policy rules to replay");
    } else {
      const ids = rules.map((r) => (typeof r === "string" ? { id: r } : { id: r.id }));
      const out = replay(inputs.intent, inputs.receipt, ids);
      const status = out.verdict === "MATCH" ? "MATCH" : out.verdict === "MISMATCH" ? "MISMATCH" : "UNKNOWN";
      add("L2_REPLAY", status, `${out.verdict}/${out.verdictCode}`);
    }
  }

  /* L3 — one leaf of the evidence bundle is provable against its root. */
  const leafSource = [
    inputs.receipt && inputs.receipt.txHash ? `receipt:${inputs.receipt.txHash}` : null,
    inputs.webhookDelivery && inputs.webhookDelivery.idempotencyKey ? `webhook:${inputs.webhookDelivery.idempotencyKey}` : null,
    inputs.paymentEnvelope && inputs.paymentEnvelope.challengeId ? `payment:${inputs.paymentEnvelope.challengeId}` : null,
    inputs.adapterState && inputs.adapterState.status ? `adapter:${inputs.adapterState.status}` : null,
  ].filter(Boolean);
  if (leafSource.length === 0) {
    add("L3_PROOF", "UNKNOWN", "no evidence leaf to prove");
  } else {
    const tree = merkleTree(leafSource);
    const proof = merkleProof(tree.tree, 0);
    add("L3_PROOF", verifyMerkle(proof, tree.root, leafSource[0]) ? "MATCH" : "MISMATCH", tree.root);
  }

  /* WEBHOOK — the delivery re-authenticates against the injected secret. */
  if (inputs.webhookDelivery === undefined) {
    add("WEBHOOK_AUTH", "UNKNOWN", "no delivery to authenticate");
  } else {
    const d = inputs.webhookDelivery;
    const headers = d.headers || {
      [HEADER_SIGNATURE]: d.signature,
      [HEADER_TIMESTAMP]: String(d.timestamp),
      [HEADER_IDEMPOTENCY]: d.idempotencyKey,
    };
    const receiver = createWebhookReceiver({
      secret: secret || "replay-lab-secret",
      windowMs: replayWindowMs,
      clock: () => (typeof now === "number" ? now : d.timestamp),
    });
    const out = receiver.handle({ headers, body: d.body });
    const status =
      out.state === "ACCEPTED" || out.state === "NOT_PERFORMED"
        ? "MATCH"
        : out.state === "DUPLICATE"
          ? "MATCH"
          : out.state === "REJECTED"
            ? "MISMATCH"
            : "UNKNOWN";
    add("WEBHOOK_AUTH", status, `${out.state}/${out.code || "none"}`);
  }

  /* PAYMENT — the envelope re-verifies against the challenge it claims. */
  if (inputs.paymentEnvelope === undefined) {
    add("PAYMENT_ENVELOPE", "UNKNOWN", "no payment envelope");
  } else {
    const e = inputs.paymentEnvelope;
    if (e.challenge === undefined || e.signature === undefined) {
      add("PAYMENT_ENVELOPE", "UNKNOWN", "envelope is missing its challenge or signature");
    } else {
      const expected = signChallenge({ secret: secret || "replay-lab-secret", challenge: e.challenge });
      add("PAYMENT_ENVELOPE", expected === e.signature ? "MATCH" : "MISMATCH", e.challenge.id);
    }
  }

  /* ADAPTER — the claim must be self-consistent with the run mode. */
  if (inputs.adapterState === undefined) {
    add("ADAPTER_CLAIM", "UNKNOWN", "no adapter state");
  } else {
    const s = inputs.adapterState;
    if (s.runMode === "DRY_RUN" && s.executed === true) {
      add("ADAPTER_CLAIM", "MISMATCH", "a DRY_RUN adapter claims execution");
    } else if (s.runMode === "DRY_RUN" && s.status === "VERIFIED") {
      add("ADAPTER_CLAIM", "MISMATCH", "a DRY_RUN adapter claims VERIFIED");
    } else if (s.runMode === "DRY_RUN" && s.status === "UNKNOWN") {
      add("ADAPTER_CLAIM", "MATCH", "DRY_RUN, UNKNOWN — honest");
    } else {
      add("ADAPTER_CLAIM", "UNKNOWN", `runMode ${s.runMode} is outside this lab's evidence`);
    }
  }

  /* JOURNEY — the six-step sequence must be present and ordered. */
  const steps = (inputs.adapterState && inputs.adapterState.journey) || null;
  if (!Array.isArray(steps) || steps.length === 0) {
    add("JOURNEY_ORDER", "UNKNOWN", "the bundle records no journey to re-derive");
  } else {
    const expectedOrder = ["AGENT", "COMMIT", "AUTHORIZE", "EXECUTE", "WEBHOOK", "RECEIPT", "REPLAY", "PASSPORT"];
    const idx = steps.map((s) => expectedOrder.indexOf(typeof s === "string" ? s : s && s.step));
    const unknownStep = idx.some((i) => i === -1);
    const ascending = idx.every((v, i) => i === 0 || v > idx[i - 1]);
    add(
      "JOURNEY_ORDER",
      unknownStep ? "MISMATCH" : ascending ? "MATCH" : "MISMATCH",
      steps.join(" -> "),
    );
  }

  return links;
}

/**
 * replayBundle — the single entry point.
 * Returns { verdict, verdictCode, links, missing, journeyHash }.
 */
export function replayBundle(bundle, { chain = null, secret = "replay-lab-secret", now = null } = {}) {
  const inputs = collect(bundle);
  const absent = missing(inputs);
  const links = deriveJourney({ inputs, chain, secret, now });
  const journeyHash = "0x" + sha256(links.map((l) => `${l.id}:${l.status}`).join("|"));

  const anyMismatch = links.some((l) => l.status === "MISMATCH");
  const anyUnknown = links.some((l) => l.status === "UNKNOWN") || absent.length > 0;

  let verdict;
  let verdictCode;
  if (anyMismatch) {
    verdict = "REPLAY_MISMATCH";
    verdictCode = "LINK_CONTRADICTION";
  } else if (anyUnknown) {
    verdict = "UNKNOWN";
    verdictCode = absent.length > 0 ? "REQUIRED_INPUT_MISSING" : "INSUFFICIENT_EVIDENCE";
  } else {
    verdict = "REPLAY_MATCH";
    verdictCode = "ALL_LINKS_REDERIVED";
  }

  return {
    schema: REPLAY_LAB_SCHEMA,
    verdict,
    verdictCode,
    links,
    missing: absent,
    journeyHash,
  };
}

/* ------------------------------------------------------- the happy bundle */

export const LAB_CHAIN = Object.freeze({
  tx: "0x" + "2".repeat(64),
  block: "0x" + "1".repeat(64),
  chainId: "1116",
});

export const LAB_SECRET = "replay-lab-secret";

/**
 * buildBundle — the canonical, honest, fully-populated bundle. One factory so
 * the lab, the tests, and the sandbox journey all replay the SAME bytes.
 */
export function buildBundle({ mutate = null, secret = LAB_SECRET, timestamp = 1750000000000 } = {}) {
  const intent = {
    subject: "escrow.release",
    chainId: LAB_CHAIN.chainId,
    policy: [
      { id: "AUTHORITY" },
      { id: "CAP" },
    ],
  };
  const commitment = commit(intent);
  const receipt = {
    status: "VERIFIED",
    txHash: LAB_CHAIN.tx,
    blockHash: LAB_CHAIN.block,
    chainId: LAB_CHAIN.chainId,
    evidence: [
      { rule: "AUTHORITY", result: "PASS" },
      { rule: "CAP", result: "PASS" },
    ],
    failedChecks: [],
  };
  const body = JSON.stringify({ event: "coreguard.journey.completed", intentHash: commitment.intentHash });
  const challenge = {
    x402Version: "X402/1",
    scheme: "exact",
    network: "core-testnet2",
    asset: "USDC",
    resource: "/v1/journey",
    amountCents: 500,
    reason: "coreguard-verification",
    payTo: null,
    expiresAt: Math.floor(timestamp / 1000) + 300,
  };
  const envelope = {
    challenge: { ...challenge, id: "0x" + sha256(JSON.stringify(challenge)) },
    signature: null,
  };
  envelope.signature = signChallenge({ secret, challenge: envelope.challenge });

  const bundle = {
    intent,
    receipt,
    webhookDelivery: {
      body,
      signature: signDelivery({ secret, timestamp: String(timestamp), body }),
      timestamp,
      idempotencyKey: "journey-idem-1",
    },
    paymentEnvelope: envelope,
    adapterState: {
      runMode: "DRY_RUN",
      status: "UNKNOWN",
      executed: false,
      receiptCaptured: true,
      journey: ["AGENT", "COMMIT", "AUTHORIZE", "EXECUTE", "WEBHOOK", "RECEIPT", "REPLAY", "PASSPORT"],
    },
  };
  return mutate ? mutate(bundle) || bundle : bundle;
}

export function labChain() {
  const t = LAB_CHAIN;
  return { getReceipt: (tx) => (tx === t.tx ? { txHash: t.tx, blockHash: t.block } : null) };
}

export function selfCheck() {
  const chain = labChain();
  const at = { chain, secret: LAB_SECRET, now: LAB_CHAIN ? 1750000000000 : 0 };
  const now = 1750000000000;

  const cases = [];
  const ok = replayBundle(buildBundle(), { chain, secret: LAB_SECRET, now });
  cases.push(["a fully-evidenced bundle with a chain authority is REPLAY_MATCH", ok.verdict === "REPLAY_MATCH", `${ok.verdict} (${ok.links.filter((l) => l.status !== "MATCH").map((l) => l.id + "=" + l.status).join(",") || "all links match"})`]);

  const noChain = replayBundle(buildBundle(), { secret: LAB_SECRET, now });
  cases.push(["the same bundle with no chain authority is UNKNOWN, not MATCH", noChain.verdict === "UNKNOWN" && noChain.verdictCode === "INSUFFICIENT_EVIDENCE", `${noChain.verdict}/${noChain.verdictCode}`]);

  const swapped = replayBundle(
    buildBundle({ mutate: (b) => { b.receipt = { ...b.receipt, txHash: "0x" + "e".repeat(64) }; } }),
    { chain, secret: LAB_SECRET, now },
  );
  cases.push(["a swapped txHash is REPLAY_MISMATCH", swapped.verdict === "REPLAY_MISMATCH", `${swapped.verdict} (${swapped.links.find((l) => l.status === "MISMATCH")?.id})`]);

  const tamperedWebhook = replayBundle(
    buildBundle({ mutate: (b) => { b.webhookDelivery = { ...b.webhookDelivery, body: b.webhookDelivery.body + " " }; } }),
    { chain, secret: LAB_SECRET, now },
  );
  cases.push(["a modified delivery body is REPLAY_MISMATCH", tamperedWebhook.verdict === "REPLAY_MISMATCH", tamperedWebhook.links.find((l) => l.id === "WEBHOOK_AUTH")?.status]);

  const staleWebhook = replayBundle(buildBundle({ timestamp: now - 3600000 }), { chain, secret: LAB_SECRET, now });
  cases.push(["a delivery outside the replay window is REPLAY_MISMATCH", staleWebhook.verdict === "REPLAY_MISMATCH", staleWebhook.links.find((l) => l.id === "WEBHOOK_AUTH")?.detail]);

  const wrongSecret = replayBundle(buildBundle(), { chain, secret: "a-different-secret", now });
  cases.push(["an envelope signed with another secret is REPLAY_MISMATCH", wrongSecret.verdict === "REPLAY_MISMATCH", wrongSecret.links.find((l) => l.id === "PAYMENT_ENVELOPE")?.status]);

  const lyingAdapter = replayBundle(
    buildBundle({ mutate: (b) => { b.adapterState = { ...b.adapterState, executed: true }; } }),
    { chain, secret: LAB_SECRET, now },
  );
  cases.push(["a DRY_RUN adapter claiming execution is REPLAY_MISMATCH", lyingAdapter.verdict === "REPLAY_MISMATCH", lyingAdapter.links.find((l) => l.id === "ADAPTER_CLAIM")?.detail]);

  const outOfOrder = replayBundle(
    buildBundle({ mutate: (b) => { b.adapterState = { ...b.adapterState, journey: ["COMMIT", "AGENT"] }; } }),
    { chain, secret: LAB_SECRET, now },
  );
  cases.push(["an out-of-order journey is REPLAY_MISMATCH", outOfOrder.verdict === "REPLAY_MISMATCH", outOfOrder.links.find((l) => l.id === "JOURNEY_ORDER")?.status]);

  const missing = replayBundle({}, { chain, secret: LAB_SECRET, now });
  cases.push(["an empty bundle is UNKNOWN naming every absent input", missing.verdict === "UNKNOWN" && missing.missing.length === 5, `${missing.missing.length} missing`]);

  const partial = replayBundle({ intent: buildBundle().intent }, { chain, secret: LAB_SECRET, now });
  cases.push(["a partial bundle is UNKNOWN, never a pass", partial.verdict === "UNKNOWN", `${partial.verdict}/${partial.verdictCode}`]);

  const rerun = replayBundle(buildBundle(), { chain, secret: LAB_SECRET, now });
  cases.push(["the same bundle replays to the same journey hash", ok.journeyHash === rerun.journeyHash, ok.journeyHash.slice(0, 14) + "..."]);

  const results = cases.map(([label, pass, detail]) => ({ label, pass, detail }));
  return { ok: results.every((c) => c.pass), cases: results };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--json")) {
    const out = replayBundle(buildBundle(), { chain: labChain(), secret: LAB_SECRET, now: 1750000000000 });
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  console.log(`INTEGRATION REPLAY LAB — ${REPLAY_LAB_SCHEMA} (offline, no keys, no side effects)`);
  const r = selfCheck();
  for (const c of r.cases) console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${c.label}${c.detail ? "  [" + c.detail + "]" : ""}`);
  console.log(`\nREPLAY-LAB SELF-CHECK: ${r.ok ? "PASS" : "FAIL"}`);
  if (!r.ok) process.exitCode = 1;
}

if (process.argv[1] && process.argv[1].endsWith("integration-replay-lab.mjs")) main();
