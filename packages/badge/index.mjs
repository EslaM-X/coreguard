/**
 * index.mjs — CG-BDG/1, the CoreGuard badge system.
 *
 * The owner asked for a badge that is beautiful, professional, and
 * exceptional. The project's philosophy decides what "exceptional" means
 * here: a badge that cannot be believed, only CHECKED.
 *
 * Four ideas make this different from a logo:
 *
 *  1. DERIVED, NOT DRAWN. Every badge is a pure function of the conformance
 *     record it names. Two different records produce two different payloads
 *     and two different digests; the same record always produces the same
 *     bytes. Nothing is hand-placed, so the artwork can never drift from the
 *     claim it depicts.
 *
 *  2. SELF-VERIFYING. The SVG embeds its own payload, and `verifyBadge`
 *     re-derives the digest from the record and compares it. A forged badge
 *     (a swapped subject, an edited suite version, a lifted digest) fails
 *     verification. `npm run badge:verify` proves it.
 *
 *  3. NEVER ISSUED BY DEFAULT. `badgeIssuerCount` is 0. The system renders
 *     SPECIMEN badges — visually real, explicitly marked as not issued — so
 *     the design exists and is provable without ever putting this mark next
 *     to a company's name without a real conformance record behind it.
 *
 *  4. IT STATES ITS LIMITS ON ITS FACE. The badge carries what it never
 *     means, in the artwork itself, so a cropped screenshot still cannot be
 *     read as an endorsement.
 *
 * Determinism: no Date, no random, no locale. Same record in, same bytes out.
 */

import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BADGE_DIR = join(REPO, "docs", "badges");
const BADGE_REGISTRY = join(REPO, "docs", "badge-registry.json");

export const BADGE_SCHEMA = "CG-BDG/1";
export const CONFORMANCE_SUITE_VERSION = "CG-CS/1";

/* The two badge kinds. Neither is a mark of approval. */
export const BADGE_KINDS = Object.freeze({
  INTEGRATION: "VERIFIED_INTEGRATION",
  SPECIMEN: "SPECIMEN",
});

export const BADGE_RULES = Object.freeze({
  INTEGRATION: Object.freeze([
    "Issued only from a CG-CS/1 record whose six criteria all PASS.",
    "Certifies the integration's attestations only — never the counterparty, its funds, its adjudication, or any legal outcome.",
    "Carries the subject id, the suite version, and a digest of the exact record; any edit to those fails verification.",
  ]),
  SPECIMEN: Object.freeze([
    "Design specimen. NOT ISSUED. No third party holds this badge.",
    "NOT ISSUED: rendered so the design and its verification path are provable before any issuance decision exists.",
  ]),
});

/**
 * The record's kind is a NON-ENUMERABLE brand, not a writable field. A
 * specimen record therefore cannot be flipped into an issued one by
 * `{ ...record, kind: "VERIFIED_INTEGRATION" }`: the copy loses the brand and
 * `renderBadge` refuses it. Only the two constructors below can ever mint a
 * record the renderer will accept.
 */
const BRAND = Symbol("CG-BDG/1.record");

function brand(record, kind) {
  Object.defineProperty(record, BRAND, { value: kind, enumerable: false, writable: false, configurable: false });
  return record;
}

/** The trusted kind of a record, or null if the record was not constructed here. */
export function badgeKind(record) {
  return record && record[BRAND] ? record[BRAND] : null;
}

/** Short, unambiguous, human-typeable digest. */
export function badgeDigest(record) {
  const canonical = JSON.stringify([
    badgeKind(record),
    record.subject,
    record.suite,
    record.verdict,
    Array.isArray(record.criteria) ? record.criteria.map((c) => `${c.id}:${c.pass === true}`) : [],
  ]);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 12).toUpperCase();
}

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const W = 320;
const H = 176;

/**
 * renderBadge — the artwork. A certificate, not a sticker: engraved frame,
 * a shield mark, a monospace digest line, and a limits line on the face.
 */
