#!/usr/bin/env node
/**
 * raer-feed.mjs — derive docs/raer/feed.json from docs/raer/registry.json.
 *
 * The feed is the ADDRESSABLE surface of RAER: the machine-readable index a
 * newsroom, a regulator's tooling, or any CI can consume the moment the next
 * AI-agent incident is announced. It carries the bilingual citation snippet —
 * the text anyone pastes when the "breaking" post lands — so the public
 * question becomes "which verdicts REPLAY?", not "who investigated?".
 *
 * LAWS (mirroring this repo's contracts):
 *  - DERIVED, never hand-edited: every field is computed from the registry;
 *    `--check` regenerates and compares bytes, exit 1 on any drift.
 *  - DETERMINISM: no timestamps, no commit hashes — two runs over the same
 *    registry produce byte-identical output (the C28 property, applied to
 *    this file itself).
 *  - FAIL-CLOSED: an incoherent registry (counts drift, unknown status,
 *    non-DEMO entry without realIncident) refuses to emit anything.
 *
 * Env: RAER_REGISTRY — override the registry path (test sandbox ONLY; never
 * set in CI). No CLI arguments: any argument is a usage error (exit 2),
 * before any file is read (the pages-settle usage-contract pattern).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REGISTRY = join(REPO, "docs", "raer", "registry.json");
const FEED_PATH = join(REPO, "docs", "raer", "feed.json");
const DEFAULT_OUTPUT = FEED_PATH;

const args = process.argv.slice(2).filter(Boolean);
if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) {
  console.error(`usage: node scripts/raer-feed.mjs [--check]  (got: ${args.join(" ")})`);
  process.exit(2);
}
const check = args.includes("--check");

const registryPath = process.env.RAER_REGISTRY
  ? join(process.cwd(), process.env.RAER_REGISTRY)
  : DEFAULT_REGISTRY;

function fail(msg) {
  console.error(`RAER-FEED: ${msg}`);
  process.exit(1);
}

// ---------- validate the registry (fail-closed, same invariants as CI) -----

const raw = (() => {
  try {
    return readFileSync(registryPath, "utf8");
  } catch (e) {
    fail(`registry unreadable: ${e.message}`);
  }
})();

let r;
try {
  r = JSON.parse(raw);
} catch (e) {
  fail(`registry is not valid JSON: ${e.message}`);
}

const problems = [];
if (r.schema !== "CG-RAER/1") problems.push(`schema must be CG-RAER/1, got ${JSON.stringify(r.schema)}`);
const statusSet = new Set(r.statuses ?? []);
if (r.statuses?.length !== statusSet.size) problems.push("duplicate statuses");
if (Array.isArray(r.entries)) {
  const tally = {};
  for (const e of r.entries) {
    if (!statusSet.has(e.status)) problems.push(`entry ${e.id}: unknown status ${e.status}`);
    tally[e.status] = (tally[e.status] ?? 0) + 1;
    if (e.status === "DEMO" && e.demo !== true) problems.push(`entry ${e.id}: DEMO must carry demo:true`);
    if (e.status !== "DEMO" && e.realIncident !== true) problems.push(`entry ${e.id}: non-DEMO entries must be realIncident:true`);
  }
  if (r.entries.length !== r.counts?.total) problems.push("entries length != counts.total");
  for (const s of r.statuses ?? []) {
    if ((r.counts?.byStatus?.[s] ?? 0) !== (tally[s] ?? 0)) problems.push(`counts.byStatus.${s} disagrees with the entries`);
  }
  const real = r.entries.filter((e) => e.realIncident).length;
  if (r.counts?.realIncidents !== real) problems.push("counts.realIncidents disagrees with the entries");
} else {
  problems.push("entries must be an array");
}
if (problems.length > 0) fail(`registry incoherent — refusing to emit:\n  ${problems.join("\n  ")}`);

// ---------- derive the feed ------------------------------------------------

const SITE = "https://eslam-x.github.io/coreguard";

const feed = {
  schema: "CG-RAER-FEED/1",
  derivedFrom: {
    source: `${SITE}/raer/registry.json`,
    spec: `${SITE}/raer/`,
    contract: "test/ci/raer-registry.test.js",
    generator: "scripts/raer-feed.mjs",
  },
  name: r.name,
  nameAr: r.nameAr,
  whatIs: "A public, neutral registry of AI-agent incidents whose evidence bundles replay deterministically: any party — the investigating lab, a regulator, an auditor, a court, the public — re-runs the same bytes through the same gate and gets the same verdict. The host certifies REPLAYABILITY, never facts.",
  whatIsAr: "سجل عام محايد لحوادث وكلاء الذكاء الاصطناعي تكون حزم أدلتها قابلة لإعادة التشغيل حتميًا: أي طرف — مختبر التحقيق، الجهة المنظمة، المدقق، المحكمة، الجمهور — يعيد تشغيل نفس البايتات عبر نفس البوابة فيحصل على نفس الحكم. المضيف يشهد على قابلية إعادة التشغيل، لا على الوقائع.",
  statuses: [...(r.statuses ?? [])].sort(),
  counts: r.counts,
  entries: (r.entries ?? []).map((e) => ({
    id: e.id,
    status: e.status,
    demo: e.demo ?? false,
    realIncident: e.realIncident ?? false,
    // AWAITING_BUNDLE surfaces: the registry records a publicly REPORTED
    // incident and points at its committed source record — it asserts no
    // fact and carries no bundle. Deep links to the publisher land only
    // with the bundle (a 404 deep-link would be a second lie channel).
    ...(e.status === "AWAITING_BUNDLE" ? {
      title: e.title,
      titleAr: e.titleAr,
      reportedBy: e.reportedBy,
      publicSources: e.publicSources ?? [],
      bundleStatus: e.evidenceBundle?.submissionStatus ?? null,
    } : {}),
    ...(e.id === r.incubatorDemoCase?.id ? { title: r.incubatorDemoCase.title } : {}),
  })),
  verify: {
    oneLiner: "one endpoint, one evidence bundle, one report schema — replayable from a cold clone by any reviewing party",
    oneLinerAr: "نقطة نهاية واحدة، حزمة أدلة واحدة، مخطط تقرير واحد — قابلة لإعادة التشغيل من استنساخ بارد من أي جهة مراجعة",
    specDoc: "https://github.com/EslaM-X/coreguard/blob/main/docs/agent-incident-evidence.md",
    reviewPage: `${SITE}/AIE-1-REVIEW.html`,
    submitHow: "copy docs/raer/submission-template.json, fill every field, open a PR — a submission that cannot parse records UNKNOWN, never a rejection",
    neverDeleted: true,
  },
  citation: {
    en: "When the next AI-agent incident is announced, don't ask \"who investigated?\" — ask \"which verdicts replay?\" RAER accepts replayable evidence bundles from any party: one endpoint, one bundle, one schema. " + `${SITE}/raer/`,
    ar: "عند إعلان الحادثة التالية لوكلاء الذكاء الاصطناعي: لا تسأل «من حقّق؟» — اسأل «أي الأحكام يمكن إعادة تشغيله؟». سجل RAER يقبل حزم أدلة قابلة لإعادة التشغيل من أي جهة: نقطة نهاية واحدة، حزمة واحدة، مخطط واحد. " + `${SITE}/raer/`,
  },
};

const out = JSON.stringify(feed, null, 2) + "\n";

if (check) {
  let current;
  try {
    current = readFileSync(FEED_PATH, "utf8");
  } catch (e) {
    fail(`--check: feed unreadable: ${e.message}`);
  }
  if (current !== out) fail(`--check: feed drifted from the registry — regenerate with \`node scripts/raer-feed.mjs\``);
  console.log("RAER-FEED: CHECK OK  (derived feed matches the registry byte-for-byte)");
  process.exit(0);
}

writeFileSync(DEFAULT_OUTPUT, out);
console.log(`RAER-FEED: WROTE ${DEFAULT_OUTPUT}`);
