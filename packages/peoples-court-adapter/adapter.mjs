#!/usr/bin/env node
/**
 * adapter.mjs — @coreguard/peoples-court-adapter
 *
 * Structural dry-run adapter: maps a verified ADAL/1 dispute package onto the
 * People's Court Partner API v2 + x402 dispute surface WITHOUT any network
 * call. The output is an offline, deterministic "ready-for-submission" package
 * that a live integrator (who holds their own authorized credential) can use as
 * the template for a real submission.
 *
 * Honesty contract (binding):
 *   - No credential is stored, requested, or simulated.
 *   - No live call is performed or claimed. `network-call: NOT_PERFORMED` is
 *     invariant for every output this package produces.
 *   - Yes, the Partner API v2 and the x402 dispute extension are real, public
 *     surfaces — but mapping to them is STRUCTURAL. No live account, no
 *     submission, no settlement authority is asserted, ever.
 *   - An Award does not move money. Execution is a separate, credential-scoped
 *     step. CoreGuard's escrow remains reference-only (`deployed:false`,
 *     `chain:"none"`).
 *
 * Determinism: no Date.now(), no Math.random(), no network. Timestamps are
 * carried from the dispute package itself when present.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, "..", "..");
export const VERIFY = join(
  REPO,
  "examples",
  "delivery-fixture",
  "pairs",
  "dispute-package",
  "verify-dispute-package.mjs",
);

export const ADAPTER_PROTOCOL = "PEOPLES-COURT-ADAPTER/1";
export const FIXTURE_VERSION = "dry-run-v1.0.0";
export const OUT_FILES = ["expected-request.json", "expected-response.json", "adapter-report.json"];

const TRIBUNAL_NOTE =
  "People's Court Partner API v2 + @peoples-court/x402-disputes are real, publicly documented surfaces. This adapter maps CoreGuard's ADAL/1 record onto their documented shape. Mapping is structural; live submission remains credential-gated and was not performed.";

/**
 * Minimal JSON-schema (draft-07 subset) validator. Supports the keywords used
 * in schemas/: type, required, properties, items, enum, const, pattern. Fail
 * closed: any mismatch is a validation error.
 */
