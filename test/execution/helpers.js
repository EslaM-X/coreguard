/**
 * WS-4 — execution evidence test fixtures.
 *
 * A fake read-only "Core" provider (EVM-style RPC surface) that strictly
 * bounds to pinned blocks and optionally exposes a trace. Raw hex mirrors of
 * the intent fields are used so extraction/binding are exercised against
 * production-identical fixture records (test/firewall/helpers.js +
 * test/sdk/helpers.js).
 */

import {
  seedKey,
  makeAddress,
  makeTxHash,
  makeIntent,
  makeDeclaration,
  signDeclaration,
} from "../firewall/helpers.js";
import { decisionRecordFor, flipRef } from "../sdk/helpers.js";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function padHex(value, bytes) {
  return "0x" + BigInt(value ?? 0).toString(16).padStart(bytes * 2, "0");
}

/** calldata = selector + abi.encode(recipient, amount) */
export function makeCalldata(selector, recipient, amount) {
  return selector + recipient.slice(2) + padHex(amount, 32).slice(2);
}

export function makeRawTx({ signer, target, selector, recipient, amount, nonce = "1", chainId = "1116", blockNumber = "0x1e0", blockHash = "0x" + "ab".repeat(32), txHash = makeTxHash(7), value = "0x0", input }) {
  return {
    hash: txHash,
    from: signer,
    to: target,
    value,
    input: input ?? makeCalldata(selector, recipient, amount),
    nonce: "0x" + BigInt(nonce).toString(16),
    blockNumber,
    blockHash,
    gas: "0x5208",
    gasPrice: "0x3b9aca00",
    type: "0x0",
  };
}

export function makeRawReceipt({ txHash = makeTxHash(7), asset, to, amount, blockNumber = "0x1e0", blockHash = "0x" + "ab".repeat(32), status = "0x1", logs }) {
  const defaultLogs = [
    {
      address: asset,
      topics: [TRANSFER_TOPIC, makeAddress(0xee).toLowerCase(), to.toLowerCase()],
      data: padHex(amount, 32),
      logIndex: "0x0",
    },
  ];
  return {
    transactionHash: txHash,
    status,
    gasUsed: "0x5208",
    transactionIndex: "0x0",
    blockNumber,
    blockHash,
    logs: logs ?? defaultLogs,
  };
}

/**
 * Build a consistent read-only provider.
 * getBlockByNumber ASSERTS a numeric block (never `latest`) — IN-W4-3.
 * @param {object} o { tx, receipt, chainId, supportsTrace, traceFrames, blockNumber, blockHash }
 */
export function makeProvider({ tx, receipt, chainId = "1116", supportsTrace = false, traceFrames = null, blockNumber = "0x1e0", blockHash = "0x" + "ab".repeat(32) }) {
  const calls = { block: 0, tx: 0, receipt: 0, chain: 0, trace: 0 };
  return {
    calls,
    actualChainId: chainId,
    async eth_chainId() {
      calls.chain++;
      return String(chainId);
    },
    async getBlockByNumber(num, hash) {
      calls.block++;
      if (num === "latest" || hash === "latest") throw new Error("latest-pin attempted");
      return { number: blockNumber, hash: blockHash };
    },
    async getTransactionByHash(txHash) {
      calls.tx++;
      return { ...tx, blockHash: tx.blockHash ?? blockHash, blockNumber: tx.blockNumber ?? blockNumber };
    },
    async getTransactionReceipt(txHash) {
      calls.receipt++;
      return { ...receipt, blockHash: receipt.blockHash ?? blockHash, blockNumber: receipt.blockNumber ?? blockNumber };
    },
    supportsTrace,
    async getTrace(txHash) {
      calls.trace++;
      return traceFrames ?? [];
    },
  };
}

/** Consistent happy-path stack: EOA intent + Allowed frozen record + provider. */
export async function executionFixture({ provider = null, intentOverrides = {}, recordOverrides = {}, signerKind = "EOA", supportsTrace = false, traceFrames = null, txOverrides = {}, chainId = "1116", decisionRef } = {}) {
  const intent = makeIntent(intentOverrides);
  const k = seedKey(1);
  const relayer = seedKey(9);
  const tx = makeRawTx({
    signer: txOverrides.from ?? (signerKind === "EOA" ? k.address : relayer.address),
    target: intent.target,
    selector: intent.selector,
    recipient: intent.recipient,
    amount: intent.amount,
    nonce: intent.nonce,
    ...txOverrides,
  });
  const receipt = makeRawReceipt({
    txHash: tx.hash,
    asset: intent.asset,
    to: intent.recipient,
    amount: intent.amount,
  });
  const providerInstance = provider ?? makeProvider({ tx, receipt, chainId, supportsTrace, traceFrames });
  const declaration = await signDeclaration(await makeDeclaration({ intent }), k.priv);
  const { record } = await decisionRecordFor({ intent, declaration, ...recordOverrides });
  return {
    intent,
    declaration,
    record,
    decisionRef: decisionRef ?? record.decisionRef,
    provider: providerInstance,
    tx,
    receipt,
    k,
    relayer,
  };
}

export const defaultValuePredicate = ({ value, amount }) => value === "0" || value === String(amount) || value === BigInt(amount ?? 0).toString();

export { flipRef, makeAddress, makeTxHash };