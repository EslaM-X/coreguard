#!/usr/bin/env node
/**
 * DDE HTTP load runner — p95 of POST /verify measured UNDER CONCURRENCY.
 *
 * The sequential benchmark (`benchmark-dde-http.mjs`) answers "how fast is one
 * verification end to end?" by sending 100 requests one after another. That
 * number is real and it is also the friendly case: a single request never has
 * to share the event loop, the socket pool, or the JSON parser with anything.
 * An integrating platform does not live in that case — it verifies a batch of
 * deliveries at once — so the tail an operator actually experiences has to be
 * measured with requests in flight TOGETHER.
 *
 * This runner therefore does exactly one thing: it keeps `concurrency`
 * requests outstanding against one loopback endpoint until `requests` have
 * completed, and reports the latency distribution of that burst. It does not
 * report a sequential median and call it "under load" — the report states
 * concurrency, the observed peak of in-flight requests, and an overlap factor
 * (Σ latency / wall time) that a sequential loop cannot fake: awaiting one
 * response at a time yields an overlap factor of ~1 no matter how fast the
 * server is.
 *
 *   node scripts/benchmark-dde-load.mjs                 # 200 requests, 50 in flight
 *   node scripts/benchmark-dde-load.mjs --json          # machine report
 *   node scripts/benchmark-dde-load.mjs --requests 400 --concurrency 100
 *   node scripts/benchmark-dde-load.mjs --p95-budget-ms 800
 *
 * Gates (fail-closed, exit 1 on breach):
 *   every request 200 + VERIFIED + decision intact — perf is measured on the
 *     real gate, never on a rejected or throttled short-circuit
 *   concurrency >= 2            — a single-at-a-time run is sequential by
 *                                 construction and this runner refuses to label
 *                                 it "under concurrency"
 *   maxInFlight === concurrency — the burst really reached the requested depth
 *   overlapFactor >= 2          — Σ latency / wall time proves the requests
 *                                 overlapped in wall-clock time, not just in a
 *                                 client-side counter
 *   p95 <= budget               — the tail budget, in ms
 *
 * The rate limiter is a REAL production guard, so the endpoint is started with
 * a window sized for this run (`max = requests`), and the report says so. A
 * load runner that trips the limiter would measure 429 handling instead of the
 * verification gate while looking green on latency — the failure mode this
 * line exists to prevent.
 *
 * Loopback only. No disk writes. Same deterministic fixture as every gate.
 */

import { performance } from "node:perf_hooks";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startDeliveryEndpoint } from "../packages/delivery/http.js";
import { loadFixtureFromDir } from "../packages/delivery/sdk.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = join(REPO, "examples", "delivery-fixture");

const DEFAULT_REQUESTS = 200;
const DEFAULT_CONCURRENCY = 50;
/** Tail budget for 50-way concurrency on a single-threaded runtime. The engine
 *  shares one event loop with the HTTP server, so p95 inflates with depth by
 *  construction (queueing time, not a leak). Measured on the dev box: ~0.4 ms
 *  sequential p95 (benchmark-dde-http) vs ~166 ms at 50-way — a 48x overlap
 *  factor. The budget keeps CI headroom while still catching a real regression:
 *  a gate that serializes lands far above it (and the overlap gate fails first). */
const DEFAULT_P95_BUDGET_MS = 600;

const EXPECTED_DECISION = "EXECUTION_EVIDENCE_ADMISSIBLE — CONFORMITY_UNDECIDED_BY_ENGINE";

function stat(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
  const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
  return {
    min: +sorted[0].toFixed(3),
    median: +pick(0.5).toFixed(3),
    p95: +pick(0.95).toFixed(3),
    p99: +pick(0.99).toFixed(3),
    max: +sorted[sorted.length - 1].toFixed(3),
    mean: +mean.toFixed(3),
  };
}

function intArg(args, name, fallback) {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const raw = args[i + 1];
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    console.error(`${name} must be an integer (got ${JSON.stringify(raw)})`);
    process.exit(2);
  }
  return n;
}

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const requests = intArg(args, "--requests", DEFAULT_REQUESTS);
const concurrency = intArg(args, "--concurrency", DEFAULT_CONCURRENCY);
const p95BudgetMs = intArg(args, "--p95-budget-ms", DEFAULT_P95_BUDGET_MS);

if (requests < 1 || concurrency < 1) {
  console.error("--requests and --concurrency must be positive integers");
  process.exit(2);
}

const WARMUP_REQUESTS = Math.min(concurrency, requests);
const RATE_LIMIT_MAX = Math.max(120, requests + WARMUP_REQUESTS);
const server = await startDeliveryEndpoint({
  port: 0,
  // sized so the burst is not answered by the limiter: the limiter is real, and
  // the report discloses exactly what was granted. The warmup burst counts
  // against the same fixed window, so it is included in the granted budget
  // (a runner that forgot this measured 50 clean 429s and looked like a gate
  // failure — the first live run of this file did exactly that).
  rateLimit: { windowMs: 60_000, max: RATE_LIMIT_MAX },
});
const { port } = server.address();
const url = `http://127.0.0.1:${port}/verify`;
const { fixture } = loadFixtureFromDir(FIXTURE_DIR);
const body = JSON.stringify(fixture);

