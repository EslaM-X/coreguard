/**
 * surface-liveness.mjs — CG-SL/1
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, "..");
const REPO = join(__dirname, "..");

export const SURFACE_LIVENESS_VERSION = "CG-SL/1";

export const SURFACE_ROSTER = Object.freeze([
  { id: "verify:levels", cmd: "node scripts/ladder/verification-levels.mjs --self-check", module: "scripts/ladder/verification-levels.mjs", surface: "verification levels" },
  { id: "integration:states", cmd: "node scripts/ladder/integration-states.mjs --self-check", module: "scripts/ladder/integration-states.mjs", surface: "integration states" },
  { id: "integration:replay", cmd: "node scripts/integration-replay-lab.mjs --self-check", module: "scripts/integration-replay-lab.mjs", surface: "integration replay lab" },
  { id: "adapters:status", cmd: "node packages/adapters/providers.mjs --status", module: "packages/adapters/providers.mjs", surface: "adapters status" },
  { id: "partner:sandbox", cmd: "node scripts/partner-sandbox.mjs", module: "scripts/partner-sandbox.mjs", surface: "partner sandbox" },
  { id: "attack-lab", cmd: "node scripts/attack-lab.mjs", module: "scripts/attack-lab.mjs", surface: "attack lab" },
  { id: "observability", cmd: "node scripts/observability.mjs --self-check", module: "scripts/observability.mjs", surface: "observability" },
  { id: "passport:v2", cmd: "node scripts/passport-v2.mjs", module: "scripts/passport-v2.mjs", surface: "passport v2" },
  { id: "ladder:conformance", cmd: "node scripts/ladder/conformance.mjs", module: "scripts/ladder/conformance.mjs", surface: "ladder conformance" },
  { id: "x402", cmd: "node packages/x402/index.mjs --self-check", module: "packages/x402/index.mjs", surface: "x402 harness" },
  { id: "webhook", cmd: "node packages/webhook/index.mjs --self-check", module: "packages/webhook/index.mjs", surface: "webhook receiver" },
  { id: "ladder:status", cmd: "node scripts/ladder/cli.mjs", module: "scripts/ladder/cli.mjs", surface: "ladder status" },
  { id: "commercial:packaging", cmd: "node scripts/ladder/commercial-packaging.mjs", module: "scripts/ladder/commercial-packaging.mjs", surface: "commercial packaging" },
  { id: "mutation", cmd: "node scripts/mutation-lab.mjs", module: "scripts/mutation-lab.mjs", surface: "mutation lab" },
  { id: "partner:journey", cmd: "node scripts/partner-journey.mjs", module: "scripts/partner-journey.mjs", surface: "partner journey" },
  { id: "quickstart", cmd: "node examples/platform-quickstart/quickstart.mjs", module: "examples/platform-quickstart/quickstart.mjs", surface: "platform quickstart" },
  { id: "demo:90s", cmd: "node submission/demo-90s/run-demo-90s.mjs --offline", module: "submission/demo-90s/run-demo-90s.mjs", surface: "demo 90s" },
]);

export function checkRoster() {
  const results = [];
  for (const item of SURFACE_ROSTER) {
    const abs = join(REPO, item.module);
    const exists = existsSync(abs);
    results.push({ ...item, exists, ok: exists });
  }
  const missing = results.filter((r) => !r.exists);
  return { ok: missing.length === 0, total: results.length, missing, results };
}

export function runLiveness({ timeoutMs = 60000 } = {}) {
  const roster = checkRoster();
  if (!roster.ok) return { ok: false, phase: "roster", ...roster, executed: [] };
  const executed = [];
  for (const item of roster.results) {
    try {
      const parts = item.cmd.split(/\s+/);
      const r = spawnSync(parts[0], parts.slice(1), { cwd: REPO, encoding: "utf8", timeout: timeoutMs, shell: false });
      const ok = r.status === 0;
      executed.push({ id: item.id, cmd: item.cmd, status: r.status, ok });
      if (!ok) return { ok: false, phase: "execute", roster, executed };
    } catch (error) {
      executed.push({ id: item.id, cmd: item.cmd, ok: false, error: error.message });
      return { ok: false, phase: "execute", roster, executed };
    }
  }
  return { ok: true, phase: "done", roster, executed };
}

export function selfCheck() {
  const roster = checkRoster();
  const cases = [];
  cases.push(["all 17 surfaces exist on disk", roster.ok && roster.total === 17]);
  for (const r of roster.results) cases.push(["surface " + r.id + " exists", r.exists]);
  const ok = cases.every(([, pass]) => pass);
  return { ok, cases, roster };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-check") || args.length === 0) {
    const result = selfCheck();
    console.log("SURFACE LIVENESS — " + SURFACE_LIVENESS_VERSION + " (" + SURFACE_ROSTER.length + " surfaces)");
    for (const c of result.cases.slice(0, 3)) console.log("  " + (c[1] ? "PASS" : "FAIL") + "  " + c[0]);
    if (result.cases.length > 3) console.log("  ... (" + (result.cases.length - 3) + " more surface checks)");
    console.log("\nSURFACE LIVENESS SELF-CHECK: " + (result.ok ? "PASS" : "FAIL"));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (args.includes("--run")) {
    const result = runLiveness();
    console.log("SURFACE LIVENESS RUN — " + (result.ok ? "OK" : "FAIL"));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  console.log("usage: node scripts/surface-liveness.mjs --self-check | --run");
  process.exitCode = 2;
}

if (process.argv[1] && process.argv[1].endsWith("surface-liveness.mjs")) main();
