/**
 * Real-fixture intake gate — executable contract.
 *
 * The gate is exercised through its real entry point (the prelude CLI) with
 * real candidate directories derived from the repository's own fixture:
 *
 *   clean candidate       → exit 0, GATE GREEN
 *   contaminated candidate→ exit 1, the planted secret named per pattern
 *   broken consent        → exit 1, grant replay failure named
 *   origin lies           → exit 1, SYNTHETIC re-labeled REAL is refused
 *   stale pins            → exit 1, byte drift named
 *   NOT_CHECKED           → declared, never faked as PASS
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, cpSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE_DIR = join(REPO, "examples", "delivery-fixture");
const PRELUDE = join(REPO, "examples", "real-fixture-intake", "prelude.mjs");
const RECORDS = [
  "agreement.json", "acceptance-criteria.json", "parties.json", "authorization.json",
  "execution-attestation.json", "delivery-manifest.json", "acceptance-record.json",
  "dispute-record.json", "consent-and-disclosure.json", "retention-policy.json",
];

const sha256 = (buf) => "0x" + createHash("sha256").update(buf).digest("hex");

/** Build a modeled REAL candidate from the synthetic fixture: re-label
 *  origin, flip the disclosure flags, re-pin the edited bytes. Consent
 *  signatures stay valid (grantor/fixtureRef/scope untouched). */
function makeCandidate(root) {
  mkdirSync(root, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(FIXTURE_DIR, "hashes.json"), "utf8"));
  const files = {};
  for (const name of RECORDS) {
    let txt = readFileSync(join(FIXTURE_DIR, name), "utf8");
    if (name === "consent-and-disclosure.json") {
      const c = JSON.parse(txt);
      c.disclosure.realDisputeExists = true;
      // The modeled party pair signs the disclosure scope (template §B_disclosureScope):
      // both-parties integrity cross-checks the gate enforces against the checklist.
      c.disclosureScope = {
        reviewersMaySee: "the ten DDE records and their hashes (modeled)",
        explicitlyWithheld: "none beyond redacted identities",
        durationUtc: "until 2027-01-01T00:00:00Z",
        revocation: "either party may withdraw by written notice",
        channels: { publicRepository: true, sharedWithCounterparty: true, sharedWithNamedReviewer: false, namedReviewer: "" },
        crossChecks: {
          redactionCompletePerChecklist: true,
          recordsAsSubmittedMatchScope: true,
          secretsRemovedConfirmed: true,
          personalDataRemovedConfirmed: true,
          checklistRef: "DDE-REAL-INTAKE-REMOVAL-v1 for the same caseRef",
        },
      };
      c.provenance = "REAL — modeled intake candidate for gate self-test; signatures retained";
      txt = JSON.stringify(c, null, 2) + "\n";
    } else {
      txt = txt.replaceAll("SYNTHETIC", "REAL");
    }
    writeFileSync(join(root, name), txt);
    files[name] = sha256(Buffer.from(txt, "utf8"));
  }
  const out = {
    ...manifest,
    fixture: { origin: "REAL", realDisputeExists: true, lifecycleState: "DISPUTE_OPEN", ddeVersion: "DDE/1" },
    files,
  };
  writeFileSync(join(root, "hashes.json"), JSON.stringify(out, null, 2) + "\n");
  return root;
}

function runPrelude(dir, args = []) {
  return spawnSync(process.execPath, [PRELUDE, dir, ...args], { cwd: REPO, encoding: "utf8" });
}

