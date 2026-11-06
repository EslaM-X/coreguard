import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SOROBAN_VERSION,
  NETWORKS,
  status,
  selfCheck,
  buildUploadTx,
  buildCreateContractTx,
  buildInvokeTx,
  sha256Hex,
  parseContractIdFromCreateResult,
  executeAnchorFlow,
} from "../../packages/stellar-soroban/index.mjs";
import { Keypair, Networks, TransactionBuilder, StrKey, xdr } from "@stellar/stellar-sdk";

test("SOROBAN/1 exports", () => {
  assert.equal(SOROBAN_VERSION, "SOROBAN/1");
  assert.deepEqual(NETWORKS, { TESTNET: "Test SDF Network ; September 2015", MAINNET: "Public Global Stellar Network ; September 2015" });
});

test("status() honest", () => {
  const s = status();
  assert.equal(s.runMode, "DRY_RUN");
  assert.equal(s.hasCredentials, false);
  assert.equal(s.authorized, false);
  assert.equal(s.executed, false);
});

test("selfCheck() passes", () => {
  assert.equal(selfCheck().ok, true);
});

test("builders refuse mainnet fail-closed", () => {
  const kp = Keypair.random();
  assert.equal(buildUploadTx({ wasm: Buffer.alloc(10), source: kp.publicKey(), sequence: "1", network: "mainnet", fee: "100" }).state, "NOT_AUTHORIZED");
  assert.equal(buildCreateContractTx({ source: kp.publicKey(), wasmHash: "a".repeat(64), sequence: "1", network: "mainnet", fee: "100" }).state, "NOT_AUTHORIZED");
  assert.equal(buildInvokeTx({ source: kp.publicKey(), contractId: "CCERTRITP7A6U4PQ7NUKHXKWL2BNRMSBLVAAAWWMRAZTICUN7ZGC5Q4R", functionName: "commit", commitmentId: Buffer.alloc(32), commitmentHash: Buffer.alloc(32), sequence: "1", network: "mainnet", fee: "100" }).state, "NOT_AUTHORIZED");
});

test("parseContractIdFromCreateResult reads v4 returnValue", () => {
  // Fixture lives IN the tree (portable across machines/CI) — never a dev Temp path.
  const fixture = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "create-meta-v4.b64.txt");
  const b64 = readFileSync(fixture, "utf8");
  const r = parseContractIdFromCreateResult(b64.trim());
  assert.equal(r.state, "READ_OK");
  assert.ok(r.contractId && r.contractId.startsWith("C"));
});

test("sha256Hex stable", () => {
  const h = sha256Hex(Buffer.from("abc"));
  assert.equal(h.length, 64);
});

test("executeAnchorFlow requires submitter", async () => {
  const kp = Keypair.random();
  const r = await executeAnchorFlow({ keypair: kp, network: "testnet", server: {}, submitter: null, wasm: Buffer.alloc(10), commitment: { id: "1", hashHex: "a".repeat(64) } });
  assert.equal(r.state, "NOT_PERFORMED");
});

// ---- The executed mainnet commit (2026-11-06, owner-authorized) ----

const EXEC_PAIR = {
  contractId: "CCKA2GYVILX7YZVSXGVIHOPNLTRBBF2SSWKBTQBIE7M67N5N2QMMXPSP",
  proofId: "0xecd9e6b3d8780c55ca3d60e88b7ff79317b3cba187e43240a540891e4cada6b8",
  commitment: "0xc0dbfb45b6c8e13b3738822360ea737adfc045d4acb808bdaeac563c8af31052",
  txHash: "69044807410f65027c1227f4e525ad83f23a6cb1a2bb79790d82849c5dbc9fec",
  ledger: 65337373,
};

const byteHex = (x) => Buffer.from(Uint8Array.from(Object.values(x))).toString("hex");
const xdrStr = (x) => (typeof x === "string" ? x : (x && x.bytes ? Buffer.from(x.bytes).toString() : String(x)));

/** Decode a built/signed commit invoke and assert the exact wire op. */
function assertInvokeCommitOps(xdrBase64, passphrase) {
  const tx = TransactionBuilder.fromXDR(xdrBase64, passphrase); // wrong passphrase throws
  const op = tx.operations[0];
  assert.equal(op.type, "invokeHostFunction", "wire op must be the invoke host-function op");
  const hfObj = op.func.toXdrObject();
  assert.equal(hfObj.type, 0, "host fn must be invoke-contract");
  assert.equal(xdrStr(hfObj.invokeContract.functionName), "commit");
  assert.equal(byteHex(hfObj.invokeContract.contractAddress.contractId), byteHex(StrKey.decodeContract(EXEC_PAIR.contractId)), "contract id must match deployed anchor");
  const a = hfObj.invokeContract.args;
  assert.equal(a.length, 2);
  assert.equal(a[0].type, 13, "arg1 = SCVAL_BYTES");
  assert.equal(byteHex(a[0].bytes), EXEC_PAIR.proofId.slice(2), "arg1 = proofId bytes");
  assert.equal(a[1].type, 13, "arg2 = SCVAL_BYTES");
  assert.equal(byteHex(a[1].bytes), EXEC_PAIR.commitment.slice(2), "arg2 = commitment bytes");
  return tx;
}

