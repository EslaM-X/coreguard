#!/usr/bin/env node
/**
 * evidence-passport.mjs — emits the machine-readable integration registry
 * ("Evidence Passport") for every adapter, plus the platform block whose
 * numbers come straight from docs/state-snapshot.json.
 *
 * Deterministic on purpose: no timestamps, no commit refs, fixed key order —
 * the committed docs/integration-registry.json must hash-stable across runs
 * on the same tree. A live fact is never claimed here: environment and status
 * derive from the registry's DRY_RUN states and the state machine's guards.
 *
 * Usage:
 *   node scripts/ladder/evidence-passport.mjs          # prints JSON
 *   node scripts/ladder/evidence-passport.mjs --write  # writes docs/integration-registry.json
 *   node scripts/ladder/evidence-passport.mjs --print  # human passports
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ADAPTER_REGISTRY, TRACK_REGISTRY } from "./adapters.mjs";
import { CONFORMANCE_SUITE_VERSION } from "./conformance.mjs";
import { currentPlatformLevel, PLATFORM_LEVELS, INTEGRATION_STATES } from "./states.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const SNAPSHOT = join(REPO, "docs", "state-snapshot.json");
const OUT = join(REPO, "docs", "integration-registry.json");

const ENV_BY_STATE = {
  NOT_STARTED: "NONE — boundary declaration only",
  DESIGNED: "OFFLINE — design only",
  DRY_RUN: "OFFLINE / DRY-RUN — recorded fixtures only",
  SANDBOX_READY: "SANDBOX — capability built, not authorized",
  SANDBOX_AUTHORIZED: "SANDBOX — owner-authorized",
  LIVE_PREPARED: "LIVE — prepared packet accepted",
  WEBHOOK_CONNECTED: "LIVE — webhook connected",
  CONFORMANCE_TESTING: "LIVE — under conformance",
  CONFORMANT: "LIVE — conformant",
  PRODUCTION: "LIVE — production boundary",
  SUSPENDED: "PAUSED",
  REVOKED: "REVOKED",
  DEPRECATED: "DEPRECATED",
};

function admitted(record) {
  return {
    id: record.id,
    name: record.name,
    surface: record.surface,
    standard: record.standard,
    status: record.state,
    integrationStatus: record.integrationStatus,
    networkCall: record.networkCall,
    lastVerification: record.lastVerification,
    environment: ENV_BY_STATE[record.state] || record.state,
    capabilities: record.capabilities,
    limitations: record.limitations,
  };
}

export function build(adapters = ADAPTER_REGISTRY, tracks = TRACK_REGISTRY) {
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
  const platformLevel = currentPlatformLevel(adapters, { offlineEvidenceReproducible: true });
  const level = PLATFORM_LEVELS.find((l) => l.id === platformLevel);
  return {
    platform: {
      testsTotal: snapshot.testsTotal,
      filesScanned: snapshot.boundaryAudit.filesScanned,
      violations: snapshot.boundaryAudit.violations,
      peoplesCourtHarness: snapshot.peoplesCourtHarness,
      docsNode: snapshot.docsNode,
      conformanceSuite: CONFORMANCE_SUITE_VERSION,
      platformLevel,
      platformLevelLabel: level ? level.label : platformLevel,
    },
    adapters: adapters.map(admitted),
    tracks: tracks.map((t) => ({
      id: t.id,
      name: t.name,
      letter: t.letter,
      state: t.state,
      target: t.target,
    })),
  };
}

function passportLines(p) {
  const lines = [];
  lines.push("COREGUARD EVIDENCE PASSPORT");
  lines.push(`  integration : ${p.name}`);
  lines.push(`  adapter      : ${p.id}`);
  lines.push(`  surface      : ${p.surface}`);
  lines.push(`  standard     : ${p.standard.join(" / ")}`);
  lines.push(`  status       : ${p.status}`);
  lines.push(`  integrationStatus : ${p.integrationStatus}`);
  lines.push(`  networkCall  : ${p.networkCall}`);
  lines.push(`  environment  : ${p.environment}`);
  lines.push(`  lastVerification : ${p.lastVerification}`);
  lines.push(`  capabilities : ${p.capabilities}`);
  lines.push(`  limitations  : ${p.limitations}`);
  return lines.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const registry = build();
  if (args.includes("--write")) {
    writeFileSync(OUT, JSON.stringify(registry, null, 2) + "\n", "utf8");
    console.log(`LADDER-PASSPORT: wrote ${OUT}`);
    process.exit(0);
  }
  if (args.includes("--print")) {
    for (const a of registry.adapters) console.log(passportLines(a) + "\n");
    return;
  }
  console.log(JSON.stringify(registry, null, 2));
}

if (process.argv[1] && process.argv[1].endsWith("evidence-passport.mjs")) main();