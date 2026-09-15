/**
 * CoreGuard Trace Normalizer
 *
 * Converts raw RPC data into canonical execution model.
 *
 * P1 (integer safety + multi-account state): every unsigned integer derived
 * from RPC hex is collapsed to its canonical CGEP/1 decimal string; balances
 * and storage are captured per-account so the state delta commits to a full
 * multi-account view.
 */

import {
  canonicalize,
  hashTrace,
  canonicalUintString,
} from "@coreguard/canonical";

/**
 * Normalize raw transaction data into canonical execution trace
 *
 * preState/postState may be either a flat balance map
 *   { [address]: "0x…" }
 * or a per-account map (P1)
 *   { [address]: { balance: "0x…", storage: { [slot]: "0x…" } } }
 */
export function normalizeExecution(tx, receipt, trace, preState, postState) {
  const calls = normalizeCalls(trace);
  const events = normalizeEvents(receipt.logs);
  const balanceChanges = normalizeBalanceChanges(preState, postState);
  const storageChanges = normalizeStorageChanges(preState, postState);

  const out = {
    version: "CGEP/1",
    txHash: tx.hash.toLowerCase(),
    from: tx.from.toLowerCase(),
    to: (tx.to || "").toLowerCase(),
    value: canonicalUintString(tx.value || "0x0"),
    calldata: tx.input.toLowerCase(),
    status: receipt.status === "0x1" ? "SUCCESS" : "REVERT",
    gasUsed: canonicalUintString(receipt.gasUsed || "0x0"),
    nonce: canonicalUintString(tx.nonce || "0x0"),
    txType: "0",
    blockNumber: canonicalUintString(receipt.blockNumber || "0x0"),
    blockHash: receipt.blockHash.toLowerCase(),
    blockTimestamp: canonicalUintString(receipt.timestamp || "0"),
    calls,
    events,
    balanceChanges,
    storageChanges,
  };

  if (tx.gasPrice) out.gasPrice = canonicalUintString(tx.gasPrice);
  if (tx.gas) out.gasLimit = canonicalUintString(tx.gas);
  if (tx.type) out.txType = canonicalUintString(tx.type);

  return out;
}

function normalizeCalls(trace) {
  if (!trace) return [];

  const calls = [];
  function flatten(frame, depth = 0) {
    const call = {
      depth,
      from: frame.from.toLowerCase(),
      to: (frame.to || "").toLowerCase(),
      value: canonicalUintString(frame.value || "0x0"),
      calldata: (frame.input || frame.calldata || "0x").toLowerCase(),
      returnData: (frame.output || frame.returnData || "0x").toLowerCase(),
      status: frame.error ? "REVERT" : "SUCCESS",
      gasUsed: canonicalUintString(frame.gasUsed || "0x0"),
    };
    if (frame.gasLimit) call.gasLimit = canonicalUintString(frame.gasLimit);
    calls.push(call);
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

function accountBalance(accountState) {
  if (accountState === null || accountState === undefined) return "0x0";
  if (typeof accountState === "string") return accountState;
  if (typeof accountState === "object") {
    if (accountState.balance !== undefined && accountState.balance !== null) {
      return accountState.balance;
    }
    // Legacy flat map with a balance field already resolved
    if (accountState.balanceBefore !== undefined) return accountState.balanceBefore;
  }
  return "0x0";
}

function normalizeBalanceChanges(preState, postState) {
  if (!preState || !postState) return [];
  const changes = [];
  const addresses = new Set([
    ...Object.keys(preState),
    ...Object.keys(postState),
  ]);
  for (const addr of addresses) {
    const before = accountBalance(preState[addr]);
    const after = accountBalance(postState[addr]);
    if (before !== after) {
      changes.push({
        address: addr.toLowerCase(),
        before: canonicalUintString(before),
        after: canonicalUintString(after),
      });
    }
  }
  return changes;
}

function accountStorage(accountState) {
  if (
    accountState &&
    typeof accountState === "object" &&
    accountState.storage &&
    typeof accountState.storage === "object"
  ) {
    return accountState.storage;
  }
  return {};
}

function normalizeStorageChanges(preState, postState) {
  if (!preState || !postState) return [];
  const changes = [];
  const addresses = new Set([
    ...Object.keys(preState),
    ...Object.keys(postState),
  ]);
  for (const address of addresses) {
    const preStorage = accountStorage(preState[address]);
    const postStorage = accountStorage(postState[address]);
    const slots = new Set([
      ...Object.keys(preStorage),
      ...Object.keys(postStorage),
    ]);
    for (const slot of slots) {
      const before = preStorage[slot] || "0x0";
      const after = postStorage[slot] || "0x0";
      if (before !== after) {
        changes.push({
          address: address.toLowerCase(),
          slot: slot.toLowerCase(),
          before: canonicalUintString(before),
          after: canonicalUintString(after),
        });
      }
    }
  }
  return changes;
}

/**
 * Compute state delta between pre and post execution
 *
 * (Legacy flat view, retained for demos: counts + the normalized change lists.)
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
 * Compute the CANONICAL multi-account state delta (P1).
 *
 * Deterministic: accounts sorted by address, slots sorted by key; every
 * numeric field is the canonical decimal string of the normalized trace; the
 * signed `delta` fields are derived BigInt differences (may be negative).
 * Commit with hashStateDelta (domain CGEP/1:STATEDELTA).
 */
export function computeCanonicalStateDelta(trace) {
  const byAddr = new Map();

  for (const bc of trace.balanceChanges || []) {
    const address = bc.address.toLowerCase();
    const acc = byAddr.get(address) || { address, balance: null, storage: [] };
    acc.balance = { before: bc.before, after: bc.after };
    byAddr.set(address, acc);
  }

  for (const sc of trace.storageChanges || []) {
    const address = sc.address.toLowerCase();
    const acc = byAddr.get(address) || { address, balance: null, storage: [] };
    acc.storage.push({ slot: sc.slot, before: sc.before, after: sc.after });
    byAddr.set(address, acc);
  }

  const accounts = [];
  for (const acc of byAddr.values()) {
    if (acc.balance) {
      const before = BigInt(acc.balance.before);
      const after = BigInt(acc.balance.after);
      acc.balance = {
        before: acc.balance.before,
        after: acc.balance.after,
        delta: (after - before).toString(),
      };
    }
    for (const slot of acc.storage) {
      const before = BigInt(slot.before);
      const after = BigInt(slot.after);
      slot.delta = (after - before).toString();
    }
    accounts.push(acc);
  }

  accounts.sort((a, b) => a.address.localeCompare(b.address));
  for (const acc of accounts) {
    acc.storage.sort((a, b) => a.slot.localeCompare(b.slot));
  }

  return {
    version: "CGEP/1",
    accounts,
    eventCount: trace.events ? trace.events.length : 0,
    callCount: trace.calls ? trace.calls.length : 0,
    status: trace.status || "UNKNOWN",
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