/**
 * index.mjs — X402/1, the CoreGuard x402 commercial-request harness.
 *
 * What this is: a deterministic builder for the x402 `Payment Required`
 * challenge and its settlement receipt envelope, plus the admission gate that
 * decides whether CoreGuard may price anything at all.
 *
 * What this is NOT, and never becomes from inside this file:
 *   - it is NOT a payment. `settle()` returns NOT_PERFORMED unless the
 *     integrator injects a settlement adapter; no key, no network call, no
 *     funds movement exists in this module.
 *   - it is NOT a price source. Price comes from the injected quote only; if
 *     no owner-gated quote is supplied the harness answers GATED. The locked
 *     pricing tiers in packages/pricing are hypotheses, so a quote built from
 *     them is labelled as such in the envelope and can never be presented as
 *     a published price.
 *   - it is NOT revenue. `metrics()` reports settledCents 0 and
 *     settledCount 0 until a real settlement is observed by the integrator's
 *     adapter, and there is no code path in this file that increments them.
 *
 * The exact-scheme signature follows the x402 `exact` scheme shape: a
 * domain-separated HMAC over the canonical challenge, so a challenge can be
 * signed without a private key and still be non-transferable to another
 * resource. Anything cryptographic beyond that is the integrator's job.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { canonicalize } from "../canonical/index.js";

export const X402_VERSION = "X402/1";
export const X402_SCHEME = "exact";
export const CHALLENGE_DOMAIN = "X402/1:CHALLENGE";
export const NETWORK = "core-testnet2";
export const ASSET = "USDC";

export const X402_STATES = Object.freeze([
  "CHALLENGE_BUILT",
  "GATED",
  "SIGNED",
  "NOT_PERFORMED",
  "SETTLED",
  "REJECTED",
]);

function canonicalBytes(value) {
  return canonicalize(value);
}

export function challengeId(challenge) {
  return createHmac("sha256", CHALLENGE_DOMAIN)
    .update(canonicalBytes(challenge), "utf8")
    .digest("hex");
}

export function signChallenge({ secret, challenge }) {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new TypeError("signChallenge: secret (string) is required — no unsigned default exists");
  }
  return createHmac("sha256", secret).update(canonicalBytes(challenge), "utf8").digest("hex");
}

export function verifyChallengeSignature({ secret, challenge, signature }) {
  if (typeof signature !== "string" || signature.length === 0) return false;
  const expected = signChallenge({ secret, challenge });
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * buildChallenge — the 402 body. Deterministic: same input, byte-identical
 * canonical form, and an id that is a function of the canonical bytes only.
 */
export function buildChallenge({ resource, amountCents, reason = "coreguard-verification", payTo = null, expiresInSeconds = 300, nowSeconds = 1750000000 } = {}) {
  if (typeof resource !== "string" || resource.length === 0) {
    throw new TypeError("buildChallenge: resource (string) is required");
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new TypeError("buildChallenge: amountCents must be a positive integer — a zero or unknown price is never a challenge");
  }
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new TypeError("buildChallenge: expiresInSeconds must be a positive integer");
  }
  const challenge = {
    x402Version: X402_VERSION,
    scheme: X402_SCHEME,
    network: NETWORK,
    asset: ASSET,
    resource,
    amountCents,
    reason,
    payTo,
    expiresAt: nowSeconds + expiresInSeconds,
  };
  return { ...challenge, id: challengeId(challenge) };
}

/**
 * quoteFor — the admission gate. A quote must carry its own provenance:
 * `lockedByOwner` is the only thing that may produce a GATED result, and
 * nothing in this repository can set it. Hypothetical tiers are allowed to
 * build a challenge but are tagged `priceStatus: "HYPOTHESIS"` so a
 * downstream page cannot render them as a published price.
 */
export function quoteFor({ quote } = {}) {
  if (!quote || typeof quote !== "object") {
    return { state: "GATED", code: "NO_QUOTE", priceStatus: "UNKNOWN", amountCents: null, detail: "no owner-approved quote was supplied" };
  }
  const { amountCents, currency = ASSET, lockedByOwner = false, provenance = "UNSPECIFIED" } = quote;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { state: "GATED", code: "INVALID_AMOUNT", priceStatus: "UNKNOWN", amountCents: null, detail: "an unpriced or zero quote cannot open a payment gate" };
  }
  if (!lockedByOwner) {
    return { state: "GATED", code: "PRICE_NOT_LOCKED", priceStatus: "HYPOTHESIS", amountCents, currency, provenance, detail: "price is a hypothesis until the owner locks it" };
  }
  return { state: "CHALLENGE_BUILT", code: null, priceStatus: "LOCKED", amountCents, currency, provenance, detail: "owner-locked price" };
}

