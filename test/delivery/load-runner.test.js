// ============================================================================
// EXECUTABLE CONTRACT — the light load runner measures CONCURRENCY, not a
// fast sequential loop wearing a load-test label.
// ----------------------------------------------------------------------------
// scripts/benchmark-dde-load.mjs keeps N requests in flight against POST
// /verify and reports the latency distribution of that burst. The interesting
// failure mode is not "it is slow" — it is "it reported a load number while
// sending one request at a time", which is exactly what a `for … await`
// rewrite of this file would do and root cause of a false capacity claim. So
// this contract does not read the runner's prose: it spawns it and checks the
// measured facts.
//
//   1. concurrent run   : gate PASS, every request VERIFIED, peak in-flight
//                         equals the requested depth, and Σlatency / wall
//                         time (the overlap factor) is far above 1 — the
//                         requests really did overlap in wall-clock time.
//   2. sequential proof : `--concurrency 1` must FAIL by name. A one-at-a-
//                         time loop reports peak 1 and overlap ~1, so a runner
//                         that called that "under concurrency" would be
//                         lying by construction.
//   3. budget bite      : `--p95-budget-ms 0` must FAIL naming p95 — a gate
//                         with no failing branch is decoration.
//   4. distribution     : samples == requests, min <= median <= p95 <= p99 <=
//                         max, throughput > 0, and the report states the rate
//                         limit it granted (the limiter is a real guard; a
//                         runner that trips it measures 429s instead of the
//                         gate while looking green on latency).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const RUNNER = join(REPO, "scripts", "benchmark-dde-load.mjs");

function run(args) {
  const r = spawnSync(process.execPath, [RUNNER, ...args], { cwd: REPO, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* keep null; assertion reports stdout */ }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

test("load runner: a 6-way burst reports a real concurrent distribution and passes", () => {
  const { status, stdout, stderr, json } = run(["--requests", "24", "--concurrency", "6", "--json"]);
  assert.ok(json, `expected a JSON machine report:\n${stdout}\n${stderr}`);
  assert.equal(status, 0, `gate must pass on a healthy loopback endpoint:\n${JSON.stringify(json.failures)}`);
  assert.equal(json.mode, "concurrent", "the report must say the measurement mode");
  assert.equal(json.concurrency, 6);
  assert.equal(json.requests, 24);
  assert.equal(json.maxInFlight, 6, "the burst must actually reach the requested depth");
  assert.ok(json.overlapFactor >= 2, `overlap factor ${json.overlapFactor}x must prove wall-clock overlap`);
  assert.equal(json.verifiedRuns, 24);
  assert.equal(json.failedRuns, 0);
  assert.ok(json.throughputRps > 0, "throughput must be measured, not assumed");
  assert.equal(json.gate, "PASS");

  const s = json.stats;
  assert.ok(s.min <= s.median && s.median <= s.p95 && s.p95 <= s.p99 && s.p99 <= s.max,
    `distribution must be monotone: ${JSON.stringify(s)}`);
  assert.ok(json.budget.p95Ms >= s.p95, "p95 must be inside the stated budget on a passing run");
});

test("load runner: a sequential run cannot be labelled concurrent — the gate fails by name", () => {
  const { status, json } = run(["--requests", "5", "--concurrency", "1", "--json"]);
  assert.ok(json, "the runner must still produce a report for the refused run");
  assert.equal(status, 1, "concurrency 1 must exit non-zero");
  assert.equal(json.gate, "FAIL");
  assert.equal(json.maxInFlight, 1, "a one-at-a-time loop can never report a deeper peak");
  assert.ok(json.failures.some((f) => /sequential by construction/.test(f)),
    `the refusal must name the reason, got: ${JSON.stringify(json.failures)}`);
});

test("load runner: the p95 budget is a real gate — an impossible budget fails by name", () => {
  const { status, json } = run(["--requests", "12", "--concurrency", "4", "--p95-budget-ms", "0", "--json"]);
  assert.ok(json, "a failing gate still emits the measured report");
  assert.equal(status, 1);
  assert.equal(json.gate, "FAIL");
  assert.ok(json.failures.some((f) => /p95 .*exceeds the 0ms concurrency budget/.test(f)),
    `expected the p95 breach by name, got: ${JSON.stringify(json.failures)}`);
});

test("load runner: the granted rate limit is disclosed and covers warmup + burst", () => {
  const { json } = run(["--requests", "8", "--concurrency", "4", "--json"]);
  assert.ok(json);
  assert.ok(json.rateLimit && Number.isInteger(json.rateLimit.max), "the report must state the granted limiter ceiling");
  assert.ok(json.rateLimit.max >= json.requests + json.concurrency,
    `the limiter budget (${json.rateLimit.max}) must cover the measured burst plus its warmup, or the run measures 429s`);
});

test("load runner: the shipped default is a real 50-way burst (the ask, not a smaller run)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(RUNNER, "utf8");
  assert.match(src, /const DEFAULT_CONCURRENCY = 50;/, "the default burst depth must be 50 requests in flight");
  assert.match(src, /const DEFAULT_REQUESTS = 200;/, "200 requests gives p95 a 10-sample tail at 50-way");
});
