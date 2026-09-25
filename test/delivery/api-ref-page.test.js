import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

test("api-ref: external defense probes — the 403/429/413 buttons script exactly the documented preconditions", () => {
  // The page must SHOW every defense code a visitor can trigger on their own
  // running endpoint, and the buttons must fire requests whose shape matches
  // the documented guard semantics (not a generic "expect an error" stub):
  //   429 — 120 verifications fill the fixed window, #121 is refused
  //   413 — an otherwise-honest fixture padded beyond the 1 MiB cap
  //   403 — a /health probe from a non-listed address (and the page must say
  //         that an unfiltered endpoint answering 200 is the contract too)
  const html = readFileSync(PAGE, "utf8");
  for (const [id, i18n] of [["runExt429", "btn_ext429"], ["runExt413", "btn_ext413"], ["runExt403", "btn_ext403"]]) {
    assert.ok(html.includes(`id="${id}"`) && html.includes(`data-i18n="${i18n}"`), `${id} button missing or unbound to its i18n key`);
    assert.match(html, new RegExp(`${i18n}:\\{en:"[^\"]+",ar:"[^\"]+"\\}`), `${i18n} must carry bilingual labels`);
  }
  assert.match(html, /live_ext_defense_note:\{en:/, "precondition note (429/413/403 semantics) must be present");
  assert.match(html, /for \(let i = 0; i < 121; i\+\+\)/, "429 probe must fire 121 verifications");
  assert.match(html, /1200 \* 1024/, "413 probe must exceed the documented 1 MiB cap");
  assert.match(html, /externalProbe\(false, "allowlist"\)/, "403 probe must be wired to the allowlist arm");
  assert.match(html, /allowAddresses/, "the 403 note must name the operator allowlist");
  for (const mode of ["ratelimit", "oversize", "allowlist"]) {
    assert.match(html, new RegExp(`externalProbe\\(false, "${mode}"\\)`), `${mode} arm must be wired to a button`);
  }
});

test("api-ref: defense codes over a real wire — the page's request shapes yield 429/413/403 from the actual handler", async () => {
  // The strongest half of the contract: replay the EXACT requests the three
  // buttons script against a live startDeliveryEndpoint instance and require
  // the documented codes with the documented bodies.
  const { startDeliveryEndpoint, MAX_BODY_BYTES } = await import(pathToFileURL(join(REPO, "packages", "delivery", "http.js")).href);
  const { loadFixtureFromDir } = await import(pathToFileURL(join(REPO, "packages", "delivery", "sdk.js")).href);
  // [C16] the live fixture tree is regenerated in place by the determinism
  // contract during a parallel full-suite run — retry a torn read, never
  // accept partial bytes.
  let fixture;
  for (let i = 0; i < 5 && !fixture; i++) {
    try { ({ fixture } = loadFixtureFromDir(join(REPO, "examples", "delivery-fixture"))); }
    catch { await new Promise((r) => setTimeout(r, 50)); }
  }
  assert.ok(fixture, "fixture could not be loaded intact");
  const base = { "content-type": "application/json" };

  // 413 — honest fixture + whitespace padding over the declared cap.
  const s413 = await startDeliveryEndpoint({ port: 0 });
  try {
    const p413 = s413.address().port;
    const r = await fetch(`http://127.0.0.1:${p413}/verify`, { method: "POST", headers: base, body: JSON.stringify(fixture) + " ".repeat(1200 * 1024) });
    assert.equal(r.status, 413);
    const j = await r.json();
    assert.equal(j.status, "REJECTED");
    assert.match(j.error, new RegExp(`exceeds ${MAX_BODY_BYTES} bytes`));
    assert.equal(r.headers.get("x-dde-boundary"), "DDE-BOUNDARY");

    // 429 — 120 verifications fill the window, #121 is refused with retry-after.
    let last;
    for (let i = 0; i < 121; i++) {
      last = await fetch(`http://127.0.0.1:${p413}/verify`, { method: "POST", headers: base, body: JSON.stringify(fixture) });
    }
    assert.equal(last.status, 429);
    const j429 = await last.json();
    assert.equal(j429.status, "REJECTED");
    assert.match(j429.error, /rate limit exceeded/);
    assert.ok(Number(last.headers.get("retry-after")) >= 1, "429 must carry retry-after");
  } finally { await new Promise((res) => s413.close(res)); }

  // 403 — a second endpoint pinned to a foreign allowlist; a loopback /health
  // probe is refused before anything else (an unfiltered endpoint answering
  // 200 is the OTHER documented posture, asserted by the honest suites).
  const s403 = await startDeliveryEndpoint({ port: 0, allowAddresses: ["198.51.100.9"] });
  try {
    const p403 = s403.address().port;
    const r = await fetch(`http://127.0.0.1:${p403}/health`);
    assert.equal(r.status, 403);
    const j = await r.json();
    assert.equal(j.status, "REJECTED");
    assert.match(j.error, /allowlist/);
  } finally { await new Promise((res) => s403.close(res)); }
});
test("api-ref: runPc drives a fresh handler — the factory-as-handler misfire (HTTP 0) is locked out", () => {
  // [C24] ENGINE_READY is a FACTORY; handing the factory itself (not its
  // product) to callHandler leaves statusCode 0 with no exception — a dead
  // control that shipped silently on the published page. The call site must
  // await the factory and invoke it, exactly like the six scenarios do.
  const html = readFileSync(PAGE, "utf8");
  assert.match(html, /return \(\) => mod\.createDeliveryRequestHandler/,
    "ENGINE_READY must be a factory — fresh handler per run (fresh rate budget)");
  const pcAt = html.indexOf('document.getElementById("runPc").onclick');
  assert.ok(pcAt > 0, "runPc wiring missing");
  const seg = html.slice(pcAt, pcAt + 700);
  assert.match(seg, /const makeHandler = await ENGINE_READY;/,
    "runPc must await the factory under its scenario name");
  assert.match(seg, /callHandler\(makeHandler\(\), "POST", "\/peoples-court"/,
    "runPc must drive a FRESH handler from the factory");
  assert.doesNotMatch(seg, /const handler = await ENGINE_READY;[\s\S]*callHandler\(handler,/,
    "the misfire literal (factory passed as handler → HTTP 0) is forbidden");
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
