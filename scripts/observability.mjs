#!/usr/bin/env node
/**
 * observability.mjs — local telemetry events (no sensitive data by default).
 *
 * Emits structured events with correlation/gate identity fields. Events go to
 * memory always; an optional JSONL file can be requested explicitly. Nothing
 * is collected by default; no sensitive payloads are attached.
 *
 * Usage:
 *   node scripts/observability.mjs --self-check
 */

import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

export const EVENT_NAMES = Object.freeze([
  "commitment_created",
  "execution_started",
  "receipt_captured",
  "verification_started",
  "verification_passed",
  "verification_failed",
  "unknown_entered",
  "adapter_called",
  "webhook_received",
  "passport_generated",
]);

export const EVENT_NAME_SET = new Set(EVENT_NAMES);

export function createSink(opts = {}) {
  const events = [];
  return {
    emit(name, fields = {}) {
      if (!EVENT_NAME_SET.has(name)) {
        throw new Error(`observability: unknown event "${name}"`);
      }
      const record = {
        event: name,
        correlationId: fields.correlationId || randomUUID(),
        caseId: fields.caseId || null,
        commitmentId: fields.commitmentId || null,
        adapterId: fields.adapterId || null,
        level: fields.level || "L0",
        timestamp: fields.timestamp || null,
      };
      events.push(record);
      return record;
    },
    events: () => events.slice(),
    count: () => events.length,
    flushTo(file) {
      if (!file) return events.length;
      writeFileSync(file, events.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
      return events.length;
    },
  };
}

function selfCheck() {
  const sink = createSink();
  const a = sink.emit("commitment_created", { commitmentId: "0xabc", level: "L0" });
  const b = sink.emit("verification_passed", { caseId: "case-1", adapterId: "PEOPLES_COURT", level: "L1" });
  let rejected = false;
  try {
    sink.emit("not_a_real_event");
  } catch {
    rejected = true;
  }
  const ok =
    sink.count() === 2 && a.correlationId && a.commitmentId === "0xabc" && b.adapterId === "PEOPLES_COURT" && rejected;
  console.log(`OBSERVABILITY SELF-CHECK: ${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && process.argv[1].endsWith("observability.mjs")) {
  if (process.argv.includes("--self-check")) selfCheck();
}