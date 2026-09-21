#!/usr/bin/env node
/**
 * inject-demo-data.mjs — embed the fixture records into the DDE demo page,
 * and the live API payload into the API-reference page.
 *
 * Page 1 — docs/DELIVERY-DISPUTE-DEMO.html
 *   Replaces the __DDE_DATA__ marker with `window.__DDE_DATA__ = { … }`,
 *   making the page fully self-contained (no fetch; works from file://, the
 *   preview server, and GitHub Pages). The relative-fetch fallback in
 *   loadFixture() remains for a skipped injection.
 *
 * Page 2 — docs/DDE-API-REFERENCE.html
 *   Replaces the __DDE_API_DATA__ marker with the payload the page's embedded
 *   engine consumes:
 *     - fixture: the ten records at their ENGINE keys via the real SDK loader
 *     - sources: the real packages/delivery code (canonical with uint.js
 *       merged — the page has no relative module tree — plus delivery/index,
 *       sdk, http) so the wire contract on the page is the repo's own code
 *     - __shim__/crypto.mjs: a real SHA-256 exposing the exact createHash
 *       surface node:crypto provides, cross-checked against node:crypto over
 *       NIST/deterministic vectors — injection FAILS CLOSED on any mismatch
 *     - __shim__/http.mjs: a Buffer.concat-compatible module so the handler's
 *       Buffer.concat(chunks) resolves (Buffer is a real global on every
 *       browser target this repo ships)
 *   Idempotent: re-running replaces the previous payloads. Run after any
 *   fixture regeneration or engine change.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEMO = join(REPO, "docs", "DELIVERY-DISPUTE-DEMO.html");
const APIREF = join(REPO, "docs", "DDE-API-REFERENCE.html");
const MARKER = "/*__DDE_DATA__*/";
const MARKER_API = "/*__DDE_API_DATA__*/";

const NAMES = [
  "agreement", "acceptance-criteria", "authorization", "execution-attestation",
  "delivery-manifest", "acceptance-record", "dispute-record",
  "consent-and-disclosure", "retention-policy",
];

/* ---------------------------------------------------------------- page 1 */
const data = {};
for (const n of NAMES) {
  data[n] = JSON.parse(readFileSync(join(REPO, "examples", "delivery-fixture", n + ".json"), "utf8"));
}
data._hashes = JSON.parse(readFileSync(join(REPO, "examples", "delivery-fixture", "hashes.json"), "utf8"));

let html = readFileSync(DEMO, "utf8");
const demoPayload = "window.__DDE_DATA__ = " + JSON.stringify(data) + ";";
// Idempotent re-injection: the ORIGINAL shipped page shipped the marker, but
// the committed page carries the previous payload — so the injector targets
// the payload line itself (or the original marker on a pristine tree).
const payloadLine = /^window\.__DDE_DATA__ = .*;$/m;
if (payloadLine.test(html)) {
  html = html.replace(payloadLine, demoPayload);
} else if (html.includes(MARKER)) {
  html = html.replace(MARKER, demoPayload);
} else {
  console.error("inject: __DDE_DATA__ marker/payload not found — page structure changed?");
  process.exit(1);
}
writeFileSync(DEMO, html, "utf8");
console.log(`injected ${NAMES.length + 1} records into docs/DELIVERY-DISPUTE-DEMO.html (${demoPayload.length} bytes of data)`);

/* ---------------------------------------------------------------- page 2 */

// --- canonical with uint.js merged (the page has no relative module tree) ---
// The re-export `export { … } from "./uint.js"` is REPLACED, not kept: the
// uint source is inlined below, so a dangling `from "./uint-inlined.js"`
// reference would explode at module link time in the browser.
// readSrc normalizes CRLF → LF: on Windows checkouts git may materialize
// sources with CRLF, and the injected payload embeds source text verbatim —
// without this, a Windows rebuild differs byte-wise from the CI (LF) build
// and the page's determinism contract test fails on Windows only.
const readSrc = (p) => readFileSync(join(REPO, p), "utf8").replace(/\r\n/g, "\n");
const canonicalSrc = readSrc("packages/canonical/index.js");
const uintSrc = readSrc("packages/canonical/uint.js");
const canonicalMerged =
  canonicalSrc.replace(/export\s*\{[^}]*\}\s*from\s*"\.\/uint\.js";?/, "/* uint.js re-export resolved by the injected inline bundle below */")
  + "\n/* ---- merged from packages/canonical/uint.js (injected bundle) ---- */\n"
  + uintSrc.replace(/^import\s+[^;]+;\s*$/gm, "").replace(/export\s+const\s+/g, "const ")
           .replace(/export\s+function\s+/g, "function ")
           .replace(/export\s+{[^}]*};?/g, "");
