#!/usr/bin/env node
/**
 * badge-wall.mjs — CG-WALL/1: the CoreGuard Badge Shield generator + auditor.
 *
 * One source of truth for the exclusive badge wall:
 *   node scripts/badge-wall.mjs            # regenerate every plate + the composed wall
 *   node scripts/badge-wall.mjs --audit    # re-derive every plate's digest from the committed tree
 *
 * Each plate is brand-designed SVG carrying a machine payload comment:
 *   <!-- CG-WALL/1 src="<committed path>" sha256="<full digest>" name="<plate>" -->
 * The digest is the sha256 of the committed source bytes; --audit re-derives it
 * offline (no network, no deps) and fails loudly on any drift, so a plate can
 * never drift from the source it certifies.
 *
 * Identity v1.1: plates carry the OFFICIAL CoreGuard mark (488-unit shield with
 * the bottom slit + faceted G) drawn from assets/coreguard-mark.svg geometry,
 * on the official Deep Core surfaces with the official Core Orange gradient.
 *
 * Identity v1.1 wall refinements (Badge Shield v2): a warm halo wash behind the
 * header, a Core-Orange gradient frame (double border), a per-plate ordinal
 * chip (Nº 01…07), a warm top-halo wash under each plate's orange crown bar,
 * the Arabic wall title in the header, and a Core-Orange footer ribbon
 * (COREGUARD · VERIFY · PROTECT · EMPOWER — CG-WALL/1). The audit payloads and
 * the plate order remain byte-identical semantics: exclusion-source proof.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(REPO, "docs/assets/badges/wall");

/* Exclusive sources: each surface pins ONE committed file that owns it. */
const SURFACES = [
  { id: "execution-firewall", plate: "EXECUTION FIREWALL", suite: "CG-EF/1", value: "FAIL-CLOSED DECISION RECORDS", src: "packages/firewall/index.js" },
  { id: "verifier-x3", plate: "VERIFIER X3", suite: "CG-VX3/1", value: "TRIPLE KEY · INDEPENDENT PARITY", src: "packages/verifier/index.js" },
  { id: "stellar-agent", plate: "STELLAR AGENT", suite: "STELLAR-AGENT/1", value: "PAYMENT GATE · JUDGED BEFORE SUBMIT", src: "packages/stellar-agent/index.mjs" },
  { id: "trinity", plate: "TRINITY ENGINE", suite: "COREGUARD-TRINITY/1", value: "CORE + STELLAR + PI · ONE LADDER", src: "packages/coreguard-trinity/index.mjs" },
  { id: "badge-engine", plate: "BADGE ENGINE", suite: "CG-BDG/1", value: "ARTWORK IS THE PROOF · HAND-EDIT FAILS", src: "packages/badge/index.mjs" },
  { id: "cgep-receipt", plate: "EVIDENCE RECEIPT", suite: "CGEP/1", value: "RECEIPT SEMANTICS · REPLAYABLE", src: "spec/CGEP-1.md" },
  { id: "core-anchor", plate: "CORE MAINNET ANCHOR", suite: "CHAIN 1116", value: "V3 EVIDENCE REGISTRY · ON-CHAIN", src: "contracts/EvidenceRegistryV3.sol" },
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function digest(surface) {
  const path = join(REPO, surface.src);
  const bytes = readFileSync(path);
  return { full: sha256(bytes), short: sha256(bytes).slice(0, 16) };
}

function payload(s, d) {
  return `<!-- CG-WALL/1 src="${s.src}" sha256="${d.full}" name="${s.plate}" suite="${s.suite}" -->`;
}

/* ---------- brand artwork (official identity v1.1) ---------- */

const FONT = "Inter, 'Segoe UI', system-ui, sans-serif";
const MONO = "'JetBrains Mono', 'Cascadia Code', Consolas, monospace";

function defs(id) {
  return `<defs>
<linearGradient id="plate${id}" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#10161F"/><stop offset="0.55" stop-color="#0B0F14"/><stop offset="1" stop-color="#080B10"/>
</linearGradient>
<linearGradient id="halo${id}" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#FF8A00" stop-opacity="0.30"/><stop offset="1" stop-color="#FF8A00" stop-opacity="0"/>
</linearGradient>
<linearGradient id="shield${id}" x1="0" y1="0" x2="0.25" y2="1">
<stop offset="0" stop-color="#FFC53D"/><stop offset="0.38" stop-color="#FFA31A"/><stop offset="0.68" stop-color="#FF8A00"/><stop offset="1" stop-color="#F4610A"/>
</linearGradient>
<linearGradient id="steel${id}" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#4A5568"/><stop offset="0.45" stop-color="#232936"/><stop offset="1" stop-color="#10131A"/>
</linearGradient>
<linearGradient id="sheen${id}" x1="0" y1="0" x2="1" y2="0.6">
<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.10"/><stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0.02"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
</linearGradient>
<linearGradient id="edge${id}" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#4A5568"/><stop offset="0.5" stop-color="#232936"/><stop offset="1" stop-color="#4A5568"/>
</linearGradient>
</defs>`;
}

/* Official CoreGuard mark on the 512 grid: shield band (bottom slit) + faceted G.
   A unique mask id per plate keeps the slit valid in standalone SVGs AND in the
   inlined composed wall (mask coords resolve in the referencing path's user
   space, so the slice maps correctly under plate scaling). */
const MARK_BAND  = "M256 16 L460 136 L460 306 L256 472 L52 306 L52 136 Z M256 90 L402 163 L402 296 L256 398 L110 296 L110 163 Z";
const MARK_CROWN = "M256 16 L460 136 L460 172 L256 54 L52 172 L52 136 Z";
const MARK_RING  = "M329 285 L329 313 L256 369 L175 313 L175 175 L329 175 L329 229";
const MARK_BAR   = "M226 285 L329 285";

function shieldGlyph(x, y, s, gradient, id) {
  return `<mask id="slit${id}"><rect width="512" height="512" fill="#fff"/><rect x="241" y="374" width="30" height="140" fill="#000"/></mask>
<g transform="translate(${x} ${y}) scale(${s})">
<path fill="url(#${gradient})" fill-rule="evenodd" mask="url(#slit${id})" d="${MARK_BAND}"/>
<path fill="#FFD867" opacity="0.5" mask="url(#slit${id})" d="${MARK_CROWN}"/>
<g fill="none" stroke="url(#steel${id})" stroke-width="54" stroke-linecap="butt" stroke-linejoin="miter">
<path d="${MARK_RING}"/><path d="${MARK_BAR}"/>
</g>
<path fill="none" stroke="#6E7A8C" stroke-width="10" opacity="0.9" d="M326 151 L182 151"/>
</g>`;
}

/* One proof plate: 320×88, dark plate, official mark, name, suite chip, digest line.
   v2: a warm halo wash under the top orange crown bar + an ordinal chip (Nº 01…07). */
function plateSvg(s, d, ordinal) {
  const id = s.id.replace(/[^a-z0-9]/gi, "");
  const nameX = 74;
  const ord = String(ordinal + 1).padStart(2, "0");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 88" width="320" height="88" role="img" aria-label="CoreGuard ${s.plate} — ${s.suite}">
${defs(id)}
<rect x="0.5" y="0.5" width="319" height="87" rx="12" fill="url(#plate${id})"/>
<rect x="0.5" y="0.5" width="319" height="87" rx="12" fill="none" stroke="url(#edge${id})" stroke-width="1"/>
<rect x="0.5" y="0.5" width="319" height="30" rx="12" fill="url(#halo${id})"/>
<rect x="1.5" y="1.5" width="317" height="4" rx="2" fill="url(#shield${id})" fill-opacity="0.9"/>
<path d="M0 0 H320 V52 L0 74 Z" fill="url(#sheen${id})"/>
${shieldGlyph(8.5, 16.3, 0.105, `shield${id}`, id)}
<text x="306" y="21" text-anchor="end" font-family="${MONO}" font-size="7.5" letter-spacing="1.4" fill="#3E4A59" opacity="0.9">Nº ${ord}</text>
<text x="${nameX}" y="30" font-family="${FONT}" font-size="14.5" font-weight="700" letter-spacing="0.4" fill="#F5F7FA">${s.plate}</text>
<text x="${nameX}" y="45" font-family="${MONO}" font-size="8" fill="#FF8A00" letter-spacing="0.8">${s.suite}</text>
<text x="${nameX}" y="60" font-family="${FONT}" font-size="9" fill="#C6CFDA" letter-spacing="0.3">${s.value}</text>
<text x="${nameX}" y="74" font-family="${MONO}" font-size="7" fill="#8B95A6">src ${s.src}</text>
<text x="${nameX}" y="83" font-family="${MONO}" font-size="7" fill="#565E6B">sha256:${d.short}…</text>
${payload(s, d)}
</svg>
`;
}

/* Composed banner: 1024×420, brand grid, headline + the seven plates.
   v2: warm header halo, Core-Orange double frame, Arabic wall title, and a
   Core-Orange footer ribbon; the plate grid keeps its fixed positions. */
function wallSvg(plates) {
  const cols = [24, 356, 688];
  const rows = [118, 212, 306];
  let slots = "";
  plates.forEach((p, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    slots += `<g transform="translate(${cols[col]} ${rows[row]}) scale(0.85)">${p.body}</g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 420" width="1024" height="420" role="img" aria-label="CoreGuard Badge Shield — seven exclusive-source plates">
<defs>
<linearGradient id="wallBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#10161F"/><stop offset="1" stop-color="#0B0F14"/></linearGradient>
<linearGradient id="wallShield" x1="0" y1="0" x2="0.25" y2="1"><stop offset="0" stop-color="#FFC53D"/><stop offset="0.38" stop-color="#FFA31A"/><stop offset="0.68" stop-color="#FF8A00"/><stop offset="1" stop-color="#F4610A"/></linearGradient>
<linearGradient id="wallSteel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4A5568"/><stop offset="0.45" stop-color="#232936"/><stop offset="1" stop-color="#10131A"/></linearGradient>
<radialGradient id="wallGlow" cx="0.17" cy="0.06" r="0.5"><stop offset="0" stop-color="#FF8A00" stop-opacity="0.16"/><stop offset="1" stop-color="#FF8A00" stop-opacity="0"/></radialGradient>
<linearGradient id="wallFrame" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFC53D" stop-opacity="0.9"/><stop offset="0.5" stop-color="#FF8A00" stop-opacity="0.55"/><stop offset="1" stop-color="#F4610A" stop-opacity="0.9"/></linearGradient>
<linearGradient id="wallFoot" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FF8A00" stop-opacity="0"/><stop offset="0.18" stop-color="#FF8A00" stop-opacity="0.75"/><stop offset="0.82" stop-color="#FF8A00" stop-opacity="0.75"/><stop offset="1" stop-color="#FF8A00" stop-opacity="0"/></linearGradient>
</defs>
<rect width="1024" height="420" rx="16" fill="url(#wallBg)"/>
<rect width="1024" height="420" rx="16" fill="url(#wallGlow)"/>
<rect x="1" y="1" width="1022" height="418" rx="15" fill="none" stroke="url(#wallFrame)" stroke-width="2"/>
<rect x="6" y="6" width="1012" height="408" rx="11" fill="none" stroke="#1B212B" stroke-width="1"/>
<g stroke="#1B212B" stroke-width="1">
${[1, 2, 3, 4, 5, 6, 7].map((i) => `<path d="M${i * 128} 96 V384"/>`).join("")}
</g>
${shieldGlyph(21.3, 12.6, 0.09, "wallShield", "wall")}
<text x="70" y="38" font-family="${FONT}" font-size="26" font-weight="800" fill="#F5F7FA">CoreGuard <tspan fill="#FF8A00">Badge Shield</tspan></text>
<text x="71" y="58" font-family="${FONT}" font-size="11" letter-spacing="3.2" fill="#C6CFDA">VERIFY · PROTECT · EMPOWER — SEVEN EXCLUSIVE-SOURCE PLATES</text>
<text x="1004" y="84" text-anchor="end" font-family="${FONT}" font-size="10.5" fill="#8B95A6">درع الشارات — سبع بطاقات من مصادر حصرية</text>
<text x="760" y="38" font-family="${MONO}" font-size="10" fill="#FF8A00">CG-WALL/1</text>
<text x="760" y="54" font-family="${MONO}" font-size="8" fill="#8B95A6">sha256 · committed tree · offline</text>
<text x="760" y="68" font-family="${MONO}" font-size="8" fill="#8B95A6">${plates.length} exclusive-source plates</text>
${slots}
<line x1="100" y1="393" x2="924" y2="393" stroke="url(#wallFoot)" stroke-width="1"/>
<circle cx="300" cy="404.5" r="2.5" fill="#FF8A00"/>
<text x="512" y="408" text-anchor="middle" font-family="${MONO}" font-size="8.5" letter-spacing="2.6" fill="#FF8A00">COREGUARD · VERIFY · PROTECT · EMPOWER — CG-WALL/1</text>
<circle cx="724" cy="404.5" r="2.5" fill="#FF8A00"/>
</svg>
`;
}

function regenerate() {
  mkdirSync(OUT, { recursive: true });
  const plates = [];
  for (const s of SURFACES) {
    const d = digest(s);
    let svg = plateSvg(s, d, plates.length);
    /* banners reference per-plate gradients that collide when inlined; give
       each inlined copy a unique gradient id prefix so the wall stays valid */
    svg = svg.replace(/(plate|shield|sheen|edge|steel|slit|halo)([a-z0-9]+)/gi, (m, g, i) => `${g}${i}`);
    plates.push({ plate: s.plate, id: s.id, file: `${s.id}.svg`, svg, body: stripRootSvg(svg), digest: d });
    writeFileSync(join(OUT, `${s.id}.svg`), svg, "utf8");
  }
  writeFileSync(join(REPO, "docs/assets/badges/wall-badge-shield.svg"), wallSvg(plates), "utf8");
  return plates;
}

function stripRootSvg(svg) {
  return svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
}

function audit() {
  const problems = [];
  for (const s of SURFACES) {
    let svg;
    try {
      svg = readFileSync(join(OUT, `${s.id}.svg`), "utf8");
    } catch {
      problems.push(`${s.plate}: plate file missing (${s.id}.svg)`);
      continue;
    }
    const m = svg.match(/<!-- CG-WALL\/1 src="([^"]+)" sha256="([0-9a-f]{64})"/);
    if (!m) {
      problems.push(`${s.plate}: payload comment missing or malformed`);
      continue;
    }
    const [, src, claimed] = m;
    if (src !== s.src) problems.push(`${s.plate}: payload src "${src}" != declared "${s.src}"`);
    let bytes;
    try {
      bytes = readFileSync(join(REPO, src));
    } catch {
      problems.push(`${s.plate}: source file missing: ${src}`);
      continue;
    }
    const actual = sha256(bytes);
    if (actual !== claimed) {
      problems.push(`${s.plate}: digest drift — plate claims ${claimed.slice(0, 16)}, committed tree hashes to ${actual.slice(0, 16)} (${src}). Regenerate: node scripts/badge-wall.mjs`);
    }
  }
  return problems;
}

const args = process.argv.slice(2);
if (args.includes("--audit")) {
  const problems = audit();
  if (problems.length) {
    console.error(`CG-WALL/1 AUDIT: FAIL — ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  ✖ ${p}`);
    process.exit(1);
  }
  console.log(`CG-WALL/1 AUDIT: PASS — ${SURFACES.length} plates re-derived from the committed tree (sha256, offline).`);
} else {
  const plates = regenerate();
  console.log(`CG-WALL/1: regenerated ${plates.length} plates + wall-badge-shield.svg into docs/assets/badges/wall/`);
  for (const p of plates) console.log(`  ${p.plate} ← ${p.digest.short}… (${p.file})`);
  const problems = audit();
  if (problems.length) {
    console.error("CG-WALL/1 self-check failed right after regen:");
    for (const p of problems) console.error(`  ✖ ${p}`);
    process.exit(1);
  }
}
