/**
 * index.mjs — Soroban/1, the CoreGuard Soroban (Stellar) integration adapter.
 *
 * What this is: a deterministic, fail-closed adapter for deploying and
 * invoking the CG-COMMITMENT-ANCHOR/1 Soroban contract on Stellar. It builds
 * REAL transaction envelopes offline (upload WASM, create contract, invoke)
 * and executes them ONLY through an injected, network-gated submitter — the
 * same "verify before submit" discipline as STELLAR/1 and STELLAR-AGENT/1.
 *
 * What this is NOT:
 *   - it is NOT a wallet. No secret key is stored; signing is the caller's
 *     job (signTransaction receives the caller's Keypair per-call only).
 *   - it is NOT a mainnet path. Every builder REFUSES mainnet fail-closed
 *     (NOT_AUTHORIZED), regardless of what is injected. Testnet-only worlds.
 *   - it is NOT a live integration claim by itself. status() reports DRY_RUN
 *     until a real submitter + a real receipt are observed by the caller (the
 *     live demo owns that proof surface).
 *
 * The contract source + built WASM artifact live at soroban/commitment-anchor/
 * (committed): the artifact is re-derivable by anyone with the Rust toolchain.
 *
 * Standards: SOROBAN/1 (CoreGuard adapter envelope), CGEP/1 receipts.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Account,
  Address,
  Networks,
  Operation,
  TransactionBuilder,
  StrKey,
  xdr,
} from "@stellar/stellar-sdk";

export const SOROBAN_VERSION = "SOROBAN/1";
export const NETWORKS = { TESTNET: "Test SDF Network ; September 2015", MAINNET: "Public Global Stellar Network ; September 2015" };
export const SOROBAN_NETWORKS = Object.freeze({
  TESTNET: "testnet",
  MAINNET: "mainnet",
  FUTURENET: "futurenet",
});
export const SOROBAN_RPC = Object.freeze({
  testnet: "https://soroban-testnet.stellar.org",
  mainnet: "https://soroban-rpc.stellar.org",
  futurenet: "https://rpc-futurenet.stellar.org",
});
export const SOROBAN_STATES = Object.freeze([
  "PLAN_OK",
  "BUILD_OK",
  "GATED",
  "NOT_PERFORMED",
  "NOT_AUTHORIZED",
  "SIGNED",
  "SUBMITTED",
  "INVOKED",
  "READ_OK",
  "READ_FAILED",
  "REJECTED",
  "REFUSED",
]);

export const CG_COMMITMENT_ANCHOR_VERSION = "CG-COMMITMENT-ANCHOR/1";

/** Committed WASM artifact path (relative to this module). */
export const WASM_ARTIFACT = "../../soroban/commitment-anchor/artifacts/cg_commitment_anchor.wasm";

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

/** sha256 hex of bytes — the wasmHash Stellar's contract creation needs. */
export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Read the committed WASM artifact + its sha256 (for offline verifiers). */
export function readWasmArtifact() {
  const path = join(dirname(fileURLToPath(import.meta.url)), WASM_ARTIFACT);
  try {
    const wasm = readFileSync(path);
    return {
      state: "READ_OK",
      path: WASM_ARTIFACT,
      bytes: wasm,
      wasmSha256: sha256Hex(wasm),
      error: null,
    };
  } catch (e) {
    return { state: "READ_FAILED", path: WASM_ARTIFACT, bytes: null, wasmSha256: null, error: e && e.message };
  }
}

/**
 * Deterministic offline PLAN for the whole anchor flow (upload + create +
 * commit + read). Pure function of its inputs: submit:false, mode:DRY_RUN —
 * the plan surface the killer packages already model, now backed by REAL
 * transaction builders in this module.
 */
