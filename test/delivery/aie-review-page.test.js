import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const PAGE = join(REPO, "docs", "AIE-1-REVIEW.html");
const SDKREF = join(REPO, "docs", "DDE-SDK-REFERENCE.html");
const ADOPT = join(REPO, "docs", "aie1-adoption-map.md");
const BRIEF = join(REPO, "docs", "mcit-aic-briefing-ar.md");
const INJECTOR = join(REPO, "examples", "delivery-fixture", "inject-demo-data.mjs");

/** Extract a page's injected payload line as a JS object. */
function readPayload(page, marker) {
  const html = readFileSync(page, "utf8");
  const i = html.indexOf(marker);
  assert.ok(i >= 0, `${marker} payload line missing — run inject-demo-data.mjs`);
  const end = html.indexOf("\n", i);
  let line = html.slice(i + marker.length, end).trim();
  if (line.endsWith(";")) line = line.slice(0, -1);
  return JSON.parse(line);
}

/**
 * Browser-equivalent boot of the AIE-1 payload (files OUTSIDE the repo so a
 * bare specifier finds no node_modules — same discipline as sdk-ref-page).
 */
async function bootLikeBrowser(D) {
  const dir = join(tmpdir(), "aie-review-boot-" + Date.now());
  mkdirSync(dir, { recursive: true });
  const mods = {};
  const define = (name, src) => {
    const file = join(dir, name.replaceAll(/[/:]/g, "_") + ".mjs");
    writeFileSync(file, src, "utf8");
    mods[name] = pathToFileURL(file).href;
    return mods[name];
  };
  const rewrite = (src) => src
    .replaceAll('from "node:crypto"', `from ${JSON.stringify(mods["node:crypto"])}`)
    .replaceAll('import("node:crypto")', `import(${JSON.stringify(mods["node:crypto"])})`)
    .replaceAll('from "node:fs"', `from ${JSON.stringify(mods["node:fs"])}`)
    .replaceAll('from "node:path"', `from ${JSON.stringify(mods["node:path"])}`)
    .replaceAll('from "node:url"', `from ${JSON.stringify(mods["node:url"])}`)
    .replaceAll('from "@coreguard/canonical"', `from ${JSON.stringify(mods["__canonical__"])}`)
    .replaceAll('from "./index.js"', `from ${JSON.stringify(mods["__delivery__"])}`);
  define("node:crypto", D.sources["__shim__/crypto.mjs"]);
  define("node:fs", D.sources["__shim__/fs.mjs"]);
  define("node:path", D.sources["__shim__/path.mjs"]);
  define("node:url", D.sources["__shim__/path.mjs"]);
  define("node:http", D.sources["__shim__/http.mjs"]);
  define("__canonical__", rewrite(D.sources["packages/canonical/index.js"]));
  define("__delivery__", rewrite(D.sources["packages/delivery/index.js"]));
  const sdkUrl = define("__sdk__", rewrite(D.sources["packages/delivery/sdk.js"]));
  const mod = await import(sdkUrl);
  return { verifyFixture: mod.verifyFixture, releaseWhen: mod.releaseWhen, dir };
}

test("AIE-1 page: injected payload is byte-identical to the SDK page's (one bundle, one schema)", () => {
  const aie = readPayload(PAGE, "window.__DDE_AIE_DATA__ = ");
  const sdk = readPayload(SDKREF, "window.__DDE_SDK_DATA__ = ");
  assert.deepEqual(aie.sources, sdk.sources, "both pages must embed the SAME engine sources");
  assert.deepEqual(aie.fixture, sdk.fixture, "both pages must embed the SAME evidence bundle");
});

