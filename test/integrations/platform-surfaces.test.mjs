import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  WEBHOOK_VERSION,
  RECEIVER_STATES,
  REJECTION_CODES,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  HEADER_IDEMPOTENCY,
  signDelivery,
  createWebhookReceiver,
  selfCheck as webhookSelfCheck,
} from "../../packages/webhook/index.mjs";
import {
  X402_VERSION,
  X402_SCHEME,
  X402_STATES,
  createX402Harness,
  buildChallenge,
  quoteFor,
  signChallenge,
  verifyChallengeSignature,
  selfCheck as x402SelfCheck,
} from "../../packages/x402/index.mjs";
import {
  CONFORMANCE_SUITE_VERSION,
  CONFORMANCE_SUITE_FIELDS,
  VERIFIED_BADGE,
  buildConformanceReport,
  evaluateConformance,
  badgeStatement,
} from "../../scripts/ladder/conformance.mjs";
import { canonicalize } from "../../packages/canonical/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const SECRET = "test-secret-not-a-real-key";
const BODY = JSON.stringify({ event: "remedy.applied", disputeId: "DSP-1" });
const T0 = 1750000000000;

function signedHeaders({ secret = SECRET, timestamp = String(T0), body = BODY, idempotency = "idem-1" } = {}) {
  return {
    [HEADER_SIGNATURE]: signDelivery({ secret, timestamp, body }),
    [HEADER_TIMESTAMP]: timestamp,
    [HEADER_IDEMPOTENCY]: idempotency,
  };
}

/* ------------------------------------------------------------- CG-WH/1 */

test("CG-WH/1: the self-check proves authentication, replay window, and idempotency", () => {
  const r = webhookSelfCheck();
  assert.equal(r.ok, true, JSON.stringify(r.cases.filter(([, p]) => !p)));
  assert.equal(r.cases.length, 8);
});

test("CG-WH/1: an unsigned delivery is rejected, not accepted-with-warning", () => {
  const r = createWebhookReceiver({ secret: SECRET, clock: () => T0 });
  const out = r.handle({ headers: { [HEADER_IDEMPOTENCY]: "k" }, body: BODY });
  assert.equal(out.state, "REJECTED");
  assert.equal(out.code, REJECTION_CODES.MISSING_SIGNATURE);
  assert.equal(out.processed, false);
  assert.ok(RECEIVER_STATES.includes(out.state));
});

test("CG-WH/1: a tampered body fails authentication", () => {
  const r = createWebhookReceiver({ secret: SECRET, clock: () => T0 });
  const out = r.handle({ headers: signedHeaders(), body: `${BODY} ` });
  assert.equal(out.state, "REJECTED");
  assert.equal(out.code, REJECTION_CODES.BAD_SIGNATURE);
});

test("CG-WH/1: the signature covers the timestamp, so a captured body cannot be re-stamped", () => {
  const r = createWebhookReceiver({ secret: SECRET, clock: () => T0 });
  const captured = signedHeaders();
  const restamped = {
    [HEADER_SIGNATURE]: captured[HEADER_SIGNATURE],
    [HEADER_TIMESTAMP]: String(T0 + 1000),
    [HEADER_IDEMPOTENCY]: "idem-restamp",
  };
  const out = r.handle({ headers: restamped, body: BODY });
  assert.equal(out.code, REJECTION_CODES.BAD_SIGNATURE);
});

test("CG-WH/1: a signature from another secret is rejected", () => {
  const r = createWebhookReceiver({ secret: SECRET, clock: () => T0 });
  const out = r.handle({ headers: signedHeaders({ secret: "other-secret" }), body: BODY });
  assert.equal(out.code, REJECTION_CODES.BAD_SIGNATURE);
});

