import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const PAGE = join(REPO, "docs", "DDE-SDK-REFERENCE.html");
const APIREF = join(REPO, "docs", "DDE-API-REFERENCE.html");
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
 * Browser-equivalent module composition: rewrite the injected sources the
 * way the page does, materialize them as FILES OUTSIDE the repo, and boot.
 * Outside the repo a bare specifier finds no node_modules — exactly like a
 * browser — so this simulation catches the shipped-unmapped-bare-import
 * failure mode that Node-cwd tests silently pass through (C15 family).
 */
async function bootSdkLikeBrowser(D) {
  const dir = join(tmpdir(), "sdk-ref-boot-" + Date.now());
  mkdirSync(dir, { recursive: true });
  const mods = {};
  const define = (name, src) => {
    const file = join(dir, name.replaceAll(/[/:]/g, "_") + ".mjs");
    writeFileSync(file, src, "utf8");
    mods[name] = pathToFileURL(file).href;
  };
  const rewrite = (src) => src
    .replaceAll('from "node:crypto"', `from ${JSON.stringify(mods["node:crypto"])}`)
    .replaceAll('import("node:crypto")', `import(${JSON.stringify(mods["node:crypto"])})`)
    .replaceAll('from "node:fs"', `from ${JSON.stringify(mods["node:fs"])}`)
    .replaceAll('from "node:path"', `from ${JSON.stringify(mods["node:path"])}`)
    .replaceAll('from "node:url"', `from ${JSON.stringify(mods["node:url"])}`)
    .replaceAll('from "node:http"', `from ${JSON.stringify(mods["node:http"])}`)
    .replaceAll('from "@coreguard/canonical"', `from ${JSON.stringify(mods["__canonical__"])}`)
    .replaceAll('from "./index.js"', `from ${JSON.stringify(mods["__delivery__"])}`);

  define("node:crypto", D.sources["__shim__/crypto.mjs"]);
  define("node:fs", D.sources["__shim__/fs.mjs"]);
  // path and url share one string-level shim — both specifiers map to it.
  define("node:path", D.sources["__shim__/path.mjs"]);
  define("node:url", D.sources["__shim__/path.mjs"]);
  define("node:http", D.sources["__shim__/http.mjs"]);
  define("__canonical__", rewrite(D.sources["packages/canonical/index.js"]));
  define("__delivery__", rewrite(D.sources["packages/delivery/index.js"]));
  define("__sdk__", rewrite(D.sources["packages/delivery/sdk.js"]));

  globalThis.Buffer = globalThis.Buffer || (await import(mods["node:http"])).Buffer;
  const sdk = await import(mods["__sdk__"]);
  const { createHash } = await import(mods["node:crypto"]);
  return { verifyFixture: sdk.verifyFixture, releaseWhen: sdk.releaseWhen, createHash };
}

const D = () => readPayload(PAGE, "window.__DDE_SDK_DATA__ = ");

test("sdk-ref: injected payload parses and carries fixture + real sources + fs shim", () => {
  const d = D();
  for (const key of ["agreement", "acceptanceCriteria", "parties", "authorization", "execution",
                     "delivery", "acceptanceRecord", "disputeRecord", "consentAndDisclosure",
                     "retentionPolicy"]) {
    assert.ok(d.fixture && d.fixture[key], `fixture.${key} missing from payload`);
  }
  for (const src of ["packages/canonical/index.js", "packages/delivery/index.js",
                     "packages/delivery/sdk.js", "__shim__/crypto.mjs", "__shim__/http.mjs",
                     "__shim__/fs.mjs", "__shim__/path.mjs"]) {
    assert.ok(d.sources && d.sources[src], `source ${src} missing from payload`);
  }
  assert.equal(d.fixture.origin, "SYNTHETIC", "fixture disclosure must stay loud");
  assert.match(d.claims.engine, /sdk/, "claims must name the SDK engine");
});