/** One request: dispatch → socket → guards → engine → JSON → parse. */
async function one(i) {
  const t0 = performance.now();
  const res = await fetch(url, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", connection: "close" },
  });
  const report = await res.json();
  const dt = performance.now() - t0;
  const ok =
    res.status === 200 &&
    report.status === "VERIFIED" &&
    report.decision === EXPECTED_DECISION;
  return { i, dt, ok, httpStatus: res.status, wireStatus: report.status, decision: report.decision };
}

/* Warmup: one burst of the same depth, discarded. Priming JIT + the socket
 *  pool with the SEQUENTIAL case would warm a code path the measurement never
 *  uses — the point is the concurrent path. */
await Promise.all(Array.from({ length: WARMUP_REQUESTS }, (_, i) => one(-1 - i)));

let issued = 0;
let inFlight = 0;
let maxInFlight = 0;
const results = [];
const started = performance.now();

async function worker() {
  while (true) {
    const i = issued++;
    if (i >= requests) return;
    inFlight += 1;
    if (inFlight > maxInFlight) maxInFlight = inFlight;
    try {
      results.push(await one(i));
    } finally {
      inFlight -= 1;
    }
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, () => worker()));
const durationMs = performance.now() - started;
server.close();

const samples = results.map((r) => r.dt);
const failed = results.filter((r) => !r.ok);
const stats = samples.length > 0 ? stat(samples) : null;
const totalLatencyMs = samples.reduce((s, v) => s + v, 0);
const overlapFactor = durationMs > 0 ? +(totalLatencyMs / durationMs).toFixed(2) : 0;
const throughputRps = durationMs > 0 ? +((results.length / durationMs) * 1000).toFixed(1) : 0;

const failures = [];
if (results.length !== requests) failures.push(`completed ${results.length}/${requests} requests — the burst did not finish`);
if (failed.length > 0) {
  const first = failed[0];
  failures.push(
    `${failed.length}/${requests} responses were not 200 VERIFIED with the intact decision (first: http ${first.httpStatus} · ${first.wireStatus} · decision ${JSON.stringify(first.decision)}) — perf must be measured on the real gate`,
  );
}
if (concurrency < 2) {
  failures.push(`concurrency ${concurrency} is sequential by construction — this runner refuses to label a one-at-a-time run "under concurrency"`);
}
if (maxInFlight !== Math.min(concurrency, requests)) {
  failures.push(`max in flight was ${maxInFlight}, not ${Math.min(concurrency, requests)} — the burst never reached the requested depth`);
}
if (overlapFactor < 2 && concurrency >= 2) {
  failures.push(`overlap factor ${overlapFactor}x — Σ latency / wall time says the requests did NOT overlap; this is a sequential run wearing a concurrency label`);
}
if (stats && stats.p95 > p95BudgetMs) {
  failures.push(`p95 ${stats.p95}ms exceeds the ${p95BudgetMs}ms concurrency budget`);
}

const report = {
  benchmark: "dde-http-load-perf",
  mode: "concurrent",
  fixture: "examples/delivery-fixture",
  unit: "ms",
  requests,
  concurrency,
  maxInFlight,
  overlapFactor,
  throughputRps,
  durationMs: +durationMs.toFixed(3),
  rateLimit: { windowMs: 60_000, max: RATE_LIMIT_MAX },
  budget: { p95Ms: p95BudgetMs },
  stats,
  verifiedRuns: results.length - failed.length,
  failedRuns: failed.length,
  gate: failures.length === 0 ? "PASS" : "FAIL",
  failures,
};

if (jsonMode) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const line = "─".repeat(64);
  console.log(line);
  console.log(`DDE HTTP load — POST /verify under ${concurrency}-way concurrency`);
  console.log(line);
  if (stats) {
    console.log(`  requests   : ${results.length}/${requests} · VERIFIED ${report.verifiedRuns} · failed ${report.failedRuns}`);
    console.log(`  in flight  : peak ${maxInFlight}/${concurrency} · overlap ${overlapFactor}x (Σlatency / wall) · ${throughputRps} req/s`);
    console.log(`  latency    : median ${stats.median} ms · p95 ${stats.p95} ms (budget ${p95BudgetMs}) · p99 ${stats.p99} ms · max ${stats.max} ms`);
    console.log(`  wall time  : ${report.durationMs} ms for ${requests} requests`);
  } else {
    console.log("  no samples — the burst completed nothing");
  }
  console.log(`  rate limit : ${report.rateLimit.max} req / 60s window (sized for the run; disclosed, not disabled)`);
  console.log(line);
  console.log(`gate: ${report.gate}${failures.length ? " — " + failures.join("; ") : ""}`);
  if (failures.length === 0) console.log("boundary: Execution verification does not decide delivery conformity.");
}
process.exitCode = failures.length === 0 ? 0 : 1;