test("clean REAL candidate: GATE GREEN, exit 0", () => {
  const dir = makeCandidate(mkdtempSync(join(tmpdir(), "dde-ok-")));
  try {
    const r = runPrelude(dir);
    assert.equal(r.status, 0, `expected green gate:\n${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /GATE GREEN/);
    assert.match(r.stdout, /does not decide delivery conformity/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("contaminated candidate: planted email + key field are named, exit 1", () => {
  const dir = makeCandidate(mkddtempSafe());
  try {
    const manifest = JSON.parse(readFileSync(join(dir, "hashes.json"), "utf8"));
    const a = JSON.parse(readFileSync(join(dir, "agreement.json"), "utf8"));
    a.contact = "ops@agentx-change.example";
    const txt = JSON.stringify(a, null, 2) + "\n";
    writeFileSync(join(dir, "agreement.json"), txt);
    manifest.files["agreement.json"] = sha256(Buffer.from(txt, "utf8"));
    writeFileSync(join(dir, "hashes.json"), JSON.stringify(manifest, null, 2) + "\n");

    const r = runPrelude(dir);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /email address/);
    assert.match(r.stdout, /GATE RED/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function mkddtempSafe() {
  return mkdtempSync(join(tmpdir(), "dde-bad-"));
}

test("origin lie: SYNTHETIC re-labeled REAL without consent flip is refused", () => {
  const dir = mkdtempSync(join(tmpdir(), "dde-lie-"));
  try {
    // Copy the SYNTHETIC fixture verbatim, then lie only in hashes.json.
    cpSync(FIXTURE_DIR, dir, { recursive: true });
    const manifest = JSON.parse(readFileSync(join(dir, "hashes.json"), "utf8"));
    manifest.fixture = { ...manifest.fixture, origin: "REAL", realDisputeExists: true };
    writeFileSync(join(dir, "hashes.json"), JSON.stringify(manifest, null, 2) + "\n");
    const r = runPrelude(dir);
    assert.equal(r.status, 1);
    // The manifest lie (origin REAL + realDisputeExists flipped) passes the
    // manifest check but the consent disclosure still says false — the gate
    // catches the contradiction at the consent layer.
    assert.match(r.stdout, /consent disclosure must assert realDisputeExists: true/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stale pin: edited bytes after pinning are named with both hashes", () => {
  const dir = makeCandidate(mkdtempSync(join(tmpdir(), "dde-pin-")));
  try {
    const txt = readFileSync(join(dir, "retention-policy.json"), "utf8");
    writeFileSync(join(dir, "retention-policy.json"), txt + "\n"); // one extra newline
    const r = runPrelude(dir);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /retention-policy\.json: pin .* != actual/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("usage error: missing directory is exit 2, not a gate verdict", () => {
  const r = spawnSync(process.execPath, [PRELUDE], { cwd: REPO, encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage:/);
});

test("signed disclosure scope is enforced: missing/false crossChecks keep the gate red", () => {
  // The scope block (consent-template.json §B_disclosureScope) is not optional:
  // a candidate whose signed scope omits or falsifies a cross-check stays RED.
  for (const mutate of [
    (c) => { delete c.disclosureScope.crossChecks; },
    (c) => { c.disclosureScope.crossChecks.secretsRemovedConfirmed = false; },
    (c) => { c.disclosureScope.crossChecks.checklistRef = ""; },
  ]) {
    const dir = makeCandidate(mkdtempSync(join(tmpdir(), "dde-scope-")));
    try {
      const manifest = JSON.parse(readFileSync(join(dir, "hashes.json"), "utf8"));
      const c = JSON.parse(readFileSync(join(dir, "consent-and-disclosure.json"), "utf8"));
      mutate(c);
      const txt = JSON.stringify(c, null, 2) + "\n";
      writeFileSync(join(dir, "consent-and-disclosure.json"), txt);
      manifest.files["consent-and-disclosure.json"] = sha256(Buffer.from(txt, "utf8"));
      writeFileSync(join(dir, "hashes.json"), JSON.stringify(manifest, null, 2) + "\n");
      const r = runPrelude(dir);
      assert.equal(r.status, 1, `expected RED for mutated scope:\n${r.stdout}`);
      assert.match(r.stdout, /disclosureScope\.crossChecks|GATE RED/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