test("sdk-ref: page structure — arc trio + boundary + i18n parity + single document", () => {
  const html = readFileSync(PAGE, "utf8");
  for (const word of ["HOLD", "RELEASE", "REFUSED"]) {
    assert.ok(html.includes(`gate_${word.toLowerCase()}`), `gate state ${word} missing`);
  }
  assert.match(html, /ACCEPTANCE_PREDICATE/, "the live predicate must be a named constant");
  assert.match(html, /peoplesCourt\.items\.some/, "predicate must read the real projection shape");
  assert.ok(html.includes('ar:'), "Arabic strings present (i18n parity)");
  assert.ok(html.includes('langBtn'), "language toggle wired");
  assert.match(html, /globalThis\.Buffer = globalThis\.Buffer/, "Buffer must be bound as a global before engine import");
  const bindAt = html.indexOf("globalThis.Buffer = globalThis.Buffer");
  const engineAt = html.indexOf("await import(sdkUrl)");
  assert.ok(bindAt > 0 && engineAt > bindAt, "Buffer binding must precede the SDK import");
  assert.equal((html.match(/<\/html>/g) || []).length, 1, "exactly one document close (no duplicated tail)");
});

test("sdk-ref: BROWSER-EQUIVALENT BOOT — the real verifyFixture + releaseWhen run over the injected bytes", async () => {
  const d = D();
  const sdk = await bootSdkLikeBrowser(d);

  // Scenario 1 — honest baseline: VERIFIED evidence + HOLD (acceptance REJECTED).
  const honest = await sdk.verifyFixture({ fixture: d.fixture, peoplesCourt: true });
  assert.equal(honest.status, "VERIFIED", "honest baseline must verify (evidence integrity)");
  assert.match(honest.decision, /CONFORMITY_UNDECIDED_BY_ENGINE/, "boundary decision must ride the envelope");
  const hold = sdk.releaseWhen(honest, (r) => r.status === "VERIFIED" &&
    r.peoplesCourt.items.some((i) => i.kind === "ACCEPTANCE_RECORD" && i.ref === "ACCEPTED"));
  assert.equal(hold.release, false, "honest baseline must HOLD");
  assert.match(hold.reasons[0], /predicate not satisfied/);

  // Scenario 2 — honest ACCEPTED arc: satisfy the criterion, re-pin truthfully,
  // criteria pass, verdict ACCEPTED → the gate RELEASES with empty reasons.
  const f = JSON.parse(JSON.stringify(d.fixture));
  const a = f.delivery.artifacts[1];
  a.content = a.content.replace("- Surface: #0d1b2a\n", "- Surface: #0d1b2a\n- Accent: #f4f7fa\n");
  a.bytes = Buffer.byteLength(a.content, "utf8");
  a.sha256 = "0x" + createHash("sha256").update(a.content, "utf8").digest("hex");
  for (const e of f.acceptanceRecord.evaluations) e.result = "PASS";
  f.acceptanceRecord.verdict = "ACCEPTED";
  const acc = await sdk.verifyFixture({ fixture: f, peoplesCourt: true });
  assert.equal(acc.status, "VERIFIED", "the ACCEPTED arc must still verify (re-pin keeps integrity honest)");
  const release = sdk.releaseWhen(acc, (r) => r.status === "VERIFIED" &&
    r.peoplesCourt.items.some((i) => i.kind === "ACCEPTANCE_RECORD" && i.ref === "ACCEPTED"));
  assert.equal(release.release, true, "honest ACCEPTED arc must RELEASE");
  assert.deepEqual(release.reasons, []);

  // Scenario 3 — structural refusal: REJECTED report + `() => true` predicate.
  const tampered = JSON.parse(JSON.stringify(d.fixture));
  tampered.delivery.artifacts[0].content = tampered.delivery.artifacts[0].content.replace("</svg>", "<X/svg>");
  const rep = await sdk.verifyFixture({ fixture: tampered });
  assert.equal(rep.status, "REJECTED", "flipped byte must be caught (E3)");
  const refused = sdk.releaseWhen(rep, () => true);
  assert.equal(refused.release, false, "the SDK must refuse release on a non-VERIFIED report regardless of predicate");
  assert.match(refused.reasons[0], /no release without a VERIFIED report/);

  // Scenario 4 — fail-closed fs shim: the in-page fs reports no filesystem.
  const fsShim = await import(modsUrl(D().sources["__shim__/fs.mjs"]));
  assert.equal(fsShim.existsSync("anything"), false);
  assert.throws(() => fsShim.readFileSync("anything"), /unavailable in-page/);
});

