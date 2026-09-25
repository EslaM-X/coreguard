import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Behavioral contract for .githooks/pre-push: it is the machine-level
// enforcement of the Pages settle guard (scripts/pages-settle.mjs). Every push
// to main from a checkout with `git config core.hooksPath .githooks` is gated
// by it; non-main pushes and PAGES_SETTLE_SKIP bypass it.
const REPO = fileURLToPath(new URL("../../", import.meta.url));
const HOOK = join(REPO, ".githooks", "pre-push");

// Git hooks are run by the shell BUNDLED with git, not by whichever `sh`
// happens to be on PATH (on Windows system bash is the WSL launcher). Resolve
// the same interpreter git uses so the test exercises the real execution path.
function resolveShell() {
  if (process.platform !== "win32") return "sh";
  const candidates = [];
  const gitLines = execFileSync("where.exe", ["git"], { encoding: "utf8" }).trim().split(/\r?\n/);
  const gitExe = gitLines.find((l) => l.toLowerCase().endsWith("git.exe"));
  if (gitExe) {
    const root = join(dirname(gitExe), "..");
    candidates.push(
      join(root, "usr", "bin", "sh.exe"),
      join(root, "bin", "sh.exe"),
      join(root, "bin", "bash.exe"),
    );
  }
  const execPath = execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim();
  candidates.push(
    join(execPath, "..", "..", "usr", "bin", "sh.exe"),
    join(execPath, "..", "..", "..", "usr", "bin", "sh.exe"),
    join(execPath, "..", "..", "bin", "sh.exe"),
  );
  const found = candidates.find(existsSync);
  if (!found) throw new Error("cannot locate git's bundled POSIX shell for the hook test");
  return found;
}

const SH = resolveShell();

function runHook(inputLines, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(SH, [HOOK], {
      cwd: REPO,
      env: { ...process.env, ...extraEnv },
    });
    let stderr = "";
    let stdout = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.stdout.on("data", (d) => (stdout += d));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.write(inputLines.join("\n") + "\n");
    // Windows msys sh nuance: closing stdin in the SAME tick as the write
    // races the hook's first `read` (the file's header makes sh reach it late)
    // — the pipe reads EOF before any ref is consumed and the main-gate is
    // silently skipped. Keep the pipe open briefly so the refs land, then EOF.
    setTimeout(() => child.stdin.end(), 250);
  });
}

