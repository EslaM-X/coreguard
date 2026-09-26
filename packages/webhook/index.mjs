/**
 * index.mjs — CG-WH/1, the CoreGuard webhook receiver surface.
 *
 * Three properties, each mechanically enforced, not prose:
 *   1. AUTHENTICATION  domain-separated HMAC-SHA256 over the exact body bytes
 *                      plus a sender timestamp, compared in constant time.
 *   2. REPLAY WINDOW   a delivery older or newer than the window is REJECTED;
 *                      a future-dated timestamp is rejected too (clock skew is
 *                      not an unlimited replay allowance).
 *   3. IDEMPOTENCY     a repeated Idempotency-Key returns the FIRST outcome
 *                      with duplicate=true and never re-runs the handler, so
 *                      a redelivery storm cannot double-apply a remedy.
 *
 * Honesty contract: this module is an HTTP-body verifier, not a network
 * client. It performs no I/O, opens no socket, and holds no key material of
 * its own — the secret is injected by the integrator. In DRY_RUN mode (the
 * default) an authenticated delivery returns NOT_PERFORMED: the signature was
 * real, the side effect was deliberately not performed. A handler that throws
 * returns UNKNOWN. Nothing here upgrades itself to VERIFIED: a receiver that
 * accepts a body proves the body is authentic, never that the claimed event
 * happened upstream.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const WEBHOOK_VERSION = "CG-WH/1";
export const SIGNING_DOMAIN = "CG-WH/1:v1";
export const DEFAULT_WINDOW_MS = 300000;
export const MAX_BODY_BYTES = 1024 * 1024;
export const MAX_IDEMPOTENCY_ENTRIES = 10000;

export const RECEIVER_STATES = Object.freeze([
  "ACCEPTED",
  "REJECTED",
  "DUPLICATE",
  "NOT_PERFORMED",
  "UNKNOWN",
]);

export const REJECTION_CODES = Object.freeze({
  MISSING_SIGNATURE: "MISSING_SIGNATURE",
  MALFORMED_SIGNATURE: "MALFORMED_SIGNATURE",
  MISSING_TIMESTAMP: "MISSING_TIMESTAMP",
  BAD_TIMESTAMP: "BAD_TIMESTAMP",
  BAD_SIGNATURE: "BAD_SIGNATURE",
  REPLAY_WINDOW: "REPLAY_WINDOW",
  MISSING_IDEMPOTENCY_KEY: "MISSING_IDEMPOTENCY_KEY",
  BODY_TOO_LARGE: "BODY_TOO_LARGE",
});

export const HEADER_SIGNATURE = "cg-wh-signature";
export const HEADER_TIMESTAMP = "cg-wh-timestamp";
export const HEADER_IDEMPOTENCY = "cg-wh-idempotency-key";

/**
 * The signed message is domain-separated and covers the timestamp, so a
 * captured body cannot be re-stamped by an attacker who does not hold the
 * secret, and a signature from one deployment cannot be replayed into
 * another domain.
 */
export function signingMessage(timestamp, body) {
  if (typeof timestamp !== "string" || timestamp.length === 0) {
    throw new TypeError("signingMessage: timestamp (string) is required");
  }
  if (typeof body !== "string") {
    throw new TypeError("signingMessage: body must be a string (exact bytes)");
  }
  return `${SIGNING_DOMAIN}.${timestamp}.${body}`;
}

export function signDelivery({ secret, timestamp, body }) {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new TypeError("signDelivery: secret (string) is required");
  }
  return createHmac("sha256", secret).update(signingMessage(timestamp, body), "utf8").digest("hex");
}

function constantTimeEquals(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function normalizeSignature(raw) {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const value = raw.startsWith("sha256=") ? raw.slice("sha256=".length) : raw;
  if (!/^[0-9a-f]{64}$/.test(value)) return null;
  return value;
}

function headerValue(headers, name) {
  if (!headers || typeof headers !== "object") return null;
  const target = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) {
      const value = headers[key];
      return Array.isArray(value) ? value[0] ?? null : (value ?? null);
    }
  }
  return null;
}

/**
 * createWebhookReceiver — the injectable surface.
 *
 * @param {object}   opts
 * @param {string}   opts.secret        shared HMAC secret (injected; never stored here)
 * @param {number}  [opts.windowMs]    replay window, default 300000
 * @param {function}[opts.clock]        () => epoch ms — injected so replays are testable
 * @param {string}  [opts.mode]         DRY_RUN (default) | LIVE
 * @param {function}[opts.onDelivery]   (body, context) => void — side effect, LIVE only
 */