test("CG-WH/1: stale and future-dated deliveries are both outside the replay window", () => {
  const r = createWebhookReceiver({ secret: SECRET, windowMs: 60000, clock: () => T0 });
  const stale = r.handle({
    headers: signedHeaders({ timestamp: String(T0 - 120000), idempotency: "k1" }),
    body: BODY,
  });
  const future = r.handle({
    headers: signedHeaders({ timestamp: String(T0 + 120000), idempotency: "k2" }),
    body: BODY,
  });
  assert.equal(stale.code, REJECTION_CODES.REPLAY_WINDOW);
  assert.equal(future.code, REJECTION_CODES.REPLAY_WINDOW);
});

test("CG-WH/1: a delivery inside the window is accepted by the receiver", () => {
  const r = createWebhookReceiver({ secret: SECRET, windowMs: 60000, clock: () => T0 });
  const out = r.handle({ headers: signedHeaders(), body: BODY });
  assert.equal(out.state, "NOT_PERFORMED");
  assert.equal(out.processed, false);
});

test("CG-WH/1: a redelivery returns the FIRST outcome and never re-runs the handler", () => {
  let runs = 0;
  const r = createWebhookReceiver({
    secret: SECRET,
    clock: () => T0,
    mode: "LIVE",
    onDelivery: () => {
      runs += 1;
    },
  });
  const first = r.handle({ headers: signedHeaders(), body: BODY });
  const second = r.handle({ headers: signedHeaders(), body: BODY });
  assert.equal(first.state, "ACCEPTED");
  assert.equal(second.duplicate, true);
  assert.equal(second.state, "ACCEPTED");
  assert.equal(runs, 1);
  assert.equal(r.seenKeys(), 1);
});

test("CG-WH/1: a handler that throws yields UNKNOWN, never ACCEPTED", () => {
  const r = createWebhookReceiver({
    secret: SECRET,
    clock: () => T0,
    mode: "LIVE",
    onDelivery: () => {
      throw new Error("downstream unavailable");
    },
  });
  const out = r.handle({ headers: signedHeaders(), body: BODY });
  assert.equal(out.state, "UNKNOWN");
  assert.equal(out.code, "HANDLER_THREW");
  assert.equal(out.accepted, false);
});

test("CG-WH/1: there is no keyless receiver and no LIVE mode without a handler", () => {
  assert.throws(() => createWebhookReceiver({}), TypeError);
  assert.throws(() => createWebhookReceiver({ secret: SECRET, mode: "LIVE" }), TypeError);
  assert.throws(() => createWebhookReceiver({ secret: SECRET, windowMs: 0 }), TypeError);
  assert.throws(() => createWebhookReceiver({ secret: SECRET, mode: "ANYTHING" }), TypeError);
});

test("CG-WH/1: an oversized body is rejected before any signature work", () => {
  const r = createWebhookReceiver({ secret: SECRET, clock: () => T0 });
  const out = r.handle({ headers: signedHeaders(), body: "x".repeat(1024 * 1024 + 1) });
  assert.equal(out.code, REJECTION_CODES.BODY_TOO_LARGE);
});

test("CG-WH/1: a malformed signature is MALFORMED, never treated as absent", () => {
  const r = createWebhookReceiver({ secret: SECRET, clock: () => T0 });
  const out = r.handle({
    headers: { ...signedHeaders(), [HEADER_SIGNATURE]: "sha256=zzzz" },
    body: BODY,
  });
  assert.equal(out.code, REJECTION_CODES.MALFORMED_SIGNATURE);
});

test("CG-WH/1: a missing Idempotency-Key is rejected — idempotency is mandatory", () => {
  const r = createWebhookReceiver({ secret: SECRET, clock: () => T0 });
  const headers = signedHeaders();
  delete headers[HEADER_IDEMPOTENCY];
  const out = r.handle({ headers, body: BODY });
  assert.equal(out.code, REJECTION_CODES.MISSING_IDEMPOTENCY_KEY);
});

/* ------------------------------------------------------------- X402/1 */

