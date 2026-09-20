#!/usr/bin/env node
/**
 * prelude.mjs — the machine-checkable gate a REAL bilateral fixture must
 * pass BEFORE it is imported into the DDE fixture format.
 *
 * Reads a candidate intake directory and enforces the removal checklist's
 * machine subset (fail-closed):
 *
 *   secret-scan      — no private keys / mnemonics / bearer tokens / JWTs /
 *                      emails / phones anywhere in the candidate records
 *   origin truth     — fixture origin must be REAL, realDisputeExists true
 *   consent          — both parties' redaction grants present, fixtureRef
 *                      identical, signatures replay (E5 semantics)
 *   pin integrity    — every record's SHA-256 matches hashes.json
 *
 * Checks that cannot run offline are reported NOT_CHECKED — never PASS.
 *
 *   node examples/real-fixture-intake/prelude.mjs <candidate-dir> [--json]
 *
 * Exit contract: 0 = gate green (proceed to conversion) · 1 = findings
 * (list printed, nothing written) · 2 = usage error.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, basename } from "node:path";
import { redactionGrantDigest } from "../../packages/delivery/index.js";

const argv = process.argv.slice(2);
const jsonMode = argv.includes("--json");
const dir = argv.find((a) => !a.startsWith("--"));

if (!dir) {
  console.error("usage: prelude.mjs <candidate-dir> [--json]");
  process.exit(2);
}
let isDir = false;
try { isDir = statSync(dir).isDirectory(); } catch { isDir = false; }
if (!isDir) {
  console.error(`candidate directory not found: ${dir}`);
  process.exit(2);
}

const findings = [];
const notes = [];
const notChecked = [];

// ---------------------------------------------------------------- helpers

const add = (msg) => findings.push(msg);

const SECRET_PATTERNS = [
  { name: "mnemonic/seed-phrase field", re: /"(?:mnemonic|seed[_-]?phrase|recovery[_-]?phrase|private[_-]?key|privkey|secret[_-]?key)"\s*:/gi },
  { name: "bearer / api token assignment", re: /(?:bearer|api[_-]?key|apikey|access[_-]?token)\s*[:=]\s*["'][A-Za-z0-9._\-]{16,}["']/gi },
  { name: "openai-style key", re: /sk-[A-Za-z0-9]{20,}/g },
  { name: "JWT", re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: "email address", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  // Phone numbers: only flag an international (+prefix) form, or an unbroken
  // run of >= 11 digits. Timestamps (2026-09-24T09:30:00Z), wei amounts, and
  // SVG coordinates contain digit runs but never match these two shapes.
  { name: "phone number", re: /\+\d{1,3}[\d\s().-]{8,}\d|\d{11,}/g },
];

function scanForSecrets(obj, pathPrefix) {
  const hits = [];
  // Declared monetary amounts are structural DDE fields, not secrets — the
  // checklist's (HUMAN) amounts item governs whether to round them, and the
  // records must carry them for the boundary to be inspectable.
  const AMOUNT_LEAVES = /(?:valueWei|maxValueWei|compensationWei|payoutWei)$/i;
  const walk = (v, path) => {
    if (typeof v === "string") {
      const leaf = path.split(".").pop();
      if (AMOUNT_LEAVES.test(leaf)) return;
      for (const p of SECRET_PATTERNS) {
        p.re.lastIndex = 0;
        let m;
        while ((m = p.re.exec(v)) !== null) {
          hits.push({ path, pattern: p.name, sample: m[0].slice(0, 6) + "…" });
        }
      }
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}[${i}]`));
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (/signature/i.test(k) && typeof x === "object") continue; // r/s/v/digest containers
        walk(x, path ? `${path}.${k}` : k);
      }
    }
  };
  walk(obj, pathPrefix);
  return hits;
}

const sha256 = (buf) => "0x" + createHash("sha256").update(buf).digest("hex");

// ---------------------------------------------------------------- manifest

const manifestPath = join(dir, "hashes.json");
if (!existsSync(manifestPath)) {
  add("hashes.json missing — the candidate carries no pin manifest (fail-closed)");
} else {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    manifest = null;
    add(`hashes.json is not valid JSON: ${e.message}`);
  }
  if (manifest) {
    // ---- origin truth
    const fx = manifest.fixture || {};
    if (fx.origin !== "REAL") add(`fixture.origin must be "REAL" for intake (got ${JSON.stringify(fx.origin ?? null)})`);
    if (fx.realDisputeExists !== true) add("fixture.realDisputeExists must be true — the intake gate exists for real disputes only");
    if (fx.ddeVersion !== "DDE/1") add(`fixture.ddeVersion must be "DDE/1" (got ${JSON.stringify(fx.ddeVersion ?? null)})`);

    // ---- pin integrity
    const files = manifest.files || {};
    if (typeof files["hashes.json"] !== "undefined") add("hashes.json must not pin itself (single declared self-exclusion)");
    for (const [name, pin] of Object.entries(files)) {
      const p = join(dir, name);
      if (!existsSync(p)) { add(`pinned record missing on disk: ${name}`); continue; }
      const actual = sha256(readFileSync(p));
      if (actual !== pin) add(`${name}: pin ${pin.slice(0, 10)}… != actual ${actual.slice(0, 10)}… — bytes changed after pinning`);
    }
    if (Object.keys(files).length === 0) add("hashes.json pins no files");
  }
}

// ---------------------------------------------------- consent + E5 replay

const consentPath = join(dir, "consent-and-disclosure.json");
if (!existsSync(consentPath)) {
  add("consent-and-disclosure.json missing — real intake cannot proceed without both parties' grants");
} else {
  let consent;
  try {
    consent = JSON.parse(readFileSync(consentPath, "utf8"));
  } catch (e) {
    consent = null;
    add(`consent-and-disclosure.json is not valid JSON: ${e.message}`);
  }
  if (consent) {
    const grants = consent.redactionGrants || [];
    if (!Array.isArray(grants) || grants.length < 2) {
      add("both parties' redaction grants are required (found " + (grants.length || 0) + ")");
    } else {
      const refs = new Set(grants.map((g) => g.fixtureRef));
      if (refs.size !== 1) add("redaction grants must share one identical fixtureRef");
      const disc = consent.disclosure || {};
      if (disc.realDisputeExists !== true) add("consent disclosure must assert realDisputeExists: true");
      // E5 replay requires the EVM adapter; failure to import it is NOT_CHECKED — never a pass.
      try {
        const evm = await import("../../packages/evm/index.js");
        const chainId = String(consent.chainId || "1116");
        for (const [i, g] of grants.entries()) {
          try {
            const digest = redactionGrantDigest(g, evm, chainId);
            const recovered = evm.recoverSignerAddress(digest, g.signature);
            if (String(recovered).toLowerCase() !== String(g.grantor).toLowerCase()) {
              add(`grant ${i + 1}: signature recovers to ${recovered} != grantor ${g.grantor}`);
            }
          } catch (e) {
            add(`grant ${i + 1} replay error: ${e.message}`);
          }
        }
      } catch {
        notChecked.push("consent signature replay (EVM adapter unavailable) — run where packages/evm is importable");
      }
    }
    if (consent.disclosure && typeof consent.disclosure.peoplesCourtConsent === "string" &&
        !/no endorsement/i.test(consent.disclosure.peoplesCourtConsent)) {
      notes.push("peoplesCourtConsent: confirm the wording explicitly states no People's Court endorsement is implied");
    }
  }
}

// ------------------------------------------------------------ secret scan

const SKIP_FILES = new Set(["hashes.json"]);
const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !SKIP_FILES.has(f));
const LEGIT_HEX_LEAVES = /^(?:r|s|digest|intentHash|fixtureRef|sha256|txHash|blockHash|evidenceHash)$/i;
for (const f of files) {
  let rec;
  try {
    rec = JSON.parse(readFileSync(join(dir, f), "utf8"));
  } catch {
    add(`${f}: not valid JSON`);
    continue;
  }
  const hits = scanForSecrets(rec, basename(f));
  const realHits = hits.filter((h) => {
    const leaf = h.path.split(".").pop().replace(/\[\d+\]$/, "");
    return !LEGIT_HEX_LEAVES.test(leaf);
  });
  for (const h of realHits) add(`possible secret/personal data in ${h.path} — pattern: ${h.pattern} (${h.sample})`);
}

// ------------------------------------------------------------------ output

const verdict = findings.length === 0 ? "GATE GREEN — proceed to fixture conversion" : "GATE RED — resolve findings before conversion";
if (jsonMode) {
  console.log(JSON.stringify({
    gate: "coreguard-dde-real-intake-prelude",
    candidate: dir,
    findings,
    notes,
    notChecked,
    verdict,
  }, null, 2) + "\n");
} else {
  const line = "─".repeat(76);
  console.log(line);
  console.log("CoreGuard real-fixture intake — pre-publication gate (machine subset)");
  console.log(line);
  console.log(`candidate: ${dir}`);
  for (const f of findings) console.log(`  ✗ ${f}`);
  for (const n of notes) console.log(`  · note: ${n}`);
  for (const n of notChecked) console.log(`  ○ NOT_CHECKED: ${n}`);
  console.log(line);
  console.log(verdict);
  console.log("boundary: Execution verification does not decide delivery conformity.");
}
process.exit(findings.length === 0 ? 0 : 1);