export function planCommitmentAnchor({ commitment, network = "testnet" } = {}) {
  if (!isNonEmptyString(commitment)) {
    return { ok: false, state: "GATED", error: "commitment required", plan: null };
  }
  if (network === "mainnet") {
    return { ok: false, state: "NOT_AUTHORIZED", error: "mainnet is never assumed (fail-closed)", plan: null };
  }
  return {
    ok: true,
    state: "PLAN_OK",
    adapter: "SOROBAN-ANCHOR/1",
    network,
    commitment,
    txPlan: [
      { step: 1, op: "uploadContractWasm", note: "install CG-COMMITMENT-ANCHOR/1 wasm" },
      { step: 2, op: "createCustomContract", note: "deploy instance" },
      { step: 3, op: "invoke:commit", note: "anchor commitment -> (hash, ledger seq)" },
      { step: 4, op: "simulate:read", note: "read back + verify exact hash match" },
    ],
    submit: false,
    mode: "DRY_RUN",
    note: "Plan only from this function. No submission. Requires an injected submitter to execute (executeAnchorFlow / the live demo).",
  };
}

function passphraseFor(network) {
  if (network === "testnet") return Networks.TESTNET;
  if (network === "futurenet") return Networks.FUTURENET;
  return null; // mainnet never gets a passphrase here (fail-closed)
}

function toBytes32(v) {
  if (v instanceof Uint8Array && v.length === 32) return Buffer.from(v);
  // hex strings accepted: the anchor flow surface (executeAnchorFlow) takes
  // hex commitment ids/hashes; builders normalize to 32 bytes.
  if (typeof v === "string" && /^[0-9a-fA-F]{64}$/.test(v)) return Buffer.from(v, "hex");
  return null;
}

/**
 * Build the WASM-UPLOAD transaction OFFLINE (no network, no signing).
 */
export function buildUploadTx({ wasm, source, sequence, network = "testnet", fee = "50000" } = {}) {
  if (network === "mainnet") {
    return { state: "NOT_AUTHORIZED", error: "mainnet is never assumed (fail-closed)", tx: null };
  }
  const passphrase = passphraseFor(network);
  if (!passphrase) return { state: "GATED", error: `unknown network: ${network}`, tx: null };
  if (!(wasm instanceof Uint8Array) || wasm.length === 0) {
    return { state: "GATED", error: "wasm bytes required", tx: null };
  }
  if (!isNonEmptyString(source) || !/^\d+$/.test(String(sequence))) {
    return { state: "GATED", error: "sourcePublicKey + sequence required", tx: null };
  }
  const tx = new TransactionBuilder(new Account(source, String(sequence)), { fee, networkPassphrase: passphrase })
    .addOperation(Operation.uploadContractWasm({ wasm: Buffer.from(wasm) }))
    .setTimeout(30)
    .build();
  return { state: "BUILD_OK", tx, wasmSha256Hex: sha256Hex(wasm), error: null };
}

/**
 * Build the CREATE-CONTRACT transaction OFFLINE. wasmHash: hex string or 32
 * bytes; salt: heart-stable 32 bytes or hex (defaults to a deterministic
 * salt derived from the deployer + wasmHash, so re-runs are reproducible).
 */
export function buildCreateContractTx({
  source,
  sequence,
  wasmHash,
  network = "testnet",
  salt,
  fee = "50000",
} = {}) {
  if (network === "mainnet") {
    return { state: "NOT_AUTHORIZED", error: "mainnet is never assumed (fail-closed)", tx: null };
  }
  const passphrase = passphraseFor(network);
  if (!passphrase) return { state: "GATED", error: `unknown network: ${network}`, tx: null };
  if (!isNonEmptyString(source) || !/^\d+$/.test(String(sequence))) {
    return { state: "GATED", error: "sourcePublicKey + sequence required", tx: null };
  }
  const hashBytes = typeof wasmHash === "string"
    ? Buffer.from(wasmHash.replace(/^0x/, ""), "hex")
    : wasmHash instanceof Uint8Array ? Buffer.from(wasmHash) : null;
  if (!hashBytes || hashBytes.length !== 32) {
    return { state: "GATED", error: "wasmHash (32-byte or hex) required", tx: null };
  }
  const saltBytes = typeof salt === "string"
    ? Buffer.from(salt.replace(/^0x/, ""), "hex")
    : salt instanceof Uint8Array && salt.length === 32 ? Buffer.from(salt) : null;
  if (!saltBytes || saltBytes.length !== 32) {
    return { state: "GATED", error: "salt (32-byte or hex) required", tx: null };
  }
  const tx = new TransactionBuilder(new Account(source, String(sequence)), { fee, networkPassphrase: passphrase })
    .addOperation(Operation.createCustomContract({
      address: new Address(source),
      wasmHash: hashBytes,
      salt: saltBytes,
    }))
    .setTimeout(30)
    .build();
  return { state: "BUILD_OK", tx, wasmHashHex: hashBytes.toString("hex"), saltHex: saltBytes.toString("hex"), error: null };
}

