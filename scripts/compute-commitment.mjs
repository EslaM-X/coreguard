/**
 * CoreGuard — Compute on-chain commitment (offline, independent)
 *
 * Rebuilds the receipt ID, the CGEP/1:PROOF commitment and the
 * CGEP/1:ANCHOR proofId purely from the receipt payload — no RPC, no trust.
 * The outputs must match what the EvidenceRegistry reads back from the chain
 * (Proofs B + C in docs/COMMUNITY.md). proofId is domain-separated and never
 * assumed equal to receiptId.
 *
 * Usage:  node scripts/compute-commitment.mjs --receipt examples/transfer/receipt-valid.json [--out <file>]
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { domainHash, computeReceiptId } from "../packages/canonical/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const receiptPath = arg("--receipt", join("examples", "transfer", "receipt-valid.json"));
// --out writes the planned artifact to the given path (default keeps the
// historical scripts/live-anchor-planned.json location).
const outArg = arg("--out", "");
const outFile = outArg
  ? resolve(root, outArg)
  : join(root, "scripts", "live-anchor-planned.json");
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
const proofId = await domainHash("CGEP/1:ANCHOR", {
  chainId: receipt.chainId,
  receiptId: computedReceiptId,
  commitment,
});

const result = "VALID";

const planned = {
  receiptFile: receiptPath,
  chainId: receipt.chainId,
  receiptId: computedReceiptId,
  evidenceRoot: receipt.evidenceRoot,
  commitment,
  proofId,
  result,
  resultCode: { VALID: 1, INVALID: 0, UNVERIFIABLE: 2, INCOMPLETE: 2 }[result] ?? 1,
};

const { writeFile } = await import("node:fs/promises");
await writeFile(outFile, JSON.stringify(planned, null, 2) + "\n", "utf8");

process.stdout.write(JSON.stringify(planned, null, 2) + "\n");