// A REAL new main tip: the all-zero line means branch DELETION, which the
// (correct) hook passes through without settling — pushes carry a real SHA.
const NEW_SHA = "a".repeat(40);
const MAIN_LINE = "refs/heads/main 0000000000000000000000000000000000000000 refs/heads/main " + NEW_SHA;
const OTHER_LINE = "refs/heads/feat/x 0000000000000000000000000000000000000000 refs/heads/feat/x 0000000000000000000000000000000000000000";

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "ps-hook-"));
  return {
    dir,
    simPath: join(dir, "sim.json"),
    writeSim: (payload) => writeFileSync(join(dir, "sim.json"), payload),
    branchPath: join(dir, "branch.json"),
    writeBranch: (payload) => writeFileSync(join(dir, "branch.json"), payload),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function oldIso() {
  return new Date(Date.now() - 120_000).toISOString();
}

test("hook: non-main push passes straight through (no env read)", async () => {
  const r = await runHook([OTHER_LINE], { PAGES_SETTLE_JSON: "definitely-missing-sim" });
  assert.equal(r.code, 0, `stderr: ${r.stderr}`);
  assert.doesNotMatch(r.stderr, /pages-settle/);
});

test("hook: main push aborts while the build is queued/building (exit 1)", async () => {
  const s = sandbox();
  try {
    s.writeSim(JSON.stringify({ status: "queued", created_at: "2026-09-23T00:00:00.000Z" }));
    // Pinned to the new tip; the sim build is active → max-wait aborts.
    const r = await runHook([MAIN_LINE], {
      PAGES_SETTLE_JSON: s.simPath,
      PAGES_SETTLE_MAX_WAIT_MS: "300",
      PAGES_SETTLE_POLL_MS: "50",
    });
    assert.equal(r.code, 1, `stderr: ${r.stderr}`);
    assert.match(r.stderr, /ABORTED/);
  } finally {
    s.cleanup();
  }
});

test("hook: main push passes once the build is terminal and aged (exit 0)", async () => {
  const s = sandbox();
  try {
    // The pinned SHA's own build is terminal and aged; the branch probe shows
    // a DIFFERENT tip only if the push had not landed — here the settle call
    // runs pre-push, so the remote does not know the SHA yet → sha-not-on-
    // source-branch → settle immediately (true pre-push semantics).
    s.writeSim(JSON.stringify({ status: "built", created_at: oldIso() }));
    s.writeBranch(JSON.stringify({ commit: { commit: { sha: "e".repeat(40) } } }));
    const r = await runHook([MAIN_LINE], { PAGES_SETTLE_JSON: s.simPath, PAGES_SETTLE_BRANCH_JSON: s.branchPath });
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
  } finally {
    s.cleanup();
  }
});

test("hook: PAGES_SETTLE_SKIP=1 bypasses the guard for one emergency push", async () => {
  const r = await runHook([MAIN_LINE], { PAGES_SETTLE_SKIP: "1", PAGES_SETTLE_JSON: "definitely-missing-sim" });
  assert.equal(r.code, 0, `stderr: ${r.stderr}`);
});

test("hook: file is honest (shebang + main-only gate + settle call), tracked + executable", async () => {
  const body = readFileSync(HOOK, "utf8");
  assert.match(body, /^#!\/bin\/sh/);
  assert.match(body, /refs\/heads\/main/);
  assert.match(body, /scripts\/pages-settle\.mjs/);
  assert.match(body, /PAGES_SETTLE_SKIP/);
  assert.match(body, /PAGES_SETTLE_SHA/, "the hook must pin the settle to the new main tip");
  assert.match(body, /git config core\.hooksPath \.githooks/);
  const trackedHook = execFileSync("git", ["ls-files", "--", ".githooks/pre-push"], {
    cwd: REPO,
    encoding: "utf8",
  });
  assert.match(trackedHook, /\.githooks\/pre-push/);
  const mode = execFileSync("git", ["ls-files", "-s", "--", ".githooks/pre-push"], {
    cwd: REPO,
    encoding: "utf8",
  });
  assert.match(mode, /^100755/, "hook must be committed as executable");
  // -text preservation: a CR byte in the working-copy hook breaks the bundled
  // shell on Windows (`\r: command not found`) -> the guard silently stops.
  assert.ok(!body.includes("\r"), "hook must be LF-only (-text in .gitattributes)");
});
test("settle: registration gap — SHA on the remote but its build not registered yet keeps waiting, then settles on the SHA build", async () => {
  const s = sandbox();
  try {
    const sha = "d".repeat(40);
    // Read 1: /latest still shows the PREVIOUS commit's aged, terminal build
    // (the registration gap) — must NOT settle, because the pinned SHA's own
    // build is absent. Mid-run the sim flips to state 2 (the settle script
    // re-reads the file on every poll): the SHA's build registered and built.
    s.writeSim(JSON.stringify({ status: "built", commit: "e".repeat(40), created_at: oldIso() }));
    s.writeBranch(JSON.stringify({ commit: { commit: { sha } } }));
    const r = spawn(process.execPath, ["scripts/pages-settle.mjs"], {
      cwd: REPO,
      env: {
        ...process.env,
        PAGES_SETTLE_JSON: s.simPath,
        PAGES_SETTLE_BRANCH_JSON: s.branchPath,
        PAGES_SETTLE_SHA: sha,
        PAGES_SETTLE_MIN_AGE_SEC: "0",
        PAGES_SETTLE_POLL_MS: "50",
        PAGES_SETTLE_MAX_WAIT_MS: "10000",
      },
    });
    let stdout = "";
    r.stdout.on("data", (d) => (stdout += d));
    const flip = setTimeout(() => {
      s.writeSim(JSON.stringify({ status: "built", commit: sha, created_at: oldIso() }));
    }, 200);
    const code = await new Promise((res) => r.on("close", (c) => { clearTimeout(flip); res(c); }));
    assert.equal(code, 0, `stdout: ${stdout}`);
    assert.match(stdout, /"settled": true/, "must settle once the SHA's own build is terminal");
  } finally {
    s.cleanup();
  }
});

test("settle: SHA build absent while an OLD build is terminal → not settled (the race is closed)", async () => {
  const s = sandbox();
  try {
    const sha = "d".repeat(40);
    // /latest forever shows an OLD terminal build for a DIFFERENT commit —
    // the exact registration-gap signature that used to authorize the cancel.
    s.writeSim(JSON.stringify({ status: "built", commit: "e".repeat(40), created_at: oldIso() }));
    // Branch probe: the SHA IS the tip — so the gap waits, never settles.
    s.writeBranch(JSON.stringify({ commit: { commit: { sha } } }));
    const r = spawn(process.execPath, ["scripts/pages-settle.mjs"], {
      cwd: REPO,
      env: {
        ...process.env,
        PAGES_SETTLE_JSON: s.simPath,
        PAGES_SETTLE_BRANCH_JSON: s.branchPath,
        PAGES_SETTLE_SHA: sha,
        PAGES_SETTLE_MIN_AGE_SEC: "0",
        PAGES_SETTLE_POLL_MS: "50",
        PAGES_SETTLE_MAX_WAIT_MS: "400",
      },
    });
    let stdout = "";
    r.stdout.on("data", (d) => (stdout += d));
    const code = await new Promise((res) => r.on("close", res));
    assert.equal(code, 1, "must NOT settle while only an older commit's build is visible");
    assert.match(stdout, /waiting-for-sha-build/);
  } finally {
    s.cleanup();
  }
});

test("settle: pre-push semantics — SHA not on the remote branch yet settles immediately (sha-not-on-source-branch)", async () => {
  const s = sandbox();
  try {
    const sha = "d".repeat(40);
    // No build registered at all (fresh site / first push of this SHA).
    s.writeSim("404");
    // Branch probe: remote tip is a DIFFERENT commit — the push has not landed.
    s.writeBranch(JSON.stringify({ commit: { commit: { sha: "e".repeat(40) } } }));
    const out = execFileSync(process.execPath, ["scripts/pages-settle.mjs"], {
      cwd: REPO,
      encoding: "utf8",
      env: {
        ...process.env,
        PAGES_SETTLE_JSON: s.simPath,
        PAGES_SETTLE_BRANCH_JSON: s.branchPath,
        PAGES_SETTLE_SHA: sha,
        PAGES_SETTLE_POLL_MS: "50",
      },
    });
    assert.match(out, /sha-not-on-source-branch/, "pre-push calls settle without waiting for their own future build");
  } finally {
    s.cleanup();
  }
});