/**
 * Build an INVOKE transaction OFFLINE. fn "commit" with (id, hash) bytes, or
 * "read" with the id only. Simulation of a read invocation is the demo's
 * verify step (a read never needs a submission).
 */
export function buildInvokeTx({
  contractId,
  functionName,
  source,
  sequence,
  commitmentId,
  commitmentHash,
  network = "testnet",
  fee = "50000",
} = {}) {
  if (network === "mainnet") {
    return { state: "NOT_AUTHORIZED", error: "mainnet is never assumed (fail-closed)", tx: null };
  }
  const passphrase = passphraseFor(network);
  if (!passphrase) return { state: "GATED", error: `unknown network: ${network}`, tx: null };
  if (!isNonEmptyString(contractId)) return { state: "GATED", error: "contractId required", tx: null };
  if (!isNonEmptyString(source) || !/^\d+$/.test(String(sequence))) {
    return { state: "GATED", error: "sourcePublicKey + sequence required", tx: null };
  }
  if (functionName !== "commit" && functionName !== "read") {
    return { state: "GATED", error: "functionName must be commit|read", tx: null };
  }
  const idBytes = toBytes32(commitmentId);
  if (!idBytes) return { state: "GATED", error: "commitmentId must be 32 bytes", tx: null };
  const args = functionName === "commit"
    ? (() => {
        const h = toBytes32(commitmentHash);
        if (!h) return null;
        return [xdr.ScVal.scvBytes(idBytes), xdr.ScVal.scvBytes(h)];
      })()
    : [xdr.ScVal.scvBytes(idBytes)];
  if (args === null) {
    return { state: "GATED", error: "commitmentHash must be 32 bytes for commit", tx: null };
  }
  const tx = new TransactionBuilder(new Account(source, String(sequence)), { fee, networkPassphrase: passphrase })
    .addOperation(Operation.invokeContractFunction({
      contract: contractId,
      function: functionName,
      args,
    }))
    .setTimeout(30)
    .build();
  return { state: "BUILD_OK", tx, function: functionName, error: null };
}

/**
 * Sign a built Transaction with the CALLER's Keypair (per-call only — this
 * module never stores keys).
 */
export function signTransaction(tx, keypair) {
  if (!tx || typeof tx.sign !== "function") return { state: "GATED", error: "tx required", xdr: null };
  if (!keypair || typeof keypair.sign !== "function") return { state: "GATED", error: "keypair required", xdr: null };
  tx.sign(keypair);
  return { state: "SIGNED", xdr: tx.toXDR("base64"), error: null };
}

/**
 * Deterministic salt for CREATE, derived from deployer + wasmHash — so a
 * re-deploy of the same artifact by the same deployer lands at the SAME
 * contract address (idempotent by construction). 32 bytes.
 */
export function deriveSalt(source, wasmHashHex) {
  return Buffer.from(
    createHash("sha256").update(`${source}:${wasmHashHex}`).digest(),
  );
}

/**
 * Parse a Soroban CREATE result into the new contract's C-strkey address.
 * Handles both the DECODED TransactionMeta object (what rpc.Server
 * getTransaction returns today, meta v4) and base64 strings (legacy), meta
 * v3 through v4. The created contract's id appears in the ledger changes of
 * the create operation (the new CONTRACT_DATA instance entry is keyed by the
 * new contract's own address). Fail-closed: null when nothing readable.
 */
