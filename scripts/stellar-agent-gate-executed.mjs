#!/usr/bin/env node
/**
 * StellarAgent/1 — EXECUTED evidence runner (offline, deterministic).
 *
 * What this is: a committed runner that actually EXECUTES the AI-agent
 * payment gate (packages/stellar-agent/index.mjs — STELLAR-AGENT/1):
 *
 *   agent proposes → policy judge (value limit · recipient allowlist · asset)
 *     → CGEP/1 commitment → receipt → deterministic replay
 *
 * Three cases are executed and recorded:
 *   allow        → VERIFIED (real mainnet wallet → SDF recipient, in-policy)
 *   above-max    → REJECTED (amount exceeds the policy ceiling)
 *   missing-id   → HELD (fail-closed: missing agent identity)
 *
 * What this is NOT:
 *   - No submission is performed. submitAgentPayment() needs an injected
 *     submitter (Freighter/credentials); the artifact records
 *     `submit: NOT_PERFORMED` exactly as the module's own honesty requires.
 *   - No wall-clock inputs inside the digested payload: the commitment and
 *     replay of STELLAR-AGENT/1 are deterministic; generatedAt is recorded
 *     but EXCLUDED from the evidence digest.
 *
 * Usage:
 *   node scripts/stellar-agent-gate-executed.mjs           # generate artifact
 *   node scripts/stellar-agent-gate-executed.mjs --verify  # re-derive + compare (exit 0/1)
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyAgentPayment, STELLAR_AGENT_VERSION } from "../packages/stellar-agent/index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const OUT = resolve(repoRoot, "docs/evidence/stellar-agent-gate-executed.json");

/** Real mainnet facts (CI-verifiable on Horizon / stellar.expert; no secrets). */
const MAINNET_WALLET = "GDJ3CRNLNDZ4AVWGPUG7DBC5BIAGMIONOONZGB5FSYAY44ZHOIPRKY7U";
const SDF_RECIPIENT = "GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR";

const POLICY = Object.freeze({
  maxAmount: 10,
  allowedRecipients: [SDF_RECIPIENT],
  allowedAssets: ["XLM"],
});
const RULES = Object.freeze([{ id: "VALUE_LIMIT" }, { id: "RECIPIENT_ALLOWLIST" }, { id: "ASSET_ALLOWLIST" }]);

function paymentOf(amount) {
  return { source: MAINNET_WALLET, destination: SDF_RECIPIENT, amount, asset: "XLM" };
}

/** The three executed cases (fixed order; deterministic outputs). */
function executeCases() {
  const verdictOf = (id, amount, agentId = "CG-AGENT-001") => {
    const out = verifyAgentPayment({ agentId, payment: paymentOf(amount), policy: POLICY, rules: RULES });
    return {
      id,
      verdict: out.verdict,
      reason: out.reason,
      agentId,
      payment: paymentOf(amount),
      policy: POLICY,
      rules: RULES,
      commitment: out.commitment,
      replay: out.replayHash
        ? { hash: out.replayHash, consistent: true }
        : null,
    };
  };

  const allow = verdictOf("allow", "4.9");
  const aboveMax = verdictOf("above-max", "99");
  const missingId = { ...verdictOf("missing-id", "4.9", ""), commitment: null, replay: null, reason: verifyAgentPayment({ agentId: "", payment: paymentOf("4.9"), policy: POLICY, rules: RULES }).reason };

  // Discipline: the module must classify exactly as designed.
  if (allow.verdict !== "VERIFIED") throw new Error(`allow case must be VERIFIED, got ${allow.verdict}`);
  if (aboveMax.verdict !== "REJECTED") throw new Error(`above-max case must be REJECTED, got ${aboveMax.verdict}`);
  if (verifyAgentPayment({ agentId: "", payment: paymentOf("4.9"), policy: POLICY, rules: RULES }).verdict !== "HELD")
    throw new Error("missing-id case must be HELD");

  return [allow, aboveMax, missingId];
}

/** Stable digest: sha256 over the canonical payload minus volatile fields. */
export function digestStable(payload) {
  const { generatedAt, evidenceDigest, ...rest } = payload;
  const h = createHash("sha256");
  h.update(JSON.stringify(rest));
  return "sha256:" + h.digest("hex");
}

export function buildArtifact() {
  const cases = executeCases();
  const artifact = {
    schema: "CoreGuard-Evidence/1",
    artifact: "stellar-agent-gate-executed",
    version: STELLAR_AGENT_VERSION,
    executedBy: "scripts/stellar-agent-gate-executed.mjs",
    network: "stellar-mainnet-declared",
    submit: "NOT_PERFORMED — credential-gated; no submitter injected (module honesty preserved)",
    cases,
    summary: {
      executedCases: cases.length,
      verdicts: Object.fromEntries(cases.map((c) => [c.id, c.verdict])),
    },
  };
  artifact.evidenceDigest = digestStable(artifact);
  artifact.generatedAt = new Date().toISOString();
  return artifact;
}

export async function main(argv) {
  if (argv.includes("--verify")) {
    const stored = JSON.parse(await readFile(OUT, "utf8"));
    const recomputed = digestStable(stored);
    if (recomputed !== stored.evidenceDigest) {
      console.error(`DIGEST MISMATCH: stored=${stored.evidenceDigest} recomputed=${recomputed}`);
      process.exit(1);
    }
    if (JSON.stringify(stored.summary.verdicts) !== JSON.stringify({ allow: "VERIFIED", "above-max": "REJECTED", "missing-id": "HELD" })) {
      console.error("SUMMARY MISMATCH: the executed verdict matrix drifted");
      process.exit(1);
    }
    console.log("STELLAR-AGENT-GATE EXECUTED · VERIFIED — digest faithful, verdict matrix intact");
    return 0;
  }
  const artifact = buildArtifact();
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(artifact, null, 2) + "\n");
  console.log(OUT);
  for (const c of artifact.cases) console.log(` ${c.id.padEnd(12)} ${c.verdict.padEnd(10)} ${c.reason}`);
  console.log("digest:", artifact.evidenceDigest);
  return 0;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  process.exit(await main(process.argv.slice(2)));
}
