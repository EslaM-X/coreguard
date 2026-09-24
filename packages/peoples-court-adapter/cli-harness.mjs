#!/usr/bin/env node
/**
 * cli-harness.mjs — `npm run peoples-court:harness -- --case <dispute-package-dir> [--feed <recorded-feed.json>] [--out <out>]`
 *
 * Test-account-ready live-submission harness (Phase-1 milestone).
 *
 * Pipeline (all offline, all deterministic, fail-closed):
 *   1. verify the ADAL/1 dispute package (fail-closed) — nothing emits on failure
 *   2. derive the eight status labels + build the four Partner-API mappings
 *   3. build the x402 `adjudication.prepare()` packet bound to the pinned
 *      package revision (deterministic idempotencyKey)
 *   4. replay a RECORDED webhook feed through the `eventId` dedup + sequence
 *      cursor consumer (at-least-once semantics)
 *   5. pin every emitted byte in harness-hashes.json, then re-verify the
 *      emitted records before exiting 0
 *
 * Exit codes:
 *   0  PEOPLES_COURT_HARNESS_READY — packet + ledger built, pinned, self-verified
 *   1  fail-closed (verification, label derivation, packet build, feed replay,
 *      or self-verify failed; nothing usable is emitted)
 *   2  usage error (missing/empty --case, feed unreadable, out dir == case dir,
 *      out dir holds foreign files)
 *
 * Honesty contract (binding):
 *   - `networkCall: NOT_PERFORMED` is invariant on every output. No live call,
 *     no credential embedded, no submission. The recorded feed is either a
 *     bundled fixture or the recorded stream of a credential-holding
 *     integrator's own test account — the harness never dials out.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyPackage,
  loadPackage,
  deriveLabels,
  buildMappings,
} from "./adapter.mjs";
import { consumeFeed, emptyLedger, sha256Canonical } from "./webhook-consumer.mjs";
import { buildX402Prepare, verifyX402Prepare, X402_PREPARE_METHOD } from "./x402-prepare.mjs";

const args = process.argv.slice(2);
const caseIdx = args.indexOf("--case");
const feedIdx = args.indexOf("--feed");
const outIdx = args.indexOf("--out");
const CASE = caseIdx === -1 ? null : args[caseIdx + 1];
const FEED_ARG = feedIdx === -1 ? null : args[feedIdx + 1];
const OUT_ARG = outIdx === -1 ? null : args[outIdx + 1];

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_FEED = join(HERE, "examples", "recorded-feed.json");

export const HARNESS_PROTOCOL = "PEOPLES-COURT-HARNESS/1";
export const HARNESS_FILES = [
  "x402-prepare-packet.json",
  "x402-packet-digest.json",
  "webhook-ledger.json",
  "webhook-events-log.json",
  "harness-report.json",
];

if (caseIdx === -1 || !CASE) {
  console.error("usage: node packages/peoples-court-adapter/cli-harness.mjs --case <dispute-package-dir> [--feed <recorded-feed.json>] [--out <out>]");
  process.exit(2);
}

const caseDir = resolve(CASE);
if (!existsSync(join(caseDir, "dispute-package.json")) || !existsSync(join(caseDir, "dispute-hashes.json"))) {
  console.error(`refusing: ${caseDir} is not a delivered dispute-package dir (dispute-package.json + dispute-hashes.json required)`);
  process.exit(2);
}

const feedPath = resolve(FEED_ARG ?? DEFAULT_FEED);
if (!FEED_ARG && !existsSync(DEFAULT_FEED)) {
  console.error("refusing: bundled recorded-feed.json is missing from the package");
  process.exit(2);
}
let feed;
try {
  feed = JSON.parse(readFileSync(feedPath, "utf8"));
} catch (e) {
  console.error(`refusing: --feed ${feedPath} is not readable JSON: ${e.message}`);
  process.exit(2);
}
if (!Array.isArray(feed?.events)) {
  console.error("refusing: recorded feed must be { events: [...] }");
  process.exit(2);
}

const outDir = OUT_ARG ? resolve(OUT_ARG) : join(dirname(caseDir), `${basename(caseDir)}-harness-output`);

if (outDir === caseDir) {
  console.error("refusing: --out must not equal the case dir (the harness never mutates the dispute package)");
  process.exit(2);
}

if (existsSync(outDir)) {
  const present = readdirSync(outDir);
  const foreign = present.filter((e) => !HARNESS_FILES.includes(e));
  if (present.length > 0 && foreign.length > 0) {
    console.error(`refusing: ${outDir} exists with files that are not harness-output files (${foreign.join(", ")})`);
    process.exit(2);
  }
}

mkdirSync(outDir, { recursive: true });

// ── Stage 1+2: verify the ADAL/1 package, derive labels + mappings ──────────
const v = verifyPackage(caseDir);
if (!v.ok) {
  console.error(`PEOPLES_COURT_HARNESS_FAILED at verify: ADAL/1 verification failed (status ${v.status}); nothing emitted. ${v.stdout}${v.stderr}`.trim());
  process.exit(1);
}
const { pkg, manifest } = loadPackage(caseDir);
const { labels, checks, complete } = deriveLabels(pkg);
if (!complete) {
  const failed = checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`).join("; ");
  console.error(`PEOPLES_COURT_HARNESS_FAILED at labels: ${failed}`);
  process.exit(1);
}
const mappings = buildMappings(pkg, manifest);
const pkgRevision = manifest.files?.["dispute-package.json"] ?? null;

// ── Stage 3: x402 adjudication.prepare() packet ─────────────────────────────
const prepared = buildX402Prepare({ pkgRevision });
if (!prepared.ok) {
  console.error(`PEOPLES_COURT_HARNESS_FAILED at x402: ${prepared.errors.join("; ")}`);
  process.exit(1);
}
const { packet, digest } = prepared;

// ── Stage 4: replay the recorded webhook feed ───────────────────────────────
const replay = consumeFeed({ events: feed.events, initialLedger: emptyLedger() });
const tamperedEvents = replay.ledger.tampered;
if (tamperedEvents.length > 0) {
  const detail = tamperedEvents.map((t) => `${t.eventId}@${t.sequence}`).join(", ");
  console.error(`PEOPLES_COURT_HARNESS_FAILED at webhook: tampered feed events not acked (${detail})`);
  process.exit(1);
}
const appliedCount = replay.eventsLog.filter((r) => r.verdict === "APPLIED").length;
const duplicateCount = replay.eventsLog.filter((r) => r.verdict === "DUPLICATE").length;
const outOfOrderCount = replay.eventsLog.filter((r) => r.verdict === "OUT_OF_ORDER").length;
const ledgerState = replay.ledger;

// ── Stage 5: emit + pin + self-verify ───────────────────────────────────────
const packetDigest = { method: X402_PREPARE_METHOD, digest, networkCall: replay.networkCall, note: prepared.digestSelfExcluded.reason };

const report = {
  protocol: HARNESS_PROTOCOL,
  stage: "PEOPLES_COURT_HARNESS_READY",
  case: basename(caseDir),
  packageRevision: pkgRevision,
  labels,
  mappings: Object.fromEntries(Object.entries(mappings).map(([k, v]) => [k, v.label])),
  x402: { method: X402_PREPARE_METHOD, idempotencyKey: packet.idempotencyKey, authorityGrantId: packet.authorityGrantId, consentArtifactIds: packet.consentArtifactIds },
  webhook: {
    feed: basename(feedPath),
    events: feed.events.length,
    applied: appliedCount,
    duplicates: duplicateCount,
    outOfOrder: outOfOrderCount,
    tampered: tamperedEvents.length,
    cursor: ledgerState.cursor,
    nextSequence: ledgerState.nextSequence,
    dedupVerified: "each eventId applied at most once; redeliveries acked, never re-applied",
  },
  networkCall: replay.networkCall,
  disclaimer: "Test-account-ready live-submission harness. No live call, no credential embedded, no submission performed. The credential-gated live adjudication.prepare() call and webhook receive belong to the integrator who holds the account credential.",
};

for (const [f, body] of [
  ["x402-prepare-packet.json", packet],
  ["x402-packet-digest.json", packetDigest],
  ["webhook-ledger.json", replay.ledger],
  ["webhook-events-log.json", { eventsLog: replay.eventsLog, networkCall: replay.networkCall }],
  ["harness-report.json", report],
]) {
  writeFileSync(join(outDir, f), JSON.stringify(body, null, 2) + "\n");
}

// Pin every emitted file (self-excluding the hashes file), then re-verify.
const hashes = { files: {}, manifest: { protocol: "HARNESS-HASHES/1", selfExcluded: ["harness-hashes.json"] } };
for (const f of HARNESS_FILES) {
  hashes.files[f] = sha256Canonical(JSON.parse(readFileSync(join(outDir, f), "utf8")));
}
writeFileSync(join(outDir, "harness-hashes.json"), JSON.stringify(hashes, null, 2) + "\n");

// Self-verify: re-read the emitted bytes and re-derive both pins + the packet digest.
for (const f of HARNESS_FILES) {
  const onDisk = sha256Canonical(JSON.parse(readFileSync(join(outDir, f), "utf8")));
  if (onDisk !== hashes.files[f]) {
    console.error(`PEOPLES_COURT_HARNESS_FAILED at self-verify: ${f} pin mismatch`);
    process.exit(1);
  }
}
const emittedPacket = JSON.parse(readFileSync(join(outDir, "x402-prepare-packet.json"), "utf8"));
const emittedDigest = JSON.parse(readFileSync(join(outDir, "x402-packet-digest.json"), "utf8"));
const recheck = verifyX402Prepare({ packet: emittedPacket, expectedDigest: emittedDigest.digest });
if (!recheck.ok) {
  console.error(`PEOPLES_COURT_HARNESS_FAILED at self-verify: x402 packet: ${recheck.errors.join("; ")}`);
  process.exit(1);
}

console.log("CoreGuard × People's Court — test-account-ready harness");
console.log("─".repeat(72));
console.log(`case       : ${caseDir}`);
console.log(`feed       : ${feedPath}  (recorded fixture; no network)`);
console.log(`out        : ${outDir}`);
console.log(`x402       : ${X402_PREPARE_METHOD} · idempotencyKey=${packet.idempotencyKey.slice(0, 12)}… · digest=${digest.slice(0, 16)}…`);
console.log(`webhook    : ${feed.events.length} events · ${appliedCount} applied · ${duplicateCount} duplicate · ${outOfOrderCount} out-of-order · ${tamperedEvents.length} tampered · cursor=${ledgerState.cursor}`);
console.log(`network    : ${replay.networkCall}  (no live call, no credential, no submission)`);
console.log("─".repeat(72));
console.log(`decision: PEOPLES_COURT_HARNESS_READY`);
console.log(`boundary: packet + ledger emitted, pinned, and self-verified. The live credential-gated call stays with the integrator who holds the account credential.`);
process.exit(0);