#!/usr/bin/env node
/**
 * make-intake-candidate.mjs — build the modeled REAL intake candidate.
 *
 * The single source of truth for the modeled-REAL candidate shape (derived
 * from the repository's synthetic fixture: origin re-labeled, disclosure
 * flags flipped, the consent-template §B_disclosureScope scope signed in,
 * pins re-hashed over the edited bytes — consent signatures untouched).
 *
 * Two consumers, one shape:
 *   - CI (workflows/intake.yml) builds the candidate it exercises the
 *     pipeline against — the full path is under continuous surveillance.
 *   - test/delivery/intake-candidate.js re-exports `makeCandidate` from
 *     here, so the contract tests judge the SAME bytes CI builds (no
 *     test-private copy of the candidate can drift away from CI's).
 *
 * Usage:
 *   node examples/real-fixture-intake/make-intake-candidate.mjs <out-dir>
 *     exit 0 — candidate written (ten records + hashes.json, GATE GREEN by construction)
 *     exit 2 — usage error
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(HERE, "..", "delivery-fixture");

export const RECORDS = [
  "agreement.json", "acceptance-criteria.json", "parties.json", "authorization.json",
  "execution-attestation.json", "delivery-manifest.json", "acceptance-record.json",
  "dispute-record.json", "consent-and-disclosure.json", "retention-policy.json",
];

export const sha256 = (buf) => "0x" + createHash("sha256").update(buf).digest("hex");

/**
 * Build the modeled REAL candidate into `root` (created if needed) and
 * return `root`. Modeled provenance: the parties, delivery, and dispute are
 * REAL-labeled exercise data built from the synthetic fixture's schema —
 * "REAL" here asserts the candidate's SHAPE for gate/tooling testing; the
 * modeled origin is stated in provenance fields, never passed off as an
 * actual case (the prelude's own disclosure checks apply verbatim).
 */
export function makeCandidate(root = mkdtempSync(join(tmpdir(), "dde-candidate-"))) {
  mkdirSync(root, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(FIXTURE_DIR, "hashes.json"), "utf8"));
  const files = {};
  for (const name of RECORDS) {
    let txt = readFileSync(join(FIXTURE_DIR, name), "utf8");
    if (name === "consent-and-disclosure.json") {
      const c = JSON.parse(txt);
      c.disclosure.realDisputeExists = true;
      // The modeled party pair signs the disclosure scope (template
      // §B_disclosureScope): the both-parties integrity cross-checks the
      // gate enforces against the checklist.
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

// ------------------------------------------------------------- CLI entry

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const usage = (msg) => {
    console.error(`usage: make-intake-candidate.mjs <out-dir>\n  ${msg}\n  builds the modeled REAL candidate (ten records + hashes.json) used by CI's intake surveillance run and the intake contract tests.`);
    process.exit(2);
  };
  if (argv.length !== 1) usage("exactly one argument required: <out-dir>");
  const outDir = resolve(argv[0]);
  if (existsSync(outDir) && existsSync(join(outDir, "hashes.json"))) {
    usage(`output already holds a candidate: ${outDir} — never overwrites (fail-closed)`);
  }
  makeCandidate(outDir);
  const line = "─".repeat(64);
  console.log(line);
  console.log("make-intake-candidate: modeled REAL candidate written");
  console.log(line);
  console.log(`  out-dir : ${outDir}`);
  console.log(`  records : ${RECORDS.length} + hashes.json (pins over the written bytes)`);
  console.log("  next    : node examples/real-fixture-intake/prelude.mjs " + outDir);
  console.log(line);
  process.exit(0);
}
