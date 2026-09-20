#!/usr/bin/env node
/**
 * verify-fixture.mjs — one-command fail-closed re-verification of the DDE
 * delivery fixture.
 *
 *   node examples/delivery-fixture/verify-fixture.mjs                → human report, exit 0|1
 *   node examples/delivery-fixture/verify-fixture.mjs --json         → machine report
 *   node examples/delivery-fixture/verify-fixture.mjs --tamper logo.svg  → in-memory tamper demo (exit 1)
 *
 * Order of operations: hashes.json integrity FIRST (the manifest that pins
 * every record), then the engine gate (F0–F3, E3–E5, B1–B3), with real
 * EIP-712 consent replay through the repository's own EVM adapter.
 *
 * Exit contract: 0 = VERIFIED · 1 = REJECTED (any FAIL) · 2 = usage error.
 * This verifier never writes and never authorizes. Every outcome carries
 * the DDE boundary banner.
 */

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyDeliveryFixture,
  mapToPeoplesCourt,
  BOUNDARY_BANNER,
} from "../../packages/delivery/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const jsonMode = argv.includes("--json");
const tamperIdx = argv.indexOf("--tamper");
const tamperId = tamperIdx !== -1 ? argv[tamperIdx + 1] : undefined;
if (tamperIdx !== -1 && !tamperId) {
  console.error("usage: verify-fixture.mjs [--json] [--tamper <artifactId>]");
  process.exit(2);
}

const RECORDS = [
  "agreement.json", "acceptance-criteria.json", "parties.json", "authorization.json",
  "execution-attestation.json", "delivery-manifest.json", "acceptance-record.json",
  "dispute-record.json", "consent-and-disclosure.json", "retention-policy.json",
];

// ---------------------------------------------------------------- load + pin

function loadFixture() {
  const hashesPath = join(HERE, "hashes.json");
  if (!existsSync(hashesPath)) {
    return { error: "hashes.json missing — the integrity manifest that pins every record is absent (fail-closed)" };
  }
  const manifest = JSON.parse(readFileSync(hashesPath, "utf8"));
  const fixture = {};
  const tamperOps = [];
  // File names → engine keys: two records carry names the engine knows by
  // their model names; everything else maps 1:1 (camelCased).
  const ALIAS = { deliveryManifest: "delivery", executionAttestation: "execution" };

  for (const name of RECORDS) {
    const path = join(HERE, name);
    if (!existsSync(path)) {
      return { error: `${name} missing — mandatory record absent (fail-closed)` };
    }
    const buf = readFileSync(path);
    const pinned = manifest.files && manifest.files[name];
    if (!pinned || !/^0x[0-9a-f]{64}$/.test(pinned)) {
      return { error: `${name}: no valid pin in hashes.json (fail-closed)` };
    }
    const actual = "0x" + createHash("sha256").update(buf).digest("hex");
    if (actual !== pinned) {
      return { error: `${name}: recorded ${pinned.slice(0, 10)}… != actual ${actual.slice(0, 10)}… — pinned bytes changed (fail-closed)` };
    }
    const key = name.replace(/\.json$/, "").replace(/-([a-z])/g, (m, c) => c.toUpperCase());
    fixture[ALIAS[key] || key] = JSON.parse(buf.toString("utf8"));
  }

  // Fixture-level facts live in hashes.json (origin, lifecycle state).
  if (manifest.fixture) {
    if (manifest.fixture.origin) fixture.origin = manifest.fixture.origin;
    if (manifest.fixture.lifecycleState) fixture.lifecycleState = manifest.fixture.lifecycleState;
  }

  // Simulated in-memory tamper (no disk write): flip one byte of one artifact.
  if (tamperId) {
  const d = fixture.delivery;
  const art = d && d.artifacts && d.artifacts.find((a) => a.id === tamperId);
    if (!art || typeof art.content !== "string" || art.content.length === 0) {
      console.error(`--tamper: artifact "${tamperId}" not found (available: ${d && d.artifacts ? d.artifacts.map(a => a.id).join(", ") : "none"})`);
      process.exit(2);
    }
    const flipped = art.content.slice(0, -1) +
      String.fromCharCode(art.content.charCodeAt(art.content.length - 1) ^ 0x01);
    art.content = flipped;
    tamperOps.push(`artifact "${tamperId}": one byte flipped in memory (disk untouched)`);
  }

  return { fixture, manifest, tamperOps };
}

