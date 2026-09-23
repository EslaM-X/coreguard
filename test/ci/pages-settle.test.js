/**
 * pages-settle.mjs — the pre-push Pages-build guard's contract.
 *
 * What is pinned here (all decision paths):
 *   settled    — latest build terminal (built/errored) AND older than the
 *                min-age window, or "no build yet" (404/missing sim), or the
 *                API was unreachable and the fallback wait expired.
 *   unsettled  — still queued/building when the max-wait cap ran out → the
 *                caller must NOT push (pushing would cancel the live build).
 *   usage      — any CLI argument is rejected (env-only config).
 * The sim hook (PAGES_SETTLE_JSON) makes every path deterministic offline:
 * the file is re-read each poll, so a test can sequence states by rewriting.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(fileURLToPath(new URL("../../scripts/pages-settle.mjs", import.meta.url)));

const oldIso = () => new Date(Date.now() - 120_000).toISOString();
const newIso = () => new Date().toISOString();

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "pages-settle-"));
  const sim = join(dir, "sim.json");
  return { dir, sim, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function runSettle(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT], {
      env: { ...process.env, PAGES_SETTLE_POLL_MS: "25", PAGES_SETTLE_MAX_WAIT_MS: "300", ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("terminal build older than min-age → settled immediately (exit 0)", async () => {
  const s = sandbox();
  try {
    writeFileSync(s.sim, JSON.stringify({ status: "built", created_at: oldIso() }));
    const r = await runSettle({ PAGES_SETTLE_JSON: s.sim });
    assert.equal(r.code, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.settled, true);
    assert.equal(out.reason, "settled");
    assert.ok(out.waitedMs < 2500, `expected a single-read settle, waited ${out.waitedMs}ms`);
  } finally {
    s.cleanup();
  }
});

test("queued/building → waits, then settles once the build turns terminal", async () => {
  const s = sandbox();
  try {
    writeFileSync(s.sim, JSON.stringify({ status: "building", created_at: newIso() }));
    const timer = setTimeout(() => {
      writeFileSync(s.sim, JSON.stringify({ status: "built", created_at: oldIso() }));
    }, 60);
    const r = await runSettle({ PAGES_SETTLE_JSON: s.sim, PAGES_SETTLE_MAX_WAIT_MS: "5000" });
    clearTimeout(timer);
    assert.equal(r.code, 0, `stdout: ${r.stdout} stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.settled, true);
    assert.equal(out.latest.status, "built");
  } finally {
    s.cleanup();
  }
});

test("terminal but still inside min-age → treated as not-settled, waits, then hits the max-wait cap", async () => {
  const s = sandbox();
  try {
    // Deterministic, no wall-clock races: even an OLD created_at is younger
    // than a 9999s min-age, so the build can never age past it. The guard must
    // still spend real time waiting and then fail the max-wait cap — proving
    // a fresh/too-recent terminal build is never treated as "safe to push".
    writeFileSync(s.sim, JSON.stringify({ status: "errored", created_at: oldIso() }));
    const r = await runSettle({ PAGES_SETTLE_JSON: s.sim, PAGES_SETTLE_MIN_AGE_SEC: "9999" });
    assert.equal(r.code, 1, `stdout: ${r.stdout} stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.settled, false);
    assert.match(out.reason, /max-wait/);
    assert.ok(out.waitedMs >= 100, `must have waited for the window, waited ${out.waitedMs}ms`);
  } finally {
    s.cleanup();
  }
});

test("still building past max-wait → unsettled (exit 1) — caller must not push", async () => {
  const s = sandbox();
  try {
    writeFileSync(s.sim, JSON.stringify({ status: "building", created_at: newIso() }));
    const r = await runSettle({ PAGES_SETTLE_JSON: s.sim, PAGES_SETTLE_MAX_WAIT_MS: "120" });
    assert.equal(r.code, 1);
    const out = JSON.parse(r.stdout);
    assert.equal(out.settled, false);
    assert.match(out.reason, /max-wait/);
  } finally {
    s.cleanup();
  }
});

test("no build yet (404 sim) → settled immediately", async () => {
  const s = sandbox();
  try {
    writeFileSync(s.sim, "404");
    const r = await runSettle({ PAGES_SETTLE_JSON: s.sim });
    assert.equal(r.code, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.settled, true);
    assert.equal(out.reason, "no-build-yet");
  } finally {
    s.cleanup();
  }
});

test("API unreachable → waits out the fallback, then settles (exit 0, fallback flagged)", async () => {
  const s = sandbox();
  try {
    writeFileSync(s.sim, "{_error simulate");
    const r = await runSettle({ PAGES_SETTLE_JSON: s.sim, PAGES_SETTLE_FALLBACK_MS: "60" });
    assert.equal(r.code, 0, `stdout: ${r.stdout} stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.settled, true);
    assert.equal(out.fallback, true);
  } finally {
    s.cleanup();
  }
});

test("usage: any CLI argument is rejected (exit 2) before any env/network read", () => {
  const child = spawn(process.execPath, [SCRIPT, "--wait"], {
    env: { ...process.env, PAGES_SETTLE_POLL_MS: "10", PAGES_SETTLE_MAX_WAIT_MS: "20" },
  });
  return new Promise((resolve) => {
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      assert.equal(code, 2);
      assert.match(stderr, /no arguments/);
      resolve();
    });
  });
});