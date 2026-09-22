/**
 * Shared candidate builder for the real-fixture intake contract tests.
 *
 * Builds a modeled REAL candidate from the repository's synthetic fixture:
 * re-labels origin, flips the disclosure flags, adds the signed disclosure
 * scope (consent-template §B_disclosureScope), and re-pins the edited
 * bytes. Consent signatures stay valid (grantor/fixtureRef/scope untouched).
 *
 * Single source of truth: every intake test (intake.test.js) and every
 * converter-feature test (convert-zip.test.js) builds its candidate from
 * here, so a fixture drift changes all tests together instead of one
 * quietly pinning a stale shape.
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE_DIR = join(REPO, "examples", "delivery-fixture");

export const RECORDS = [
  "agreement.json", "acceptance-criteria.json", "parties.json", "authorization.json",
  "execution-attestation.json", "delivery-manifest.json", "acceptance-record.json",
  "dispute-record.json", "consent-and-disclosure.json", "retention-policy.json",
];

export const sha256 = (buf) => "0x" + createHash("sha256").update(buf).digest("hex");

/** Build a modeled REAL candidate from the synthetic fixture. */
export function makeCandidate(root = mkdtempSync(join(tmpdir(), "dde-candidate-"))) {
  const manifest = JSON.parse(readFileSync(join(FIXTURE_DIR, "hashes.json"), "utf8"));
  const files = {};
  for (const name of RECORDS) {
    let txt = readFileSync(join(FIXTURE_DIR, name), "utf8");
    if (name === "consent-and-disclosure.json") {
      const c = JSON.parse(txt);
      c.disclosure.realDisputeExists = true;
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
