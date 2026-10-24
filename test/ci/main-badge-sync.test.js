import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { audit, ROWS } from "./badge-audit.mjs";

/**
 * Badge sync AT THE BRANCH TIP the branch actually serves — main. The
 * working-tree freshness audit (badge-freshness.test.js) sees what the
 * checkout holds; a stale badge can still be SERVED when the committed tree
 * disagrees with checkout reality or when the trend bot's push landed
 * badges that lag the ledger it appended in the same commit. This audit
 * reads the GIT COMMIT TREE of main — `git cat-file -p main:path` and
 * `git ls-tree main:docs/badges` — so the state README, GitHub Pages and
 * the repo page actually serve is measured where staleness bites, and a
 * stale badge on main is caught immediately, by name, on the first run
 * after it exists.
 *
 * Ref resolution: on a main checkout (CI on main, or local main) the tip is
 * HEAD; on any other checkout the audit resolves refs/remotes/origin/main —
 * and if NEITHER is reachable it fails, named, never silent: an audit that
 * audited nothing while reporting green would be the exact lie it exists
 * to refuse.
 */

const GIT = { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 };

function runGit(args) {
  const r = spawnSync("git", args, GIT);
  return { status: r.status, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

function resolveMainTip() {
  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch.status === 0 && branch.out === "main") return "HEAD";
  const originMain = runGit(["rev-parse", "--verify", "refs/remotes/origin/main^{commit}"]);
  if (originMain.status === 0) return originMain.out;
  assert.fail(
    `no auditable main tree: HEAD is ${branch.out || "unknown"} and refs/remotes/origin/main is not reachable in this checkout — the audit refuses to report green on nothing`
  );
}

// Bytes of the COMMIT TREE at `ref`, checked out here or not.
const committed = (ref, path) => {
  const r = runGit(["cat-file", "-p", `${ref}:${path}`]);
  return r.status === 0 ? r.out : null;
};

/** Every .svg under docs/badges in the tree of `ref` → its text (null = absent). */
function committedBadges(ref) {
  const map = new Map();
  const listing = runGit(["ls-tree", "--name-only", `${ref}:docs/badges`]);
  if (listing.status === 0) {
    for (const file of listing.out.split("\n")) {
      if (file.endsWith(".svg")) map.set(file, committed(ref, `docs/badges/${file}`));
    }
  }
  for (const r of ROWS) if (!map.has(r.file)) map.set(r.file, null);
  return map;
}

test("the badge set committed on MAIN shows main's latest ledger points — a stale one fails immediately, by name", () => {
  const ref = resolveMainTip();
  const history = committed(ref, "benchmarks/perf-history.jsonl");
  assert.ok(history && history.length > 0, `benchmarks/perf-history.jsonl must exist on ${ref} — no history, nothing to sync against`);
  const problems = audit(history, committedBadges(ref));
  assert.deepEqual(
    problems, [],
    `the badge set served by main (${ref}) is stale or lying against ITS OWN committed ledger:\n  ${problems.join("\n  ")}`
  );
});

test("main's badge table is parseable from the same commit tree it serves — a re-written table is caught", () => {
  const ref = resolveMainTip();
  const module = committed(ref, "scripts/benchmark-trend.mjs");
  assert.ok(module, `scripts/benchmark-trend.mjs must exist on ${ref}`);
  const rows = [...module.matchAll(
    /file:\s*"([^"]+)",\s*series:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*budget:\s*(\d+)(?:,\s*metric:\s*"([a-z0-9]+)")?(?:,\s*nightly:\s*true)?/g
  )];
  assert.deepEqual(
    rows.map((m) => m[1]).sort(),
    [...ROWS.map((r) => r.file)].sort(),
    `main's badge table (${ref}) and the audited repo's must agree on the declared set — drift here means Pages/README derive a DIFFERENT audit than CI`
  );
});

test("the sync really reads the committed bytes: a newer ledger point staged into the audit bites by name", () => {
  const ref = resolveMainTip();
  const history = committed(ref, "benchmarks/perf-history.jsonl");
  assert.ok(history, `benchmarks/perf-history.jsonl must exist on ${ref}`);

  // Mutation — clone main's LAST engine point as a newer one with a shifted
  // value: if the badge lagged this point, the audit must call it STALE by
  // name. If this ever stops biting, the audit above is reading working-tree
  // bytes, not main's tree — the exact failure mode this file exists for.
  const lines = history.split("\n").filter((l) => l.trim());
  let lastEngineIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('"dde-http-wire-perf:engine"')) { lastEngineIdx = i; break; }
  }
  assert.ok(lastEngineIdx >= 0, `main's ledger (${ref}) must contain engine points for the control to mutate`);
  const newer = lines[lastEngineIdx].replace(/("median":)([0-9.]+)/, "$10.0888").replace(/"utc":"[^"]+"/, '"utc":"2999-01-01T00:00:00.000Z"');
  const staleHistory = [...lines.slice(0, lastEngineIdx), lines[lastEngineIdx], newer, ...lines.slice(lastEngineIdx + 1)].join("\n");
  const problems = audit(staleHistory, committedBadges(ref));
  assert.ok(
    problems.some((p) => p.includes("perf-engine.svg") && p.includes("STALE")),
    `the committed-bytes control must bite by name, got: ${problems.join(" | ")}`
  );
});

test("ref resolution never audits nothing silently", () => {
  const ref = resolveMainTip();
  assert.match(ref, /^(HEAD|main|[0-9a-f]{40})$/, `the audit's ref must name itself (${ref})`);
  const head = runGit(["rev-parse", "HEAD"]);
  assert.equal(head.status, 0, `HEAD must parse even when auditing ${ref}`);
  assert.ok(Array.isArray([...committedBadges(ref).keys()]), "the badge map must enumerate before audit");
});