export function renderBadge(record) {
  if (!record || typeof record.subject !== "string" || !record.subject) {
    throw new TypeError("renderBadge: record.subject (string) is required");
  }
  const kind = badgeKind(record);
  if (kind !== BADGE_KINDS.INTEGRATION && kind !== BADGE_KINDS.SPECIMEN) {
    throw new TypeError("renderBadge: the record must come from integrationRecord() or specimenRecord(); an unbranded, hand-built, or copied record is refused");
  }
  if (kind === BADGE_KINDS.INTEGRATION && record.verdict !== "CONFORMANT") {
    throw new TypeError("renderBadge: an integration badge requires verdict CONFORMANT — a non-conformant record can never render one");
  }

  const criteriaPassed = Array.isArray(record.criteria) ? record.criteria.filter((c) => c.pass === true).length : 0;
  const criteriaTotal = Array.isArray(record.criteria) ? record.criteria.length : 0;

  const digest = badgeDigest(record);
  const issued = kind === BADGE_KINDS.INTEGRATION;
  const allPass = criteriaTotal > 0 && criteriaPassed === criteriaTotal;
  const subject = esc(record.subject.length > 26 ? record.subject.slice(0, 25) + "…" : record.subject);
  const suite = esc(record.suite || CONFORMANCE_SUITE_VERSION);

  /* three honest faces: issued, conformant-but-not-issued, and the refusal */
  const title = issued ? "CoreGuard Verified Integration" : "CoreGuard Conformance";
  const subtitle = issued ? suite : "CONFORMANCE SUITE " + suite;
  const ribbon = issued ? "ISSUED" : allPass ? "SPECIMEN · NOT ISSUED" : "NOT CONFORMANT · NOT ISSUED";
  const ribbonFill = issued ? "#0F766E" : allPass ? "#B45309" : "#B91C1C";
  const shieldMark = allPass
    ? "M40 20 L51 24 V34 C51 41 47 46.5 40 49 C33 46.5 29 41 29 34 V24 Z M35 34.5 L38.5 38 L45.5 30.5"
    : "M40 20 L51 24 V34 C51 41 47 46.5 40 49 C33 46.5 29 41 29 34 V24 Z M34.5 30.5 L45.5 41 M45.5 30.5 L34.5 41";
  const limitsLine = issued
    ? "Certifies this integration's attestations only — not the counterparty, its funds, or any outcome"
    : allPass
      ? "Design specimen — no third party holds this badge"
      : "Fails CG-CS/1 — no badge may be issued to a non-conformant record";

  /* the ribbon is sized from the string it holds, not guessed: 8.5px
     semi-condensed glyph advance + 1.2px letter-spacing, plus 10px padding.
     A wrong width here would clip the one word that must never be clipped. */
  const ribbonW = Math.round(10 + ribbon.length * 6.2);

  // the criteria meter: one engraved segment per criterion, filled only when
  // that criterion passed in the record this badge is derived from
  const meter = Array.from({ length: criteriaTotal }, (_, i) => {
    const on = i < criteriaPassed;
    return `<rect x="${22 + i * 26}" y="128" width="21" height="4" rx="2" fill="${on ? ribbonFill : "#232A33"}"/>`;
  }).join("");

  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(title)} — ${esc(record.subject)}">`,
    "<defs>",
    '<linearGradient id="plate" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0" stop-color="#12161C"/><stop offset="0.55" stop-color="#0B0E13"/><stop offset="1" stop-color="#07090C"/>',
    "</linearGradient>",
    '<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0.6">',
    '<stop offset="0" stop-color="#ffffff" stop-opacity="0.10"/><stop offset="0.45" stop-color="#ffffff" stop-opacity="0.02"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>',
    "</linearGradient>",
    '<linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">',
    '<stop offset="0" stop-color="#4B5563"/><stop offset="0.5" stop-color="#1F2937"/><stop offset="1" stop-color="#4B5563"/>',
    "</linearGradient>",
    `<clipPath id="plateClip"><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="18"/></clipPath>`,
    "</defs>",
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="18" fill="url(#plate)"/>`,
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="18" fill="none" stroke="url(#edge)" stroke-width="1"/>`,
    /* the sheen is clipped to the plate, so it can never paint outside the
       rounded corner and leave a visible edge on the page behind it */
    `<g clip-path="url(#plateClip)"><path d="M0 0 H${W} V96 L0 140 Z" fill="url(#sheen)"/></g>`,
    // engraved inner rule
    `<rect x="14.5" y="14.5" width="${W - 29}" height="${H - 29}" rx="11" fill="none" stroke="#2A313B" stroke-width="1"/>`,
    // shield
    `<path d="${shieldMark}" fill="none" stroke="${ribbonFill}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
    // title block
    `<text x="66" y="34" font-family="Inter, 'Segoe UI', system-ui, sans-serif" font-size="15" font-weight="700" fill="#F3F4F6" letter-spacing="0.2">${esc(title)}</text>`,
    `<text x="66" y="51" font-family="'JetBrains Mono', 'Cascadia Code', Consolas, monospace" font-size="9.5" fill="#9CA3AF" letter-spacing="1.1">${esc(subtitle)}</text>`,
    // ribbon
    `<rect x="66" y="59" width="${ribbonW}" height="16" rx="8" fill="${ribbonFill}" fill-opacity="0.16" stroke="${ribbonFill}" stroke-opacity="0.55" stroke-width="0.8"/>`,
    `<text x="71" y="70.5" font-family="Inter, 'Segoe UI', system-ui, sans-serif" font-size="8.5" font-weight="700" letter-spacing="1.2" fill="${ribbonFill}">${esc(ribbon)}</text>`,
    // subject
    `<text x="22" y="104" font-family="Inter, 'Segoe UI', system-ui, sans-serif" font-size="19" font-weight="650" fill="#FFFFFF">${subject}</text>`,
    // criteria meter
    `<text x="22" y="122" font-family="'JetBrains Mono', 'Cascadia Code', Consolas, monospace" font-size="9.5" fill="#9CA3AF">${criteriaPassed}/${criteriaTotal} CRITERIA PASS</text>`,
    meter,
    // digest + schema
    `<text x="22" y="152" font-family="'JetBrains Mono', 'Cascadia Code', Consolas, monospace" font-size="8.5" fill="#6B7280">${BADGE_SCHEMA} · ${esc(digest)} · npm run badge:verify</text>`,
    // limits on the face
    `<text x="22" y="165" font-family="Inter, 'Segoe UI', system-ui, sans-serif" font-size="7.6" fill="#6B7280">${limitsLine}</text>`,
    `<!-- CG-BDG/1 payload: ${JSON.stringify({ d: digest, s: record.subject, k: kind, v: record.suite || CONFORMANCE_SUITE_VERSION, p: criteriaPassed, t: criteriaTotal })} -->`,
    "</svg>",
  ];
  return lines.filter((l) => typeof l === "string" && l.length > 0).join("\n");
}

/* ------------------------------------------------------------- verifying */

/** Extract the embedded payload from a rendered badge. */
export function extractPayload(svg) {
  const m = /<!-- CG-BDG\/1 payload: (.*?) -->/.exec(svg);
  if (!m) return null;
  return JSON.parse(m[1]);
}

/**
 * verifyBadge — the property that makes this a badge and not a logo.
 * Re-derives the digest from the record and compares it to the artwork. A
 * swapped subject, an upgraded verdict, a lifted digest from another badge,
 * or a hand-edited payload all fail.
 */
export function verifyBadge(svg, record) {
  const payload = extractPayload(svg);
  if (!payload) return { valid: false, reason: "NO_PAYLOAD", detail: "the artwork carries no CG-BDG/1 payload" };
  if (!record || typeof record.subject !== "string") return { valid: false, reason: "NO_RECORD", detail: "no conformance record was supplied" };
  const expected = badgeDigest(record);
  if (payload.d !== expected) return { valid: false, reason: "DIGEST_MISMATCH", detail: `artwork says ${payload.d}, the record derives ${expected}` };
  if (payload.s !== record.subject) return { valid: false, reason: "SUBJECT_MISMATCH", detail: `artwork names ${payload.s}, the record names ${record.subject}` };
  if (payload.k !== badgeKind(record)) return { valid: false, reason: "KIND_MISMATCH", detail: `artwork is ${payload.k}, the record is ${badgeKind(record)}` };
  const expectedPayloadPassed = Array.isArray(record.criteria) ? record.criteria.filter((c) => c.pass === true).length : 0;
  if (payload.p !== expectedPayloadPassed) return { valid: false, reason: "CRITERIA_MISMATCH", detail: `artwork shows ${payload.p} passing, the record has ${expectedPayloadPassed}` };
  /* Trailing whitespace is normalized, not ignored: an editor or a git
     filter may append a final newline, and a badge that fails verification
     because of one byte of whitespace teaches integrators to distrust the
     check. Everything INSIDE the artwork must still match byte for byte. */
  const rendered = renderBadge(record);
  if (rendered.trimEnd() !== String(svg).trimEnd()) {
    return { valid: false, reason: "BYTES_DIFFER", detail: "the artwork is not the deterministic render of this record" };
  }
  return { valid: true, reason: "VERIFIED", detail: `re-derived ${expected} from the record; the artwork is byte-identical` };
}

/* -------------------------------------------------------- the specimen */

export const BADGE_SPECIMENS = Object.freeze([
  {
    id: "SPECIMEN-VERIFIED-INTEGRATION",
    subject: "SPECIMEN · NOT ISSUED",
    criteriaPass: true,
    note: "Shows exactly what an issued badge looks like. It is not one, and it is issued to nobody.",
  },
  {
    id: "SPECIMEN-NOT-CONFORMANT",
    subject: "SPECIMEN · NOT ISSUED",
    criteriaPass: false,
    note: "The refusal face: what the system shows when the suite does not pass. A failing record can never be issued a badge, and this artwork proves the refusal is designed, not accidental.",
  },
]);

/**
 * The specimen record: six criteria, rendered as SPECIMEN and never issued.
 * `criteriaPass: false` yields 2/6 so the fail-closed face is real artwork.
 */
export function specimenRecord({ criteriaPass = true, subject = "SPECIMEN · NOT ISSUED" } = {}) {
  const ids = [
    "evidenceContractPass",
    "determinismPass",
    "replayPass",
    "tamperDetectionPass",
    "securityCheckPass",
    "compatibilityPass",
  ];
  const criteria = ids.map((id, i) => ({ id, pass: criteriaPass ? true : i < 2 }));
  return brand({ subject, suite: CONFORMANCE_SUITE_VERSION, verdict: "CONFORMANT", criteria }, BADGE_KINDS.SPECIMEN);
}

/** A record for a real issuance — refused unless the suite actually passed. */
export function integrationRecord({ subject, results }) {
  if (!subject || typeof subject !== "string") throw new TypeError("integrationRecord: subject is required");
  const ids = [
    "evidenceContractPass",
    "determinismPass",
    "replayPass",
    "tamperDetectionPass",
    "securityCheckPass",
    "compatibilityPass",
  ];
  const criteria = ids.map((id) => ({ id, pass: results && results[id] === true }));
  const verdict = criteria.every((c) => c.pass) ? "CONFORMANT" : "NOT_CONFORMANT";
  return brand({ subject, suite: CONFORMANCE_SUITE_VERSION, verdict, criteria }, BADGE_KINDS.INTEGRATION);
}

export function buildBadgeRegistry() {
  const specimens = BADGE_SPECIMENS.map((s) => {
    const record = specimenRecord({ subject: s.subject, criteriaPass: s.criteriaPass });
    const svg = renderBadge(record);
    return {
      id: s.id,
      subject: s.subject,
      kind: badgeKind(record),
      suite: record.suite,
      criteriaPass: s.criteriaPass,
      criteriaPassed: record.criteria.filter((c) => c.pass).length,
      criteriaTotal: record.criteria.length,
      digest: badgeDigest(record),
      note: s.note,
      file: `docs/badges/${s.id.toLowerCase()}.svg`,
      svg,
      verified: verifyBadge(svg, record).valid,
    };
  });
  return {
    schema: BADGE_SCHEMA,
    suite: CONFORMANCE_SUITE_VERSION,
    rules: BADGE_RULES,
    issuerCount: 0,
    issuers: [],
    issuedNote: "No badge is issued to any third party. An issuance requires a CG-CS/1 record whose six criteria all pass, and the record must be reviewable by whoever the badge names.",
    specimens,
    specimenCount: specimens.length,
  };
}

export function selfCheck() {
  const cases = [];
  const record = specimenRecord();
  const svg = renderBadge(record);

  cases.push(["a record renders deterministic bytes", svg === renderBadge(specimenRecord())]);
  cases.push(["the artwork carries a re-derivable payload", (extractPayload(svg) || {}).d === badgeDigest(record)]);
  cases.push(["a genuine badge verifies against its record", verifyBadge(svg, record).valid === true]);
  cases.push(["a forged subject fails verification", verifyBadge(svg, specimenRecord({ subject: "SOMEONE ELSE" })).valid === false]);
  cases.push(["a hand-edited payload fails verification", verifyBadge(svg.replace(badgeDigest(record), "AAAAAAAAAAAA"), record).valid === false]);
  cases.push(["a digest lifted from another record fails", verifyBadge(renderBadge(specimenRecord({ subject: "OTHER" })), record).valid === false]);
  cases.push(["an artwork with no payload fails verification", verifyBadge("<svg></svg>", record).reason === "NO_PAYLOAD"]);
  cases.push(["an unissued specimen can never render as an issued badge", (() => { try { renderBadge({ ...specimenRecord(), kind: BADGE_KINDS.INTEGRATION }); return false; } catch { return true; } })()]);
  cases.push(["a hand-built record is refused outright", (() => { try { renderBadge({ subject: "X", suite: CONFORMANCE_SUITE_VERSION, verdict: "CONFORMANT", criteria: [] }); return false; } catch { return true; } })()]);
  cases.push(["the record's kind is a brand, not a writable field", Object.getOwnPropertyNames(specimenRecord()).indexOf("kind") === -1]);
  cases.push(["a non-conformant record cannot produce an issued badge", (() => { try { renderBadge(integrationRecord({ subject: "X", results: {} })); return false; } catch { return true; } })()]);
  cases.push(["an issued badge requires all six criteria", integrationRecord({ subject: "X", results: { evidenceContractPass: true } }).verdict === "NOT_CONFORMANT"]);
  const allPass = Object.fromEntries(["evidenceContractPass", "determinismPass", "replayPass", "tamperDetectionPass", "securityCheckPass", "compatibilityPass"].map((k) => [k, true]));
  const issued = renderBadge(integrationRecord({ subject: "GENUINE", results: allPass }));
  cases.push(["a genuine conformant record renders an ISSUED badge", issued.includes("ISSUED")]);
  cases.push(["an issued badge carries its limits on its face", issued.includes("not the counterparty")]);
  cases.push(["the registry issues nothing", buildBadgeRegistry().issuerCount === 0]);

  const ok = cases.every(([, pass]) => pass);
  return { ok, cases: cases.map(([label, pass]) => ({ label, pass })) };
}

/**
 * writeBadgeRegistry — renders the specimens to docs/badges/ and writes the
 * registry. Deterministic: no timestamp, so re-running produces no diff, and
 * a specimen that would change bytes is a bug worth seeing in a diff.
 */
export function writeBadgeRegistry() {
  mkdirSync(BADGE_DIR, { recursive: true });
  const registry = buildBadgeRegistry();
  const written = [];
  for (const s of registry.specimens) {
    const path = join(REPO, s.file);
    writeFileSync(path, s.svg + "\n", "utf8");
    written.push(s.file);
  }
  /* the registry stores each specimen WITHOUT the inline svg, so the JSON
     stays reviewable; the artwork lives in its own file. */
  const slim = { ...registry, specimens: registry.specimens.map(({ svg, ...rest }) => rest) };
  writeFileSync(BADGE_REGISTRY, JSON.stringify(slim, null, 2) + "\n", "utf8");
  return { registry, written, registryFile: "docs/badge-registry.json" };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--write")) {
    const { registry, written, registryFile } = writeBadgeRegistry();
    console.log(`BADGE WRITE — ${BADGE_SCHEMA}`);
    for (const f of written) console.log(`  wrote ${f}`);
    console.log(`  wrote ${registryFile}`);
    console.log(`\n  ${registry.specimenCount} specimens · issuerCount ${registry.issuerCount} · nothing issued to anyone`);
    return;
  }
  if (args.includes("--verify")) {
    const registry = buildBadgeRegistry();
    console.log(`BADGE VERIFY — ${BADGE_SCHEMA} (re-derives every digest from its record)`);
    let allValid = true;
    for (const s of registry.specimens) {
      const record = specimenRecord({ subject: s.subject, criteriaPass: s.criteriaPass });
      const out = verifyBadge(s.svg, record);
      allValid = allValid && out.valid;
      console.log(`  ${out.valid ? "PASS" : "FAIL"}  ${s.file} — ${s.criteriaPassed}/${s.criteriaTotal} criteria, ${out.reason}${out.valid ? "" : " :: " + out.detail}`);
    }
    console.log(`\nBADGE-VERIFY: ${allValid ? "PASS" : "FAIL"}`);
    if (!allValid) process.exitCode = 1;
    return;
  }
  if (args.includes("--registry")) {
    console.log(JSON.stringify(buildBadgeRegistry(), null, 2));
    return;
  }
  console.log(`COREGUARD BADGE — ${BADGE_SCHEMA} (derived artwork, self-verifying, issued to nobody)`);
  const r = selfCheck();
  for (const c of r.cases) console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${c.label}`);
  console.log(`\nBADGE SELF-CHECK: ${r.ok ? "PASS" : "FAIL"}`);
  if (!r.ok) process.exitCode = 1;
}

if (process.argv[1] && process.argv[1].endsWith("index.mjs")) main();
