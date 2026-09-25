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
 *                  With PAGES_SETTLE_SHA set, settled additionally requires
 *                  the LATEST build to be for THAT commit (commit match) —
 *                  the guard then knows the build FOR THE COMMIT BEING
 *                  PUBLISHED finished, not merely that nothing is running.
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
 *   PAGES_SETTLE_SHA          optional       the commit this push is about
 *                                             to publish. Closes the
 *                                             REGISTRATION GAP: right after
 *                                             a push, /pages/builds/latest
 *                                             can still report the PREVIOUS
 *                                             commit's (terminal, aged)
 *                                             build while the new commit's
 *                                             build has not registered yet —
 *                                             a naive settle in that gap
 *                                             authorizes exactly the push
 *                                             that cancels the content build
 *                                             (the bot race, AGENTS.md
 *                                             [C18]). With the SHA set, the
 *                                             guard waits for THAT commit's
 *                                             own build instead.
 *   PAGES_SETTLE_BRANCH_JSON  test hook      simulates the /branches/main
 *                                             probe used to distinguish
 *                                             "build not registered yet"
 *                                             from "nothing to wait for".
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

/**
 * Is `sha` reachable from the Pages source branch tip on the remote?
 *   true   — yes: a build for it MUST appear (registration gap → keep waiting)
 *   false  — no: a pre-push call (the SHA is definitionally not on the remote
 *            yet) or a fresh/unrelated push → settle without waiting
 *   null   — probe failed → caller falls back to legacy behavior
 * In sim mode (PAGES_SETTLE_BRANCH_JSON) the branch probe is file-backed and
 * deterministic: tip == sha → true, any other tip → false, 404/missing → null.
 */
async function shaOnSourceBranch({ repo, token, sha, simFile }) {
  try {
    if (simFile !== undefined) {
      const bytes = readFileSync(simFile, "utf8").trim();
      if (bytes === "" || bytes === "404") return null;
      const tip = String(JSON.parse(bytes)?.commit?.commit?.sha ?? "").toLowerCase();
      if (!tip) return null;
      return tip === sha.toLowerCase();
    }
    const headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": `${repo} pages-settle`,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    const branchRes = await fetch(`${API}/repos/${repo}/branches/main`, { headers });
    if (!branchRes.ok) return null;
    const tip = String((await branchRes.json())?.commit?.commit?.sha ?? "").toLowerCase();
    if (!tip) return null;
    if (tip === sha.toLowerCase()) return true;
    const cmp = await fetch(`${API}/repos/${repo}/compare/${sha}...${tip}`, { headers });
    if (!cmp.ok) return null;
    const status = (await cmp.json())?.status;
    return status === "behind" || status === "identical";
  } catch {
    return null;
  }
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
  // An empty value (no usable ref line), an all-zero line (branch deletion),
  // or an absent variable all disable pinning.
  const rawSha = (process.env.PAGES_SETTLE_SHA ?? "").trim() || null;
  const wantSha = rawSha && /^0+$/.test(rawSha) ? null : rawSha;
  const simBranchFile = process.env.PAGES_SETTLE_BRANCH_JSON !== undefined
    ? process.env.PAGES_SETTLE_BRANCH_JSON
    : undefined;
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
      if (wantSha) {
        // A SHA is expected but no build is registered yet. Distinguish the
        // registration gap (the commit IS on the source branch — its build
        // MUST come) from "nothing to wait for" (fresh site / unrelated push
        // / a pre-push call whose SHA is definitionally not on the remote
        // yet). On a probe error, fall back to legacy behavior.
        const reachable = await shaOnSourceBranch({ repo, token, sha: wantSha, simFile: simBranchFile });
        if (reachable === true) {
          latestInfo = { status: "awaiting-registration", sha: wantSha.slice(0, 7) };
          waitedMs = Date.now() - started;
          if (waitedMs >= maxWaitMs) {
            report(false, { reason: "build-not-registered-yet", latest: latestInfo, waitedMs });
            process.exitCode = 1;
            return;
          }
          await sleep(pollMs);
          continue;
        }
        if (reachable === false) {
          report(true, { reason: "sha-not-on-source-branch", latest: null, waitedMs });
          return;
        }
        // reachable === null → probe failed; legacy behavior below.
      }
      report(true, { reason: "no-build-yet", latest: null, waitedMs });
      return;
    }
    const cls = classify(body);
    latestInfo = { status: cls.status, createdAt: cls.createdAt };
    waitedMs = Date.now() - started;
    if (cls.tone === "terminal") {
      // With a pinned SHA, ONLY that commit's own build counts as settled.
      // A terminal build for any other (older) commit means the content
      // build either has not registered yet or is still queued — pushing
      // now would cancel it (the bot race).
      if (wantSha) {
        const buildSha = String(body.commit ?? "").trim().toLowerCase();
        const wanted = wantSha.trim().toLowerCase();
        if (!buildSha || buildSha !== wanted) {
          // The visible terminal build is NOT the pinned commit's. Two very
          // different situations: the pinned SHA is already on the remote
          // (bot side — its build must still register/finish → WAIT) versus
          // a pre-push call where the SHA is not on the remote yet (the
          // visible build is an OLD, finished one; this push starts a fresh
          // build and cancels nothing alive → SETTLE). A failed probe is
          // treated as the bot side (conservative: wait).
          const reachable = await shaOnSourceBranch({ repo, token, sha: wanted, simFile: simBranchFile });
          if (reachable === false) {
            report(true, { reason: "sha-not-on-source-branch", latest: latestInfo, waitedMs });
            return;
          }
          latestInfo = { status: cls.status, createdAt: cls.createdAt, sha: buildSha || null, expected: wanted.slice(0, 7) };
          waitedMs = Date.now() - started;
          if (waitedMs >= maxWaitMs) {
            report(false, { reason: "waiting-for-sha-build", latest: latestInfo, waitedMs });
            process.exitCode = 1;
            return;
          }
          await sleep(pollMs);
          continue;
        }
      }
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