#!/usr/bin/env node
/**
 * Stellar Gate Demo (Soroban/1) — end-to-end commitment anchor on Stellar testnet.
 *
 * All operations are TESTNET only. Mainnet is refused fail-closed by the adapter.
 * No mainnet funds. Uses throwaway friendbot-funded keypairs.
 *
 * Usage: node examples/stellar-gate/demo.mjs
 */

import { Keypair, Networks, rpc } from "@stellar/stellar-sdk";
import * as S from "../../packages/stellar-soroban/index.mjs";
import { createHash } from "node:crypto";

const SERVER = "https://soroban-testnet.stellar.org";
const FRIENDBOT = "https://friendbot.stellar.org";

function sha256(b) {
  return createHash("sha256").update(b).digest();
}

async function fund(addr) {
  const res = await fetch(`${FRIENDBOT}?addr=${addr}`);
  if (!res.ok) throw new Error(`Friendbot failed: ${res.status}`);
}

async function wait(server, hash) {
  for (let i = 0; i < 60; i++) {
    const r = await server.getTransaction(hash);
    if (r.status === "SUCCESS" || r.status === "FAILED") return r;
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  throw new Error("timeout");
}

async function main() {
  const server = new rpc.Server(SERVER, { allowHttp: false });
  const kp = Keypair.random();
  console.log("deployer:", kp.publicKey());
  await fund(kp.publicKey());

  const wasm = await S.readWasm("../../soroban/commitment-anchor/artifacts/cg_commitment_anchor.wasm");
  const account = await server.getAccount(kp.publicKey());
  const up = S.buildUploadWasm({ sourceAccount: kp.publicKey(), wasm, fee: "500000", networkPassphrase: Networks.TESTNET });
  up.tx.sign(kp);
  const u = await server.sendTransaction(up.tx);
  const ur = await wait(server, u.hash);
  console.log("upload:", ur.status);

  const acc2 = await server.getAccount(kp.publicKey());
  const cr = S.buildCreateContract({ sourceAccount: kp.publicKey(), wasmHash: S.wasmSha256(wasm), fee: "1000000", networkPassphrase: Networks.TESTNET });
  cr.tx.sign(kp);
  const c = await server.sendTransaction(cr.tx);
  const crRes = await wait(server, c.hash);
  console.log("create:", crRes.status);
  const pid = S.parseContractIdFromCreateResult(crRes.resultMetaXdr);
  console.log(pid.state, pid.contractId);
}

main().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
