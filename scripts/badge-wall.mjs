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

/* ---------- brand artwork ---------- */

const FONT = "Inter, 'Segoe UI', system-ui, sans-serif";
const MONO = "'JetBrains Mono', 'Cascadia Code', Consolas, monospace";

function defs(id) {
  return `<defs>
<linearGradient id="plate${id}" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#12161C"/><stop offset="0.55" stop-color="#0B0E13"/><stop offset="1" stop-color="#07090C"/>
</linearGradient>
<linearGradient id="shield${id}" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#FFB84A"/><stop offset="0.55" stop-color="#FF8A00"/><stop offset="1" stop-color="#F26B00"/>
</linearGradient>
<linearGradient id="sheen${id}" x1="0" y1="0" x2="1" y2="0.6">
<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.10"/><stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0.02"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
</linearGradient>
<linearGradient id="edge${id}" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#4B5563"/><stop offset="0.5" stop-color="#1F2937"/><stop offset="1" stop-color="#4B5563"/>
</linearGradient>
</defs>`;
}

/* Shield mark drawn from the brand geometry (hex shield + inner core). */
function shieldGlyph(x, y, s, gradient) {
  return `<path transform="translate(${x} ${y}) scale(${s})" d="M12 0 L24 6 V15 C24 22.5 19 28 12 31 C5 28 0 22.5 0 15 V6 Z" fill="none" stroke="url(#${gradient})" stroke-width="2.6" stroke-linejoin="round"/>
<g transform="translate(${x} ${y}) scale(${s})"><path d="M12 9 L17.5 12 V19 C17.5 22 15.4 23.9 12 25 C8.6 23.9 6.5 22 6.5 19 V12 Z" fill="#171C24"/><path d="M12 12.2 L7.8 15.4 V12 L12 9.4 L16.2 12 V15.4 Z" fill="url(#${gradient})"/></g>`;
}

/* One proof plate: 320×88, dark plate, shield, name, suite chip, digest line. */
function plateSvg(s, d) {
  const id = s.id.replace(/[^a-z0-9]/gi, "");
  const nameX = 74;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 88" width="320" height="88" role="img" aria-label="CoreGuard ${s.plate} — ${s.suite}">
${defs(id)}
<rect x="0.5" y="0.5" width="319" height="87" rx="12" fill="url(#plate${id})"/>
<rect x="0.5" y="0.5" width="319" height="87" rx="12" fill="none" stroke="url(#edge${id})" stroke-width="1"/>
<rect x="1.5" y="1.5" width="317" height="4" rx="2" fill="url(#shield${id})" fill-opacity="0.9"/>
<path d="M0 0 H320 V52 L0 74 Z" fill="url(#sheen${id})"/>
${shieldGlyph(16, 22, 1.4, `shield${id}`)}
<text x="${nameX}" y="30" font-family="${FONT}" font-size="14.5" font-weight="700" letter-spacing="0.4" fill="#F5F7FA">${s.plate}</text>
<text x="${nameX}" y="45" font-family="${MONO}" font-size="8" fill="#FF8A00" letter-spacing="0.8">${s.suite}</text>
<text x="${nameX}" y="60" font-family="${FONT}" font-size="9" fill="#9CA3AF" letter-spacing="0.3">${s.value}</text>
<text x="${nameX}" y="74" font-family="${MONO}" font-size="7" fill="#6B7280">src ${s.src}</text>
<text x="${nameX}" y="83" font-family="${MONO}" font-size="7" fill="#565E6B">sha256:${d.short}…</text>
${payload(s, d)}
</svg>
`;
}

/* Composed banner: 1024×300, brand grid, headline + the seven plates. */
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
<linearGradient id="wallBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#10141B"/><stop offset="1" stop-color="#07090C"/></linearGradient>
<linearGradient id="wallShield" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFB84A"/><stop offset="0.55" stop-color="#FF8A00"/><stop offset="1" stop-color="#F26B00"/></linearGradient>
</defs>
<rect width="1024" height="420" rx="16" fill="url(#wallBg)"/>
<g stroke="#1B212B" stroke-width="1">
${[1, 2, 3, 4, 5, 6, 7].map((i) => `<path d="M${i * 128} 96 V420"/>`).join("")}
</g>
${shieldGlyph(24, 18, 1.7, "wallShield")}
<text x="70" y="38" font-family="${FONT}" font-size="26" font-weight="800" fill="#F5F7FA">CoreGuard <tspan fill="#FF8A00">Badge Shield</tspan></text>
<text x="71" y="58" font-family="${FONT}" font-size="11" letter-spacing="3.2" fill="#9CA3AF">VERIFY · PROTECT · EMPOWER — SEVEN EXCLUSIVE-SOURCE PLATES</text>
<text x="760" y="38" font-family="${MONO}" font-size="10" fill="#FF8A00">CG-WALL/1</text>
<text x="760" y="54" font-family="${MONO}" font-size="8" fill="#6B7280">sha256 · committed tree · offline</text>
<text x="760" y="68" font-family="${MONO}" font-size="8" fill="#6B7280">${plates.length} exclusive-source plates</text>
${slots}
</svg>
`;
}

function regenerate() {
  mkdirSync(OUT, { recursive: true });
  const plates = [];
  for (const s of SURFACES) {
    const d = digest(s);
    let svg = plateSvg(s, d);
    /* banners reference per-plate gradients that collide when inlined; give
       each inlined copy a unique gradient id prefix so the wall stays valid */
    svg = svg.replace(/(plate|shield|sheen|edge)([a-z0-9]+)/gi, (m, g, i) => `${g}${i}`);
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