// ------------------------------------------------------------------- replay

const loaded = loadFixture();
if (loaded.error) {
  if (jsonMode) console.log(JSON.stringify({ status: "REJECTED", error: loaded.error, boundary: BOUNDARY_BANNER.statement }, null, 2));
  else console.error(`verify-fixture: ${loaded.error}`);
  process.exit(1);
}

const evm = await import("../../packages/evm/index.js");
const report = await verifyDeliveryFixture(loaded.fixture, evm);

// ---------------------------------------------------------- manifest recheck
// (record pins were already enforced in loadFixture; mirror the result)

// ------------------------------------------------------------ peoples court
const pc = mapToPeoplesCourt(loaded.fixture);
const anchor = loaded.fixture.execution;
const anchorLive = anchor && anchor.verifiedVia && anchor.verifiedVia.checkedAtUtc
  ? `receipt re-verified live ${anchor.verifiedVia.checkedAtUtc} via ${anchor.verifiedVia.rpc}`
  : "anchor provenance: see execution-attestation.json";

if (jsonMode) {
  console.log(JSON.stringify({
    verifier: "coreguard-dde-verify-fixture",
    ...report,
    hashesManifest: "PASS — all 10 records byte-exact vs hashes.json",
    tamperOps: loaded.tamperOps,
    peoplesCourt: pc,
    anchor: { txHash: anchor.txHash, ...anchorLive ? {} : {} },
  }, null, 2));
  process.exit(report.status === "VERIFIED" ? 0 : 1);
}

// ------------------------------------------------------------------ human
const line = "─".repeat(72);
console.log(line);
console.log("CoreGuard DDE — Delivery Fixture Verification (DDE/1)");
console.log(line);
console.log(`fixture      : ${loaded.fixture.agreement.agreementId} (origin: ${report.fixtureOrigin})`);
console.log(`hashes.json  : PASS — all 10 records byte-exact vs the pin manifest`);
if (loaded.tamperOps.length) {
  console.log(`tamper       : ${loaded.tamperOps.join("; ")}`);
}
console.log(`anchor       : ${anchor.txHash.slice(0, 22)}… on ${anchor.network} (${anchorLive})`);
console.log(line);

const idw = Math.max(...report.checks.map((c) => c.id.length));
const nw = Math.max(...report.checks.map((c) => c.name.length));
for (const c of report.checks) {
  const mark = c.result === "PASS" ? "✓" : c.result === "NOT_RUN" ? "○" : "✗";
  const pad = (s, w) => s + " ".repeat(w - s.length);
  console.log(`  ${mark} ${pad(c.id, idw)}  ${pad(c.name, nw)}  ${c.result}` +
    (c.result === "FAIL" && c.reasons && c.reasons.length
      ? `\n      → ${c.reasons.join("\n      → ")}`
      : c.result === "NOT_RUN" && c.note ? `\n      → ${c.note}` : ""));
}

console.log(line);
console.log(`status  : ${report.status} (${report.summary.pass} PASS · ${report.summary.fail} FAIL · ${report.summary.notRun} NOT_RUN)`);
console.log(`decision: ${report.decision}`);
console.log(`peoples court mapping: ${pc.readiness}`);
for (const it of pc.items) console.log(`  · ${it.kind}: ${it.ref}${it.note ? ` — ${it.note}` : ""}`);
console.log(line);
console.log(`boundary: ${report.boundary}`);
process.exit(report.status === "VERIFIED" ? 0 : 1);