test("AIE-1 page: browser-equivalent boot runs the three scenarios to their contract verdicts", async () => {
  const D = readPayload(PAGE, "window.__DDE_AIE_DATA__ = ");
  const { verifyFixture, releaseWhen, dir } = await bootLikeBrowser(D);
  try {
    const PREDICATE = (r) => r.status === "VERIFIED" &&
      r.peoplesCourt && r.peoplesCourt.items.some((i) => i.kind === "ACCEPTANCE_RECORD" && i.ref === "ACCEPTED");

    // honest → VERIFIED + HOLD (predicate needs an explicit ACCEPTED record)
    const honest = await verifyFixture({ fixture: D.fixture, peoplesCourt: true });
    const gHonest = releaseWhen(honest, PREDICATE);
    assert.equal(honest.status, "VERIFIED");
    assert.equal(gHonest.release, false, "the honest baseline holds: the modeled acceptance record is REJECTED");
    assert.ok(gHonest.reasons.length > 0 && gHonest.reasons[0].startsWith("release predicate not satisfied"));

    // tamper → REJECTED naming the flipped byte in the documented format
    const f = JSON.parse(JSON.stringify(D.fixture));
    const pin = f.delivery.artifacts[0].sha256;
    f.delivery.artifacts[0].sha256 = pin.slice(0, 2) + (pin[2] === "4" ? "0" : "4") + pin.slice(3);
    const tamper = await verifyFixture({ fixture: f });
    assert.equal(tamper.status, "REJECTED");
    const e3 = tamper.checks.find((c) => c.name === "DELIVERY_INTEGRITY_REPLAY");
    assert.match(e3.mismatches[0], /logo\.svg: recorded 0x[0-9a-f]{8}… != actual 0x[0-9a-f]{8}…/);

    // empty → structurally refused, predicate never consulted
    const empty = await verifyFixture({});
    assert.equal(empty.status, "REJECTED");
    const gEmpty = releaseWhen(empty, () => true);
    assert.equal(gEmpty.release, false);
    assert.match(gEmpty.reasons[0], /no release without a VERIFIED report/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AIE-1 page: the injector targets this page (payload idempotency contract)", async () => {
  const inj = readFileSync(INJECTOR, "utf8");
  assert.match(inj, /AIE-1-REVIEW\.html/, "the injector must list the AIE-1 review page as an injection target");
  assert.match(inj, /__DDE_AIE_DATA__/);
});

test("AIE-1 page: cross-links from the outreach docs are present and literal", () => {
  const html = readFileSync(PAGE, "utf8");
  // the page links its two sibling surfaces and the spec
  assert.ok(html.includes('href="DDE-API-REFERENCE.html"'), "review page must cross-link the wire surface");
  assert.ok(html.includes('href="DDE-SDK-REFERENCE.html"'), "review page must cross-link the SDK surface");
  assert.ok(html.includes("docs/agent-incident-evidence.md"), "review page must link the AIE-1 spec");
  // the adoption map and the Arabic brief must both route to the review page
  const adopt = readFileSync(ADOPT, "utf8");
  const brief = readFileSync(BRIEF, "utf8");
  assert.ok(adopt.includes("docs/AIE-1-REVIEW.html"), "adoption map must route to the review page");
  assert.ok(brief.includes("docs/AIE-1-REVIEW.html"), "the ministry brief must route to the review page");
  // deep-link contract
  assert.match(html, /#run=/, "the page must implement #run= deep links");
  assert.match(html, /runHash/, "deep-link dispatcher present");
  // [C24] applied: the hash block sits AFTER main() is kicked off
  const iMain = html.indexOf("main();");
  const iHash = html.indexOf("function runHash");
  assert.ok(iMain > 0 && iHash > iMain, "the deep-link block must come after main() starts (lesson C24)");
});

test("AIE-1 page: bilingual structure — EN default with a persistent AR toggle", () => {
  const html = readFileSync(PAGE, "utf8");
  assert.match(html, /<html lang="en" dir="ltr">/, "EN is the default language");
  assert.ok(html.includes('id="langToggle"'), "language toggle present");
  assert.ok(html.includes("data-lang-text=\"ar\""), "Arabic mirror text present");
  assert.ok(html.includes("localStorage"), "language choice persists");
});
