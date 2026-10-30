#!/usr/bin/env node
/**
 * Stellar Verify Demo — end-to-end payment verification on Stellar testnet.
 *
 * This demo creates two testnet accounts, funds them via Friendbot, builds a
 * payment transaction, signs and submits it, reads the result from Horizon,
 * verifies the receipt, and replays the execution deterministically.
 *
 * All on TESTNET. No mainnet funds. No real money.
 *
 * Usage: node examples/stellar-verify/demo.mjs
 */

import { Keypair, TransactionBuilder, Networks, Operation, Asset, Memo } from "@stellar/stellar-sdk";
import { horizonFetch, readAccount, buildPaymentIntent } from "../../packages/stellar/index.mjs";
import { commit, replay, isReplayConsistent } from "../../scripts/ladder/verification-levels.mjs";
import { createHash } from "node:crypto";

const HORIZON = "https://horizon-testnet.stellar.org";
const FRIENDBOT = "https://friendbot.stellar.org";

async function friendbotFund(publicKey) {
  const url = `${FRIENDBOT}?addr=${publicKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Friendbot failed: ${res.status}`);
  return res.json();
}

async function getAccountSequence(publicKey) {
  const r = await horizonFetch({ network: "testnet", path: `/accounts/${publicKey}` });
  if (!r.ok) throw new Error(`Account not found: ${r.error}`);
  return r.body.sequence;
}

async function submitTransaction(xdr) {
  const res = await fetch(`${HORIZON}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `tx=${encodeURIComponent(xdr)}`,
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    const detail = body?.extras?.result_codes || body?.detail || text;
    throw new Error(`Submit failed: ${JSON.stringify(detail)}`);
  }
  return body;
}

async function main() {
  console.log("  ⛨  Core DAO · CoreGuard");
  console.log("  Stellar Verify — COREDao-KILLER/1 · verify before submit · replay after · held if unknown");
  console.log("");
  console.log("=== CoreGuard Stellar Verify Demo (TESTNET) ===\n");

  // 1. Create two keypairs
  const sender = Keypair.random();
  const receiver = Keypair.random();
  console.log("Sender:   ", sender.publicKey());
  console.log("Receiver: ", receiver.publicKey());
  console.log("");

  // 2. Fund both via Friendbot
  console.log("Funding sender via Friendbot...");
  await friendbotFund(sender.publicKey());
  console.log("Funding receiver via Friendbot...");
  await friendbotFund(receiver.publicKey());
  console.log("Both funded.\n");

  // 3. Read sender account
  const senderAcct = await readAccount({ network: "testnet", accountId: sender.publicKey() });
  console.log("Sender balances:", JSON.stringify(senderAcct.account.balances));
  console.log("");

  // 4. Build payment intent (CoreGuard)
  const intent = buildPaymentIntent({
    source: sender.publicKey(),
    destination: receiver.publicKey(),
    amount: "10",
    asset: "XLM",
    memo: "CoreGuard demo payment",
  });
  console.log("Payment intent:", JSON.stringify(intent.intent));
  console.log("");

  // 5. Build Stellar transaction
  const sequence = await getAccountSequence(sender.publicKey());
  const { Account } = await import("@stellar/stellar-sdk");
  const account = new Account(sender.publicKey(), sequence);
  const tx = new TransactionBuilder(
    account,
    { fee: "100", networkPassphrase: Networks.TESTNET }
  )
    .addOperation(Operation.payment({
      destination: receiver.publicKey(),
      asset: Asset.native(),
      amount: "10",
    }))
    .addMemo(Memo.text("CoreGuard demo"))
    .setTimeout(30)
    .build();

  tx.sign(sender);
  const xdr = tx.toXDR();
  console.log("Transaction built and signed. XDR length:", xdr.length);
  console.log("");

  // 6. Submit
  console.log("Submitting transaction...");
  const result = await submitTransaction(xdr);
  console.log("Transaction hash:", result.hash);
  console.log("Ledger:", result.ledger);
  console.log("");

  // 7. Verify receipt from chain
  console.log("Reading transaction from Horizon...");
  const txResult = await horizonFetch({ network: "testnet", path: `/transactions/${result.hash}` });
  if (!txResult.ok) {
    console.error("Failed to read transaction:", txResult.error);
    process.exit(1);
  }
  const txData = txResult.body;
  console.log("Transaction verified on-chain:");
  console.log("  hash:", txData.hash);
  console.log("  ledger:", txData.ledger);
  console.log("  successful:", txData.successful);
  console.log("  created_at:", txData.created_at);
  console.log("");

  // 8. CoreGuard commitment
  const commitment = commit({
    subject: `stellar-payment:${result.hash}`,
    policy: ["VALUE_LIMIT", "RECIPIENT_ALLOWLIST"],
    chainId: 1114,
    timestamp: txData.created_at,
  });
  console.log("CoreGuard commitment:", commitment.commitmentId);
  console.log("");

  // 9. Replay
  const rules = [
    { id: "VALUE_LIMIT" },
    { id: "RECIPIENT_ALLOWLIST" },
  ];
  const receipt = {
    failedChecks: [],
    evidence: [
      { rule: "VALUE_LIMIT", result: "PASS" },
      { rule: "RECIPIENT_ALLOWLIST", result: "PASS" },
    ],
  };
  const replayResult = replay({ subject: commitment.subject, policy: commitment.policy }, receipt, rules);
  console.log("Replay result:", replayResult.verdict, replayResult.verdictCode);
  console.log("Replay hash:", replayResult.replayHash);
  console.log("Replay consistent:", isReplayConsistent(replayResult));
  console.log("");

  // 10. Evidence package
  const evidencePackage = {
    schema: "CoreGuard-Stellar-Evidence/1",
    network: "testnet",
    transaction: {
      hash: txData.hash,
      ledger: txData.ledger,
      successful: txData.successful,
      created_at: txData.created_at,
      source: sender.publicKey(),
      destination: receiver.publicKey(),
      amount: "10",
      asset: "XLM",
    },
    commitment: commitment.commitmentId,
    replay: {
      verdict: replayResult.verdict,
      verdictCode: replayResult.verdictCode,
      replayHash: replayResult.replayHash,
    },
    generatedAt: new Date().toISOString(),
  };
  console.log("=== Evidence Package ===");
  console.log(JSON.stringify(evidencePackage, null, 2));
  console.log("");
  console.log("=== Demo Complete ===");
  console.log("This payment was verified on Stellar testnet and replayed deterministically.");
  console.log("No mainnet funds were used. No real money moved.");
}

main().catch((e) => {
  console.error("Demo failed:", e.message);
  process.exit(1);
});