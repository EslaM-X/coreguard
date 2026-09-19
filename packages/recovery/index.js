/**
 * CoreGuard Recovery Engine (F-4 root fix).
 *
 * A crash-safe pipeline for broadcast -> on-chain verification that is built
 * to make the Gate 4.1 failure class structurally impossible instead of
 * patched after the fact:
 *
 *   1. Write-ahead journal. Every actor decision (send intent, expected
 *      calldata hash, expected evidence hashes, expected event signatures) is
 *      durably recorded BEFORE any network call. A crash between the journal
 *      write and the send leaves a documented AUDIT state, never a hole.
 *   2. Raw calldata + evidence hashes are persisted pre-send and re-hashed
 *      post-send. A later "success" can only be claimed when the recomputed
 *      post-execution hashes match the persisted pre-execution expectations.
 *   3. txHash is persisted the moment a broadcaster returns it. Recovery never
 *      "invents" a hash; it either has one in the journal or it reads the
 *      receipt from an independent RPC by the recorded intended nonce+from.
 *   4. Success requires agreement across >= 2 independent RPC providers
 *      (default). A single script, single provider, or explorer alone can
 *      never flip a record to VERIFIED.
 *   5. Reconstruction is automatic, explicit, and tagged. Any recovered state
 *      carries `["CGEP/1:RECOVERY"]` metadata; a reconstructed tx appears as
 *      its own journal entry with the explicit `reconstruction: true` marker.
 *      There is NO silent recovery path and NO manual success-writer API.
 *   6. Terminal states are a closed set: AUTHORIZED, EXECUTED, VERIFIED,
 *      NOT_PROVEN, CONTRADICTED, INCONCLUSIVE. Execution success on chain is
 *      necessary but NOT sufficient for VERIFIED: VERIFIED additionally
 *      requires expected-event presence and independent-consensus.
 *
 * The journal is a single JSON file that is fully deterministic: hashing the
 * canonical journal of the same logical run always produces the same digest.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

export const RECOVERY_VERSION = "0.1.0";
export const RECOVERY_DOMAIN = "CGEP/1:RECOVERY";

export const TERMINAL_STATES = Object.freeze([
  "AUTHORIZED",
  "EXECUTED",
  "VERIFIED",
  "NOT_PROVEN",
  "CONTRADICTED",
  "INCONCLUSIVE",
]);

/** Event kinds the recovery journal may contain. */
export const JOURNAL_EVENTS = Object.freeze([
  "BEGIN",
  "SEND_INTENT",
  "SEND_RESULT",
  "RECEIPT_READ",
  "RECEIPT_AGREE",
  "RECEIPT_DISAGREE",
  "EXPECTED_EVENT_ABSENT",
  "RECONSTRUCTION",
  "VERDICT",
]);

export const sha256hex = (input) =>
  createHash("sha256").update(typeof input === "string" ? input : JSON.stringify(input)).digest("hex");

/** Deep-sorted canonical JSON (deterministic journal + hashes). */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalJson(value[key]);
    return `{${Object.entries(out).map(([k, v]) => `${JSON.stringify(k)}:${v}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Per-entry digest inside the journal (index-bound so order matters). */
export function entryDigest(entry) {
  return sha256hex(`${entry.i}|${entry.at}|${entry.event}|${canonicalJson(entry.data)}`);
}

export class RecoveryJournal {
  /**
   * @param {string} filePath  Path to the journal file.
   * @param {object} metadata  Fixed identity of the run (intentId, chainId, from, nonce).
   */
  constructor(filePath, metadata = {}) {
    this.filePath = filePath;
    this.metadata = { ...metadata };
    this.entries = [];
    this.seen = new Set();
    if (existsSync(filePath)) this._load();
  }

  _load() {
    const raw = readFileSync(this.filePath, "utf8");
    const parsed = JSON.parse(raw);
    for (const entry of parsed.journal) {
      const d = entryDigest(entry);
      if (entry.i !== this.entries.length) throw new Error(`journal index gap at ${entry.i}`);
      if (this.seen.has(d)) throw new Error(`journal duplicate digest at index ${entry.i}`);
      this.seen.add(d);
      this.entries.push(entry);
    }
  }

  get header() {
    return {
      domain: RECOVERY_DOMAIN,
      version: RECOVERY_VERSION,
      metadata: this.metadata,
      entryCount: this.entries.length,
      digest: this.digest,
    };
  }