// Fail-closed guards: the merge must have consumed BOTH hazards, or the page
// bundle would carry a specifier the module registry cannot resolve. Matches
// the SPECIFIER forms ("./uint.js", any uint-inlined reference) — not the
// word "uint.js" in prose comments, which legitimately remains.
if (/"\.\/uint\.js"|uint-inlined/.test(canonicalMerged)) {
  console.error("inject: canonical bundle still references uint.js — merge failed");
  process.exit(1);
}
if (!/function canonicalUintString/.test(canonicalMerged)) {
  console.error("inject: uint.js functions missing from canonical bundle — merge failed");
  process.exit(1);
}
const canonicalBundled = canonicalMerged;

// --- shims (plain ESM, no imports of their own) ---

// node:crypto shim — real SHA-256 over the exact createHash surface used by
// packages/canonical (createHash("sha256").update(x).digest("hex") over
// string|Uint8Array) and packages/delivery (dynamic import + same chain).
const CRYPTO_SHIM = `/* node:crypto shim — real SHA-256 (browser); created by inject-demo-data.mjs.
   Cross-checked against node:crypto at injection time; injection fails closed
   on any vector mismatch. Only the surface the engine uses is provided. */
const K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
]);
function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
export class Sha256 {
  constructor() { this._pending = new Uint8Array(0); this._len = 0;
    this.h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]); }
  update(data) {
    const d = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
    this._len += d.length;
    const all = new Uint8Array(this._pending.length + d.length);
    all.set(this._pending); all.set(d, this._pending.length);
    const full = all.length - (all.length % 64);
    for (let i = 0; i < full; i += 64) this._block(all.subarray(i, i + 64));
    this._pending = all.subarray(full);
    return this;
  }
  _block(p) {
    const w = new Uint32Array(64);
    for (let i = 0; i < 16; i++) w[i] = (p[i*4]<<24) | (p[i*4+1]<<16) | (p[i*4+2]<<8) | p[i*4+3];
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i-15],7) ^ rotr(w[i-15],18) ^ (w[i-15] >>> 3);
      const s1 = rotr(w[i-2],17) ^ rotr(w[i-2],19) ^ (w[i-2] >>> 10);
      w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0;
    }
    const h = this.h;
    let [a,b,c,d,e,f,g,hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0]=(h[0]+a)|0; h[1]=(h[1]+b)|0; h[2]=(h[2]+c)|0; h[3]=(h[3]+d)|0;
    h[4]=(h[4]+e)|0; h[5]=(h[5]+f)|0; h[6]=(h[6]+g)|0; h[7]=(h[7]+hh)|0;
  }
  hex() {
    // FIPS 180-4 padding: 0x80, zeros, then the 64-bit big-endian bit length.
    const bitLo = (this._len % 2**32) * 8 % 2**32;
    const bitHi = Math.floor(this._len / 2**32) * 8 + Math.floor((this._len % 2**32) * 8 / 2**32);
    const totalLen = this._len + 9;
    const paddedLen = Math.ceil(totalLen / 64) * 64;
    const pad = new Uint8Array(paddedLen - this._len);
    pad[0] = 0x80;
    const dv = new DataView(pad.buffer);
    dv.setUint32(pad.length - 8, bitHi >>> 0);
    dv.setUint32(pad.length - 4, bitLo >>> 0);
    this.update(pad);
    return Array.from(this.h).map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
  }
  digest(enc) { const h = this.hex(); return enc === "hex" ? h : new Uint8Array(h.match(/../g).map((b) => parseInt(b, 16))); }
}
export function createHash(alg) {
  if (alg !== "sha256") throw new Error("browser shim: only sha256 (engine surface)");
  return new Sha256();
}
`;

// Cross-check the shim against node:crypto over deterministic vectors — the
// E3/E1 checks must not run on a subtly wrong hash.
const VECTORS = ["", "abc", "CoreGuard DDE/1", "0".repeat(1000), String.fromCharCode(200) + "é😀"];
for (const v of VECTORS) {
  const real = createHash("sha256").update(v, "utf8").digest("hex");
  const shimmed = await evalSha256(CRYPTO_SHIM, v);
  if (real !== shimmed) {
    console.error(`inject: crypto shim vector MISMATCH for ${JSON.stringify(v.slice(0, 20))} — real=${real} shim=${shimmed}`);
    process.exit(1);
  }
}

