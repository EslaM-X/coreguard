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

/**
 * Build a DDE HTTP request handler. Exported for tests and custom servers;
 * `startDeliveryEndpoint` is the one-command entry.
 *
 * @param {object} [opts]
 * @param {object} [opts.evm] optional EVM adapter forwarded to the engine for
 *        consent signature replay (E5). Absent → E5 NOT_RUN (never fabricated).
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<void>}
 */
export function createDeliveryRequestHandler({ evm = undefined } = {}) {
  return async function handle(req, res) {
    const send = (code, payload) => {
      const body = JSON.stringify(payload, null, 2) + "\n";
      res.writeHead(code, {
        "content-type": "application/json; charset=utf-8",
        "x-dde-version": DDE_VERSION,
        "x-dde-boundary": BOUNDARY_BANNER.code,
      });
      res.end(body);
    };

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
      return send(413, {
        status: "REJECTED",
        error: `request body exceeds ${MAX_BODY_BYTES} bytes — fixtures are small JSON documents (fail-closed)`,
        ddeVersion: DDE_VERSION,
        boundary: BOUNDARY_BANNER.statement,
      });
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
 * @returns {Promise<import("node:http").Server>}
 */
export async function startDeliveryEndpoint({ port = 8787, host = "127.0.0.1", evm = undefined } = {}) {
  const server = createServer(createDeliveryRequestHandler({ evm }));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return server;
}
