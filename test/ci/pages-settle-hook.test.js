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

const MAIN_LINE = "refs/heads/main 0000000000000000000000000000000000000000 refs/heads/main 0000000000000000000000000000000000000000";
const OTHER_LINE = "refs/heads/feat/x 0000000000000000000000000000000000000000 refs/heads/feat/x 0000000000000000000000000000000000000000";

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "ps-hook-"));
  return {
    dir,
    simPath: join(dir, "sim.json"),
    writeSim: (payload) => writeFileSync(join(dir, "sim.json"), payload),
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
    s.writeSim(JSON.stringify({ status: "built", created_at: oldIso() }));
    const r = await runHook([MAIN_LINE], { PAGES_SETTLE_JSON: s.simPath });
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