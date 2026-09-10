/**
 * CoreGuard Trace Normalizer
 *
 * Converts raw RPC data into canonical execution model.
 */

import { canonicalize, hashTrace } from "../canonical/index.js";

/**
 * Normalize raw transaction data into canonical execution trace
 */
export function normalizeExecution(tx, receipt, trace, preState, postState) {
  const calls = normalizeCalls(trace);
  const events = normalizeEvents(receipt.logs);
  const balanceChanges = normalizeBalanceChanges(preState, postState);
  const storageChanges = normalizeStorageChanges(preState, postState);

  return {
    version: "CGEP/1",
    txHash: tx.hash.toLowerCase(),
    from: tx.from.toLowerCase(),
    to: (tx.to || "").toLowerCase(),
    value: tx.value,
    calldata: tx.input.toLowerCase(),
    status: receipt.status === "0x1" ? "SUCCESS" : "REVERT",
    gasUsed: receipt.gasUsed,
    blockNumber: String(receipt.blockNumber),
    blockHash: receipt.blockHash.toLowerCase(),
    blockTimestamp: String(receipt.timestamp || "0"),
    calls,
    events,
    balanceChanges,
    storageChanges,
  };
}

function normalizeCalls(trace) {
  if (!trace) return [];

  const calls = [];
  function flatten(frame, depth = 0) {
    calls.push({
      depth,
      from: frame.from.toLowerCase(),
      to: (frame.to || "").toLowerCase(),
      value: frame.value || "0x0",
      calldata: (frame.input || frame.calldata || "0x").toLowerCase(),
      returnData: (frame.output || frame.returnData || "0x").toLowerCase(),
      status: frame.error ? "REVERT" : "SUCCESS",
      gasUsed: frame.gasUsed || "0x0",
    });
    if (frame.calls) {
      frame.calls.forEach((c) => flatten(c, depth + 1));
    }
  }

  if (Array.isArray(trace)) {
    trace.forEach((frame) => flatten(frame));
  } else if (trace) {
    flatten(trace);
  }

  return calls;
}

function normalizeEvents(logs) {
  if (!logs) return [];
  return logs.map((log) => ({
    address: log.address.toLowerCase(),
    topics: log.topics.map((t) => t.toLowerCase()),
    data: log.data.toLowerCase(),
  }));
}

function normalizeBalanceChanges(preState, postState) {
  if (!preState || !postState) return [];
  const changes = [];
  const addresses = new Set([
    ...Object.keys(preState),
    ...Object.keys(postState),
  ]);
  for (const addr of addresses) {
    const before = preState[addr] || "0x0";
    const after = postState[addr] || "0x0";
    if (before !== after) {
      changes.push({
        address: addr.toLowerCase(),
        before,
        after,
      });
    }
  }
  return changes;
}

function normalizeStorageChanges(preState, postState) {
  if (!preState?.storage || !postState?.storage) return [];
  const changes = [];
  const slots = new Set([
    ...Object.keys(preState.storage),
    ...Object.keys(postState.storage),
  ]);
  for (const slot of slots) {
    const before = preState.storage[slot] || "0x0";
    const after = postState.storage[slot] || "0x0";
    if (before !== after) {
      changes.push({
        address: (preState.address || "").toLowerCase(),
        slot: slot.toLowerCase(),
        before,
        after,
      });
    }
  }
  return changes;
}

/**
 * Compute state delta between pre and post execution
 */
export function computeStateDelta(trace) {
  return {
    balanceChanges: trace.balanceChanges,
    storageChanges: trace.storageChanges,
    eventCount: trace.events.length,
    callCount: trace.calls.length,
    failed: trace.status !== "SUCCESS",
  };
}

/**
 * Hash a normalized trace
 */
export async function commitTrace(trace) {
  const canonical = canonicalize(trace);
  const hash = await hashTrace(trace);
  return { trace, canonical, hash };
}
