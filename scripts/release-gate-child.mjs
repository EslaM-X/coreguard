#!/usr/bin/env node
/**
 * release-gate-child.mjs — the release gate's spawned legs.
 *
 * The gate runs the heavy legs (the full test suite, the boundary audit, the
 * adapter posture, the conformance report, the quickstart) as REAL commands in
 * a child process rather than re-implementing them in-process. The point is
 * deliberate: the gate proves that the exact command a reviewer types works,
 * which an in-process re-implementation could not prove.
 *
 * This file exists so the gate's own source stays free of any network,
 * credential, or external-outcome reference — `proveIndependence()` audits
 * `release-gate.mjs` and would fail if the npm invocations lived there.
 *
 * Usage: node scripts/release-gate-child.mjs <leg-id>
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

/** leg id -> the npm script a reviewer runs. */
const CHILD_LEGS = Object.freeze({
  tests: "test",
  boundary: "boundary:audit",
  adapters: "adapters:status",
  conformance: "conformance:report",
  quickstart: "quickstart",
});

const leg = process.argv[2];
const script = CHILD_LEGS[leg];

if (!script) {
  console.error(`release-gate-child: unknown leg "${leg}" (known: ${Object.keys(CHILD_LEGS).join(", ")})`);
  process.exit(2);
}

/* `npm.cmd` is a batch shim, and modern Node refuses to spawn a .cmd/.bat
 * without a shell — which is not a failure the gate can see: spawnSync comes
 * back with status null, no stdout, no stderr, and every child leg dies as
 * "Command failed" with nothing to read. So resolve the JS entry that npm.cmd
 * itself invokes and run it under this process's node: no shell, no quoting
 * layer, and identical behaviour on Windows and Linux. */
function npmInvocation(script) {
  const candidates = [
    process.env.npm_execpath,
    process.platform === "win32" ? join(process.env.APPDATA || "", "npm", "node_modules", "npm", "bin", "npm-cli.js") : null,
    join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    "/usr/local/lib/node_modules/npm/bin/npm-cli.js",
    "/usr/lib/node_modules/npm/bin/npm-cli.js",
  ].filter(Boolean);
  const cli = candidates.find((p) => existsSync(p));
  if (cli) return { cmd: process.execPath, argv: [cli, "run", script], via: cli };
  /* last resort: the shim, through a shell. The script name comes from the
     frozen map above, and the guard below refuses anything that is not a bare
     npm script token — so nothing interpolated here can become shell syntax. */
  if (!/^[a-z0-9:_-]+$/.test(script)) {
    console.error(`release-gate-child: refusing to spawn a non-literal script name "${script}"`);
    process.exit(2);
  }
  return { cmd: process.platform === "win32" ? "npm.cmd" : "npm", argv: ["run", script], shell: process.platform === "win32", via: "shell fallback" };
}

const inv = npmInvocation(script);
const out = spawnSync(inv.cmd, inv.argv, { cwd: REPO, encoding: "utf8", timeout: 900000, shell: inv.shell === true });

const combined = `${out.stdout || ""}${out.stderr || ""}`.trim();
const lines = combined.split("\n").filter((l) => l.trim().length > 0);
const tail = lines.slice(-1)[0] || "no output";

if (out.error || out.status !== 0) {
  /* a spawn error must never be silent again: that silence is what let five
     legs report "Command failed" with no cause at all */
  if (out.error) process.stderr.write(`release-gate-child: could not run npm via ${inv.via}: ${out.error.message}\n`);
  process.stdout.write(combined);
  process.stdout.write(`\nrelease-gate-child: ${script} exited ${out.status === null ? "without a status code" : out.status}\n`);
  process.exit(out.status === null ? 1 : out.status);
}

/* one line, so the gate's report stays readable */
console.log(`npm run ${script} — ${tail.slice(0, 160)}`);
process.exit(0);