// Small helper: materialize a shim source standalone and import it.
function modsUrl(src) {
  const file = join(tmpdir(), `sdk-ref-shim-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
  writeFileSync(file, src, "utf8");
  return pathToFileURL(file).href;
}

test("sdk-ref: idempotent build — re-running the injector changes no bytes (both live pages)", () => {
  const beforeSdk = readFileSync(PAGE, "utf8");
  const beforeApi = readFileSync(APIREF, "utf8");
  execFileSync(process.execPath, [INJECTOR], { cwd: REPO, stdio: "pipe" });
  assert.equal(readFileSync(PAGE, "utf8"), beforeSdk, "SDK page injector must be idempotent");
  assert.equal(readFileSync(APIREF, "utf8"), beforeApi, "API page injector must be idempotent");
});

test("sdk-ref: deep links — INTEGRATION.md's release-law arc resolves to wired in-page scenarios", () => {
  // INTEGRATION.md §"Two-line SDK gate" points its four-scenario release arc
  // (HOLD/RELEASE/REFUSED/REFUSED) at the published page via #run=… deep
  // links. The page must consume that exact hash grammar, every linked name
  // must be a wired scenario, and this contract fails the push the day
  // either side renames.
  const doc = readFileSync(join(REPO, "INTEGRATION.md"), "utf8");
  const readme = readFileSync(join(REPO, "README.md"), "utf8");
  const html = readFileSync(PAGE, "utf8");
  const links = [...doc.matchAll(/DDE-SDK-REFERENCE\.html#run=([a-z]+)/g)].map((m) => m[1])
    .concat([...readme.matchAll(/DDE-SDK-REFERENCE\.html#run=([a-z]+)/g)].map((m) => m[1]));
  assert.ok(links.includes("verify") && links.includes("accepted") && links.includes("tamper") && links.includes("misuse"),
    "INTEGRATION.md must deep-link all four gate-arc scenarios");
  assert.ok(readme.includes("DDE-API-REFERENCE.html#run=honest") && readme.includes("DDE-API-REFERENCE.html#run=tamper")
    && links.includes("verify") && links.includes("accepted"),
    "README must deep-link its three fixture examples (honest/accepted/tamper) to the live pages");
  assert.match(html, /match\(\/\^#run=\(\[a-z\]\+\)\$\/\)/,
    "page must parse the #run= deep-link grammar");
  // [C24] sibling: the hash consumer must run AFTER the boot's final
  // renderTable()/renderDetail() — a block placed mid-main races the boot
  // re-render (its selection gets wiped) and reruns against an unresolved
  // SDK. The last boot render is the earliest safe point.
  const html2 = html;
  const hashAt = html2.indexOf("^#run=");
  // the boot's final render is the LAST re-render BEFORE the hash block
  // (the hash block itself contains a render pair — search only up to it)
  const bootRerenderAt = html2.slice(0, hashAt).lastIndexOf("renderTable(); renderDetail();");
  const rerunAt = html2.indexOf("async function rerun");
  assert.ok(hashAt > 0 && rerunAt > 0 && bootRerenderAt > 0,
    "deep-link block, boot re-render or rerun() missing from page script");
  assert.ok(hashAt > bootRerenderAt && hashAt < rerunAt,
    "hash consumer must sit between the boot's final render and rerun()'s definition");
  const pageScenarios = [...html.matchAll(/const SCENARIOS = \[([^\]]+)\]/g)][0];
  assert.ok(pageScenarios, "SCENARIOS list missing from page script");
  for (const sc of links) {
    assert.match(pageScenarios[1], new RegExp(`"${sc}"`),
      `deep link #run=${sc} has no wired in-page scenario`);
  }
});

test("sdk-ref: cross-links — the page mirrors its scenarios to the API reference page, bilingually", () => {
  const html = readFileSync(PAGE, "utf8");
  assert.match(html, /DDE-API-REFERENCE\.html#run=honest/, "must cross-link the wire honest scenario");
  assert.match(html, /DDE-API-REFERENCE\.html#run=peoples-court/, "must cross-link the wire projection");
  assert.match(html, /DDE-API-REFERENCE\.html#run=tamper/, "must cross-link the wire tamper scenario");
  assert.match(html, /xlink:\{en:"/, "cross-link line must be bilingual");
  const buildAt = html.indexOf('xl.innerHTML = L(I18N.xlink)');
  const staticAt = html.indexOf("function applyStatic");
  assert.ok(buildAt > staticAt > 0, "cross-links must be rebuilt after the i18n static pass");
});