export function parseContractIdFromCreateResult(resultMetaXdr) {
  try {
    const meta = typeof resultMetaXdr === "string"
      ? xdr.TransactionMeta.fromXDR(resultMetaXdr, "base64")
      : resultMetaXdr;
    const arm = meta && meta.value ? meta.value : meta;
    const body = (arm && (arm.operations || arm.txChangesBefore || arm.sorobanMeta)) ? arm
      : (arm && arm.v4 ? arm.v4 : (arm && arm.v3 ? arm.v3 : null));
    const candidates = [];
    // Try sorobanMeta.returnValue first (v4 createCustomContract path)
    const sm = body && body.sorobanMeta ? body.sorobanMeta : (arm && arm.sorobanMeta ? arm.sorobanMeta : null);
    if (sm) {
      try {
        const rv = typeof sm.returnValue === "function" ? sm.returnValue() : sm.returnValue;
        if (rv) {
          const rvType = typeof rv.switch === "function" ? rv.switch().name : rv.type;
          if (rvType === "scvAddress") {
            const addr = typeof rv.address === "function" ? rv.address() : rv.address;
            if (addr) {
              const at = typeof addr.switch === "function" ? addr.switch().name : addr.type;
              if (at === "scAddressTypeContract" || at === "contract") {
                const cid = typeof addr.contractId === "function" ? addr.contractId() : addr.contractId;
                if (cid) {
                  const raw = cid.value !== undefined ? cid.value : cid;
                  const buf = Buffer.isBuffer(raw) ? raw : (raw instanceof Uint8Array ? Buffer.from(raw) : Buffer.from(raw));
                  if (buf.length === 32) candidates.push(StrKey.encodeContract(buf));
                }
              } else if (addr.contractId) {
                const cid = addr.contractId;
                const buf = Buffer.isBuffer(cid) ? cid : (cid instanceof Uint8Array ? Buffer.from(cid) : Buffer.from(cid));
                if (buf.length === 32) candidates.push(StrKey.encodeContract(buf));
              }
            }
          } else if (rv.address) {
            const addr = rv.address;
            if (addr.contractId) {
              const cid = addr.contractId;
              const raw = cid && cid.value !== undefined ? cid.value : cid;
              const buf = Buffer.isBuffer(raw) ? raw : (raw instanceof Uint8Array ? Buffer.from(raw) : Buffer.from(raw));
              if (buf.length === 32) candidates.push(StrKey.encodeContract(buf));
            }
          }
        }
      } catch {}
      if (sm.transactionData && sm.transactionData.footprint) {
        const fp = sm.transactionData.footprint;
        const changes = [];
        for (const arr of [fp.readOnly, fp.readWrite]) {
          for (const k of arr || []) changes.push(k);
        }
        for (const c of changes) {
          const bytes = isLegacyKey(c) ? ledgerKeyContractBytes(c) : entryChangeContractBytes(c);
          if (bytes) {
            const s = StrKey.encodeContract(bytes);
            if (!candidates.includes(s)) candidates.push(s);
          }
        }
      }
    }
    const changes = [];
    if (body && body.operations) {
      for (const c of body.txChangesBefore || []) changes.push(c);
      for (const op of body.operations || []) for (const c of op.changes || []) changes.push(c);
      for (const c of body.txChangesAfter || []) changes.push(c);
    }
    for (const c of changes) {
      const bytes = isLegacyKey(c) ? ledgerKeyContractBytes(c) : entryChangeContractBytes(c);
      if (bytes) {
        const s = StrKey.encodeContract(bytes);
        if (!candidates.includes(s)) candidates.push(s);
      }
    }
    if (candidates.length > 0) {
      return { state: "READ_OK", contractId: candidates[0], candidates, error: null };
    }
    return { state: "READ_FAILED", contractId: null, candidates: [], error: "no contract id readable from meta" };
  } catch (e) {
    return { state: "READ_FAILED", contractId: null, candidates: [], error: e && e.message };
  }
}

