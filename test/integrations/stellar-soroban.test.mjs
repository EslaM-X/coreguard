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
import { Keypair, Networks } from "@stellar/stellar-sdk";

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
