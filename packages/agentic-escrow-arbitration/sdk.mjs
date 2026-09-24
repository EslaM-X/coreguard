#!/usr/bin/env node
/**
 * sdk.mjs — AEA/1 (Agentic Escrow & Arbitration Standard) reference SDK.
 *
 * Deterministic, offline boundary record that ties a VERIFIED ADAL/1 dispute
 * package to:
 *   - an escrow-contract reference interface (deployed:false, chain:"none"), and
 *   - a tribunal submission surface (structural template, NOT_BUILT).
 *
 * What this SDK does NOT do (by design, verified by its own verifier):
 *   - does NOT adjudicate: the award slot stays UNKNOWN, adjudicator NONE
 *   - does NOT settle: settlement authorizationStatus is NOT_AUTHORIZED and no
 *     fund/action/broadcast is performed or claimed
 *   - does NOT send anything to any API: networkCall is NOT_PERFORMED
 *
 * Determinism: fixed structure, no Date.now(), no randomness, no network — two
 * runs on the same input produce byte-identical output.
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const VERIFY_DISPUTE = join(
  REPO,
  "examples",
  "delivery-fixture",
  "pairs",
  "dispute-package",
  "verify-dispute-package.mjs",
);

export const AEA1 = "AEA/1";
export const AEA1_PACKAGE_VERSION = "0.1.0";
export const AEA1_NOTE =
  "AEA/1 boundary record: connects a verified ADAL/1 dispute package to an escrow-contract reference interface and a tribunal submission surface. It does not adjudicate, settle, broadcast, or claim any integration.";

export const OUT_FILES = [
  "aea1-boundary.json",
  "escrow-interface.json",
  "aea1-report.json",
  "aea1-hashes.json",
];

/** SHA-256 pin helper (same convention as the dispute-package manifest). */
export function sha256(bytes) {
  return "0x" + createHash("sha256").update(bytes).digest("hex");
}

function readV(rel) {
  return { path: rel, bytes: readFileSync(rel) };
}

/** Re-verify the ADAL/1 dispute package fail-closed (cwd = the package dir). */
export function verifyDisputePackage(caseDir) {
  const r = spawnSync(process.execPath, [VERIFY_DISPUTE], {
    cwd: caseDir,
    encoding: "utf8",
  });
  const ok = r.status === 0 && /DISPUTE_PACKAGE OK/.test(r.stdout ?? "");
  return {
    ok,
    status: r.status,
    out: `${r.stdout ?? ""}${r.stderr ?? ""}`,
  };
}

/** Build the escrow-contract reference interface for the standard. */
export function buildEscrowInterface(pkg) {
  const authorityCorpus = pkg?.agreement?.authorityCorpus ?? "authority corpus of the pinned agreement/remedy scope";
  return {
    protocolVersion: AEA1,
    packageVersion: AEA1_PACKAGE_VERSION,
    kind: "ESCROW_REFERENCE_INTERFACE",
    deployed: false,
    chain: "none",
    authoredBy: "AEA/1 record producer (synthetic)",
    authorityCorpus,
    contractSurface: [
      {
        method: "deposit",
        role: "counterparty",
        note: "locks the obligated value under a pinned agreement reference",
      },
      {
        method: "lockForDispute",
        role: "counterparty",
        note: "freezes the record once an ADAL/1 dispute package closes",
      },
      {
        method: "executeSettlement",
        authorityBound: true,
        note: "executes ONLY with a verified external award plus a separately scoped authority-bound credential — never on the record alone",
      },
      {
        method: "refund",
        authorityBound: true,
        note: "returns value only under an executed award/authority path or a closed no-dispute window",
      },
    ],
    settlementGate:
      "Award ≠ execution. A decision_served record never triggers execution without a separately scoped settlement-adapter credential (the tribunal's own documented rule, mirrored here).",
    note: "Reference interface only. No contract is deployed, signed, or broadcast by this protocol; a real deployment requires the owner's separate explicit sign-off (governance CONDITIONAL NO-GO on signing/broadcast is unchanged).",
  };
}