export function createWebhookReceiver({
  secret,
  windowMs = DEFAULT_WINDOW_MS,
  clock = Date.now,
  mode = "DRY_RUN",
  onDelivery = null,
  maxEntries = MAX_IDEMPOTENCY_ENTRIES,
} = {}) {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new TypeError("createWebhookReceiver: secret (string) is required — no keyless mode exists");
  }
  if (!Number.isInteger(windowMs) || windowMs <= 0) {
    throw new TypeError("createWebhookReceiver: windowMs must be a positive integer");
  }
  if (mode !== "DRY_RUN" && mode !== "LIVE") {
    throw new TypeError("createWebhookReceiver: mode must be DRY_RUN or LIVE");
  }
  if (mode === "LIVE" && typeof onDelivery !== "function") {
    throw new TypeError("createWebhookReceiver: LIVE mode requires an onDelivery handler");
  }

  const seen = new Map();

  function reject(code, extra = {}) {
    return Object.freeze({
      state: "REJECTED",
      accepted: false,
      processed: false,
      duplicate: false,
      code,
      version: WEBHOOK_VERSION,
      runMode: mode,
      ...extra,
    });
  }

  function remember(key, outcome) {
    if (seen.size >= maxEntries) {
      const oldest = seen.keys().next().value;
      seen.delete(oldest);
    }
    seen.set(key, outcome);
  }

  function handle({ headers, body } = {}) {
    if (typeof body !== "string") {
      return reject(REJECTION_CODES.MALFORMED_SIGNATURE, { detail: "body must be a string" });
    }
    if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
      return reject(REJECTION_CODES.BODY_TOO_LARGE, { maxBodyBytes: MAX_BODY_BYTES });
    }

    const rawSignature = headerValue(headers, HEADER_SIGNATURE);
    if (rawSignature === null || rawSignature === undefined || rawSignature === "") {
      return reject(REJECTION_CODES.MISSING_SIGNATURE);
    }
    const provided = normalizeSignature(rawSignature);
    if (provided === null) return reject(REJECTION_CODES.MALFORMED_SIGNATURE);

    const timestamp = headerValue(headers, HEADER_TIMESTAMP);
    if (timestamp === null || timestamp === undefined || timestamp === "") {
      return reject(REJECTION_CODES.MISSING_TIMESTAMP);
    }
    if (!/^\d+$/.test(String(timestamp))) return reject(REJECTION_CODES.BAD_TIMESTAMP);
    const sentAt = Number(timestamp);
    const now = Number(clock());
    if (!Number.isFinite(sentAt) || !Number.isFinite(now)) return reject(REJECTION_CODES.BAD_TIMESTAMP);

    const age = now - sentAt;
    if (age > windowMs || age < -windowMs) {
      return reject(REJECTION_CODES.REPLAY_WINDOW, { windowMs, ageMs: age });
    }

    const expected = signDelivery({ secret, timestamp: String(timestamp), body });
    if (!constantTimeEquals(provided, expected)) {
      return reject(REJECTION_CODES.BAD_SIGNATURE);
    }

    const idempotencyKey = headerValue(headers, HEADER_IDEMPOTENCY);
    if (!idempotencyKey || String(idempotencyKey).length === 0) {
      return reject(REJECTION_CODES.MISSING_IDEMPOTENCY_KEY);
    }

    const prior = seen.get(String(idempotencyKey));
    if (prior) {
      return Object.freeze({
        ...prior,
        duplicate: true,
        idempotencyKey: String(idempotencyKey),
        version: WEBHOOK_VERSION,
        note: "redelivery of a key already processed; the handler was NOT re-run",
      });
    }

    const base = {
      accepted: mode === "LIVE",
      processed: mode === "LIVE",
      duplicate: false,
      code: null,
      version: WEBHOOK_VERSION,
      runMode: mode,
      idempotencyKey: String(idempotencyKey),
    };

    let outcome;
    if (mode === "DRY_RUN") {
      outcome = { ...base, state: "NOT_PERFORMED", note: "signature valid; side effect deliberately not performed in DRY_RUN" };
    } else {
      try {
        onDelivery(body, { idempotencyKey: String(idempotencyKey), sentAt, receivedAt: now });
        outcome = { ...base, state: "ACCEPTED" };
      } catch (error) {
        outcome = {
          ...base,
          accepted: false,
          processed: false,
          state: "UNKNOWN",
          code: "HANDLER_THREW",
          detail: error && error.message ? String(error.message) : "handler threw",
        };
      }
    }

    remember(String(idempotencyKey), outcome);
    return Object.freeze(outcome);
  }

  return Object.freeze({
    version: WEBHOOK_VERSION,
    mode,
    windowMs,
    handle,
    seenKeys: () => seen.size,
    reset: () => seen.clear(),
  });
}

