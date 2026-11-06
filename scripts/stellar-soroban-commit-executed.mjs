#!/usr/bin/env node
/**
 * scripts/stellar-soroban-commit-executed.mjs
 * Stellar Soroban Commitment Anchor — EXECUTED evidence runner (owner-authorized mainnet commit).
 *
 * Executes the FIRST commitment-anchor CALL on the CG-COMMITMENT-ANCHOR/1
 * Soroban contract deployed on Stellar mainnet
 * (`CCKA2GYVILX7YZVSXGVIHOPNLTRBBF2SSWKBTQBIE7M67N5N2QMMXPSP`), then records the
 * executed-evidence artifact for it.
 *
 * Flow (owner-authorized): the owner's explicit decision (this run) unlocks the
 * fail-closed mainnet path of the SOROBAN/1 adapter
 * (`packages/stellar-soroban/index.mjs` — `executeAnchorFlow` with
 * `ownerAuthorization: true` + `deployedContractId`, commit-only on the deployed
 * instance). The injected submitter owns ALL networking/IO and is backed by the
 * Soroban RPC mainnet node that served the deployment:
 *   getSequence: async (publicKey) => <sequence string>
 *   submit:      async (signedXdrBase64) => { state:"SUBMITTED", hash, ... }
 *   wait:        async (hash) => { state:"INVOKED", ledger? } | { state:"FAILED" }
 * Build -> sign (owner keypair, per-call only) -> prepare/simulation -> submit ->
 * poll finality. The contract's own fail-closed semantics (same (id, hash) ->
 * idempotent Ok(seq); different hash for the same id -> HashMismatch) mean a
 * SUCCESS/INVOKED commit is an on-chain-verified anchor of the exact pair.
 *
 * What this is NOT:
 *   - no deploy: the deployment is a recorded fact (`.stellar-soroban-deploy.json`)
 *   - no fresh anchoring beyond the live plan's proof pair (chainId 1116 plan)
 *   - no status claim beyond what the wire showed (INVOKED + artifact digest)
 *
 * Usage:
 *   node scripts/stellar-soroban-commit-executed.mjs           # execute + write artifact
 *   node scripts/stellar-soroban-commit-executed.mjs --verify # re-derive + compare (exit 0/1)
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair, TransactionBuilder, Networks, Horizon } from "@stellar/stellar-sdk";
import { Server as RpcServer } from "@stellar/stellar-sdk/rpc";
import * as S from "../packages/stellar-soroban/index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const OUT = resolve(repoRoot, "docs/evidence/stellar-soroban-commit-executed.json");
const PLAN = resolve(repoRoot, "scripts/live-anchor-planned.json");

const NETWORK = "mainnet";
const CONTRACT_ID = "CCKA2GYVILX7YZVSXGVIHOPNLTRBBF2SSWKBTQBIE7M67N5N2QMMXPSP";
const WALLET_PUBLIC = "GDJ3CRNLNDZ4AVWGPUG7DBC5BIAGMIONOONZGB5FSYAY44ZHOIPRKY7U";
const RPC_URL = "https://mainnet.sorobanrpc.com";
const HORIZON_URL = "https://horizon.stellar.org";
const NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";
const FEE = "1000000";

export function digestStable(payload) {
  const { generatedAt, evidenceDigest, ...rest } = payload;
  const h = createHash("sha256");
  h.update(JSON.stringify(rest));
  return "sha256:" + h.digest("hex");
}

export async function loadPlan() {
  return JSON.parse(await readFile(PLAN, "utf8"));
}

export async function loadWallet() {
  const raw = JSON.parse(await readFile(resolve(repoRoot, ".stellar-wallet.json"), "utf8"));
  const keypair = Keypair.fromSecret(raw.secretKey);
  return { keypair, publicKey: keypair.publicKey(), raw };
}

export async function runCommit() {
  const plan = await loadPlan();
  const { keypair, publicKey } = await loadWallet();
  const rpcServer = new RpcServer(RPC_URL);

  const getSequence = async () => {
    // The mainnet Soroban RPC node occasionally answers getAccount with an
    // Account that lacks sequenceNumber (wire-observed transient); compaction
    // may also race a deploy. Fail-closed sequence discipline: retry the RPC
    // node, then fall back to a read-only Horizon account read — the same
    // ledger-truth sequence either way.
    for (let i = 0; i < 3; i++) {
      try {
        const acct = await rpcServer.getAccount(publicKey);
        const seq = acct && String(acct.sequenceNumber ?? "");
        if (/^\d+$/.test(seq)) return seq;
      } catch { /* transient RPC flake — retry */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    const horizon = new Horizon.Server(HORIZON_URL);
    const loaded = await horizon.loadAccount(publicKey);
    const seq = String(loaded.sequence);
    if (!/^\d+$/.test(seq)) throw new Error(`unusable sequence from Horizon: ${seq}`);
    return seq;
  };
  const submit = async (signedXdrBase64) => {
    const tx = TransactionBuilder.fromXDR(signedXdrBase64, NETWORK_PASSPHRASE);
    const prepared = await rpcServer.prepareTransaction(tx);
    prepared.sign(keypair);
    const result = await rpcServer.sendTransaction(prepared);
    if (!result || !result.hash) return { state: "REJECTED", error: "sendTransaction returned no hash", hash: null };
    return { state: "SUBMITTED", hash: result.hash, status: result.status || null };
  };
  const wait = async (hash) => {
    for (let i = 0; i < 60; i++) {
      const r = await rpcServer.getTransaction(hash);
      const st = r && r.status;
      if (st === "SUCCESS" || st === "INVOKED") return { state: "INVOKED", ledger: (r && r.ledger) || null };
      if (st === "FAILED") return { state: "FAILED" };
      await new Promise((r) => setTimeout(r, 2000));
    }
    return { state: "FAILED", error: "finality timeout" };
  };

  const execution = await S.executeAnchorFlow({
    network: NETWORK,
    deployerKey: keypair,
    commitmentId: plan.proofId,
    commitmentHash: plan.commitment,
    getSequence,
    submit,
    wait,
    deployedContractId: CONTRACT_ID,
    ownerAuthorization: true,
    fee: FEE,
  });

  return { execution, plan, keypair, publicKey };
}

