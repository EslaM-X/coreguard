#!/usr/bin/env node
/**
 * cli.mjs — `npm run ladder:status`: the one-shot status surface for the
 * Live Integration & Adoption Ladder.
 *
 * Prints the current platform level, every adapter's guarded state, the
 * transition refused by default for live steps, and the red line. Pure read;
 * never writes.
 */

import { ADAPTER_REGISTRY, TRACK_REGISTRY } from "./adapters.mjs";
import { evaluateTransition } from "./state-machine.mjs";
import { currentPlatformLevel, HARD_RED_LINE, INTEGRATION_STATES, PLATFORM_LEVELS, STATE_MEANING } from "./states.mjs";

function main() {
  const level = currentPlatformLevel(ADAPTER_REGISTRY, { offlineEvidenceReproducible: true });
  const meta = PLATFORM_LEVELS.find((l) => l.id === level);
  const out = [];
  out.push("COREGUARD — LIVE INTEGRATION & ADOPTION LADDER");
  out.push("");
  out.push(`PLATFORM LEVEL : ${level} — ${meta.label}`);
  out.push(`STATE SPACE    : ${INTEGRATION_STATES.join(" → ")}`);
  out.push("");
  out.push("ADAPTERS");
  for (const a of ADAPTER_REGISTRY) {
    out.push(`  ${a.id.padEnd(42)} state=${a.state.padEnd(18)} integrationStatus=${a.integrationStatus} networkCall=${a.networkCall}`);
  }
  out.push("");
  out.push("TRACKS (Phase B rails, owner-gated)");
  for (const t of TRACK_REGISTRY) {
    out.push(`  ${t.id.padEnd(38)} letter=${t.letter.padEnd(4)} state=${t.state}`);
  }
  out.push("");
  const demo = evaluateTransition("SANDBOX_AUTHORIZED", "LIVE_PREPARED", {});
  out.push("GUARD DEMO — L1 sandbox → L2 live preparation without records:");
  out.push(`  allowed=${demo.allowed}  missing=[${demo.missing.join(", ")}]`);
  out.push("");
  out.push(`MEANING REF  — ${Object.keys(STATE_MEANING).length} states defined; e.g. DRY_RUN: ${STATE_MEANING.DRY_RUN}`);
  out.push("");
  out.push(HARD_RED_LINE);
  console.log(out.join("\n"));
}

main();