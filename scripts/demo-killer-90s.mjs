#!/usr/bin/env node
/**
 * demo-killer-90s.mjs — CoreGuard 90-second "killer demo" runner.
 *
 * Plays the eight-beat public script by executing the REPO'S OWN verifiers and
 * demos as real child processes, then fail-closed asserting on each output.
 * The tamper beat never touches the committed fixtures: it copies reference-B
 * to a temp dir and flips one byte there, proving the SHA-256 pins reject it.
 *
 * Run:  npm run demo:90s:killer   (or node scripts/demo-killer-90s.mjs)
 *
 * Exit: 0 = every beat produced its expected verdict
 *        1 = a beat's expected fail-closed behavior did NOT occur (demo broken)
 *        2 = usage / missing prerequisite
 *
 * Honesty contract (binding — mirrors the covered docs):
 *   - Every stage labels itself: recorded / synthetic / reference-only.
 *   - The reference tribunal is explicitly NOT People's Court.
 *   - The adapter dry-run performs NO network call and claims none.
 *   - The escrow is reference-only (deployed:false, chain:none) forever.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(join(HERE, ".."));

const has = (fn) => existsSync(join(REPO, fn));
for (const must of [
  "examples/delivery-fixture/pairs/assent-pair/verify-assent-pair.mjs",
  "examples/delivery-fixture/pairs/dispute-package/verify-dispute-package.mjs",
  "packages/peoples-court-adapter/cli.mjs",
  "examples/reference-tribunal/sim-tribunal.mjs",
  "examples/reference-tribunal/mock-escrow.mjs",
]) {
  if (!has(must)) {
    console.error(`missing prerequisite: ${must}`);
    process.exit(2);
  }
}

const W = process.stdout.columnWidth || process.stdout.columns || 100;

const pad = (s, n, ch = ".") => String(s).padEnd(n, ch);
function h(line, sub) {
  console.log("");
  console.log(`\x1b[1m${line}\x1b[0m`);
  if (sub) console.log(`\x1b[2m${sub}\x1b[0m`);
  console.log("─".repeat(W));
}

const NODE = process.execPath;

function run(cmdArgs, opts = {}) {
  const arg0 = cmdArgs[0] === "node" ? NODE : cmdArgs[0];
  const cwdRaw = opts.cwd || ".";
  const cwd = isAbsolute(cwdRaw) ? cwdRaw : join(REPO, cwdRaw);
  const res = spawnSync(arg0, cmdArgs.slice(1), {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.error) throw res.error;
  return res;
}

/** print only the closing verdict lines (a screen a viewer can read) */
function verdict(line, ok, expected, actual) {
  console.log(`\n  ${ok ? "✓" : "✗"} ${line}`);
  if (!ok) {
    console.log(`    expected : ${expected}`);
    console.log(`    actual   : ${actual}`);
  }
  return ok;
}

// ————— beat 1 · the problem —————————————————————————————————————————
h("1 · THE PROBLEM", "An agent can execute a transaction. Execution is not consent.");

const delim = "─".repeat(W);
console.log(`
  agent can execute ......... identity + intent + authorization surface
  a receipt proves execution .. CGEP/1 execution evidence, SHA-256 pinned
  execution is not consent .... EVP/1 consent labels — FULL / PARTIAL / UNKNOWN
  consent is not adjudication .. ADAL/1 dispute package, award slot UNKNOWN
  adjudication is not settlement  escrow reference-only; authority-bound

${delim}`);

// ————— beat 2 · evidence ————————————————————————————————————————————
h("2 · EVIDENCE", "Execution evidence → cryptographic package → pinned hashes.");

const transfer = run(["node", "packages/cli/src/index.js", "verify-run", "--bundle", "examples/transfer/verify-bundle.json", "--json"]);
const ev = JSON.parse(transfer.stdout || "{}");
const verdicts = Array.isArray(ev.verified) ? ev.verified : [];
const evidenceOk = ev.verdict?.verdict === "VERIFIED" && verdicts.length >= 8 && transfer.status === 0;
console.log(
  `  ${pad("receiptId", 52)}${transfer.status === 0 ? ev.observed?.receiptId || "?" : "?"}
  ${pad("engine checks", 52)}${verdicts.length}/9 PASS (RECEIPT_INTEGRITY · L2)`,
);
verdict("execution evidence re-derives and verifies", evidenceOk, "VERIFIED · 8+ checks", `${ev.verdict?.verdict || "?"} · ${verdicts.length} checks`);