export function validateSchema(value, schema, path = "$") {
  const errors = [];
  const err = (msg) => errors.push(`${path}: ${msg}`);

  if (schema === undefined || schema === null) return { ok: true, errors };

  if (schema.type) {
    const typeMap = {
      string: "string",
      object: "object",
      array: "array",
      boolean: "boolean",
      number: "number",
    };
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = Array.isArray(value) ? "array" : typeof value;
    const allowed = types.map((t) => typeMap[t] ?? t);
    if (!allowed.includes("array") && Array.isArray(value)) {
      err(`expected ${allowed.join("|")}, got array`);
    } else if (!Array.isArray(value) && !allowed.includes(actual)) {
      err(`expected ${allowed.join("|")}, got ${actual}`);
    }
  }

  if (schema.const !== undefined && value !== schema.const) {
    err(`expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }

  if (schema.enum && !schema.enum.includes(value)) {
    err(`value ${JSON.stringify(value)} not in enum ${JSON.stringify(schema.enum)}`);
  }

  if (schema.pattern && typeof value === "string" && !new RegExp(schema.pattern).test(value)) {
    err(`value ${JSON.stringify(value)} does not match ${schema.pattern}`);
  }

  if (typeof value === "object" && value !== null && !Array.isArray(value) && schema.properties) {
    for (const [k, sub] of Object.entries(schema.properties)) {
      if (k in value) {
        const r = validateSchema(value[k], sub, `${path}.${k}`);
        errors.push(...r.errors);
      }
    }
    for (const req of schema.required ?? []) {
      if (!(req in value)) err(`missing required property '${req}'`);
    }
  }

  if (Array.isArray(value) && schema.items) {
    value.forEach((v, i) => {
      const r = validateSchema(v, schema.items, `${path}[${i}]`);
      errors.push(...r.errors);
    });
  }

  // for object/array types, validate required on arrays of objects recursively
  if (typeof value === "object" && value !== null && !Array.isArray(value) && !schema.properties && schema.required) {
    for (const req of schema.required) {
      if (!(req in value)) err(`missing required property '${req}'`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Run the fail-closed ADAL/1 verifier over a delivered dispute-package dir. */
export function verifyPackage(caseDir) {
  const r = spawnSync(process.execPath, [VERIFY], { cwd: caseDir, encoding: "utf8" });
  const ok = r.status === 0 && /DISPUTE_PACKAGE OK/.test(r.stdout ?? "");
  return { ok, status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** Load dispute-package.json + dispute-hashes.json from a delivered dir. */
export function loadPackage(caseDir) {
  const pkg = JSON.parse(readFileSync(join(caseDir, "dispute-package.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(caseDir, "dispute-hashes.json"), "utf8"));
  return { pkg, manifest };
}

const ADMITTED_ASSENT = ["ASSENTED", "NOT_ASSENTED", "MISSING", "UNKNOWN"];
const ADMITTED_AGGREGATE = ["FULL", "PARTIAL", "MISSING", "UNKNOWN"];

/**
 * Derive the eight status labels from a loaded ADAL/1 package. Each label is
 * computed from real package fields; every computation that cannot be made
 * fail-closed. Returns { labels, checks } — checks carry the per-label evidence
 * path so tests can assert honest derivation.
 */
export function deriveLabels(pkg) {
  const checks = [];
  const fail = (name, detail) => {
    checks.push({ name, ok: false, detail });
  };
  const pass = (name, detail) => {
    checks.push({ name, ok: true, detail });
  };

  // record — protocol identity
  const recordOk = pkg.protocolVersion === "ADAL/1" && typeof pkg.packageVersion === "string";
  if (recordOk) {
    pass("record", `ADAL/1 record (protocolVersion=${pkg.protocolVersion})`);
  } else {
    fail("record", `protocolVersion must be ADAL/1, got ${JSON.stringify(pkg.protocolVersion)}`);
  }
  const record = recordOk ? "ADAL/1" : null;

  // consent — EVP/1 labels, never converted
  const c = pkg.evidence?.consent;
  const agg = c?.modeledAssent;
  const pA = c?.parties?.principalA?.assent;
  const pB = c?.parties?.principalB?.assent;
  const consentOk =
    ADMITTED_AGGREGATE.includes(agg) &&
    typeof agg === "string" &&
    ADMITTED_ASSENT.includes(pA) &&
    ADMITTED_ASSENT.includes(pB) &&
    Array.isArray(c?.modeledAssentDerivedFrom);
  if (consentOk) {
    pass("consent", `EVP/1 labels verified (aggregate=${agg}, A=${pA}, B=${pB}, not converted)`);
  } else {
    fail("consent", `consent labels incomplete or malformed (aggregate=${JSON.stringify(agg)})`);
  }
  const consent = consentOk ? "VERIFIED_LABELS" : null;

  // execution — core-mainnet receipt present
  const ex = pkg.evidence?.execution;
  const txOk =
    ex?.network === "core-mainnet" &&
    ex?.chainId === "1116" &&
    typeof ex?.txHash === "string" &&
    /^0x[0-9a-fA-F]{64}$/.test(ex.txHash ?? "") &&
    typeof ex?.receipt?.status === "string";
  if (txOk) {
    pass("execution", `core-mainnet receipt present (chainId=${ex.chainId}, tx=${ex.txHash})`);
  } else {
    fail("execution", `core-mainnet execution receipt missing/malformed`);
  }
  const execution = txOk ? "CORE_MAINNET_RECEIPT" : null;

  // evidence — pins verified via the ADAL/1 verifier path
  const st = ex?.compensationSettlement;
  const pinOk =
    typeof st?.evidenceStatus === "string" &&
    typeof st?.actualStatus === "string" &&
    !("status" in (st ?? {})) &&
    Array.isArray(pkg.evidence?.unknowns);
  if (pinOk) {
    pass("evidence", `evidence labels + unknowns pinned; evidenceStatus/actualStatus split present`);
  } else {
    fail("evidence", `evidence pin/label structure incomplete`);
  }
  const evidence = pinOk ? "SHA256_PINNED" : null;

  // award — never prefilled by CoreGuard; must come from an external adjudicator
  const a = pkg.awardSlot ?? {};
  const awardOk =
    a.status === "UNKNOWN" && a.signedReasonedAward === null && a.adjudicator === "NONE";
  if (awardOk) {
    pass("award", `award slot UNKNOWN; adjudicator NONE; award is an external artifact`);
  } else {
    fail("award", `award slot must be UNKNOWN/NONE, not prefilled`);
  }
  const award = awardOk ? "EXTERNAL" : null;

  // authority — derived candidate from consent parties, never live
  const partiesOk = c?.parties?.principalA?.principalAddress && c?.parties?.principalB?.principalAddress;
  const authority = partiesOk && consentOk ? "DERIVED" : null;
  if (authority) {
    pass("authority", `authority candidate DERIVED from consent parties (modeled, not live)`);
  } else {
    fail("authority", `authority requires derived consent parties`);
  }

  // settlement — authority-bound, escrow reference-only
  const e = pkg.escrowRef ?? {};
  const settlementOk =
    e.deployed === false && e.chain === "none" && e.kind === "REFERENCE_INTERFACE" && awardOk;
  if (settlementOk) {
    pass("settlement", `settlement AUTHORITY_BOUND: escrow reference-only; award unknown; no execution scoped`);
  } else {
    fail("settlement", `settlement binding must be authority-bound with reference-only escrow`);
  }
  const settlement = settlementOk ? "AUTHORITY_BOUND" : null;

  const labels = { authority, consent, execution, evidence, record, award, settlement };
  const networkCall = "NOT_PERFORMED";
  const complete = Object.values(labels).every((v) => v !== null);

  return { labels: { ...labels, "network-call": networkCall }, checks, complete };
}

/** Build the four mapped candidates (authority, consent, evidence-export, settlement-binding). */
export function buildMappings(pkg, manifest) {
  const c = pkg.evidence.consent;
  const ex = pkg.evidence.execution;

  const packageRevision = manifest.files?.["dispute-package.json"] ?? null;

  const authority = {
    kind: "AUTHORITY_GRANT_CANDIDATE",
    derivedFrom: "ADO.layers consent.parties (modeled) — DERIVED, not live authority",
    principal: c.parties.principalA.principalAddress,
    counterparty: c.parties.principalB.principalAddress,
    role: c.parties.principalA.role,
    withinStatedAuthority: c.parties.principalA.withinStatedAuthority,
    confirmationRequired: true,
    label: "DERIVED",
    note: "A live authority grant additionally requires an authorized People's Court credential and the platform's confirmation binding (actorId/principalId + digest-bound statement).",
  };

  const consentArtifact = {
    kind: "CONSENT_ARTIFACT_CANDIDATE",
    derivedFrom: "evidence.consent.modeledAssent + parties",
    scopeRef: c.scopeRef,
    agreementVersion: c.agreementVersion,
    modeledAssent: c.modeledAssent,
    perPartyAssent: {
      principalA: c.parties.principalA.assent,
      principalB: c.parties.principalB.assent,
    },
    artifactIds: null,
    label: "VERIFIED_LABELS",
    note: "modeledAssent is an EVP/1 derived tri-state; it is never converted into an assertion of bilateral real-world consent. Artifact IDs are assigned by the platform after evidence submission.",
  };

  const evidenceExport = {
    kind: "EVIDENCE_EXPORT_CANDIDATE",
    packageRevision,
    execution: {
      network: ex.network,
      chainId: ex.chainId,
      txHash: ex.txHash,
      receipt: { status: ex.receipt?.status ?? null, blockNumber: ex.receipt?.blockNumber ?? null },
    },
    pins: manifest.files ?? {},
    canonicalization: "RFC 8785",
    unknowns: pkg.evidence.unknowns ?? [],
    label: "SHA256_PINNED",
    note: "evidenceExporter-style export: canonical manifest with individually pinned, verifiable artifacts. Authenticity challenges affect contested weight at adjudication, never automatic exclusion.",
  };

  const settlementBinding = {
    kind: "SETTLEMENT_BINDING_CANDIDATE",
    awardStatus: pkg.awardSlot.status,
    adjudicator: pkg.awardSlot.adjudicator,
    escrow: { deployed: pkg.escrowRef.deployed, chain: pkg.escrowRef.chain, kind: pkg.escrowRef.kind },
    allowedActions: [],
    executionBoundary:
      "An Award does not move money. Execution is separate and requires a settlement adapter credential scoped to exactly these actions within this authority corpus. decision_served never triggers execution without that separately scoped credential.",
    label: "AUTHORITY_BOUND",
    note: "CoreGuard escrow is reference-only in this record. No settlement instruction may be issued without a real signed award over this package's bytes and an authority-bound credential.",
  };

  return { authority, consentArtifact, evidenceExport, settlementBinding };
}

/** Validate the four mapped candidates against the packaged schemas. */
export function validateMappings(mappings) {
  const schemas = {};
  for (const name of ["authority", "consent", "evidence-export", "settlement-binding"]) {
    schemas[name] = JSON.parse(
      readFileSync(join(HERE, "schemas", `${name}.json`), "utf8"),
    );
  }
  const results = {
    authority: validateSchema(mappings.authority, schemas.authority),
    consentArtifact: validateSchema(mappings.consentArtifact, schemas.consent),
    evidenceExport: validateSchema(mappings.evidenceExport, schemas["evidence-export"]),
    settlementBinding: validateSchema(mappings.settlementBinding, schemas["settlement-binding"]),
  };
  return {
    ok: Object.values(results).every((r) => r.ok),
    results,
  };
}

/**
 * Build the dry-run expected-request + expected-response fixtures. `generatedAtUtc`
 * is carried from the package (deterministic) when present.
 */
export function buildFixtures(pkg, mappings, labels) {
  const generatedAtUtc = pkg.generatedAtUtc ?? "2026-09-24T12:00:00Z";

  const expectedRequest = {
    dryRun: true,
    fixtureVersion: FIXTURE_VERSION,
    protocol: ADAPTER_PROTOCOL,
    generatedAtUtc,
    generatedBy: "packages/peoples-court-adapter/adapter.mjs",
    targetSurface:
      "People's Court Partner API v2 + @peoples-court/x402-disputes (publicly documented surface; referenced, not invoked)",
    labels,
    endpoints: [
      {
        method: "POST",
        path: "/api/v2/authorizations/authority-grants",
        purpose: "live authority grant binding (actorId/principalId + digest-bound statement)",
        note: "mapped object is a DERIVED candidate; live grant requires authorized credential",
      },
      {
        method: "POST",
        path: "/api/v2/authorizations/consents",
        purpose: "consent artifact registration scoped to the pinned agreement",
        note: "artifact IDs are assigned by the platform after submission",
      },
      {
        method: "POST",
        path: "/api/v2/evidence/exports",
        purpose: "evidenceExporter export of the canonical, pinned evidence manifest",
        note: "RFC 8785 canonical manifest; artifacts individually pinned and verifiable",
      },
      {
        method: "POST",
        path: "/api/v2/settlements/bindings",
        purpose: "authority-bound settlement binding naming allowed actions + authority corpus",
        note: "an Award does not move money; execution needs a separately scoped settlement credential",
      },
      {
        method: "POST",
        path: "x402-disputes: adjudication.prepare()",
        purpose:
          "dispute declaration + consent-aware adjudication initiation (idempotencyKey, authorityGrantId, consentArtifactIds)",
        note: "packet integrity + party/amount bindings verified before transport",
      },
    ],
    rulesPin: {
      rulesetId: "pending-assignment",
      rulesVersion: "pending-assignment",
      rulesHash: "pending-assignment",
      note: "the platform's governing Rules are pinned at submission; CoreGuard records the reference, it does not author the rules.",
    },
    mappings,
    bodyRef: "expected-request-body.json",
    credentialsRequired: [
      { name: "channelToken", purpose: "authenticated channel to the Partner API", status: "NOT_PROVIDED" },
      {
        name: "settlementAdapterCredential",
        purpose: "separately scoped settlement execution credential",
        status: "NOT_PROVIDED",
      },
    ],
    networkCall: "NOT_PERFORMED",
    disclaimer:
      "This is a dry-run structural template, not a live submission. No credential is embedded, no network call is made, and no settlement authority is asserted or implied.",
  };

  const expectedResponse = {
    dryRun: true,
    fixtureVersion: FIXTURE_VERSION,
    expectedShape:
      "acknowledgement shape per the publicly documented Partner API v2; this is the EXPECTED response shape, not a live response.",
    fields: [
      { name: "packageRevision", description: "pinned coreguard package revision the platform received" },
      { name: "confirmationReference", description: "platform confirmation reference for the case" },
      { name: "consentArtifactIds", description: "artifact IDs assigned by the platform" },
      { name: "status", value: "RECEIVED_FOR_REVIEW", description: "ack receipt only; not an adjudication or settlement" },
      { name: "rulesPin", description: "rulesetId + rulesVersion + rulesHash pinned at submission" },
      { name: "webhookEventIds", description: "at-least-once webhook events with eventId dedup + sequence cursor" },
    ],
    accepted: false,
    verified: false,
    submitted: false,
    networkCall: "NOT_PERFORMED",
    note: TRIBUNAL_NOTE,
  };

  return { expectedRequest, expectedResponse };
}

/**
 * Full dry-run preparation pipeline:
 *   1. verify the ADAL/1 package (fail-closed) — nothing is emitted on failure
 *   2. load + derive the eight labels
 *   3. build + schema-validate the four mappings
 *   4. build the fixtures
 *   5. emit expected-request.json, expected-response.json, adapter-report.json
 *
 * Returns { ok, labels, checks, mappings, validation, fixtures, outDir, exit }.
 * Never touches the network; `network-call: NOT_PERFORMED` is invariant.
 */
export function prepareDryRun({ caseDir, outDir }) {
  const v = verifyPackage(caseDir);
  if (!v.ok) {
    return {
      ok: false,
      stage: "verify",
      detail: `ADAL/1 verification failed (status ${v.status}); nothing emitted. ${v.stdout}${v.stderr}`.trim(),
      outDir: null,
    };
  }

  const { pkg, manifest } = loadPackage(caseDir);
  const { labels, checks, complete } = deriveLabels(pkg);
  if (!complete) {
    return {
      ok: false,
      stage: "labels",
      detail: `label derivation failed: ${checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`).join("; ")}`,
      checks,
      outDir: null,
    };
  }

  const mappings = buildMappings(pkg, manifest);
  const validation = validateMappings(mappings);
  if (!validation.ok) {
    const flat = Object.entries(validation.results)
      .filter(([, r]) => !r.ok)
      .map(([k, r]) => `${k}: ${r.errors.join("; ")}`);
    return {
      ok: false,
      stage: "schema",
      detail: `mapping schema validation failed: ${flat.join(" / ")}`,
      checks,
      outDir: null,
    };
  }

  const { expectedRequest, expectedResponse } = buildFixtures(pkg, mappings, labels);
  const report = {
    protocol: ADAPTER_PROTOCOL,
    fixtureVersion: FIXTURE_VERSION,
    generatedAtUtc: pkg.generatedAtUtc ?? expectedRequest.generatedAtUtc,
    case: basename(caseDir),
    labels,
    stage: "PEOPLES_COURT_ADAPTER_READY",
    networkCall: "NOT_PERFORMED",
    disclaimer:
      "Structural dry-run mapping to the publicly documented People's Court Partner API v2 + x402 dispute surface. No live call; no credential embedded; no settlement authority asserted.",
    rulesPin: expectedRequest.rulesPin,
    files: OUT_FILES,
  };

  writeFileSync(join(outDir, "expected-request.json"), JSON.stringify(expectedRequest, null, 2) + "\n");
  writeFileSync(join(outDir, "expected-response.json"), JSON.stringify(expectedResponse, null, 2) + "\n");
  writeFileSync(join(outDir, "adapter-report.json"), JSON.stringify(report, null, 2) + "\n");

  return {
    ok: true,
    stage: "PEOPLES_COURT_ADAPTER_READY",
    labels,
    checks,
    mappings,
    validation,
    fixtures: { expectedRequest, expectedResponse },
    outDir,
  };
}