/**
 * CoreGuard Delivery & Dispute Evidence (DDE/1) — HTTP endpoint.
 *
 * The delivery/acceptance boundary, exposed over HTTP so external platforms
 * (agent platforms, settlement providers, People's Court intake tooling) can
 * verify a bilateral evidence fixture without installing anything beyond
 * Node's standard library.
 *
 *   POST /verify          body = fixture JSON  → DDE/1 verification report
 *   POST /peoples-court   body = fixture JSON  → + evidence-class projection
 *   GET  /health                               → liveness + boundary banner
 *   rate limit            in-memory fixed window per peer address (429 +
 *                         retry-after); /health is exempt so liveness probes
 *                         never consume budget and floods cannot lock out
 *                         monitoring
 *   size guard, 2 layers  declared content-length over the cap → 413 before
 *                         any body byte is read; the streaming cap remains
 *                         the truth for chunked or lying senders
 *   address allowlist     optional third guard for deliberate public
 *                         exposure: `allowAddresses: ["127.0.0.1", "::1", …]`
 *                         rejects every other socket address with 403 BEFORE
 *                         the rate limiter — a rejected peer never consumes
 *                         budget, and /health is gated too (an unlisted
 *                         address learns nothing, not even liveness)
 *
 * The boundary survives the network hop verbatim: every response body carries
 * DDE-BOUNDARY, and `decision` is limited to
 * EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE (or
 * FIXTURE_REJECTED). The endpoint never judges conformity, never adjudicates,
 * never authorizes, never broadcasts.
 *
 * Design rules:
 *   - node:http only — zero dependencies (mirrors index.js).
 *   - No outbound network calls: the EVM adapter is injected by the caller;
 *     none is loaded here. Without it, E5 reports NOT_RUN (never fabricated).
 *   - Fixed request ceiling (MAX_BODY_BYTES) — oversized bodies are rejected
 *     with 413 before parsing. Fail-closed.
 *   - Malformed JSON → 400 with a REJECTED status, not a 5xx: a bad fixture
 *     is a rejected submission, not a server failure.
 *   - Rate limiting keyed on the direct peer address; no X-Forwarded-For
 *     trust is added — a spoofable header would let callers forge identity
 *     (fail-closed identity). Memory is bounded: buckets expire on window
 *     rollover and sweep on a size threshold.
 *   - `rateLimit: false` disables limiting; `{ windowMs, max }` tunes it.
 *   - `allowAddresses` is a closed list of permitted peer socket addresses
 *     (IPv4, IPv6, or IPv4-mapped IPv6 normalized to its IPv4 form). Keys on
 *     the DIRECT peer — no X-Forwarded-For trust (fail-closed identity, same
 *     as the rate limiter). Omit the option → no address filtering.
 *
 * @module @coreguard/delivery/http
 */

import { createServer } from "node:http";
import {
  verifyDeliveryFixture,
  mapToPeoplesCourt,
  DDE_VERSION,
  BOUNDARY_BANNER,
} from "./index.js";

/** Maximum accepted request body (1 MiB). Fixtures are small JSON documents;
 *  anything larger is rejected before parsing (fail-closed). */
export const MAX_BODY_BYTES = 1024 * 1024;

/** Rate limiting defaults: 120 verification requests per address per minute.
 *  Tuned to leave honest integrations (which verify once per delivery event)
 *  far outside the ceiling while capping floods. */
export const RATE_LIMIT_DEFAULTS = Object.freeze({
  windowMs: 60_000,
  max: 120,
  pruneAt: 10_000,
});

/** Shared 413 payload — the same rejection no matter which size layer trips. */
function oversizeBody() {
  return {
    status: "REJECTED",
    error: `request body exceeds ${MAX_BODY_BYTES} bytes — fixtures are small JSON documents (fail-closed)`,
    ddeVersion: DDE_VERSION,
    boundary: BOUNDARY_BANNER.statement,
  };
}

/** Shared 403 payload — the same rejection no matter which allowlist form tripped. */
function notAllowedBody() {
  return {
    status: "REJECTED",
    error: "peer address not on the endpoint allowlist (fail-closed); bind loopback or add this address explicitly",
    ddeVersion: DDE_VERSION,
    boundary: BOUNDARY_BANNER.statement,
  };
}

/**
 * Normalize a raw `req.socket.remoteAddress` to its canonical comparison
 * form. IPv4-mapped IPv6 ("::ffff:127.0.0.1" and the "::ffff:7f00:1" hex
 * form) collapses to the plain IPv4 address — a dual-stack listener reports
 * loopback clients in both spellings, and the allowlist must not depend on
 * which one the kernel chose. Anything else returns verbatim.
 */
