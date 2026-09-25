import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const PAGE = join(REPO, "docs", "DDE-API-REFERENCE.html");
const INJECTOR = join(REPO, "examples", "delivery-fixture", "inject-demo-data.mjs");

/** Extract the single live payload line as a JS object. */
function readPayload() {
  const html = readFileSync(PAGE, "utf8");
  const marker = "window.__DDE_API_DATA__ = ";
  const i = html.indexOf(marker);
  assert.ok(i >= 0, "payload line missing — run inject-demo-data.mjs");
  const end = html.indexOf("\n", i);
  let line = html.slice(i + marker.length, end).trim();
  if (line.endsWith(";")) line = line.slice(0, -1);
  return JSON.parse(line);
}

test("api-ref: injected payload parses and carries fixture + real sources", () => {
  const data = readPayload();
  for (const key of ["agreement", "acceptanceCriteria", "parties", "authorization", "execution",
                     "delivery", "acceptanceRecord", "disputeRecord", "consentAndDisclosure",
                     "retentionPolicy"]) {
    assert.ok(data.fixture && data.fixture[key], `fixture.${key} missing from payload`);
  }
  for (const src of ["packages/canonical/index.js", "packages/delivery/index.js",
                     "packages/delivery/http.js", "__shim__/crypto.mjs", "__shim__/http.mjs"]) {
    assert.ok(data.sources && data.sources[src], `source ${src} missing from payload`);
  }
  assert.equal(data.fixture.origin, "SYNTHETIC", "fixture disclosure must stay loud");
});

test("api-ref: canonical bundle is fully merged (no dangling uint specifier)", () => {
  const { sources } = readPayload();
  const can = sources["packages/canonical/index.js"];
  assert.doesNotMatch(can, /"\.\/uint\.js"|uint-inlined/,
    "canonical bundle references an unresolvable uint module — page would fail to link");
  assert.match(can, /function canonicalUintString/, "uint functions must be inlined");
});

test("api-ref: http shim covers the exact Node Buffer surface the engine uses", () => {
  const { sources } = readPayload();
  const shim = sources["__shim__/http.mjs"];
  assert.match(shim, /static concat/, "handler needs Buffer.concat");
  assert.match(shim, /static from\(/, "artifactSha256 needs Buffer.from(str, 'utf8')");
  assert.match(shim, /toString\(enc\)/, "handler needs Buffer(...).toString('utf8')");
  assert.match(shim, /createServer/, "import surface must include createServer (never called in-page)");
  // The page must bind Buffer as a global BEFORE importing the engine —
  // a bare `Buffer.concat` reference inside the handler relies on it.
  const html = readFileSync(PAGE, "utf8");
  const bindAt = html.indexOf("globalThis.Buffer = globalThis.Buffer");
  const engineAt = html.indexOf("await import(httpUrl)");
  assert.ok(bindAt > 0 && engineAt > bindAt, "Buffer global must be bound before the engine import");
});

test("api-ref: browser-equivalent boot — the bare @coreguard/canonical import is mapped (engine links in-page)", () => {
  // index.js imports its canonical dependency BARE. A browser has no
  // node_modules walk, so the page's module registry must map that exact
  // specifier — this precise gap shipped once and the embedded engine failed
  // to link ONLY in browsers (Node-based tests resolved the bare specifier
  // via node_modules and stayed green). Fail closed on the page source.
  const html = readFileSync(PAGE, "utf8");
  assert.match(html, /replaceAll\('from "@coreguard\/canonical"'/,
    "module registry must map the bare @coreguard/canonical specifier");
  const mapAt = html.indexOf("@coreguard/canonical\"");
  const engineAt = html.indexOf("await import(httpUrl)");
  assert.ok(mapAt > 0 && engineAt > mapAt, "bare mapping must exist before the engine import");
});

test("api-ref: page structure — all six wire scenarios + boundary + i18n", () => {
  const html = readFileSync(PAGE, "utf8");
  for (const code of [200, 422, 400, 413, 429, 404]) {
    assert.ok(html.includes(`code: ${code}`), `scenario ${code} missing from SCENARIOS table`);
  }
  assert.match(html, /CONFORMITY_UNDECIDED_BY_ENGINE/, "the boundary decision string must be displayed");
  assert.match(html, /x-dde-boundary: DDE-BOUNDARY/, "the boundary header must be documented in-page");
  assert.match(html, /Never judges conformity|conformity undecided/, "the boundary must be visible in page prose");
  assert.ok(html.includes('ar:'), "Arabic strings present (i18n parity)");
  assert.ok(html.includes('langBtn'), "language toggle wired");
  assert.equal((html.match(/<\/html>/g) || []).length, 1, "exactly one document close (no duplicated tail)");
});

test("api-ref: idempotent build — re-running the injector changes no bytes", () => {
  const before = readFileSync(PAGE, "utf8");
  execFileSync(process.execPath, [INJECTOR], { cwd: REPO, stdio: "pipe" });
  const after = readFileSync(PAGE, "utf8");
  assert.equal(after, before, "injector must be idempotent over the committed page");
});

test("api-ref: deep links — the boundary doc's try-it-live pointers resolve to wired in-page scenarios", () => {
  // docs/delivery-dispute-boundary.md §6 points its curl examples at the
  // published page via #run=… deep links. The page must consume that exact
  // hash grammar, every linked name must be a wired scenario (peoples-court
  // deep-links the runPc handler; the /health curl has no embedded scenario
  // and deep-links the #playground anchor instead), and this contract fails
  // the push the day either side renames.
  const doc = readFileSync(join(REPO, "docs", "delivery-dispute-boundary.md"), "utf8");
  const html = readFileSync(PAGE, "utf8");
  const links = [...doc.matchAll(/DDE-API-REFERENCE\.html#(run=[a-z-]+|playground)/g)].map((m) => m[1]);
  assert.ok(links.includes("run=honest") && links.includes("run=peoples-court") && links.includes("playground"),
    "boundary doc must deep-link verify, peoples-court and health to the live page");
  assert.match(html, /match\(\/\^#run=\(\[a-z-\]\+\)\$\/\)/,
    "page must parse the #run= deep-link grammar");
  const hashAt = html.indexOf("^#run=");
  const pcAt = html.indexOf('document.getElementById("runPc").onclick');
  assert.ok(hashAt > 0 && pcAt > 0 && hashAt > pcAt, "hash consumer must sit after the handlers it drives");
  for (const link of links) {
    if (!link.startsWith("run=")) continue;
    const sc = link.slice(4);
    const wired = sc === "peoples-court"
      ? html.includes('document.getElementById("runPc").click()')
      : html.includes(`"${sc}"`);
    assert.ok(wired, `deep link #${link} has no wired in-page scenario`);
  }
});
