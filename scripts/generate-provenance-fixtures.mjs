/**
 * Deterministic AgentProof example fixtures (examples/provenance/).
 *
 * Produces manifest.json + evidence.json from a fixed test key so the README
 * command `npm run verify-provenance -- --manifest ... --evidence ...` is
 * reproducible on any clean clone (exit code 0 = MANIFEST_ID_PROVEN).
 */

import { mkdirSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

import { makeManifest, signManifest, seedKey, makeTxHash } from "../test/provenance/helpers.js";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../examples/provenance");
const CHAIN_ID = "1116";
const signer = seedKey(500); // fixed index → deterministic key/address

const manifest = await signManifest(
  makeManifest({
    kind: "STAMP",
    signerAddress: signer.address,
    chainId: CHAIN_ID,
    executorType: "AI_AGENT",
    executionRef: { chainId: CHAIN_ID, txHash: makeTxHash(0xca1), blockNumber: "12345" },
  }),
  signer.priv,
  CHAIN_ID,
);

const evidence = {
  chainId: CHAIN_ID,
  executionFrom: signer.address,
  executionBlock: "12345",
};

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
writeFileSync(resolve(outDir, "evidence.json"), JSON.stringify(evidence, null, 2));

console.log(`Wrote ${outDir}\\manifest.json and ${outDir}\\evidence.json (signer=${signer.address})`);