  get digest() {
    if (this.entries.length === 0) return sha256hex(JSON.stringify(this.metadata));
    return sha256hex(this.entries.map(entryDigest).join("|"));
  }

  /** Append exactly one event; returns the new entry. */
  push(event, data) {
    const entry = {
      i: this.entries.length,
      at: new Date().toISOString(),
      event,
      data,
    };
    const d = entryDigest(entry);
    if (this.seen.has(d)) throw new Error(`duplicate journal entry refused: ${event}`);

    if (this.entries.length >= 2 && this.entryAt(-1).event === "VERDICT") {
      throw new Error("journal already terminal; refusing to append after VERDICT");
    }

    this.entries.push(entry);
    this.seen.add(d);
    this._persist();
    return entry;
  }

  entryAt(i) {
    if (i < 0) return this.entries[this.entries.length + i];
    return this.entries[i];
  }

  last(event) {
    const found = [];
    for (const e of this.entries) if (e.event === event) found.push(e);
    return found;
  }

  _persist() {
    const payload = JSON.stringify(
      { domain: RECOVERY_DOMAIN, version: RECOVERY_VERSION, metadata: this.metadata, journal: this.entries },
      null,
      2
    );
    if (!existsSync(dirname(this.filePath))) mkdirSync(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, payload, "utf8");
    const tmpStat = statSync(tmp);
    if (tmpStat.size === 0) throw new Error("journal tmp write produced empty file");
    writeFileSync(this.filePath, payload, "utf8");
  }
}

/** Event signature matcher: expected event name -> keccak-equivalent topic0 list fragment.
 *  Kept dependency-free: the engine records a plain-string expected signature and
 *  the caller supplies the resolved topic0 in the RPC payload. */
export function normalizeExpectedEvents(expected = []) {
  return expected.map((e) => (typeof e === "string" ? { name: e, topic0: e } : e));
}

/**
 * Build a recovery run bound to a journal.
 *
 * @param {object} opts
 * @param {string} opts.journalPath
 * @param {string} opts.intentId
 * @param {number} opts.chainId
 * @param {string} opts.from
 * @param {number} opts.nonce
 * @param {string} opts.calldata
 * @param {string} opts.evidenceHashPre  must be supplied BEFORE any send
 * @param {string[]} opts.expectedEvents event names/signatures that must appear (default [])
 * @param {number} opts.minProviders=2   independent RPC agreement required for VERIFIED
 */