test("status() carries the executed first commit facts (honest additive)", () => {
  const s = status();
  const c = s.firstCommitExecuted;
  assert.equal(c.state, "INVOKED");
  assert.equal(c.network, "mainnet");
  assert.equal(c.contractId, EXEC_PAIR.contractId);
  assert.equal(c.proofId, EXEC_PAIR.proofId);
  assert.equal(c.commitment, EXEC_PAIR.commitment);
  assert.equal(c.txHash, EXEC_PAIR.txHash);
  assert.equal(c.ledger, EXEC_PAIR.ledger);
  assert.equal(c.runner, "scripts/stellar-soroban-commit-executed.mjs");
  assert.equal(c.evidence, "docs/evidence/stellar-soroban-commit-executed.json");
});

test("mainnet builders build ONLY with ownerAuthorization (owner-authorized lane)", () => {
  const s = status(); // posture unchanged for the bare module
  assert.equal(s.runMode, "DRY_RUN");
  assert.equal(s.authorized, false);
  const kp = Keypair.random();
  const built = buildInvokeTx({
    contractId: EXEC_PAIR.contractId,
    functionName: "commit",
    source: kp.publicKey(),
    sequence: "999",
    commitmentId: EXEC_PAIR.proofId,
    commitmentHash: EXEC_PAIR.commitment,
    network: "mainnet",
    fee: "1000000",
    ownerAuthorization: true, // the owner's explicit decision passed by the caller
  });
  assert.equal(built.state, "BUILD_OK");
  // decoding the envelope with the PUBLIC passphrase proves the deferred-gated
  // mainnet lane resolves Networks.PUBLIC (never an undefined constant)
  assertInvokeCommitOps(built.tx.toXDR("base64"), Networks.PUBLIC);
});

test("executeAnchorFlow commit-only on mainnet -> INVOKED via injected submitter", async () => {
  let submits = 0;
  let sentXdr = null;
  const kp = Keypair.random();
  const res = await executeAnchorFlow({
    network: "mainnet",
    deployerKey: kp,
    commitmentId: EXEC_PAIR.proofId,
    commitmentHash: EXEC_PAIR.commitment,
    getSequence: async () => "999",
    submit: async (x) => { submits++; sentXdr = x; return { state: "SUBMITTED", hash: EXEC_PAIR.txHash }; },
    wait: async (h) => { assert.equal(h, EXEC_PAIR.txHash); return { state: "INVOKED", ledger: EXEC_PAIR.ledger }; },
    deployedContractId: EXEC_PAIR.contractId,
    ownerAuthorization: true,
    fee: "1000000",
  });
  assert.equal(res.state, "INVOKED");
  assert.equal(res.ownerAuthorized, true);
  assert.equal(res.contractId, EXEC_PAIR.contractId);
  assert.equal(res.commitHash, EXEC_PAIR.txHash);
  assert.equal(res.ledger, EXEC_PAIR.ledger);
  assert.equal(submits, 1);
  assert.equal(res.steps[res.steps.length - 1].step, "commit");
  assertInvokeCommitOps(sentXdr, Networks.PUBLIC);
  assert.ok(Buffer.from(sentXdr, "base64").includes(Buffer.from(EXEC_PAIR.proofId.slice(2), "hex")));
  assert.ok(Buffer.from(sentXdr, "base64").includes(Buffer.from(EXEC_PAIR.commitment.slice(2), "hex")));
});

test("executeAnchorFlow fail-closed defaults preserved (mainnet WITHOUT ownerAuth, no submitter, no wait, FAILED wait)", async () => {
  const kp = Keypair.random();
  let submits = 0;
  const noAuth = await executeAnchorFlow({
    network: "mainnet",
    deployerKey: kp,
    commitmentId: EXEC_PAIR.proofId,
    commitmentHash: EXEC_PAIR.commitment,
    deployedContractId: EXEC_PAIR.contractId,
    getSequence: async () => "1",
    submit: async () => { submits++; return { state: "SUBMITTED", hash: "h" }; },
  });
  assert.equal(noAuth.state, "NOT_AUTHORIZED");
  assert.deepEqual(noAuth.steps, []);
  assert.equal(submits, 0); // nothing left the room

  const noSubmitter = await executeAnchorFlow({
    network: "testnet",
    deployerKey: kp,
    commitmentId: EXEC_PAIR.proofId,
    commitmentHash: EXEC_PAIR.commitment,
    deployedContractId: EXEC_PAIR.contractId,
  });
  assert.equal(noSubmitter.state, "NOT_PERFORMED");

  const noWait = await executeAnchorFlow({
    network: "testnet",
    deployerKey: kp,
    commitmentId: EXEC_PAIR.proofId,
    commitmentHash: EXEC_PAIR.commitment,
    deployedContractId: EXEC_PAIR.contractId,
    getSequence: async () => "1",
    submit: async () => ({ state: "SUBMITTED", hash: "h2" }),
  });
  assert.equal(noWait.state, "SUBMITTED"); // honest intermediate: submitted, not confirmed

  const failed = await executeAnchorFlow({
    network: "testnet",
    deployerKey: kp,
    commitmentId: EXEC_PAIR.proofId,
    commitmentHash: EXEC_PAIR.commitment,
    deployedContractId: EXEC_PAIR.contractId,
    getSequence: async () => "1",
    submit: async () => ({ state: "SUBMITTED", hash: "h3" }),
    wait: async () => ({ state: "FAILED" }),
  });
  assert.equal(failed.state, "REJECTED");
});