export function normalizeRemoteAddress(raw) {
  if (typeof raw !== "string" || raw === "") return raw;
  if (raw.toLowerCase().startsWith("::ffff:")) {
    const tail = raw.slice(7);
    return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(tail) ? tail : raw.toLowerCase();
  }
  return raw;
}

/**
 * Address allowlist gate — the third guard for deliberate public exposure.
 * A closed list of permitted peer socket addresses; empty/absent means
 * "no filtering" (the default posture, loopback bind). Exported for direct
 * unit tests, mirroring createRateLimiter.
 *
 * @param {string[]} [addresses]
 */
export function createAddressGate(addresses) {
  const allowed = new Set((addresses ?? []).map((a) => {
    if (typeof a !== "string" || a.trim() === "") throw new Error("allowAddresses entries must be non-empty strings");
    return normalizeRemoteAddress(a.trim());
  }));
  return {
    size: () => allowed.size,
    /** @returns {{allowed: boolean, peer: string}} */
    check(rawPeer) {
      const peer = normalizeRemoteAddress(rawPeer ?? "");
      // No list configured → the gate is open (default posture: loopback bind).
      // A CONFIGURED empty list is refused at construction, so openness here
      // means exactly "the operator did not ask for filtering".
      return { allowed: allowed.size === 0 || allowed.has(peer), peer };
    },
  };
}

/**
 * resets after `windowMs`; memory stays bounded because expired buckets are
 * dropped lazily on hit and swept when the map crosses `pruneAt` entries.
 * Exported for direct unit tests with an injected clock.
 *
 * @param {object} [opts]
 * @param {number} [opts.windowMs=60000]
 * @param {number} [opts.max=120]
 * @param {number} [opts.pruneAt=10000]
 * @param {() => number} [opts.now=Date.now] injectable clock for tests
 */
export function createRateLimiter({
  windowMs = RATE_LIMIT_DEFAULTS.windowMs,
  max = RATE_LIMIT_DEFAULTS.max,
  pruneAt = RATE_LIMIT_DEFAULTS.pruneAt,
  now = Date.now,
} = {}) {
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new Error("rate limit windowMs must be a positive number");
  if (!Number.isFinite(max) || max <= 0) throw new Error("rate limit max must be a positive number");
  if (!Number.isFinite(pruneAt) || pruneAt < 1) throw new Error("rate limit pruneAt must be >= 1");
  const buckets = new Map(); // key → { windowStart, count }
  const sweep = (t) => { for (const [k, b] of buckets) if (t - b.windowStart >= windowMs) buckets.delete(k); };
  return {
    windowMs,
    max,
    /** Tracked keys — exposed for tests and ops introspection. */
    size: () => buckets.size,
    /**
     * @param {string} key
     * @returns {{allowed: boolean, remaining: number, resetSec: number, retryAfterSec?: number}}
     */
    check(key) {
      const t = now();
      if (buckets.size >= pruneAt) sweep(t);
      let b = buckets.get(key);
      if (!b || t - b.windowStart >= windowMs) {
        b = { windowStart: t, count: 0 };
        buckets.set(key, b);
      }
      const resetSec = Math.max(0, Math.ceil((b.windowStart + windowMs - t) / 1000));
      if (b.count >= max) {
        return { allowed: false, remaining: 0, resetSec, retryAfterSec: Math.max(1, resetSec) };
      }
      b.count += 1;
      return { allowed: true, remaining: max - b.count, resetSec };
    },
  };
}

/**
 * Build a DDE HTTP request handler. Exported for tests and custom servers;
 * `startDeliveryEndpoint` is the one-command entry.
 *
 * @param {object} [opts]
 * @param {object} [opts.evm] optional EVM adapter forwarded to the engine for
 *        consent signature replay (E5). Absent → E5 NOT_RUN (never fabricated).
 * @param {object|false} [opts.rateLimit] `false` disables limiting; otherwise
 *        `{ windowMs, max }` tunes the per-address in-memory fixed window
 *        (default 120/min). `/health` is always exempt.
 * @param {string[]} [opts.allowAddresses] optional closed allowlist of peer
 *        socket addresses; every other address is rejected with 403 before
 *        the rate limiter (and `/health` is gated too). Absent → no filtering.
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<void>}
 */
