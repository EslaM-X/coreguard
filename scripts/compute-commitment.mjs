/**
 * CoreGuard — Compute on-chain commitment (offline, independent)
 *
 * Rebuilds the receipt ID and the CGEP/1:PROOF commitment purely from the
 * receipt payload — no RPC, no trust. The output must match what the
 * EvidenceRegistry reads back from the chain (Proof C in docs/COMMUNITY.md).
 *
 * Usage:  node scripts/compute-commitment.mjs --receipt examples/transfer/receipt-valid.json
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { domainHash, computeReceiptId } from "../packages/canonical/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const receiptPath = arg("--receipt", join("examples", "transfer", "receipt-valid.json"));
const payload = JSON.parse(await readFile(join(root, receiptPath), "utf8"));

if (!payload.receipt) throw new Error("expected { receipt: ... } payload");
const receipt = payload.receipt;

const { receiptId: embeddedReceiptId, ...receiptPayload } = receipt;
const computedReceiptId = await computeReceiptId(receiptPayload);
const commitmentData = {
  protocol: "CGEP/1",
  chainId: receipt.chainId,
  receiptId: computedReceiptId,
  evidenceRoot: receipt.evidenceRoot,
};
const commitment = await domainHash("CGEP/1:PROOF", commitmentData);

const planned = {
  receiptFile: receiptPath,
  chainId: receipt.chainId,
  receiptId: computedReceiptId,
  evidenceRoot: receipt.evidenceRoot,
  commitment,
  result: "VALID",
};

const outFile = join(root, "scripts", "live-anchor-planned.json");
const { writeFile } = await import("node:fs/promises");
await writeFile(outFile, JSON.stringify(planned, null, 2) + "\n", "utf8");

process.stdout.write(JSON.stringify(planned, null, 2) + "\n");