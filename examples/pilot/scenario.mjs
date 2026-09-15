/**
 * Pilot-1 scenario: an automated agent moves a small amount of CORE on Core
 * Mainnet. All values are explicit (never inferred): the intent, the policy,
 * the scope and the execution envelope are authored here and committed as
 * CGEP/1 artifacts before any execution happens.
 *
 * Recipient defaults to the SEPARATE controlled recipient EOA in
 * `recipient.local.json` (a distinct account from the agent — a commercial
 * transfer, never a self-transfer). Falls back to the agent address only when
 * no recipient file exists (bare machinery demo). Overrides (env):
 * CG_PILOT_CHAIN_ID, CG_PILOT_RECIPIENT, CG_PILOT_AMOUNT, CG_PILOT_VALID_UNTIL.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalUintString } from "@coreguard/canonical";

const here = dirname(fileURLToPath(import.meta.url));

function defaultRecipient(agentAddress) {
  if (process.env.CG_PILOT_RECIPIENT) return process.env.CG_PILOT_RECIPIENT.toLowerCase();
  try {
    const local = JSON.parse(readFileSync(resolve(here, "recipient.local.json"), "utf8"));
    if (local.address) return String(local.address).toLowerCase();
  } catch {
    /* no local recipient — fall through */
  }
  return agentAddress;
}

export function resolveScenario(agentAddress) {
  const chainId = String(process.env.CG_PILOT_CHAIN_ID || "1116");
  const amountWei = BigInt(process.env.CG_PILOT_AMOUNT || "1000000000000000"); // 0.001 CORE
  const recipient = defaultRecipient(agentAddress);
  const validUntil = String(process.env.CG_PILOT_VALID_UNTIL || "5000000000");

  return {
    chainId,
    header: {
      pilot: "Pilot-1: agent execution verification",
      network: "core-mainnet",
      declaredAt: null, // set at plan time when the declaration is built
    },
    intent: {
      version: "CGEP/1",
      chainId,
      signer: agentAddress,
      nonce: null, // set at plan time
      validAfter: "0",
      validUntil,
      action: "TRANSFER",
      target: recipient,
      selector: "0x",
      asset: "0x0000000000000000000000000000000000000000",
      amount: canonicalUintString(amountWei.toString()),
      recipient,
    },
    policy: {
      version: "CGEP/1",
      policyId: "0x" + "ab".repeat(20),
      name: "Pilot-1 Agent Policy",
      rules: [
        {
          ruleId: "VALUE_001",
          type: "VALUE_LIMIT",
          params: { max: canonicalUintString(amountWei.toString()) },
          severity: "CRITICAL",
        },
        {
          ruleId: "TARGET_001",
          type: "TARGET_ALLOWLIST",
          params: { targets: [recipient] },
          severity: "CRITICAL",
        },
        {
          ruleId: "DEADLINE_001",
          type: "DEADLINE",
          params: { deadline: validUntil },
          severity: "HIGH",
        },
      ],
    },
    executionEnvelope: {
      description: "Agent CORE value transfer (native asset, no calldata). Selector binding is therefore NOT claimable — RECEIPT_LEVEL only, never fabricated.",
      to: recipient,
      selector: "0x",
      value: amountWei.toString(),
    },
    addressChecksum: {
      agent: agentAddress,
      recipient,
    },
  };
}

export function policyContextFor(intent) {
  return {
    value: intent.amount,
    target: intent.target,
    recipient: intent.recipient,
    selector: intent.selector,
    blockTimestamp: null,
    slippageBps: "0",
  };
}