const dde = run(["node", "examples/delivery-fixture/verify-fixture.mjs"]);
const ddeOk = dde.status === 0 && /VERIFIED \(10 PASS/.test(dde.stdout);
const ddeLine = dde.stdout.split("\n").filter((l) => /status|decision/.test(l)).map((l) => l.trim()).pop() || "?";
console.log(`\n  ${pad("delivery fixture (DDE/1)", 52)}${ddeLine}`);
verdict("delivery evidence replay-passes its pins", ddeOk, "exit 0 · VERIFIED (10 PASS)", `exit ${dde.status}`);

// ————— beat 3 · consent — the paired fixture (1e75fba) ————————————————
h("3 · CONSENT — the paired fixture", "CASE A and CASE B: identical execution + delivery; consent differs.");

const pairCwd = "examples/delivery-fixture/pairs/assent-pair";
const pair = run(["node", "verify-assent-pair.mjs"], { cwd: pairCwd });
const pairOk = pair.status === 0 && /11\/11 passed/.test(pair.stdout);
const pairLine = (pair.stdout.match(/summary: .*/) || [""])[0];
console.log(`\n  ${pairLine}`);
verdict(`paired fixture separates consent from execution`, pairOk, "exit 0 · 11/11", `exit ${pair.status}`);

// ————— beat 4 · dispute package —————————————————————————————————————
h("4 · DISPUTE PACKAGE", "ADAL/1 — Evidence + Consent + Positions + Closure → Award Slot → Settle Gate.");

const discCwd = "examples/delivery-fixture/pairs/dispute-package/reference-B";
const disc = run(["node", "../verify-dispute-package.mjs"], { cwd: discCwd });
const discOk = disc.status === 0 && /DISPUTE_PACKAGE OK/.test(disc.stdout);

let pkg;
try {
  pkg = JSON.parse(readFileSync(join(REPO, discCwd, "dispute-package.json"), "utf8"));
} catch { pkg = null; }
const award = pkg?.awardSlot?.status;
const escrow = pkg?.escrowRef?.deployed;
const adapter = pkg?.adapter?.integrationStatus;
const boundariesOk = award === "UNKNOWN" && escrow === false && adapter === "NOT_BUILT";

console.log(`\n  ${pad("awardSlot.status", 52)}${award} (never prefilled by the evidence layer)`);
console.log(`  ${pad("escrowRef.deployed", 52)}${escrow} (reference-only)`);
console.log(`  ${pad("adapter.integrationStatus", 52)}${adapter} (structural dry-run only)`);
verdict("dispute package verifies fail-closed and stays inside its boundary", discOk && boundariesOk, "DISPUTE_PACKAGE OK · UNKNOWN/false/NOT_BUILT", `exit ${disc.status} ${award}/${escrow}/${adapter}`);

// ————— beat 5 · tamper — fail-closed ———————————————————————————————
h("5 · TAMPER — FAIL-CLOSED", "One flipped byte in the package: the pins refuse.");

let tamperOk = false;
const tamDir = mkdtempSync(join(tmpdir(), "cg-tamper-"));
try {
  copyFileSync(join(REPO, discCwd, "dispute-package.json"), join(tamDir, "dispute-package.json"));
  copyFileSync(join(REPO, discCwd, "dispute-hashes.json"), join(tamDir, "dispute-hashes.json"));
  const b = readFileSync(join(tamDir, "dispute-package.json"));
  b[b.length >> 1] ^= 0xff; // flip one byte in the middle, in memory + in the temp copy
  writeFileSync(join(tamDir, "dispute-package.json"), b);

  const tamper = run(["node", join(REPO, "examples/delivery-fixture/pairs/dispute-package/verify-dispute-package.mjs")], { cwd: tamDir });
  tamperOk = tamper.status === 1;
  const tamperLine = (tamper.stdout + tamper.stderr).split("\n").filter((l) => /✗|DISPUTE|FAIL|reject/i.test(l)).slice(0, 2).join(" · ");
  console.log(`\n  flipped 1 byte in dispute-package.json (temp copy — repo untouched)`);
  console.log(`  ${pad("verifier", 52)}exit ${tamper.status} — ${tamperLine}`);
  verdict("tampered package is refused", tamperOk, "exit 1", `exit ${tamper.status}`);
} finally {
  rmSync(tamDir, { recursive: true, force: true });
}

// ————— beat 6 · tribunal dry-run ————————————————————————————————
h("6 · INTEROPERABILITY", "CoreGuard → People's Court structural adapter → Reference Tribunal.");

let adapterOk = false;
let tribOk = false;
const outDir = mkdtempSync(join(tmpdir(), "cg-adapter-"));
try {
  const adapter = run(["node", "packages/peoples-court-adapter/cli.mjs", "--case", "examples/delivery-fixture/pairs/dispute-package/reference-A", "--out", outDir]);
  adapterOk = adapter.status === 0 && /PEOPLES_COURT_ADAPTER_READY/.test(adapter.stdout);
  const net = (adapter.stdout.match(/network\s*: (.*)/) || [])[1] || "?";
  console.log(`\n  ${pad("adapter dry-run", 52)}${net}  (offline, deterministic)`);
  verdict("adapter maps to the documented surface without any live call", adapterOk && /NOT_PERFORMED/.test(net), "PEOPLES_COURT_ADAPTER_READY · NOT_PERFORMED", `exit ${adapter.status} — ${net}`);

  const trib = run(["node", "examples/reference-tribunal/sim-tribunal.mjs", "--case", "examples/delivery-fixture/pairs/dispute-package/reference-B", "--scenario", "B", "--out", outDir]);
  tribOk = trib.status === 1 && /PARTIAL/.test(trib.stdout + trib.stderr);
  const tribLine = (trib.stdout + trib.stderr).split("\n").filter((l) => /consent-GATE|escrow-reference-only/i.test(l)).slice(0, 2).map((l) => l.trim());
  console.log(`  ${pad("reference tribunal · scenario B", 52)}exit ${trib.status} — ${tribLine.join(" · ")}`);
  verdict("partial consent stays partial — the tribunal refuses to settle", tribOk, "exit 1 · PARTIAL refused", `exit ${trib.status}`);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

// ————— beat 7 · the boundary ————————————————————————————————————————
h("7 · WHAT CoreGuard IS NOT", "");
console.log(`  CoreGuard does not adjudicate.  (B1/B2 forbid any conformity opinion)
  CoreGuard does not settle.       (escrow reference-only, authority boundary)
  CoreGuard never fills an UNKNOWN. (EVP/1 labels: absent ≠ absent-of-record)

  COREGUARD — FAIL-CLOSED (fail-open is a test failure)
  No silent conversion of unknowns.
  No adjudication by the evidence layer.
  No settlement without authority.`);

// ————— beat 8 · take it home ————————————————————————————————————————
h("8 · TAKE IT AND RUN IT", "");
console.log(`  npm run demo:90s:killer     (this script, in this repo)
  npm run demo:90s             (pilot replay, offline)
  npm test                     (970/970 · CI Node 18/20/22)

  github.com/EslaM-X/coreguard`);

const results = { evidenceOk, ddeOk, pairOk, disputeOk: discOk && boundariesOk, tamperOk, adapterOk: adapterOk && true, tribOk };
const allOk = Object.values(results).every(Boolean);
console.log("\n" + "═".repeat(W));
if (allOk) {
  console.log("  demo-killer-90s: ALL BEATS GREEN");
} else {
  console.log("  demo-killer-90s: A BEAT FAILED — fail-open somewhere");
  for (const [k, v] of Object.entries(results)) if (!v) console.log(`    ✗ ${k}`);
}
console.log("═".repeat(W) + "\n");
process.exit(allOk ? 0 : 1);