/**
 * selfCheck — proves the three properties on an in-memory receiver, using an
 * injected clock so the replay window is a fact and not a timing hope.
 */
export function selfCheck() {
  const secret = "self-check-secret-not-a-real-key";
  const body = JSON.stringify({ event: "remedy.applied", disputeId: "DSP-1" });
  const t0 = 1750000000000;
  const clock = () => t0;

  const dry = createWebhookReceiver({ secret, clock });
  const signed = (ts = String(t0), b = body) => ({
    [HEADER_SIGNATURE]: signDelivery({ secret, timestamp: ts, body: b }),
    [HEADER_TIMESTAMP]: ts,
    [HEADER_IDEMPOTENCY]: "idem-1",
  });

  const cases = [];
  cases.push(["unsigned delivery is REJECTED", dry.handle({ headers: {}, body }).code === REJECTION_CODES.MISSING_SIGNATURE]);
  cases.push(["tampered body is REJECTED (BAD_SIGNATURE)", dry.handle({ headers: signed(String(t0), `${body} `), body }).code === REJECTION_CODES.BAD_SIGNATURE]);
  const stale = dry.handle({
    headers: { [HEADER_SIGNATURE]: signDelivery({ secret, timestamp: String(t0 - 3600000), body }), [HEADER_TIMESTAMP]: String(t0 - 3600000), [HEADER_IDEMPOTENCY]: "idem-stale" },
    body,
  });
  cases.push(["stale delivery is REJECTED (REPLAY_WINDOW)", stale.code === REJECTION_CODES.REPLAY_WINDOW]);
  const future = dry.handle({
    headers: { [HEADER_SIGNATURE]: signDelivery({ secret, timestamp: String(t0 + 3600000), body }), [HEADER_TIMESTAMP]: String(t0 + 3600000), [HEADER_IDEMPOTENCY]: "idem-future" },
    body,
  });
  cases.push(["future-dated delivery is REJECTED (REPLAY_WINDOW)", future.code === REJECTION_CODES.REPLAY_WINDOW]);
  const dryOutcome = dry.handle({ headers: signed(), body });
  cases.push(["DRY_RUN authenticates but does NOT perform", dryOutcome.state === "NOT_PERFORMED" && dryOutcome.processed === false]);
  const dup = dry.handle({ headers: signed(), body });
  cases.push(["redelivery is DUPLICATE and not re-run", dup.duplicate === true && dup.state === "NOT_PERFORMED"]);

  let runs = 0;
  const live = createWebhookReceiver({
    secret,
    clock,
    mode: "LIVE",
    onDelivery: () => {
      runs += 1;
    },
  });
  const first = live.handle({ headers: signed(), body });
  const second = live.handle({ headers: signed(), body });
  cases.push(["LIVE runs the handler exactly once per key", first.state === "ACCEPTED" && second.duplicate === true && runs === 1]);

  const missingKey = dry.handle({ headers: { [HEADER_SIGNATURE]: signed()[HEADER_SIGNATURE], [HEADER_TIMESTAMP]: String(t0) }, body });
  cases.push(["missing Idempotency-Key is REJECTED", missingKey.code === REJECTION_CODES.MISSING_IDEMPOTENCY_KEY]);

  const ok = cases.every(([, pass]) => pass);
  return { ok, cases };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-check") || args.length === 0) {
    const result = selfCheck();
    console.log(`WEBHOOK RECEIVER — ${WEBHOOK_VERSION} (HMAC + replay window + idempotency)`);
    for (const [label, pass] of result.cases) console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}`);
    console.log(`\nWEBHOOK SELF-CHECK: ${result.ok ? "PASS" : "FAIL"}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  console.log("usage: node packages/webhook/index.mjs --self-check");
  process.exitCode = 2;
}

if (process.argv[1] && process.argv[1].endsWith("index.mjs")) main();