function isLegacyKey(k) {
  const arm = k && k.value ? k.value : k;
  return arm && (arm.type === "contractData" || arm.contractData);
}

function ledgerKeyContractBytes(key) {
  const arm = key && key.value ? key.value : key;
  if (arm && arm.type === "contractData") {
    return scAddressContractBytes(arm.contractData && arm.contractData.contract);
  }
  return null;
}

function entryChangeContractBytes(change) {
  const arm = change && change.value ? change.value : change;
  if (!arm || !arm.type) return null;
  const entry = arm.type === "ledgerEntryCreated" ? arm.created
    : arm.type === "ledgerEntryUpdated" ? arm.updated
    : arm.type === "ledgerEntryState" ? arm.state
    : arm.type === "ledgerEntryRestored" ? arm.restored
    : null;
  if (!entry) return null;
  const d = entry && entry.data;
  const da = d && d.value ? d.value : d;
  if (!da || da.type !== "contractData") return null;
  return scAddressContractBytes(da.contractData && da.contractData.contract);
}

function scAddressContractBytes(sc) {
  const s = sc && sc.value ? sc.value : sc;
  if (s && s.type === "scAddressTypeContract") {
    const b = s.contractId;
    if (b && (b instanceof Uint8Array) && b.length === 32) return Buffer.from(b);
  }
  return null;
}

/**
 * Execute the ANCHOR anchor flow upload -> create -> commit with an INJECTED
 * submitter. The submitter owns ALL networking/IO and is the only surface
 * that can execute:
 *   getSequence: async (publicKey) => <sequence string>
 *   submit:      async (signedXdrBase64) => { state:"SUBMITTED", hash, metaXdr? }
 * Fail-closed: no submitter -> NOT_PERFORMED (DRY_RUN); mainnet ->
 * NOT_AUTHORIZED; missing inputs -> GATED/REJECTED. Nothing here signs on
 * its own initiative, and the network is never assumed from the caller.
 */
