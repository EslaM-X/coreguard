#!/usr/bin/env node
/**
 * inject-demo-data.mjs — embed the fixture records into the DDE demo page.
 *
 * Replaces the __DDE_DATA__ marker inside docs/DELIVERY-DISPUTE-DEMO.html
 * with `window.__DDE_DATA__ = { … }`, making the page fully self-contained
 * (no fetch; works from file://, the preview server, and GitHub Pages).
 * The relative-fetch fallback in loadFixture() remains for a skipped
 * injection.
 *
 * Idempotent: re-running replaces the previous payload. Data is regenerated
 * from examples/delivery-fixture/ records, so it always mirrors the repo
 * truth at injection time. Run after any fixture regeneration.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEMO = join(REPO, "docs", "DELIVERY-DISPUTE-DEMO.html");
const MARKER = "/*__DDE_DATA__*/";

const NAMES = [
  "agreement", "acceptance-criteria", "authorization", "execution-attestation",
  "delivery-manifest", "acceptance-record", "dispute-record",
  "consent-and-disclosure", "retention-policy",
];

const data = {};
for (const n of NAMES) {
  data[n] = JSON.parse(readFileSync(join(REPO, "examples", "delivery-fixture", n + ".json"), "utf8"));
}
data._hashes = JSON.parse(readFileSync(join(REPO, "examples", "delivery-fixture", "hashes.json"), "utf8"));

let html = readFileSync(DEMO, "utf8");
if (!html.includes(MARKER)) {
  console.error("inject: __DDE_DATA__ marker not found — page structure changed?");
  process.exit(1);
}
const payload = "window.__DDE_DATA__ = " + JSON.stringify(data) + ";";
html = html.replace(MARKER, `/* injected by examples/delivery-fixture/inject-demo-data.mjs — source of truth: examples/delivery-fixture/ */\n${payload}`);
writeFileSync(DEMO, html, "utf8");
console.log(`injected ${NAMES.length + 1} records into docs/DELIVERY-DISPUTE-DEMO.html (${payload.length} bytes of data)`);