// Runs the shim source in-process by swapping its node-specific surface for a
// dynamic import and calling createHash().update(v).digest("hex").
async function evalSha256(shimSrc, input) {
  const file = join(REPO, "examples/delivery-fixture/.tmp-shim-check.mjs");
  writeFileSync(file, shimSrc + `\nconst h = createHash("sha256").update(${JSON.stringify(input)}, "utf8").digest("hex");\nprocess.stdout.write(h);\n`, "utf8");
  const { execFileSync } = await import("node:child_process");
  const out = execFileSync(process.execPath, [file], { encoding: "utf8" });
  const { rmSync } = await import("node:fs");
  rmSync(file, { force: true });
  return out.trim();
}

// node:http shim — the ONLY thing the handler needs from it is Buffer.concat
// (Buffer is a real global on every supported browser target). The module
// shape keeps the import statement in http.js meaningful.
const HTTP_SHIM = `/* node:http shim — created by inject-demo-data.mjs.
   Surface = exactly what packages/delivery/http.js consumes in the page:
   createServer (import must link; never called in-page — the page drives the
   request handler directly) and Buffer (NOT a browser global; the handler
   needs Buffer.concat(...).toString(\"utf8\") to drain request bodies).
   CRITICAL: static concat must return a real Buffer INSTANCE — a plain
   Uint8Array would hit Uint8Array.prototype.toString (radix semantics) and
   emit comma-separated decimal bytes instead of text. */
const _bodyTd = new TextDecoder();
export class Buffer extends Uint8Array {
  static concat(list) {
    const parts = Array.from(list, (b) => (b instanceof Uint8Array ? b : new Uint8Array(b)));
    const total = parts.reduce((n, a) => n + a.length, 0);
    const out = new this(total);
    let off = 0;
    for (const a of parts) { out.set(a, off); off += a.length; }
    return out;
  }
  toString(enc) {
    if (enc === undefined || enc === "utf8" || enc === "utf-8") return _bodyTd.decode(this);
    throw new Error(\`browser Buffer shim: unsupported encoding \${enc} (handler surface is utf8)\`);
  }
  static from(input, enc) {
    // from(str, "utf8") → bytes (artifactSha256 surface). from(Uint8Array|Buffer)
    // → copy. The 1-arg typed-array form is Uint8Array's own constructor method.
    if (typeof input === "string") {
      if (enc !== undefined && enc !== "utf8" && enc !== "utf-8") {
        throw new Error(\`browser Buffer shim: unsupported encoding \${enc}\`);
      }
      return new this(new TextEncoder().encode(input));
    }
    if (input instanceof Uint8Array) return new this(input);
    throw new Error("browser Buffer shim: from() supports string(utf8) and Uint8Array only");
  }
}
export function createServer() {
  throw new Error("createServer is not available in-page — drive createDeliveryRequestHandler directly");
}
export default { Buffer, createServer };
`;

// --- fixture at ENGINE keys via the real SDK loader ---
const { loadFixtureFromDir } = await import(pathToFileURL(join(REPO, "packages/delivery/sdk.js")).href);
const { fixture } = loadFixtureFromDir(join(REPO, "examples/delivery-fixture"));

// Engine claim banner for the injected payload. NO wall-clock timestamp:
// the committed page must be byte-identical across re-injections (same
// determinism bar as make-fixture.mjs); the page does not display it.
const claims = { engine: "packages/delivery — createDeliveryRequestHandler" };

let html2 = readFileSync(APIREF, "utf8");
const apiPayload = {
  fixture,
  claims,
  sources: {
    "packages/canonical/index.js": canonicalBundled,
    "packages/delivery/index.js": readSrc("packages/delivery/index.js"),
    "packages/delivery/sdk.js": readSrc("packages/delivery/sdk.js"),
    "packages/delivery/http.js": readSrc("packages/delivery/http.js"),
    "__shim__/crypto.mjs": CRYPTO_SHIM,
    "__shim__/http.mjs": HTTP_SHIM,
  },
};
const apiData = "window.__DDE_API_DATA__ = " + JSON.stringify(apiPayload) + ";";
// Same idempotency contract as page 1: replace the live payload line, or the
// pristine marker on a fresh tree.
const apiLine = /^window\.__DDE_API_DATA__ = .*;$/m;
if (apiLine.test(html2)) {
  html2 = html2.replace(apiLine, apiData);
} else if (html2.includes(MARKER_API)) {
  html2 = html2.replace(MARKER_API, apiData);
} else {
  console.error("inject: __DDE_API_DATA__ marker/payload not found — page structure changed?");
  process.exit(1);
}
writeFileSync(APIREF, html2, "utf8");
console.log(`injected engine payload into docs/DDE-API-REFERENCE.html (${apiData.length} bytes)`);