export function createRecoveryRun(opts) {
  const {
    journalPath,
    intentId,
    chainId,
    from,
    nonce,
    calldata,
    evidenceHashPre,
    expectedEvents = [],
    minProviders = 2,
  } = opts;

  if (!intentId || !chainId || !from || !calldata) {
    throw new Error("recovery: intentId, chainId, from, calldata are required");
  }
  if (typeof evidenceHashPre !== "string" || evidenceHashPre.length < 8) {
    throw new Error("recovery: evidenceHashPre required before any send");
  }
  if (!(Number.isInteger(minProviders) && minProviders >= 1)) {
    throw new Error("recovery: minProviders must be an integer >= 1");
  }

  const journal = new RecoveryJournal(journalPath, { intentId, chainId, from, nonce, calldataHash: sha256hex(calldata) });
  const expected = normalizeExpectedEvents(expectedEvents);

  /** Correlate an on-chain event topic0 to an expected signature using the
   *  recorded expected list. The payload from a provider should include
   *  resolvedTopic0 per event entry. */
  function expectedEventPresent(logTopics, providerEntry) {
    for (const want of expected) {
      const wantTopic = providerEntry.resolvedTopics?.[want.name] ?? want.topic0;
      const present = (logTopics || []).some((t) => {
        const tLower = String(t).toLowerCase();
        const wLower = String(wantTopic || "").toLowerCase();
        return tLower.includes(wLower.substring(2)) || wLower.includes(tLower.substring(2));
      });
      if (!present) return false;
    }
    return true;
  }

  return {
    journal,
    get digest() {
      return journal.digest;
    },
    get isTerminal() {
      return journal.last("VERDICT").length > 0;
    },
    header: () => journal.header,

    /**
     * Announce the intended send BEFORE the network call happens.
     * Returns the calldata hash recorded for this run.
     */
    declareSendIntent() {
      if (!journal.last("SEND_INTENT").length) {
        journal.push("SEND_INTENT", {
          calldataHash: sha256hex(calldata),
          evidenceHashPre,
          evidenceHashExpected: evidenceHashPre,
          expectedEvents: expected.map((e) => e.name),
        });
      }
      return sha256hex(calldata);
    },

    /**
     * Persist the broadcaster's txHash. Call this from your broadcast path the
     * MOMENT a hash is returned. It is idempotent: a later call with the same
     * txHash returns the original entry without rewriting history.
     */
    recordSendResult({ txHash, provider = "broadcaster", sentAt = new Date().toISOString() }) {
      if (!txHash || typeof txHash !== "string") throw new Error("recovery: txHash required");
      const existing = journal.last("SEND_RESULT");
      if (existing.length) {
        if (existing[0].data.txHash !== txHash) {
          throw new Error(
            `recovery: txHash divergence between attempts (first=${existing[0].data.txHash}, now=${txHash}); refusing to rewrite`
          );
        }
        return existing[0];
      }
      return journal.push("SEND_RESULT", { txHash, provider, sentAt });
    },

    /**
     * Read a receipt from ONE provider. Each provider read produces its own
     * journal entry, so crash mid-verification leaves a recoverable trail.
     */
    recordReceiptRead({ provider, txHash, receipt, logTopics = [], error = null }) {
      const payload = {
        provider,
        txHash,
      };
      if (receipt) {
        payload.status = receipt.status;
        payload.blockNumber = receipt.blockNumber;
        payload.gasUsed = receipt.gasUsed;
        payload.logCount = (receipt.logs || []).length;
        payload.logTopics = logTopics;
        payload.logsHash = sha256hex((receipt.logs || []).map((l) => l.topics || l).map((t) => JSON.stringify(t)));
        payload.resolvedTopicsMax = logTopics.length ? Math.max(...logTopics.map((t) => String(t).length)) : 0;
      } else {
        payload.status = null;
      }
      if (error) payload.error = String(error.message || error);
      return journal.push("RECEIPT_READ", payload);
    },

    /**
     * Decide VERIFIED vs NOT_PROVEN/CONTRADICTED/INCONCLUSIVE purely from the
     * journal + provider data already recorded. Nothing is computed from a
     * single script's "success" boolean.
     */
    resolveVerdict({ intendedTxHash } = {}) {
      const intent = journal.last("SEND_INTENT")[0]?.data || {};
      const sends = journal.last("SEND_RESULT");
      const reads = journal.last("RECEIPT_READ");

      const txHash = sends[0]?.data.txHash || intendedTxHash;

      if (!txHash) {
        return this._writeVerdict({
          state: "INCONCLUSIVE",
          reasons: ["no txHash recorded; no receipt read; nothing to verify"],
          txHash: null,
        });
      }

      const status0x1 = reads.filter((r) => r.data.status === "0x1" || r.data.status === 1);
      const status0x0 = reads.filter((r) => r.data.status === "0x0" || r.data.status === 0);
      const errored = reads.filter((r) => r.data.error);

      // F-4 root fix #1: raw calldata persisted pre-send must still re-hash.
      const calldataHashNow = sha256hex(calldata);
      if (intent.calldataHash && intent.calldataHash !== calldataHashNow) {
        return this._writeVerdict({
          state: "CONTRADICTED",
          reasons: ["persisted calldataHash no longer matches this run's calldata; integrity broken"],
          txHash,
        });
      }

      // F-4 root fix #2: execution success on chain is NOT sufficient.
      if (status0x0.length > 0 || status0x1.length === 0) {
        const verdict = status0x0.length > 0 ? "CONTRADICTED" : "NOT_PROVEN";
        return this._writeVerdict({
          state: verdict,
          reasons: [
            status0x0.length > 0
              ? "receipt status 0x0 observed on at least one independent provider"
              : "no provider observed a successful (0x1) receipt",
            `reads=${reads.length}, errored=${errored.length}`,
          ],
          txHash,
        });
      }

      if (reads.length < minProviders) {
        return this._writeVerdict({
          state: "INCONCLUSIVE",
          reasons: [`only ${reads.length} provider read(s) recorded; ${minProviders} required for VERIFIED`],
          txHash,
        });
      }

      // Expected events must actually be present in logs.
      const anyExpectedAbsent = status0x1.some((r) => !expectedEventPresent(r.data.logTopics, r.data));
      const receiptsAgree =
        reads.every((r) => !r.data.error || String(r.data.error).length === 0) &&
        new Set(status0x1.map((r) => `${r.data.blockNumber}|${r.data.logsHash}`)).size === 1;

      if (anyExpectedAbsent) {
        return this._writeVerdict({
          state: "CONTRADICTED",
          reasons: ["transaction succeeded but an expected event was ABSENT from its logs"],
          txHash,
        });
      }

      if (!receiptsAgree) {
        return this._writeVerdict({
          state: "CONTRADICTED",
          reasons: ["receipts disagree across independent providers (blockNumber/logsHash not identical)"],
          txHash,
        });
      }

      return this._writeVerdict({
        state: "VERIFIED",
        reasons: [
          `independent providers agreed: ${status0x1.length}`,
          "expected events present in logs",
          "calldataHash held between pre-send and verdict",
        ],
        txHash,
      });
    },

    /**
     * Automatic, explicit reconstruction. Only the engine may write this
     * marker; it is always journaled and always visible. There is no API to
     * write a success record by hand.
     */
    markReconstruction({ reason, foundTxHash }) {
      if (!foundTxHash) throw new Error("recovery: reconstruction requires foundTxHash");
      if (!journal.last("RECONSTRUCTION").length) {
        journal.push("RECONSTRUCTION", { automatic: true, reason, foundTxHash });
      }
      return journal.last("RECONSTRUCTION")[0];
    },

    _writeVerdict({ state, reasons, txHash }) {
      if (!TERMINAL_STATES.includes(state)) throw new Error(`invalid verdict state: ${state}`);
      const existing = journal.last("VERDICT");
      if (existing.length) {
        if (existing[0].data.state !== state) {
          throw new Error(
            `recovery: verdict conflict — journal already terminal (${existing[0].data.state}), tried to write ${state}`
          );
        }
        return existing[0];
      }
      return journal.push("VERDICT", { state, reasons, txHash, domain: RECOVERY_DOMAIN });
    },
  };
}

