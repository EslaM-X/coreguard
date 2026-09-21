#!/usr/bin/env node
/**
 * DDE SDK performance benchmark — the verification budget, measured.
 *
 * Contract: verifying a bilateral fixture through the DDE SDK must stay
 * well under 50 ms per fixture (median). The budget is a product promise to
 * integrating platforms — payment gating runs on the hot path, so evidence
 * verification can never be the slow part.
 *
 * The WIRE cost (full loopback HTTP round trip) is measured separately by
 * scripts/benchmark-dde-http.mjs under its own 150 ms median budget —
 * engine cost and transport cost are distinct promises, neither hides in
 * the other's number.
 *
 *   node scripts/benchmark-dde.mjs          # human report, exit 0/1
 *   node scripts/benchmark-dde.mjs --json   # machine report
 *
 * Gates (fail-closed, exit 1 on breach):
 *   median  <= 50 ms   — the budget itself
 *   p95     <= 100 ms  — tail headroom (CI runners are noisy; 2x median cap)
 *   every run must return VERIFIED — perf measured on the real gate only,
 *   never on a rejected short-circuit
 *
 * Deterministic fixture: examples/delivery-fixture (byte-identical records,
 * CI-verified). No disk writes; report goes to stdout only.
 */

import { performance } from "node:perf_hooks";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyFixture } from "../packages/delivery/sdk.js";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "examples", "delivery-fixture");
const ITERS = 100;
const WARMUP = 10;
const MEDIAN_BUDGET_MS = 50;
const P95_BUDGET_MS = 100;

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

for (let i = 0; i < WARMUP; i++) await verifyFixture({ fixtureDir: FIXTURE_DIR });

const samples = [];
let verified = 0;
for (let i = 0; i < ITERS; i++) {
  const t0 = performance.now();
  const report = await verifyFixture({ fixtureDir: FIXTURE_DIR });
  const dt = performance.now() - t0;
  if (report.status === "VERIFIED") verified += 1;
  samples.push(dt);
}

const s = stats(samples);
const failures = [];
if (verified !== ITERS) failures.push(`only ${verified}/${ITERS} runs VERIFIED — perf must be measured on the real gate`);
if (s.median > MEDIAN_BUDGET_MS) failures.push(`median ${s.median}ms exceeds the ${MEDIAN_BUDGET_MS}ms budget`);
if (s.p95 > P95_BUDGET_MS) failures.push(`p95 ${s.p95}ms exceeds the ${P95_BUDGET_MS}ms tail budget`);

const result = {
  benchmark: "dde-sdk-verify-perf",
  fixture: "examples/delivery-fixture",
  iterations: ITERS,
  unit: "ms",
  budget: { medianMs: MEDIAN_BUDGET_MS, p95Ms: P95_BUDGET_MS },
  stats: s,
  verifiedRuns: verified,
  gate: failures.length === 0 ? "PASS" : "FAIL",
  failures,
};

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const line = "─".repeat(64);
  console.log(line);
  console.log("DDE SDK performance — verifyFixture over the committed fixture");
  console.log(line);
  console.log(`  iterations : ${ITERS} (+${WARMUP} warmup) · VERIFIED runs: ${verified}/${ITERS}`);
  console.log(`  median     : ${s.median} ms   (budget ${MEDIAN_BUDGET_MS} ms)`);
  console.log(`  p95        : ${s.p95} ms   (budget ${P95_BUDGET_MS} ms)`);
  console.log(`  min/max    : ${s.min} / ${s.max} ms`);
  console.log(`  headroom   : ${(MEDIAN_BUDGET_MS / s.median).toFixed(1)}x under budget`);
  console.log(line);
  console.log(`gate: ${result.gate}${failures.length ? " — " + failures.join("; ") : ""}`);
  if (failures.length === 0) console.log("boundary: Execution verification does not decide delivery conformity.");
}
process.exitCode = failures.length === 0 ? 0 : 1;
