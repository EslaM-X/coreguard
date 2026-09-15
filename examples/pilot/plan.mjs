/**
 * Pilot-1 `plan` — pre-declared agent authorization + readiness gates.
 *
 * NO broadcast ever happens here. This module:
 *   1. Verifies the RPC is Core Mainnet (chainId 1116) and refuses otherwise.
 *   2. Derives the agent EOA identity (key never leaves the closure).
 *   3. Builds the explicit intent + policy (never inferred).
 *   4. Signs the WS-1 EIP-712 ManifestDeclaration with the agent EOA and
 *      recomputes intentRef / manifestId / bindingRef.
 *   5. Reads the agent nonce + balance; reports FUNDING CLOSED if balance = 0
 *      (Phase-Gate: no broadcast until funded).
 *   6. Stages the raw execution payload (to/value/nonce) WITHOUT sending.
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile, mkdir } from "node:fs/promises";

import { hashIntent, hashPolicy } from "@coreguard/canonical";
import { buildAuthorization } from "@coreguard/intent/authorization.js";
import { probeAuthorization } from "@coreguard/provenance/authorization-probe.js";
import * as evm from "@coreguard/evm";

import { agentFromEnv } from "./agent-key.mjs";
import { chainIdHex, readBalance, readNonce, mainnetRpcUrl } from "./provider.mjs";
import { resolveScenario } from "./scenario.mjs";

const here = dirname(fileURLToPath(import.meta.url));

async function readGasPrice() {
  const feed = await mainnetRpcUrl();
  const res = await fetch(feed, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] }),
  });
  const body = await res.json();
  return body.result ? BigInt(body.result) : 0n;
}

export async function plan({ outDir }) {
  const agent = agentFromEnv();

  const chainHex = await chainIdHex();
  const chainId = parseInt(chainHex, 16);
  if (chainId !== 1116) {
    throw new Error(`Pilot-1 gate: refusing non-Mainnet chain chainId=${chainId} (expected 1116). No pilot executes on a non-Mainnet chain.`);
  }

  const scenario = resolveScenario(agent.address);
  const nonce = await readNonce(agent.address);
  const balance = await readBalance(agent.address);
  const gasPrice = await readGasPrice();

  scenario.intent.nonce = nonce.toString();
  scenario.header.declaredAt = new Date().toISOString();

  // --- WS-1 signed authorization (pre-declared, offline) ---
  const manifestId = await buildDeclarationMaterial(scenario, agent);
  const declaration = {
    version: "CGEP/1",
    kind: "INTENT_DECLARATION",
    chainId: scenario.chainId,
    nonce: scenario.intent.nonce,
    intent: scenario.intent,
    manifestId,
    signerBinding: { address: agent.address, kind: "EOA" },
    signature: await agent.signManifest(manifestId, scenario.chainId),
  };

  const binding = await buildAuthorization({ intent: scenario.intent, declaration });
  if (binding.status !== "OK") {
    throw new Error(`Pilot-1 gate: WS-1 authorization did not bind — ${binding.status} ${binding.label}: ${binding.reason}`);
  }

  // WS-1 authority probe — signature RECOVERY at declaration time (offline).
  const probe = await probeAuthorization({
    signature: declaration.signature,
    signerBinding: declaration.signerBinding,
    manifestId: declaration.manifestId,
    chainId: scenario.chainId,
    authorityAtState: null,
    evm,
  });
  if (probe.status !== "OK") {
    throw new Error(`Pilot-1 gate: WS-1 signature did not recover to the agent — ${probe.label}: ${probe.reason}`);
  }

  // --- readiness gates ---
  const gates = {
    mainnetRpc: { ok: chainId === 1116, detail: `chainId=${chainId} (${mainnetRpcUrl()})` },
    agentNonce: { ok: true, detail: `nonce=${nonce} @ ${agent.address}` },
    funding: {
      ok: balance > 0n,
      detail: balance > 0n ? `balance=${balance.toString()} wei` : "BALANCE 0 — broadcast staged, awaiting Core Mainnet funding",
    },
    ws1Authorization: { ok: binding.status === "OK" && probe.status === "OK", detail: `${binding.status} ${binding.label} + WS-1 probe ${probe.label}` },
  };

  const intentHash = await hashIntent(scenario.intent);
  const policyHash = await hashPolicy(scenario.policy);

  const staged = {
    kind: "STAGED_NOT_SENT",
    chainId: scenario.chainId,
    to: scenario.executionEnvelope.to,
    value: scenario.executionEnvelope.value,
    nonce: nonce.toString(),
    gasPrice: gasPrice.toString(),
    gasLimit: "21000",
    envelope: scenario.executionEnvelope,
  };

  const plan = {
    pilot: scenario.header.pilot,
    network: "core-mainnet (1116)",
    declaredAt: scenario.header.declaredAt,
    agent: agent.address,
    recipient: scenario.intent.recipient,
    intentHash,
    policyHash,
    intentRef: binding.semantics.intentRef,
    manifestId: binding.semantics.manifestId,
    bindingRef: binding.instance.bindingRef,
    authorization: { status: binding.status, label: binding.label, atState: null },
    gates,
    staged,
    freezeMe: ["intent.json", "policy.json", "declaration.json"],
  };

  if (outDir) {
    const dir = resolve(here, outDir);
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, "plan.json"), JSON.stringify(plan, null, 2));
    await writeFile(resolve(dir, "intent.json"), JSON.stringify(scenario.intent, null, 2));
    await writeFile(resolve(dir, "policy.json"), JSON.stringify(scenario.policy, null, 2));
    await writeFile(resolve(dir, "declaration.json"), JSON.stringify(declaration, null, 2));
  }
  return plan;
}

async function buildDeclarationMaterial(scenario, agent) {
  // manifestId = H("CGEP/1:AGENT-PROVENANCE", canonicalize(declaration minus
  // manifestId/signature/commit)) — recomputed by buildAuthorization; here we
  // agree on the value BEFORE signing so the EIP-712 envelope is deterministic.
  void agent;
  const draft = {
    version: "CGEP/1",
    kind: "INTENT_DECLARATION",
    chainId: scenario.chainId,
    nonce: scenario.intent.nonce,
    intent: scenario.intent,
    signerBinding: { address: scenario.intent.signer, kind: "EOA" },
  };
  const { domainHash, canonicalize } = await import("@coreguard/canonical");
  return domainHash("CGEP/1:AGENT-PROVENANCE", JSON.parse(canonicalize(draft)));
}