/**
 * createX402Harness — the integrator-facing surface.
 *
 * @param {object}   opts
 * @param {string}  [opts.secret]        challenge-signing secret (injected)
 * @param {function}[opts.settler]      ({ challenge, envelope }) => { settlementId }
 *                                       REQUIRED for any settlement claim
 * @param {object}  [opts.clock]        () => epoch seconds (injected, deterministic)
 * @param {string}  [opts.mode]         DRY_RUN (default) | LIVE
 */
export function createX402Harness({ secret = null, settler = null, clock = () => Math.floor(Date.now() / 1000), mode = "DRY_RUN" } = {}) {
  if (mode !== "DRY_RUN" && mode !== "LIVE") {
    throw new TypeError("createX402Harness: mode must be DRY_RUN or LIVE");
  }
  if (mode === "LIVE" && typeof settler !== "function") {
    throw new TypeError("createX402Harness: LIVE mode requires a settler adapter — there is no built-in settlement path");
  }

  const metrics = { challenges: 0, signed: 0, settled: 0, settledCents: 0, rejected: 0 };

  function challengeFor({ resource, quote, reason, expiresInSeconds } = {}) {
    const gate = quoteFor({ quote });
    if (gate.state !== "CHALLENGE_BUILT" || !Number.isInteger(gate.amountCents)) {
      metrics.rejected += 1;
      return { state: "GATED", code: gate.code, detail: gate.detail, priceStatus: gate.priceStatus, challenge: null, metrics: { ...metrics } };
    }
    const challenge = buildChallenge({
      resource,
      amountCents: gate.amountCents,
      reason,
      expiresInSeconds,
      nowSeconds: Number(clock()),
    });
    metrics.challenges += 1;
    return { state: "CHALLENGE_BUILT", code: null, detail: gate.detail, priceStatus: gate.priceStatus, challenge, metrics: { ...metrics } };
  }

  function sign(challenge) {
    if (!challenge || typeof challenge.id !== "string") {
      return { state: "REJECTED", code: "NO_CHALLENGE", signature: null };
    }
    if (secret === null) {
      return { state: "REJECTED", code: "NO_SIGNING_SECRET", signature: null, detail: "an unsigned challenge is not an offer" };
    }
    metrics.signed += 1;
    return { state: "SIGNED", code: null, signature: signChallenge({ secret, challenge }), challengeId: challenge.id };
  }

  function settle({ challenge, envelope } = {}) {
    if (mode === "DRY_RUN") {
      return { state: "NOT_PERFORMED", code: null, detail: "DRY_RUN: no settlement was attempted, no funds moved, no revenue recorded", settlementId: null, metrics: { ...metrics } };
    }
    if (!challenge || typeof challenge.id !== "string") {
      return { state: "REJECTED", code: "NO_CHALLENGE", settlementId: null, metrics: { ...metrics } };
    }
    if (envelope && secret !== null) {
      const provided = envelope.signature;
      if (!verifyChallengeSignature({ secret, challenge, signature: provided })) {
        metrics.rejected += 1;
        return { state: "REJECTED", code: "BAD_ENVELOPE_SIGNATURE", settlementId: null, metrics: { ...metrics } };
      }
    }
    let result;
    try {
      result = settler({ challenge, envelope: envelope ?? null });
    } catch (error) {
      return { state: "UNKNOWN", code: "SETTLER_THREW", settlementId: null, detail: error && error.message ? String(error.message) : "settler threw", metrics: { ...metrics } };
    }
    if (!result || typeof result.settlementId !== "string" || result.settlementId.length === 0) {
      return { state: "UNKNOWN", code: "NO_SETTLEMENT_ID", settlementId: null, detail: "a settler that cannot name a settlement has not settled", metrics: { ...metrics } };
    }
    metrics.settled += 1;
    metrics.settledCents += challenge.amountCents;
    return { state: "SETTLED", code: null, settlementId: result.settlementId, settledCents: challenge.amountCents, metrics: { ...metrics } };
  }

  return Object.freeze({
    version: X402_VERSION,
    scheme: X402_SCHEME,
    network: NETWORK,
    mode,
    challengeFor,
    sign,
    settle,
    metrics: () => ({ ...metrics }),
  });
}

