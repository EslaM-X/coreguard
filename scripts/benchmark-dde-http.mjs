#!/usr/bin/env node
/**
 * DDE HTTP endpoint performance benchmark — the WIRE cost of verification,
 * measured beside the engine cost.
 *
 * The SDK benchmark (benchmark-dde.mjs) measures verifyFixture() in-process:
 * the engine's budget is 50 ms median. This script measures the FULL loopback
 * round trip an integrating platform actually experiences — HTTP request
 * encode → socket → endpoint guards → engine → JSON report → socket → parse —
 * under its own, separate budget (wire overhead is real cost; pretending it
 * is free would make the product promise a lie).
 *
 *   node scripts/benchmark-dde-http.mjs          # human report, exit 0/1
 *   node scripts/benchmark-dde-http.mjs --json   # machine report
 *
 * Gates (fail-closed, exit 1 on breach):
 *   engine median <= 50 ms    — same budget as the SDK benchmark (consistency)
 *   wire   median <= 150 ms   — engine budget + loopback/JSON/parse headroom;
 *                               if the engine alone eats the wire budget the
 *                               split line tells you which layer regressed
 *   p95 <= 2x median budget   — CI runners are noisy
 *   every wire run 200 VERIFIED and decision intact — perf is measured on the
 *   real gate only, never on a rejected short-circuit
 *
 * Same deterministic fixture as every other gate: examples/delivery-fixture.
 * No disk writes; report to stdout only. Loopback only — this never binds a
 * public interface.
 */

import { performance } from "node:perf_hooks";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startDeliveryEndpoint } from "../packages/delivery/http.js";
import { loadFixtureFromDir } from "../packages/delivery/sdk.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = join(REPO, "examples", "delivery-fixture");
const ITERS = 100;
const WARMUP = 10;
const ENGINE_BUDGET_MS = 50;    // shared contract with benchmark-dde.mjs
const WIRE_BUDGET_MS = 150;     // engine + socket + JSON + parse, median

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
  return {
    min: +sorted[0].toFixed(3),
    median: +pick(0.5).toFixed(3),
    p95: +pick(0.95).toFixed(3),
    max: +sorted[sorted.length - 1].toFixed(3),
    mean: +mean.toFixed(3),
  };
}

const jsonMode = process.argv.includes("--json");

// The endpoint under test — loopback, ephemeral port, no EVM adapter (E5
// NOT_RUN is the honest default and identical in both measurement modes).
const server = await startDeliveryEndpoint({ port: 0 });
const { port } = server.address();
const base = `http://127.0.0.1:${port}/verify`;

// The exact bytes every wire iteration sends — fixture serialized once, so
// the measurement isolates transport+server cost, not JSON.stringify noise.
const { fixture } = loadFixtureFromDir(FIXTURE_DIR);
const body = JSON.stringify(fixture);

// ---- engine cost, measured in the SAME process/run for a fair split ----
for (let i = 0; i < WARMUP; i++) {
  await fetch(base, { method: "POST", body, headers: { "content-type": "application/json", connection: "close" } });
}
const { verifyDeliveryFixture } = await import("../packages/delivery/index.js");
const engineSamples = [];
let engineVerified = 0;
for (let i = 0; i < ITERS; i++) {
  const t0 = performance.now();
  const report = await verifyDeliveryFixture(structuredClone(fixture));
  const dt = performance.now() - t0;
  if (report.status === "VERIFIED") engineVerified += 1;
  engineSamples.push(dt);
}

// ---- wire cost: the full loopback round trip ----
const wireSamples = [];
let wireVerified = 0;
for (let i = 0; i < ITERS; i++) {
  const t0 = performance.now();
  const res = await fetch(base, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", connection: "close" },
  });
  const report = await res.json();
  const dt = performance.now() - t0;
  if (res.status === 200 && report.status === "VERIFIED" &&
      report.decision === "EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE") {
    wireVerified += 1;
  }
  wireSamples.push(dt);
}

server.close();

const engine = stats(engineSamples);
const wire = stats(wireSamples);
const overhead = {
  median: +(wire.median - engine.median).toFixed(3),
  p95: +(wire.p95 - engine.p95).toFixed(3),
};
const failures = [];
if (engineVerified !== ITERS) failures.push(`engine: only ${engineVerified}/${ITERS} runs VERIFIED`);
if (wireVerified !== ITERS) failures.push(`wire: only ${wireVerified}/${ITERS} runs returned 200 VERIFIED with the intact decision — perf must be measured on the real gate`);
if (engine.median > ENGINE_BUDGET_MS) failures.push(`engine median ${engine.median}ms exceeds the ${ENGINE_BUDGET_MS}ms budget`);
if (wire.median > WIRE_BUDGET_MS) failures.push(`wire median ${wire.median}ms exceeds the ${WIRE_BUDGET_MS}ms budget`);
if (engine.p95 > ENGINE_BUDGET_MS * 2) failures.push(`engine p95 ${engine.p95}ms exceeds the ${ENGINE_BUDGET_MS * 2}ms tail budget`);
if (wire.p95 > WIRE_BUDGET_MS * 2) failures.push(`wire p95 ${wire.p95}ms exceeds the ${WIRE_BUDGET_MS * 2}ms tail budget`);

const result = {
  benchmark: "dde-http-wire-perf",
  fixture: "examples/delivery-fixture",
  iterations: ITERS,
  unit: "ms",
  budget: { engineMedianMs: ENGINE_BUDGET_MS, wireMedianMs: WIRE_BUDGET_MS },
  engine,        // in-process verifyDeliveryFixture (same gate, no socket)
  wire,          // full loopback POST /verify round trip
  wireOverhead: overhead, // wire − engine at median/p95: the transport+JSON share
  verifiedRuns: { engine: engineVerified, wire: wireVerified },
  gate: failures.length === 0 ? "PASS" : "FAIL",
  failures,
};

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const line = "─".repeat(64);
  console.log(line);
  console.log("DDE HTTP performance — full loopback /verify round trip vs engine");
  console.log(line);
  console.log(`  iterations : ${ITERS} (+${WARMUP} warmup) · VERIFIED: engine ${engineVerified}/${ITERS} · wire ${wireVerified}/${ITERS}`);
  console.log(`  engine     : median ${engine.median} ms   (budget ${ENGINE_BUDGET_MS} ms) · p95 ${engine.p95} ms`);
  console.log(`  wire       : median ${wire.median} ms   (budget ${WIRE_BUDGET_MS} ms) · p95 ${wire.p95} ms`);
  console.log(`  overhead   : median +${overhead.median} ms · p95 +${overhead.p95} ms  (socket + guards + JSON + parse)`);
  console.log(`  headroom   : engine ${(ENGINE_BUDGET_MS / engine.median).toFixed(1)}x · wire ${(WIRE_BUDGET_MS / wire.median).toFixed(1)}x under budget`);
  console.log(line);
  console.log(`gate: ${result.gate}${failures.length ? " — " + failures.join("; ") : ""}`);
  if (failures.length === 0) console.log("boundary: Execution verification does not decide delivery conformity.");
}
process.exitCode = failures.length === 0 ? 0 : 1;
