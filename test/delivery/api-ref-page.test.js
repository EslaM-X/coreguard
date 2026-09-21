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