export function selfCheck() {
  const cases = [];
  const noQuote = createX402Harness();
  const gated = noQuote.challengeFor({ resource: "/v1/verify" });
  cases.push(["no quote is GATED (never a free-for-all challenge)", gated.state === "GATED" && gated.challenge === null]);
  const zero = noQuote.challengeFor({ resource: "/v1/verify", quote: { amountCents: 0 } });
  cases.push(["a zero price never opens a payment gate", zero.state === "GATED" && zero.code === "INVALID_AMOUNT"]);
  const hypo = noQuote.challengeFor({ resource: "/v1/verify", quote: { amountCents: 500, provenance: "packages/pricing hypothesis" } });
  cases.push(["an unlocked price stays HYPOTHESIS and stays GATED", hypo.state === "GATED" && hypo.code === "PRICE_NOT_LOCKED" && hypo.priceStatus === "HYPOTHESIS"]);

  const locked = createX402Harness({ secret: "harness-secret-not-a-real-key" });
  const built = locked.challengeFor({ resource: "/v1/verify", quote: { amountCents: 500, lockedByOwner: true, provenance: "owner decision" } });
  cases.push(["an owner-locked price builds a canonical challenge", built.state === "CHALLENGE_BUILT" && typeof built.challenge.id === "string"]);
  const again = locked.challengeFor({ resource: "/v1/verify", quote: { amountCents: 500, lockedByOwner: true, provenance: "owner decision" } });
  cases.push(["the same input is byte-deterministic", built.challenge.id === again.challenge.id]);
  const drifted = locked.challengeFor({ resource: "/v1/verify", quote: { amountCents: 501, lockedByOwner: true, provenance: "owner decision" } });
  cases.push(["a different price yields a different challenge id", drifted.challenge.id !== built.challenge.id]);
  const unsigned = createX402Harness().sign(built.challenge);
  cases.push(["a harness without a secret refuses to sign", unsigned.state === "REJECTED" && unsigned.code === "NO_SIGNING_SECRET"]);
  const signed = locked.sign(built.challenge);
  cases.push(["a signed challenge verifies", signed.state === "SIGNED" && verifyChallengeSignature({ secret: "harness-secret-not-a-real-key", challenge: built.challenge, signature: signed.signature })]);
  const tampered = { ...built.challenge, amountCents: 1 };
  cases.push(["a tampered envelope fails verification", !verifyChallengeSignature({ secret: "harness-secret-not-a-real-key", challenge: tampered, signature: signed.signature })]);
  const dry = locked.settle({ challenge: built.challenge });
  cases.push(["DRY_RUN settle is NOT_PERFORMED and books zero revenue", dry.state === "NOT_PERFORMED" && locked.metrics().settledCents === 0]);
  const silent = createX402Harness({ mode: "LIVE", settler: () => ({}) }).settle({ challenge: built.challenge });
  cases.push(["a settler that names no settlement is UNKNOWN, not SETTLED", silent.state === "UNKNOWN" && silent.code === "NO_SETTLEMENT_ID"]);
  const forged = createX402Harness({ mode: "LIVE", secret: "harness-secret-not-a-real-key", settler: ({ challenge: c }) => ({ settlementId: "SETTLED-" + c.id.slice(0, 8) }) })
    .settle({ challenge: built.challenge, envelope: { signature: "0".repeat(64) } });
  cases.push(["a forged envelope is REJECTED before the settler runs", forged.state === "REJECTED" && forged.code === "BAD_ENVELOPE_SIGNATURE"]);

  const ok = cases.every(([, pass]) => pass);
  return { ok, cases };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-check") || args.length === 0) {
    const result = selfCheck();
    console.log(`X402 HARNESS — ${X402_VERSION} (DRY_RUN, no key, no settlement, no revenue)`);
    for (const [label, pass] of result.cases) console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}`);
    const m = createX402Harness().metrics();
    console.log(`  metrics: challenges ${m.challenges} · signed ${m.signed} · settled ${m.settled} · settledCents ${m.settledCents}`);
    console.log(`\nX402 SELF-CHECK: ${result.ok ? "PASS" : "FAIL"}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (args.includes("--status")) {
    const m = createX402Harness().metrics();
    console.log(`X402 ${X402_VERSION} — DRY_RUN · network ${NETWORK} · asset ${ASSET}`);
    console.log("  pricing: gated (packages/pricing is 1-hypothesis; an unlocked price is never a challenge)");
    console.log(`  settledCents ${m.settledCents} · settledCount ${m.settled} · revenue $0`);
    return;
  }
  console.log("usage: node packages/x402/index.mjs --self-check | --status");
  process.exitCode = 2;
}

if (process.argv[1] && process.argv[1].endsWith("index.mjs")) main();