/** Build the tribunal submission surface template (structural, NOT_BUILT). */
export function buildTribunalSurface(pkg) {
  return {
    integrationStatus: "NOT_BUILT",
    surface: "structural mapping to the publicly documented tribunal surface (Partner API v2 + x402 dispute extension)",
    networkCall: "NOT_PERFORMED",
    submissionTemplate: {
      method: "adjudication.prepare (documented)",
      idempotencyKey: "derived deterministically from packageRevision",
      authorityGrantId: "AUTHORITY_GRANT_REQUIRED (not held)",
      consentArtifactIds: pkg?.evidence?.consent?.artifactIds ?? [],
    },
    consumers: [],
    note: "No credential, no live call, no submission. A credential-holding integrator performs the live step; this record only shapes the packet.",
  };
}

/**
 * Build the full AEA/1 boundary record from a delivered, verified dispute
 * package dir. Deterministic. Write artifacts into outDir.
 * Returns { ok, stage, detail, checks } — fail-closed.
 */
export function prepareAea1({ caseDir, outDir }) {
  const checks = [];
  const fail = (stage, detail) => ({ ok: false, stage, detail, checks });

  const v = verifyDisputePackage(caseDir);
  if (!v.ok) {
    return fail("verify", `ADAL/1 dispute package failed verification (status ${v.status}): ${v.out.trim().slice(0, 400)}`);
  }
  checks.push("package verified (ADAL/1, fail-closed, pins match)");

  const pkgPath = join(caseDir, "dispute-package.json");
  const hashesPath = join(caseDir, "dispute-hashes.json");
  if (!existsSync(pkgPath) || !existsSync(hashesPath)) {
    return fail("input", "dispute-package.json + dispute-hashes.json required in the case dir");
  }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const manifest = JSON.parse(readFileSync(hashesPath, "utf8"));
  const packageRevision = manifest.files?.["dispute-package.json"] ?? null;
  if (!packageRevision) return fail("input", "dispute-hashes.json must pin dispute-package.json");

  const boundary = {
    protocolVersion: AEA1,
    packageVersion: AEA1_PACKAGE_VERSION,
    synthetic: true,
    origin: "SYNTHETIC",
    caseRef: pkg.caseRef ?? null,
    packageRevision,
    escrow: {
      kind: "REFERENCE_INTERFACE",
      deployed: false,
      chain: "none",
      note: "No contract is deployed or signed. The interface target is in escrow-interface.json.",
    },
    award: {
      status: "UNKNOWN",
      adjudicator: "NONE",
      signedReasonedAward: null,
      note: "A genuine award is a signed reason from an external adjudicator over the package bytes; CoreGuard never fills this slot.",
    },
    settlement: {
      authorizationStatus: "NOT_AUTHORIZED",
      executionNote:
        "Execution requires a separately scoped authority-bound credential held by a credential-holding integrator. This record holds no credential, performs no broadcast, and moves no funds.",
      funds: "NONE_MOVED",
    },
    adapter: buildTribunalSurface(pkg),
    boundary: AEA1_NOTE,
  };

  const escrowInterface = buildEscrowInterface(pkg);

  const report = {
    protocolVersion: AEA1,
    packageVersion: AEA1_PACKAGE_VERSION,
    caseRef: pkg.caseRef ?? null,
    packageRevision,
    decision: "AEA1_BOUNDARY_READY",
    boundary: AEA1_NOTE,
    checks,
  };

  const files = [
    ["aea1-boundary.json", boundary],
    ["escrow-interface.json", escrowInterface],
    ["aea1-report.json", report],
  ];

  for (const [name, obj] of files) {
    writeFileSync(join(outDir, name), JSON.stringify(obj, null, 2) + "\n");
  }

  const pins = {};
  for (const [name, obj] of files) {
    pins[name] = sha256(readFileSync(join(outDir, name)));
  }
  const hashes = {
    protocolVersion: AEA1,
    packageVersion: AEA1_PACKAGE_VERSION,
    manifest: { selfExcluded: ["aea1-hashes.json"] },
    files: pins,
  };
  writeFileSync(join(outDir, "aea1-hashes.json"), JSON.stringify(hashes, null, 2) + "\n");

  return { ok: true, stage: "aea1-ready", detail: "AEA1_BOUNDARY_READY", checks, boundary, escrowInterface, report, hashes };
}

