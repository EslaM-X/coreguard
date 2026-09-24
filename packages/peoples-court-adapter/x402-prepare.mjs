#!/usr/bin/env node
/**
 * x402-prepare.mjs — @coreguard/peoples-court-adapter
 *
 * Offline, deterministic builder for the x402 dispute extension's
 * `adjudication.prepare()` packet (`@peoples-court/x402-disputes`), shaped to
 * the publicly documented surface: `idempotencyKey`, `authorityGrantId`,
 * `consentArtifactIds`, plus a dispute payload bound to the pinned ADAL/1
 * package revision.
 *
 * Honesty contract (binding):
 *   - No network. `networkCall: NOT_PERFORMED` is invariant on every output.
 *   - The packet is a READY-FOR-TRANSPORT template: a credential-holding
 *     integrator performs the live `prepare()` call against their own
 *     authorized channel. CoreGuard embeds no credential and never dials out.
 *   - Determinism: no Date.now(), no randomness, no network. `idempotencyKey`
 *     is derived from the pinned package revision (stable content address),
 *     so re-runs emit byte-identical packets.
 *   - `authorityGrantId` and `consentArtifactIds` are carried from the
 *     platform-assigned identifiers when a live integrator supplies them; in a
 *     pure dry-run these stay `pending-assignment` (mirroring the rulesPin
 *     convention).
 */

import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { canonicalJson } from "./webhook-consumer.mjs";
import { validateSchema } from "./adapter.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

export const X402_PREPARE_PROTOCOL = "X402-DISPUTES/1";
export const X402_PREPARE_METHOD = "adjudication.prepare";
export const NETWORK_CALL = "NOT_PERFORMED";

export const PENDING = "pending-assignment";

/**
 * Derive a deterministic idempotency key from the pinned package revision + a
 * suffix. The revision is the content address of the verified dispute package,
 * so the same verified bytes always yield the same key — replay-safe without
 * a single random byte.
 */
export function deriveIdempotencyKey(packageRevision, suffix = "prepare") {
  return createHash("sha256").update(`x402:${packageRevision}:${suffix}`, "utf8").digest("hex").slice(0, 48);
}

/**
 * Build the x402 `adjudication.prepare()` packet.
 *
 * `pkgRevision` is the SHA-256 pin of dispute-package.json from the verified
 * ADAL/1 package. `authorityGrantId`/`consentArtifactIds` are externally
 * assigned by the platform; pass them to produce the transport-ready packet,
 * or omit them to emit a dry-run packet with `pending-assignment` placeholders.
 *
 * Returns { packet, digest, ok, errors }. `digest` is SHA-256 over the
 * canonical packet minus the digest field itself (self-excluding pin).
 */
export function buildX402Prepare({ pkgRevision, authorityGrantId = PENDING, consentArtifactIds = [] }) {
  const errors = [];
  const revision = typeof pkgRevision === "string" ? pkgRevision.replace(/^0x/, "") : pkgRevision;
  if (typeof revision !== "string" || !/^[0-9a-f]{64}$/.test(revision)) {
    errors.push(`pkgRevision must be a 64-hex SHA-256 pin, got ${JSON.stringify(pkgRevision)}`);
  }
  if (authorityGrantId !== PENDING && typeof authorityGrantId !== "string") {
    errors.push("authorityGrantId must be a string or pending-assignment");
  }
  if (!Array.isArray(consentArtifactIds)) {
    errors.push("consentArtifactIds must be an array");
  }

  const idempotencyKey = deriveIdempotencyKey(revision);

  const packet = {
    protocol: X402_PREPARE_PROTOCOL,
    method: X402_PREPARE_METHOD,
    idempotencyKey,
    authorityGrantId,
    consentArtifactIds,
    payload: {
      packageRevision: revision,
      disputeRef: `dispute-${revision.slice(0, 12)}`,
      partiesBound: true,
    },
    networkCall: NETWORK_CALL,
    note: "Ready-for-transport template. The live adjudication.prepare() call is performed by a credential-holding integrator over their own authorized channel; CoreGuard performs no network call.",
  };

  const digest = createHash("sha256").update(canonicalJson(packet), "utf8").digest("hex");
  const selfExcluded = { excluded: ["digest"], reason: "digest pins the canonical packet minus itself" };
  return { packet, digest: "0x" + digest, digestSelfExcluded: selfExcluded, ok: errors.length === 0, errors };
}

/** Re-verify a prepared packet: digest must match a re-derivation. */
export function verifyX402Prepare({ packet, expectedDigest }) {
  const errors = [];
  if (!packet || typeof packet !== "object" || packet.method !== X402_PREPARE_METHOD) {
    errors.push("not an x402 prepare packet");
    return { ok: false, errors };
  }
  if (typeof expectedDigest !== "string" || !/^0x[0-9a-f]{64}$/.test(expectedDigest)) {
    errors.push("expectedDigest must be a 0x-prefixed 64-hex SHA-256");
  } else {
    const rehash = "0x" + createHash("sha256").update(canonicalJson(packet), "utf8").digest("hex");
    if (rehash !== expectedDigest) errors.push("packet digest does not re-derive from the canonical packet bytes");
  }
  const schema = validateX402Schema(packet);
  if (!schema.ok) errors.push(`schema: ${schema.errors.join("; ")}`);
  return { ok: errors.length === 0, errors };
}

/** Validate against the packaged x402 schema. */
export function validateX402Schema(packet) {
  const schema = JSON.parse(readFileSync(join(HERE, "schemas", "x402-prepare-packet.json"), "utf8"));
  return validateSchema(packet, schema);
}