export function createDeliveryRequestHandler({ evm = undefined, rateLimit, allowAddresses } = {}) {
  const limiter = rateLimit === false ? null : createRateLimiter(rateLimit ?? {});
  const addressGate = createAddressGate(allowAddresses);
  return async function handle(req, res) {
    const send = (code, payload, extraHeaders = {}) => {
      const body = JSON.stringify(payload, null, 2) + "\n";
      res.writeHead(code, {
        "content-type": "application/json; charset=utf-8",
        "x-dde-version": DDE_VERSION,
        "x-dde-boundary": BOUNDARY_BANNER.code,
        ...extraHeaders,
      });
      res.end(body);
    };

    // Guard 0 — address allowlist (when configured): the direct peer must be
    // on the closed list or it gets 403 before anything else. A rejected peer
    // never consumes rate-limit budget, and /health is NOT exempt here — an
    // unlisted address learns nothing, not even liveness. With no list the
    // gate is open (default posture: loopback bind) and this is a no-op.
    const peerVerdict = addressGate.check(req.socket?.remoteAddress);
    if (!peerVerdict.allowed) {
      return send(403, notAllowedBody());
    }

    // Rate limit — every endpoint except /health. Keyed on the direct peer
    // address: no X-Forwarded-For trust (a spoofable header would forge
    // identity — fail-closed identity). /health stays free so a flood can
    // never lock out liveness probes.
    if (!(req.method === "GET" && req.url === "/health") && limiter) {
      const verdict = limiter.check(req.socket.remoteAddress || "unknown");
      res.setHeader("x-ratelimit-limit", String(limiter.max));
      res.setHeader("x-ratelimit-remaining", String(verdict.remaining));
      res.setHeader("x-ratelimit-reset", String(verdict.resetSec));
      if (!verdict.allowed) {
        return send(429, {
          status: "REJECTED",
          error: `rate limit exceeded — max ${limiter.max} requests per ${Math.round(limiter.windowMs / 1000)}s window per address (fail-closed); retry later`,
          ddeVersion: DDE_VERSION,
          boundary: BOUNDARY_BANNER.statement,
        }, { "retry-after": String(verdict.retryAfterSec) });
      }
    }

    // Early size gate: a declared content-length over the cap is rejected
    // before a single body byte is read. The streaming cap below remains the
    // truth for absent or lying declarations (chunked, or actual > declared).
    const declaredLength = Number(req.headers["content-length"]);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return send(413, oversizeBody());
    }

    // Liveness — carries the banner so even a probe quotes the boundary.
    if (req.method === "GET" && req.url === "/health") {
      return send(200, {
        status: "OK",
        service: "coreguard-dde-http",
        ddeVersion: DDE_VERSION,
        boundary: BOUNDARY_BANNER.statement,
      });
    }

    if (req.method !== "POST" || (req.url !== "/verify" && req.url !== "/peoples-court")) {
      return send(404, {
        status: "REJECTED",
        error: "not found — POST /verify or POST /peoples-court with a fixture JSON body",
        ddeVersion: DDE_VERSION,
        boundary: BOUNDARY_BANNER.statement,
      });
    }

    // Read the body with a hard cap. Bloat is rejected before parsing.
    let size = 0;
    const chunks = [];
    let oversized = false;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { oversized = true; break; }
      chunks.push(chunk);
    }
    if (oversized) {
      return send(413, oversizeBody());
    }

    let fixture;
    try {
      fixture = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return send(400, {
        status: "REJECTED",
        error: "request body is not valid JSON — a malformed fixture is a rejected submission, not a server failure",
        ddeVersion: DDE_VERSION,
        boundary: BOUNDARY_BANNER.statement,
      });
    }

    // The full fail-closed gate — identical semantics to the CLI verifier.
    const report = await verifyDeliveryFixture(fixture, evm);
    const code = report.status === "VERIFIED" ? 200 : 422;

    if (req.url === "/peoples-court") {
      return send(code, {
        ...report,
        hashesManifest: "NOT_EVALUATED_OVER_HTTP — record pins are enforced by the file-based verifier (verify-fixture.mjs); this endpoint verifies the submitted records themselves",
        peoplesCourt: mapToPeoplesCourt(fixture),
      });
    }
    return send(code, report);
  };
}

/**
 * Start the DDE HTTP endpoint. Returns the server (call `.close()` in tests).
 *
 * @param {object} [opts]
 * @param {number} [opts.port=8787]
 * @param {string} [opts.host="127.0.0.1"] loopback by default — bind a public
 *        interface deliberately, never by accident
 * @param {object} [opts.evm] optional EVM adapter for consent replay (E5)
 * @param {object|false} [opts.rateLimit] `false` disables; `{ windowMs, max }`
 *        tunes the per-address fixed window (default 120/min)
 * @param {string[]} [opts.allowAddresses] closed allowlist of peer socket
 *        addresses (see createDeliveryRequestHandler)
 * @returns {Promise<import("node:http").Server>}
 */
export async function startDeliveryEndpoint({ port = 8787, host = "127.0.0.1", evm = undefined, rateLimit, allowAddresses } = {}) {
  const server = createServer(createDeliveryRequestHandler({ evm, rateLimit, allowAddresses }));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return server;
}