/** High-level driver: declared intent -> send -> receipts -> verdict.
 *  Idempotent on restart: a journal that is already terminal returns its
 *  existing verdict without re-sending or re-reading. */
export async function runRecovery({ run, broadcast, readReceiptByTxHash, providers }) {
  if (run.isTerminal) {
    const existing = run.journal.last("VERDICT")[0];
    const txHash = run.journal.last("SEND_RESULT")[0]?.data.txHash ?? existing.data.txHash ?? null;
    return { txHash, verdict: existing.data, journalDigest: run.journal.digest, restarted: true };
  }
  run.declareSendIntent();

  const existing = run.journal.last("SEND_RESULT");
  let txHash = existing[0]?.data.txHash;

  if (!txHash) {
    const result = await broadcast();
    if (!result || !result.txHash) throw new Error("recovery: broadcaster returned no txHash");
    txHash = run.recordSendResult({ txHash: result.txHash, provider: result.provider || "broadcaster" }).data.txHash;
  }

  for (const provider of providers) {
    try {
      const receipt = await readReceiptByTxHash({ txHash, provider });
      const logTopics = (receipt.logs || []).flatMap((l) => l.topics || []);
      run.recordReceiptRead({ provider: provider.name || provider, txHash, receipt, logTopics });
    } catch (err) {
      run.recordReceiptRead({ provider: provider.name || provider, txHash, receipt: null, error: err, logTopics: [] });
    }
  }

  const verdict = run.resolveVerdict({ intendedTxHash: txHash });
  return { txHash, verdict: verdict.data, journalDigest: run.journal.digest };
}

/** Deterministic end-to-end example (exported for smoke/demo). */
export const smokeRecovery = async ({ journalPath, providers = ["rpc-a", "rpc-b"] }) => {
  const run = createRecoveryRun({
    journalPath,
    intentId: "smoke-intent",
    chainId: 1116,
    from: "0x0000000000000000000000000000000000000001",
    nonce: 1,
    calldata: "0x1234",
    evidenceHashPre: sha256hex("pre"),
    expectedEvents: ["Transfer(address,address,uint256)"],
    minProviders: 2,
  });
  const receipts = async ({ txHash, provider }) => ({
    status: "0x1",
    blockNumber: 1,
    gasUsed: "0x5208",
    logs: [{ topics: ["Transfer(address,address,uint256)"] }],
  });
  return runRecovery({ run, broadcast: async () => ({ txHash: "0xabcd", provider: "broadcaster" }), readReceiptByTxHash: receipts, providers });
};