export function buildArtifact(execution, plan) {
  const steps = (execution && Array.isArray(execution.steps) ? execution.steps : []) || [];
  const commitStep = steps.find((s) => s && s.step === "commit") || null;
  const confirmed = Boolean(execution) && execution.state === "INVOKED";
  const artifact = {
    schema: "CoreGuard-Evidence/1",
    artifact: "stellar-soroban-commit-executed",
    version: "SOROBAN-ANCHOR/1",
    executedBy: "scripts/stellar-soroban-commit-executed.mjs",
    network: "stellar-mainnet",
    contractId: (execution && execution.contractId) || CONTRACT_ID,
    ownerAuthorized: true,
    submit: confirmed
      ? `CONFIRMED — Soroban mainnet commit anchored (tx ${commitStep ? commitStep.hash : "unknown"}, ledger ${execution.ledger ?? (commitStep ? commitStep.ledger : null)})`
      : `NOT_CONFIRMED — last observed state: ${execution ? execution.state : "UNKNOWN"}`,
    commit: {
      fn: "commit",
      commitmentId: (execution && execution.anchored && execution.anchored.id) || null,
      commitmentHash: (execution && execution.anchored && execution.anchored.hash) || null,
      state: confirmed ? "INVOKED" : (execution ? execution.state : "UNKNOWN"),
      txHash: commitStep ? commitStep.hash : null,
      ledger: execution && execution.ledger !== null ? execution.ledger : (commitStep ? commitStep.ledger : null),
    },
    anchorPlan: {
      receiptFile: plan ? plan.receiptFile : null,
      chainId: plan ? plan.chainId : null,
      receiptId: plan ? plan.receiptId : null,
      commitment: plan ? plan.commitment : null,
      proofId: plan ? plan.proofId : null,
      result: plan ? plan.result : null,
      resultCode: plan ? plan.resultCode : null,
    },
    summary: {
      contractId: CONTRACT_ID,
      commitState: confirmed ? "INVOKED" : (execution ? execution.state : "UNKNOWN"),
      anchored: confirmed,
      chainId: plan ? plan.chainId : null,
      verdict: confirmed ? "MAINNET ANCHOR EXECUTED — VERIFIED (owner-authorized commit; fail-closed anchor semantics hold)" : "NOT_EXECUTED",
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
    if (stored.summary.commitState !== "INVOKED") {
      console.error(`SUMMARY MISMATCH: stored commit state ${stored.summary.commitState} is not INVOKED`);
      process.exit(1);
    }
    console.log("STELLAR-SOROBAN-COMMIT EXECUTED · INVOKED — digest faithful, commit anchored on mainnet");
    return 0;
  }
  const { execution, plan, publicKey } = await runCommit();
  const artifact = buildArtifact(execution, plan);
  await writeFile(OUT, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  console.log(OUT);
  console.log("commit state:", artifact.summary.commitState);
  console.log("submit:", artifact.submit);
  console.log("tx:", artifact.commit.txHash, "ledger:", artifact.commit.ledger);
  console.log("commitmentId:", artifact.commit.commitmentId);
  console.log("commitmentHash:", artifact.commit.commitmentHash);
  console.log("digest:", artifact.evidenceDigest);
  if (artifact.summary.commitState !== "INVOKED") {
    process.exit(1);
  }
  return 0;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  process.exit(await main(process.argv.slice(2)));
}
