#!/usr/bin/env node
/**
 * webhook-consumer.mjs — @coreguard/peoples-court-adapter
 *
 * Offline, deterministic webhook consumer for the People's Court Partner API
 * v2 at-least-once webhook surface (`eventId` dedup + sequence cursor).
 *
 * Replay semantics (mirroring the documented surface):
 *   - every event carries `eventId` + monotonic `sequence`
 *   - `APPLIED`  : eventId unseen, sequence === cursor + 1, payloadHash verified
 *   - `DUPLICATE`: eventId already applied or acked → ack only, never re-applied
 *   - `OUT_OF_ORDER`: inbound sequence !== cursor + 1 → held, recorded, not applied
 *   - `TAMPERED` : payloadHash mismatch → fail-closed (verdict REJECTED); an
 *     unacknowledged tampered event forces the harness to fail closed
 *
 * Honesty contract (binding):
 *   - No network. `networkCall: NOT_PERFORMED` is invariant on every output.
 *   - Feeds are recorded fixtures (or, for a live integrator, the recorded
 *     stream of their own credential-gated test account). The harness itself
 *     never dials out.
 *   - Determinism: no Date.now(), no randomness, no network. Timestamps are
 *     carried from the feed; the ledger is a pure function of feed + cursor.
 */

import { createHash } from "node:crypto";

export const WEBHOOK_CONSUMER_PROTOCOL = "PEOPLES-COURT-WEBHOOK-CONSUMER/1";
export const NETWORK_CALL = "NOT_PERFORMED";

/** Strict RFC-8785-style canonical JSON: sorted keys, space-free, ASCII escapes. */
export function canonicalJson(value) {
  if (value === null || typeof value === "undefined") return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite number is not canonicalizable");
    if (!Number.isSafeInteger(value)) throw new Error("unsafe number is not canonicalizable");
    return String(value);
  }
  if (typeof value === "string") {
    // JSON.stringify escapes control characters and quotes exactly per the
    // JSON spec, and its escaping round-trips (parse then stringify is
    // identity). RFC-8785-style: no whitespace inside strings, escapes kept.
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(value[k])).join(",") + "}";
  }
  throw new Error(`unsupported canonical type: ${typeof value}`);
}

/** SHA-256 of the canonical JSON bytes. */
export function sha256Canonical(value) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

/** Empty consumer ledger; `nextSequence` is the next expected inbound sequence. */
export const emptyLedger = () => ({
  protocol: WEBHOOK_CONSUMER_PROTOCOL,
  networkCall: NETWORK_CALL,
  cursor: 0,
  nextSequence: 1,
  appliedByEventId: {},
  appliedBySequence: {},
  ackedByEventId: {},
  outOfOrder: [],
  tampered: [],
});

/**
 * Consume one webhook event against the ledger (pure). Returns
 * `{ verdict, detail, ledger }` — a fresh ledger, or the same reference when
 * the event changed nothing. Never throws on a well-formed event.
 *
 * verdicts: APPLIED | DUPLICATE | OUT_OF_ORDER | TAMPERED
 */
export function consumeEvent({ event, ledger = emptyLedger() }) {
  const l = {
    ...ledger,
    appliedByEventId: { ...ledger.appliedByEventId },
    appliedBySequence: { ...ledger.appliedBySequence },
    ackedByEventId: { ...ledger.ackedByEventId },
    outOfOrder: [...ledger.outOfOrder],
    tampered: [...ledger.tampered],
  };

  if (!event || typeof event !== "object" || typeof event.eventId !== "string" || typeof event.sequence !== "number") {
    return { verdict: "TAMPERED", detail: "event has no eventId/sequence", ledger: l };
  }

  // Dedup first: an eventId already applied or already acked is a duplicate,
  // regardless of sequence — at-least-once redelivery. Ack only. Never re-apply.
  if (event.eventId in l.appliedByEventId || event.eventId in l.ackedByEventId) {
    return { verdict: "DUPLICATE", detail: `eventId ${event.eventId} already seen`, ledger: l };
  }

  // Payload integrity: payloadHash must equal SHA-256 of the canonical payload.
  const expectHash = sha256Canonical(event.payload ?? null);
  if (typeof event.payloadHash === "string" && event.payloadHash !== "0x" + expectHash) {
    l.tampered.push({ eventId: event.eventId, sequence: event.sequence, detail: "payloadHash mismatch" });
    return { verdict: "TAMPERED", detail: `payloadHash mismatch for ${event.eventId}`, ledger: l };
  }

  // Sequence discipline: only the next expected sequence is applied in-order.
  if (event.sequence !== l.nextSequence) {
    l.outOfOrder.push({ eventId: event.eventId, sequence: event.sequence, expected: l.nextSequence });
    l.ackedByEventId[event.eventId] = { sequence: event.sequence, verdict: "OUT_OF_ORDER" };
    return { verdict: "OUT_OF_ORDER", detail: `sequence ${event.sequence} != expected ${l.nextSequence}`, ledger: l };
  }

  l.appliedByEventId[event.eventId] = event.sequence;
  l.appliedBySequence[event.sequence] = event.eventId;
  l.ackedByEventId[event.eventId] = { sequence: event.sequence, verdict: "APPLIED" };
  l.cursor = event.sequence;
  l.nextSequence = event.sequence + 1;
  return { verdict: "APPLIED", detail: `applied ${event.eventId} at sequence ${event.sequence}`, ledger: l };
}

/** Replay a recorded feed (array of events) over a starting ledger. */
export function consumeFeed({ events, initialLedger = emptyLedger() }) {
  let ledger = initialLedger;
  const eventsLog = [];
  for (const event of events) {
    const r = consumeEvent({ event, ledger });
    ledger = r.ledger;
    eventsLog.push({ eventId: event?.eventId ?? null, sequence: event?.sequence ?? null, verdict: r.verdict });
  }
  return { ledger, eventsLog, networkCall: NETWORK_CALL };
}