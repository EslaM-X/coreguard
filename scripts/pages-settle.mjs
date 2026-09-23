#!/usr/bin/env node
/**
 * pages-settle.mjs — wait for the latest GitHub Pages build to reach a
 * terminal state before pushing ANOTHER commit that would otherwise race it.
 *
 * Why this exists: GitHub Pages classic (branch-source) builds once per push.
 * Two pushes landed inside the build window collide — the second push cancels
 * the first commit's build ("Page build failed"), so the first commit's build
 * is superseded by the second's. On this repo the perf median commit has been
 * the second push ~17s after every content push, which is how the alternating
 * built/errored pattern on the pages build list appeared.
 *
 * The guard's single job: make sure no build is in flight BEFORE you push the
 * next commit, so the running build completes instead of being cancelled.
 *
 *   node scripts/pages-settle.mjs      # exit 0 => safe to push
 *
 * Exit code contract (the ONLY thing callers rely on):
 *   0  settled   — latest build is terminal (built/errored) and older than
 *                  PAGES_SETTLE_MIN_AGE_SEC, or no build exists at all.
 *   1  unsettled — still queued/building when PAGES_SETTLE_MAX_WAIT_MS ran
 *                  out. Caller must NOT push now (it would cancel the live
 *                  build); let the next scheduled attempt retry instead.
 *   2  usage     — bad invocation.
 *
 * Env shape (all optional, tests inject PAGES_SETTLE_JSON / small timing):
 *   PAGES_REPO               owner/repo        default: GITHUB_REPOSITORY, else "EslaM-X/coreguard"
 *   GITHUB_TOKEN / PAGES_SETTLE_TOKEN         token for github.com/api (Pages API needs auth only to be polite)
 *   PAGES_SETTLE_JSON         path to a JSON body to simulate the API
 *                             response bytes (test hook; no network). The
 *                             file is re-read on every poll, so a test can
 *                             sequence states. A file whose bytes are "404"
 *                             (or that is missing) means "no build yet".
 *   PAGES_SETTLE_MIN_AGE_SEC  default 15      a terminal build younger than
 *                                             this is still "the build this
 *                                             push just made" -> wait again,
 *                                             so we never push onto a build
 *                                             that is seconds old.
 *   PAGES_SETTLE_POLL_MS      default 10000   poll interval
 *   PAGES_SETTLE_MAX_WAIT_MS  default 180000  cap for one call; 0 => fail on
 *                                             the first non-terminal read
 *   PAGES_SETTLE_FALLBACK_MS  default 60000   on API error (auth/5xx/net):
 *                                             sleep this then settle anyway.
 *                                             We cannot see the queue, so we
 *                                             wait out a typical build first.
 *
 * Determinism: pure function of its inputs; no wall-clock appears in exit
 * decisions except the age computation, which tests pass explicitly.
 */

import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const API = "https://api.github.com";
const TERMINAL = new Set(["built", "errored"]);

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function report(settled, extra) {
  const out = { trend: "pages-settle", settled, reason: extra.reason ?? "settled" };
  if (extra.latest) out.latest = extra.latest;
  if (extra.fallback) out.fallback = true;
  if (extra.waitedMs !== undefined) out.waitedMs = extra.waitedMs;
  if (extra.error) out.error = String(extra.error);
  console.log(JSON.stringify(out, null, 2));
}

function classify(body) {
  const status = body?.status;
  if (!status) return { tone: "none" };
  if (TERMINAL.has(status)) {
    return { tone: "terminal", status, createdAt: body.created_at ?? null };
  }
  return { tone: "active", status, createdAt: body.created_at ?? null };
}

async function readLatest({ repo, token, simFile }) {
  if (simFile !== undefined) {
    const bytes = readFileSync(simFile, "utf8").trim();
    if (bytes === "" || bytes === "404") return { none: true };
    if (bytes.startsWith("{_error")) throw new Error("simulated API error");
    return JSON.parse(bytes);
  }
  const res = await fetch(`${API}/repos/${repo}/pages/builds/latest`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": `${repo} pages-settle`,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 404) return { none: true };
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Pages API ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 0) {
    console.error("pages-settle: takes no arguments (configure via env)");
    process.exitCode = 2;
    return;
  }
  const repo = process.env.PAGES_REPO ?? process.env.GITHUB_REPOSITORY ?? "EslaM-X/coreguard";
  const token = process.env.PAGES_SETTLE_TOKEN ?? process.env.GITHUB_TOKEN;
  const minAgeMs = envInt("PAGES_SETTLE_MIN_AGE_SEC", 15) * 1000;
  const pollMs = envInt("PAGES_SETTLE_POLL_MS", 10000);
  const maxWaitMs = envInt("PAGES_SETTLE_MAX_WAIT_MS", 180000);
  const fallbackMs = envInt("PAGES_SETTLE_FALLBACK_MS", 60000);
  const simFile = process.env.PAGES_SETTLE_JSON !== undefined ? process.env.PAGES_SETTLE_JSON : undefined;

  const started = Date.now();
  let latestInfo;
  let waitedMs = 0;
  while (true) {
    let body;
    try {
      body = await readLatest({ repo, token, simFile });
    } catch (err) {
      // Cannot observe the queue — wait out a typical build, then decide.
      if (fallbackMs > 0) {
        await sleep(fallbackMs);
        report(true, { reason: "api-unavailable-fallback", fallback: true, error: err.message, latest: latestInfo, waitedMs: waitedMs + fallbackMs });
        return;
      }
      report(false, { reason: "api-unavailable", error: err.message, latest: latestInfo, waitedMs });
      process.exitCode = 1;
      return;
    }
    if (body.none) {
      report(true, { reason: "no-build-yet", latest: null, waitedMs });
      return;
    }
    const cls = classify(body);
    latestInfo = { status: cls.status, createdAt: cls.createdAt };
    waitedMs = Date.now() - started;
    if (cls.tone === "terminal") {
      const createdAtMs = cls.createdAt ? Date.parse(cls.createdAt) : NaN;
      const ageMs = Number.isFinite(createdAtMs) ? Date.now() - createdAtMs : minAgeMs;
      if (ageMs >= minAgeMs) {
        report(true, { latest: latestInfo, waitedMs });
        return;
      }
      // terminal but freshly created — this IS the build our own push just
      // started (or a very recent sibling); wait it out to full age.
    }
    if (waitedMs >= maxWaitMs) {
      report(false, { reason: "still-in-flight-after-max-wait", latest: latestInfo, waitedMs });
      process.exitCode = 1;
      return;
    }
    await sleep(pollMs);
  }
}

main().catch((err) => {
  console.error(`pages-settle: unexpected failure: ${err && err.stack ? err.stack : err}`);
  process.exitCode = 1;
});