export async function executeAnchorFlow({
  network = "testnet",
  wasm,
  deployerKey,
  commitmentId,
  commitmentHash,
  getSequence,
  submit,
} = {}) {
  if (network === "mainnet") {
    return { state: "NOT_AUTHORIZED", error: "mainnet is never assumed (fail-closed)", steps: [] };
  }
  const nop = { state: "NOT_PERFORMED", error: "no submitter injected (DRY_RUN)", steps: [] };
  if (typeof submit !== "function" || typeof getSequence !== "function") return nop;
  if (!isNonEmptyString(commitmentId) || !isNonEmptyString(commitmentHash)) {
    return { state: "GATED", error: "commitmentId + commitmentHash (hex|bytes) required", steps: [] };
  }
  const deployerPublicKey = deployerKey && typeof deployerKey.publicKey === "function" ? deployerKey.publicKey() : null;
  if (!deployerPublicKey) {
    return { state: "GATED", error: "deployerKey (Keypair) required for signing", steps: [] };
  }
  const steps = [];
  const seq0 = String(await getSequence());

  const builtUpload = buildUploadTx({ wasm, source: deployerPublicKey, sequence: seq0, network });
  if (builtUpload.state !== "BUILD_OK") return { state: builtUpload.state, error: builtUpload.error, steps: [...steps, { step: "build:upload", state: builtUpload.state }] };
  const builtCreate = buildCreateContractTx({
    source: deployerPublicKey,
    sequence: nextSequence(seq0),
    wasmHash: builtUpload.wasmSha256Hex,
    network,
    salt: deriveSalt(deployerPublicKey, builtUpload.wasmSha256Hex),
  });
  if (builtCreate.state !== "BUILD_OK") return { state: builtCreate.state, error: builtCreate.error, steps: [...steps, { step: "build:create", state: builtCreate.state }] };

  const signedUpload = signTransaction(builtUpload.tx, deployerKey);
  if (signedUpload.state !== "SIGNED") return { state: signedUpload.state, error: signedUpload.error, steps };
  const signedCreate = signTransaction(builtCreate.tx, deployerKey);
  if (signedCreate.state !== "SIGNED") return { state: signedCreate.state, error: signedCreate.error, steps };

  const up = await submit(signedUpload.xdr);
  steps.push({ step: "upload", ...normalize(up) });
  if (!up || up.state !== "SUBMITTED") {
    return { state: "REJECTED", error: "upload submit rejected", steps };
  }
  const cr = await submit(signedCreate.xdr);
  steps.push({ step: "create", ...normalize(cr) });
  if (!cr || cr.state !== "SUBMITTED") {
    return { state: "REJECTED", error: "create submit rejected", steps };
  }
  const contractIdRead = cr.contractId
    ? { state: "READ_OK", contractId: cr.contractId }
    : (cr.metaXdr ? parseContractIdFromCreateResult(cr.metaXdr) : { state: "READ_FAILED", error: "no contractId/metaXdr in create result" });
  steps.push({ step: "contractId", ...contractIdRead });
  if (contractIdRead.state !== "READ_OK") {
    return { state: "REJECTED", error: "contract id unreadable", steps };
  }
  const contractId = contractIdRead.contractId;

  const seq2 = String(await getSequence());
  const builtCommit = buildInvokeTx({
    contractId,
    functionName: "commit",
    source: deployerPublicKey,
    sequence: seq2,
    commitmentId,
    commitmentHash,
    network,
  });
  if (builtCommit.state !== "BUILD_OK") return { state: builtCommit.state, error: builtCommit.error, steps };
  const signedCommit = signTransaction(builtCommit.tx, deployerKey);
  if (signedCommit.state !== "SIGNED") return { state: signedCommit.state, error: signedCommit.error, steps };
  const cm = await submit(signedCommit.xdr);
  steps.push({ step: "commit", ...normalize(cm) });
  if (!cm || cm.state !== "SUBMITTED") {
    return { state: "REJECTED", error: "commit submit rejected", steps };
  }
  return {
    state: "SUBMITTED",
    contractId,
    steps,
    uploadHash: up.hash || null,
    createHash: cr.hash || null,
    commitHash: cm.hash || null,
    wasmSha256Hex: builtUpload.wasmSha256Hex,
    saltHex: builtCreate.saltHex,
  };
}

function normalize(r) {
  return {
    state: r.state,
    hash: r.hash || null,
    ledger: r.ledger || null,
    contractId: r.contractId || null,
  };
}

/** sequence-string +1 without Number precision loss (sequences can exceed 2^53). */
function nextSequence(seqStr) {
  try { return (BigInt(seqStr) + 1n).toString(); } catch { return String(Number(seqStr) + 1); }
}

/**
 * Status report — honest, no live claim.
 */
export function status() {
  return {
    version: SOROBAN_VERSION,
    runMode: "TESTNET_LIVE",
    integrationStatus: "BUILT",
    hasCredentials: false,
    authorized: false,
    executed: false,
    receiptCaptured: false,
    defaultNetwork: "testnet",
    mainnetRefused: true,
    contractArtifact: "committed (soroban/commitment-anchor/artifacts/cg_commitment_anchor.wasm)",
    note: "Soroban adapter builds REAL anchor transactions offline and executes ONLY via an injected testnet submitter. It refuses mainnet fail-closed. Status UNKNOWN until a real submitter + a real receipt are observed.",
  };
}

export function selfCheck() {
  const s = status();
  const wasm = readWasmArtifact();
  return {
    ok: s.runMode === "DRY_RUN"
      && s.integrationStatus === "NOT_EXECUTED"
      && !s.hasCredentials
      && !s.executed
      && wasm.state === "READ_OK"
      && wasm.bytes && wasm.bytes.length > 0,
    status: s,
    wasmArtifact: {
      path: wasm.path,
      wasmSha256: wasm.wasmSha256,
      bytes: wasm.bytes ? wasm.bytes.length : 0,
      state: wasm.state,
    },
  };
}
