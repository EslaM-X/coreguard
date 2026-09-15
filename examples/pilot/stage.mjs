/**
 * Pilot-1 staging step — tip of the pre-declaration pipeline WITHOUT broadcast.
 *
 * After `plan` (intent + WS-1 authorization) and a GENUINE preflight (eth_call
 * at a pinned pre-execution block), this signs the legacy EIP-155 execution tx
 * and produces stage.json. Nothing is broadcast here by default.
 *
 * An explicit `broadcast` command may later call eth_sendRawTransaction, and only
 * after ALL of: mainnet chain check, funding gate (balance >= value + gas),
 * operator double-confirmation, and env guard CG_PILOT_ALLOW_BROADCAST=1.
 * The default and the shipped state is STAGED, NEVER SENT.
 */

import { signLegacyTransaction } from "./txsigner.mjs";

export async function stageExecution({ scenario, agent, nonce, gasPrice, gasLimit, balance, preflight }) {
  const { value } = scenario.execution;
  const gasCost = BigInt(gasLimit) * BigInt(gasPrice);
  const required = BigInt(value) + gasCost;

  if (balance < required) {
    throw new Error(
      "stage: UNFUNDED — refusing to stage a broadcast the agent cannot pay for. " +
        `balance=${balance.toString()} wei, required incl. gas=${required.toString()} wei.`
    );
  }

  const signed = await signLegacyTransaction({
    privateKey: agent.privateKeyForBroadcast(),
    nonce,
    gasPrice,
    gasLimit,
    to: scenario.execution.to,
    value,
    data: "0x",
    chainId: scenario.intent.chainId,
  });

  return {
    intent: scenario.intent,
    tx: signed,
    preflight: { ...preflight, at: "genuine eth_call replay at pinned pre-execution block" },
    broadcast: { state: "STAGED", sent: false },
    gates: {
      chainIdOk: true,
      funded: true,
      fundingRequiredWei: required.toString(),
      traceUnavailable: "TRACE_UNAVAILABLE (rpc.coredao.org exposes no debug_traceTransaction) — RECEIPT_LEVEL evidence only, no fabricated traces",
    },
  };
}