test("X402/1: the self-check proves the gate, the determinism, and the zero-revenue rule", () => {
  const r = x402SelfCheck();
  assert.equal(r.ok, true, JSON.stringify(r.cases.filter(([, p]) => !p)));
});

test("X402/1: no quote, a zero quote, and an unlocked quote are all GATED", () => {
  assert.equal(quoteFor({}).state, "GATED");
  assert.equal(quoteFor({ quote: { amountCents: 0 } }).state, "GATED");
  const unlocked = quoteFor({ quote: { amountCents: 500, provenance: "hypothesis" } });
  assert.equal(unlocked.state, "GATED");
  assert.equal(unlocked.code, "PRICE_NOT_LOCKED");
  assert.equal(unlocked.priceStatus, "HYPOTHESIS");
});

test("X402/1: only an owner-locked price opens a challenge", () => {
  const gate = quoteFor({ quote: { amountCents: 500, lockedByOwner: true, provenance: "owner decision" } });
  assert.equal(gate.state, "CHALLENGE_BUILT");
  assert.equal(gate.priceStatus, "LOCKED");
});

test("X402/1: the challenge is canonical and deterministic, and its id covers the amount", () => {
  const a = buildChallenge({ resource: "/v1/verify", amountCents: 500, nowSeconds: 1750000000 });
  const b = buildChallenge({ resource: "/v1/verify", amountCents: 500, nowSeconds: 1750000000 });
  const c = buildChallenge({ resource: "/v1/verify", amountCents: 501, nowSeconds: 1750000000 });
  assert.equal(a.id, b.id);
  assert.notEqual(a.id, c.id);
  assert.equal(a.scheme, X402_SCHEME);
  assert.equal(a.x402Version, X402_VERSION);
  const { id, ...withoutId } = a;
  assert.equal(canonicalize(withoutId).length > 0, true);
});

test("X402/1: a challenge cannot declare a zero or missing price", () => {
  assert.throws(() => buildChallenge({ resource: "/v1/verify", amountCents: 0 }), TypeError);
  assert.throws(() => buildChallenge({ amountCents: 500 }), TypeError);
  assert.throws(() => buildChallenge({ resource: "/v1/verify", amountCents: 1.5 }), TypeError);
  assert.throws(() => buildChallenge({ resource: "/v1/verify", amountCents: 500, expiresInSeconds: 0 }), TypeError);
});

test("X402/1: a harness with no secret refuses to sign — an unsigned challenge is not an offer", () => {
  const h = createX402Harness();
  const out = h.sign(buildChallenge({ resource: "/v1/verify", amountCents: 500 }));
  assert.equal(out.state, "REJECTED");
  assert.equal(out.code, "NO_SIGNING_SECRET");
  assert.ok(X402_STATES.includes(out.state));
});

test("X402/1: a signed challenge verifies and a tampered one does not", () => {
  const h = createX402Harness({ secret: SECRET });
  const challenge = buildChallenge({ resource: "/v1/verify", amountCents: 500 });
  const signed = h.sign(challenge);
  assert.equal(signed.state, "SIGNED");
  assert.equal(verifyChallengeSignature({ secret: SECRET, challenge, signature: signed.signature }), true);
  assert.equal(verifyChallengeSignature({ secret: SECRET, challenge: { ...challenge, amountCents: 1 }, signature: signed.signature }), false);
  assert.equal(verifyChallengeSignature({ secret: "other", challenge, signature: signed.signature }), false);
  assert.throws(() => signChallenge({ secret: "", challenge }), TypeError);
});

test("X402/1: DRY_RUN settle books zero cents and zero settlements", () => {
  const h = createX402Harness({ secret: SECRET });
  const challenge = buildChallenge({ resource: "/v1/verify", amountCents: 500 });
  const out = h.settle({ challenge });
  assert.equal(out.state, "NOT_PERFORMED");
  const m = h.metrics();
  assert.equal(m.settled, 0);
  assert.equal(m.settledCents, 0);
});

