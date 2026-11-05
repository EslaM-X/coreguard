/**
 * scripts/deploy-soroban-mainnet.mjs
 * Deploy Soroban commitment anchor contract to Stellar mainnet.
 *
 * Usage:
 *   node scripts/deploy-soroban-mainnet.mjs --secret <secret-key>
 */

import { Keypair, Horizon, TransactionBuilder, Networks, Operation, Asset, Memo, xdr, Address, nativeToScVal, Account } from "@stellar/stellar-sdk";
import { Server as RpcServer } from "@stellar/stellar-sdk/rpc";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");

const HORIZON = "https://horizon.stellar.org";
const SOROBAN_RPC = "https://mainnet.sorobanrpc.com";
const NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";

const args = process.argv.slice(2);
let secretKey = null;
let wasmPath = join(REPO, "soroban/commitment-anchor/artifacts/cg_commitment_anchor.wasm");

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--secret") secretKey = args[++i];
  if (args[i] === "--wasm") wasmPath = args[++i];
}

if (!secretKey) {
  console.error("Usage: node scripts/deploy-soroban-mainnet.mjs --secret <secret-key>");
  process.exit(1);
}

const keypair = Keypair.fromSecret(secretKey);
console.log("Source account:", keypair.publicKey());

const horizon = new Horizon.Server(HORIZON);
const rpcServer = new RpcServer(SOROBAN_RPC);

async function uploadWasm() {
  console.log("\n=== Step 1: Upload WASM ===");
  const wasm = readFileSync(wasmPath);
  console.log("WASM size:", wasm.length, "bytes");

  // Load account from Soroban RPC
  const account = await rpcServer.getAccount(keypair.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: "10000000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.uploadContractWasm({ wasm }))
    .setTimeout(60)
    .build();

  // Prepare (handles simulation internally)
  console.log("Preparing transaction...");
  const prepared = await rpcServer.prepareTransaction(tx);
  prepared.sign(keypair);

  // Send
  const result = await rpcServer.sendTransaction(prepared);
  console.log("Upload tx hash:", result.hash);
  console.log("Upload status:", result.status);
  console.log("Upload result:", JSON.stringify(result).slice(0, 500));

  // Wait for confirmation
  let status = result.status;
  while (status === "PENDING") {
    await new Promise(r => setTimeout(r, 2000));
    const txResult = await rpcServer.getTransaction(result.hash);
    status = txResult.status;
    console.log("Status:", status);
    if (status === "SUCCESS") {
      console.log("Upload confirmed!");
      break;
    }
    if (status === "FAILED") {
      throw new Error("Upload failed");
    }
  }

  const wasmHash = crypto.createHash("sha256").update(wasm).digest();
  console.log("WASM hash:", wasmHash.toString("hex"));
  return wasmHash;
}

async function createContract(wasmHash) {
  console.log("\n=== Step 2: Create Contract ===");
  // Load account from Soroban RPC
  const account = await rpcServer.getAccount(keypair.publicKey());

  const salt = crypto.randomBytes(32);
  const address = new Address(keypair.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: "10000000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.createCustomContract({
      wasmHash,
      salt,
      address,
    }))
    .setTimeout(60)
    .build();

  // Prepare (handles simulation internally)
  console.log("Preparing transaction...");
  const prepared = await rpcServer.prepareTransaction(tx);
  prepared.sign(keypair);

  // Send
  const result = await rpcServer.sendTransaction(prepared);
  console.log("Create tx hash:", result.hash);
  console.log("Create status:", result.status);
  console.log("Create result:", JSON.stringify(result).slice(0, 500));

  // Wait for confirmation
  let status = result.status;
  let contractId = null;
  while (status === "PENDING") {
    await new Promise(r => setTimeout(r, 2000));
    const txResult = await rpcServer.getTransaction(result.hash);
    status = txResult.status;
    console.log("Status:", status);
    if (status === "SUCCESS") {
      console.log("Create confirmed!");
      // Extract contract ID from result
      if (txResult.returnValue) {
        console.log("Return value:", txResult.returnValue);
      }
      break;
    }
    if (status === "FAILED") {
      throw new Error("Create failed");
    }
  }

  console.log("Contract created successfully");
  return result.hash;
}

async function main() {
  try {
    console.log("=== Stellar Soroban Mainnet Deployment ===");
    console.log("Network:", NETWORK_PASSPHRASE);
    console.log("Source:", keypair.publicKey());

    // Check account balance
    const account = await horizon.loadAccount(keypair.publicKey());
    console.log("Account balance:", account.balances.map(b => `${b.balance} ${b.asset_type === "native" ? "XLM" : b.asset_code}`).join(", "));

    // Step 1: Upload WASM
    const wasmHash = await uploadWasm();

    // Step 2: Create Contract
    const contractId = await createContract(wasmHash);

    console.log("\n=== Deployment Complete ===");
    console.log("Contract ID:", contractId);
    console.log("WASM Hash:", wasmHash.toString("hex"));

    // Save deployment info
    const { writeFileSync } = await import("fs");
    const deployInfo = {
      network: "mainnet",
      source: keypair.publicKey(),
      contractId,
      wasmHash: wasmHash.toString("hex"),
      wasmPath,
      timestamp: new Date().toISOString(),
    };
    writeFileSync(join(REPO, ".stellar-soroban-deploy.json"), JSON.stringify(deployInfo, null, 2));
    console.log("Deployment info saved to .stellar-soroban-deploy.json");

  } catch (e) {
    console.error("ERROR:", e.message);
    if (e.response && e.response.data) {
      console.error("Details:", JSON.stringify(e.response.data, null, 2));
    }
    process.exit(1);
  }
}

main();