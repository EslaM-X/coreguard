/**
 * CoreGuard Delivery & Dispute Evidence (DDE/1) — integration SDK surface.
 *
 * The minimal programmatic surface an external platform (agent platform,
 * escrow provider, People's Court intake tooling) embeds to hold payment
 * hostage to evidence: verify a bilateral delivery fixture, get a JSON
 * report stamped with the binding boundary, and gate release on it.
 *
 *   import { verifyFixture, releaseWhen } from "@coreguard/delivery/sdk";
 *
 *   const report = await verifyFixture({ fixtureDir: "./fixtures/case-17" });
 *   const gate = releaseWhen(report, (r) => r.status === "VERIFIED" &&
 *                                         r.acceptance?.verdict === "ACCEPTED");
 *   if (!gate.release) holdPayment(gate.reasons);
 *
 * Semantics are the engine's, unchanged: this surface adds zero checks and
 * strips zero checks. Every report carries DDE-BOUNDARY. The SDK never
 * signs, never broadcasts, never judges conformity.
 *
 * Zero dependencies. Node >= 18.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyDeliveryFixture,
  mapToPeoplesCourt,
  DDE_VERSION,
  BOUNDARY_BANNER,
} from "./index.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/** File name → engine key for on-disk fixtures (verify-fixture.mjs parity). */
const FILE_TO_KEY = {
  "agreement.json": "agreement",
  "acceptance-criteria.json": "acceptanceCriteria",
  "parties.json": "parties",
  "authorization.json": "authorization",
  "execution-attestation.json": "execution",
  "delivery-manifest.json": "delivery",
  "acceptance-record.json": "acceptanceRecord",
  "dispute-record.json": "disputeRecord",
  "consent-and-disclosure.json": "consentAndDisclosure",
  "retention-policy.json": "retentionPolicy",
};

/**
 * Load a fixture from a directory of record JSON files.
 * Record pins are NOT re-hashed here (the SDK may receive fixtures without
 * their manifest); pass the directory containing `hashes.json` to
 * `verifyFixture` to get the pin verdict in the envelope.
 *
 * @param {string} dir directory containing the ten record files
 * @returns {{ fixture: object, hashesManifest: "PRESENT"|"ABSENT" }} loader result
 */
export function loadFixtureFromDir(dir) {
  if (!dir || !existsSync(dir)) {
    throw new Error(`fixture directory not found: ${dir}`);
  }
  const fixture = {};
  for (const [name, key] of Object.entries(FILE_TO_KEY)) {
    const path = join(dir, name);
    if (!existsSync(path)) {
      throw new Error(`${name} missing in ${dir} — mandatory record absent (fail-closed)`);
    }
    fixture[key] = JSON.parse(readFileSync(path, "utf8"));
  }
  const manifestPath = join(dir, "hashes.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.fixture) {
      if (manifest.fixture.origin) fixture.origin = manifest.fixture.origin;
      if (manifest.fixture.lifecycleState) fixture.lifecycleState = manifest.fixture.lifecycleState;
    }
    return { fixture, hashesManifest: "PRESENT" };
  }
  return { fixture, hashesManifest: "ABSENT" };
}

/**
 * Envelope every report: the boundary is part of the payload itself, so any
 * consumer quoting the report quotes the boundary with it.
 */
function envelope(report, extra = {}) {
  return {
    sdk: "coreguard-dde-sdk",
    ddeVersion: DDE_VERSION,
    boundary: BOUNDARY_BANNER.statement,
    boundaryCode: BOUNDARY_BANNER.code,
    ...extra,
    ...report,
  };
}

/**
 * Verify a fixture from an in-memory object or a directory of records.
 *
 * @param {object} opts
 * @param {object} [opts.fixture] fixture object (records at their engine keys)
 * @param {string} [opts.fixtureDir] directory of record JSON files
 * @param {object} [opts.evm] optional EVM adapter for consent replay (E5);
 *        absent → E5 NOT_RUN (never fabricated)
 * @param {boolean} [opts.peoplesCourt=false] include the evidence-class projection
 * @returns {Promise<object>} boundary-stamped verification report
 */
export async function verifyFixture({ fixture = undefined, fixtureDir = undefined, evm = undefined, peoplesCourt = false } = {}) {
  let hashesManifest = "NOT_PROVIDED";
  if (fixtureDir !== undefined) {
    const loaded = loadFixtureFromDir(fixtureDir);
    fixture = loaded.fixture;
    hashesManifest = loaded.hashesManifest;
  }
  if (!fixture || typeof fixture !== "object") {
    return envelope({
      status: "REJECTED",
      decision: "FIXTURE_REJECTED",
      error: "no fixture provided — pass `fixture` (object) or `fixtureDir` (directory of records)",
      checks: [],
      summary: { total: 0, pass: 0, fail: 1, notRun: 0 },
    });
  }
  const report = await verifyDeliveryFixture(fixture, evm);
  const pc = peoplesCourt ? mapToPeoplesCourt(fixture) : undefined;
  return envelope(report, {
    hashesManifest,
    peoplesCourt: pc,
  });
}

/**
 * Payment-gate helper: turn a report into an explicit release/hold decision
 * with named reasons. The predicate is YOUR acceptance condition — the SDK
 * only enforces that no release can be decided by execution facts alone:
 * a gate that releases without the report being VERIFIED is refused
 * structurally (fail-closed), regardless of the predicate.
 *
 * @param {object} report envelope from verifyFixture()
 * @param {(report: object) => boolean} predicate platform's release condition
 * @returns {{ release: boolean, reasons: string[] }}
 */
export function releaseWhen(report, predicate) {
  const reasons = [];
  if (!report || report.status !== "VERIFIED") {
    reasons.push(`fixture verification is ${report?.status ?? "ABSENT"} — no release without a VERIFIED report`);
  }
  if (typeof predicate !== "function") {
    reasons.push("no release predicate provided — release requires an explicit acceptance condition");
  }
  if (reasons.length === 0) {
    let ok = false;
    try { ok = predicate(report) === true; } catch (e) { reasons.push(`predicate error: ${e.message}`); }
    if (!ok) reasons.push("release predicate not satisfied — the acceptance condition did not hold");
  }
  return { release: reasons.length === 0, reasons };
}