test("X402/1: LIVE mode is unreachable without an injected settler", () => {
  assert.throws(() => createX402Harness({ mode: "LIVE" }), TypeError);
  assert.throws(() => createX402Harness({ mode: "PAYWALL" }), TypeError);
});

test("X402/1: a settler that names no settlement is UNKNOWN, not SETTLED", () => {
  const h = createX402Harness({ mode: "LIVE", settler: () => ({}) });
  const out = h.settle({ challenge: buildChallenge({ resource: "/v1/verify", amountCents: 500 }) });
  assert.equal(out.state, "UNKNOWN");
  assert.equal(out.code, "NO_SETTLEMENT_ID");
  assert.equal(h.metrics().settled, 0);
});

test("X402/1: a settler that throws never books revenue", () => {
  const h = createX402Harness({
    mode: "LIVE",
    settler: () => {
      throw new Error("rpc down");
    },
  });
  const out = h.settle({ challenge: buildChallenge({ resource: "/v1/verify", amountCents: 500 }) });
  assert.equal(out.state, "UNKNOWN");
  assert.equal(h.metrics().settledCents, 0);
});

test("X402/1: a forged envelope is rejected before the settler is called", () => {
  let called = 0;
  const h = createX402Harness({
    mode: "LIVE",
    secret: SECRET,
    settler: ({ challenge }) => {
      called += 1;
      return { settlementId: `SETTLED-${challenge.id.slice(0, 8)}` };
    },
  });
  const out = h.settle({
    challenge: buildChallenge({ resource: "/v1/verify", amountCents: 500 }),
    envelope: { signature: "0".repeat(64) },
  });
  assert.equal(out.state, "REJECTED");
  assert.equal(out.code, "BAD_ENVELOPE_SIGNATURE");
  assert.equal(called, 0);
});

test("X402/1: the four adapter providers still declare DRY_RUN with no credentials", async () => {
  const { buildProviders } = await import("../../packages/adapters/providers.mjs");
  const providers = buildProviders();
  const x402 = providers.find((p) => p.id === "X402");
  assert.equal(x402.contract, "VERIFIED");
  assert.equal(x402.status.runMode, "DRY_RUN");
  assert.equal(x402.status.status, "UNKNOWN");
  assert.equal(x402.status.integrationStatus, "NOT_BUILT");
  assert.equal(x402.lifecycle.hasCredentials, false);
  const spec = providers.length === 4 ? true : false;
  assert.equal(spec, true);
  for (const p of providers) assert.equal(p.status.runMode, "DRY_RUN");
});

/* ------------------------------------------------- CG-CS/1 + CG-CR/1 */

test("CG-CR/1: the committed conformance report matches the machine build byte-for-byte", () => {
  const committed = JSON.parse(readFileSync(join(REPO, "docs", "conformance-report.json"), "utf8"));
  const built = buildConformanceReport();
  assert.deepEqual(committed, JSON.parse(JSON.stringify(built)));
});

test("CG-CR/1: no integration is badge-eligible, and that is stated in the artifact", () => {
  const report = buildConformanceReport();
  assert.equal(report.badgeIssuerCount, 0);
  assert.deepEqual(report.badgeIssuers, []);
  assert.equal(report.suite, CONFORMANCE_SUITE_VERSION);
  assert.equal(report.defaultVerdict, "INCOMPLETE_EVIDENCE");
  assert.match(report.note, /empty list is the honest state/);
});

test("CG-CR/1: every criterion has a label, and none is silently dropped", () => {
  const report = buildConformanceReport();
  assert.equal(report.criteria.length, CONFORMANCE_SUITE_FIELDS.length);
  for (const c of report.criteria) {
    assert.ok(c.id && typeof c.label === "string" && c.label.length > 10, c.id);
  }
});