/**
 * A10 gate — V9-style no-overclaim check over the boundary's text field.
 *
 * The boundary MUST negate any establishment of authority/payment/merits AND
 * MUST NOT carry a POSITIVE assertion of one. The affirms arm anchors each
 * positive phrase to an adjacent subject-verb ("settlement was executed"), so
 * a NEGATED clause can never satisfy it: "settlement was NOT executed" leaves
 * `not` between the subject and the verb, and "does not settle" uses the bare
 * infinitive — neither matches affirms, exactly as V9 intends. A naive bare
 * participle matcher (`(settle|adjudicat|execut)ed`) wrongly trips on those.
 */
export function boundaryTextNoOverclaim(text) {
  const b = String(text ?? "").toLowerCase();
  const negates = /\bno\b|never|does not|cannot/.test(b);
  const mentions = /adjudicat|settle|broadcast|integrat|credential|fund/.test(b);
  // The `(?<!no )` lookbehind keeps a "no settlement was executed" style
  // clause negated: the `no` precedes the SUBJECT, so the phrase is not an
  // assertion of fact. A genuine positive ("the settlement was executed")
  // has no preceding `no` and is caught.
  const affirms =
    /(is|are) (an? )?(adjudicator|integration|settlement|credential|escrow)|(?<!no )(settlement|award|payment|transfer|funds?|broadcast) (is|was|were|has been|had been) (executed|settled|paid|moved|released|transferred|authorized|granted|broadcast)|authorizes (the )?(deal|transfer|settlement|release)|(merits|dispute|claim) (resolved|decided|upheld)|(was|is) (sent|broadcast) to (the )?api/.test(b);
  return { ok: negates && mentions && !affirms, negates, mentions, affirms };
}

/**
 * Verify an emitted AEA/1 boundary record (fail-closed). Mirrors the
 * dispute-package verifier conventions: every invariant must pass.
 * Returns { ok, checks, failures }.
 */
export function verifyAea1(outDir) {
  const checks = [];
  const failures = [];
  const check = (name, ok, detail) => {
    checks.push({ name, ok, detail });
    if (!ok) failures.push(`${name}: ${detail}`);
  };

  const p = (f) => join(outDir, f);
  const hashes = JSON.parse(readFileSync(p("aea1-hashes.json"), "utf8"));
  const boundary = JSON.parse(readFileSync(p("aea1-boundary.json"), "utf8"));

  for (const [name, pin] of Object.entries(hashes.files ?? {})) {
    if (!existsSync(p(name))) {
      check(`A1::${name}`, false, "file missing from the emitted tree");
      continue;
    }
    const actual = sha256(readFileSync(p(name)));
    check(`A1::${name}`, actual === pin, `pin mismatch (${actual} != ${pin})`);
  }

  check("A2::protocol", boundary.protocolVersion === AEA1, `protocolVersion must be ${AEA1}`);
  check("A3::synthetic", boundary.synthetic === true && boundary.origin === "SYNTHETIC", "boundary must be synthetic:true");
  check("A4::escrowReferenceOnly", boundary.escrow?.deployed === false && boundary.escrow?.chain === "none", "escrow must be reference-only (deployed:false, chain:none)");
  check("A5::awardUnknown", boundary.award?.status === "UNKNOWN" && boundary.award?.adjudicator === "NONE", "award slot must stay UNKNOWN/NONE");
  check("A6::settlementNotAuthorized", boundary.settlement?.authorizationStatus === "NOT_AUTHORIZED", "settlement authorizationStatus must be NOT_AUTHORIZED");
  check("A7::noFundsClaim", boundary.settlement?.funds === "NONE_MOVED", "no fund-movement claim may exist");
  check("A8::adapterNotBuilt", boundary.adapter?.integrationStatus === "NOT_BUILT", "adapter integrationStatus must be NOT_BUILT");
  check("A9::networkNotPerformed", boundary.adapter?.networkCall === "NOT_PERFORMED", "networkCall must be NOT_PERFORMED");
  // A10 mirrors V9's gate: the boundary MUST negate any establishment of
  // authority/payment/merits AND MUST NOT carry a POSITIVE assertion — via the
  // subject-adjacent affirms arm (never a bare `-ed` participle matcher).
  const t = boundaryTextNoOverclaim(boundary.boundary);
  check("A10::noOverclaim", t.ok, `boundary text must negate (not affirm) authority/payment/merits claims (negates=${t.negates} mentions=${t.mentions} affirms=${t.affirms})`);

  return { ok: failures.length === 0, checks, failures };
}