test("CG-CS/1: the badge is not statementable without CONFORMANT evidence on both sides", () => {
  const allPass = Object.fromEntries(CONFORMANCE_SUITE_FIELDS.map((f) => [f, true]));
  const oneFails = { ...allPass, tamperDetectionPass: false };
  assert.equal(evaluateConformance(allPass).verdict, "CONFORMANT");
  assert.equal(evaluateConformance(oneFails).verdict, "NOT_CONFORMANT");
  assert.equal(evaluateConformance({}).verdict, "INCOMPLETE_EVIDENCE");
  assert.equal(badgeStatement("NOT_CONFORMANT", evaluateConformance(allPass)), null);
  assert.equal(badgeStatement("CONFORMANT", evaluateConformance(oneFails)), null);
  const statement = badgeStatement("CONFORMANT", evaluateConformance(allPass));
  assert.match(statement, /not an endorsement of the counterparty/);
  assert.ok(VERIFIED_BADGE.neverMeans.length >= 4);
});

test("CG-CR/1: an integration is only listed when it is genuinely conformant", () => {
  const allPass = Object.fromEntries(CONFORMANCE_SUITE_FIELDS.map((f) => [f, true]));
  const listed = buildConformanceReport({
    eligibleIntegrations: [
      { id: "PARTNER-X", results: allPass },
      { id: "PARTNER-Y", results: { ...allPass, replayPass: false } },
      { id: "PARTNER-Z", results: {} },
    ],
  });
  assert.equal(listed.badgeIssuerCount, 1);
  assert.equal(listed.badgeIssuers[0].id, "PARTNER-X");
  assert.equal(listed.badgeIssuers[0].suite, CONFORMANCE_SUITE_VERSION);
});

test("the conformance report carries no timestamp — a churning artifact trains reviewers to ignore diffs", () => {
  const text = readFileSync(join(REPO, "docs", "conformance-report.json"), "utf8");
  assert.equal(/measuredAtUtc|generatedAt|timestamp/i.test(text), false);
});

/* ------------------------------------------------------------ packaging */

test("the packaging document names only files that exist, and publishes no price", () => {
  const doc = readFileSync(join(REPO, "docs", "commercial-packaging-2026-09-26.md"), "utf8");
  const paths = [...doc.matchAll(/`([A-Za-z0-9_./-]+\.(?:mjs|json|md))`/g)].map((m) => m[1]);
  assert.ok(paths.length >= 10, `expected the doc to cite real files, found ${paths.length}`);
  for (const p of paths) {
    assert.equal(existsSync(join(REPO, p)), true, `packaging doc cites a missing path: ${p}`);
  }
  assert.match(doc, /LOCKED/);
  const money = [...doc.matchAll(/\$\s?([0-9][0-9,._]*)/g)].map((m) => m[1]);
  for (const amount of money) assert.equal(amount.replace(/[,._]/g, "") === "0", true, `doc advertises a price: $${amount}`);
  assert.match(doc, /revenue \$0/);
});

test("the quickstart runs green offline and prints every honesty line", () => {
  const out = execFileSync(process.execPath, ["examples/platform-quickstart/quickstart.mjs"], {
    cwd: REPO,
    encoding: "utf8",
  });
  assert.match(out, /QUICKSTART SELF-CHECK: PASS/);
  assert.match(out, /VERIFIED \/ RECEIPT_INTEGRITY/);
  assert.match(out, /UNKNOWN \/ NO_CHAIN_EVIDENCE/);
  assert.match(out, /MISMATCH \/ TX_NOT_FOUND/);
  assert.match(out, /MISMATCH \/ RULE_FAILED/);
  assert.match(out, /UNKNOWN \/ EVIDENCE_MISSING/);
  assert.match(out, /RESEARCH/);
  assert.equal(/ZK supported|partnership|customer|revenue/i.test(out.replace(/no "ZK supported" claim/, "")), false);
});
