/**
 * AgentProof CLI surface (CGEP/1:VERIFY-PROVENANCE §10).
 *
 * Pure-function exit-code discipline + one real `node ... verify-provenance`
 * subprocess run proving the command is wired into the CLI entry.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyProvenance } from "../../packages/provenance/index.js";
import { makeManifest, signManifest, seedKey, makeAddress, makeTxHash } from "./helpers.js";
import {
  exitCodeForProvenance,
  badgeState,
  renderBadge,
  CONTRACT,
} from "../../packages/cli/src/verify-provenance.js";

const CHAIN_ID = "1116";
const EVM = await import("../../packages/evm/index.js");

async function stampManifest({ signer, chainId = CHAIN_ID, executorType = "AI_AGENT" }) {
  const manifest = makeManifest({
    kind: "STAMP",
    signerAddress: signer.address,
    chainId,
    executorType,
    executionRef: { chainId, txHash: makeTxHash(0xb1), blockNumber: "12345" },
  });
  return signManifest(manifest, signer.priv, chainId);
}

test("verify-provenance exit 0: valid direct STAMP", async () => {
  const signer = seedKey(120);
  const manifest = await stampManifest({ signer });
  const out = await verifyProvenance(manifest, {
    chainId: CHAIN_ID,
    executionFrom: signer.address,
    executionBlock: "12345",
  });
  assert.equal(out.summary, "MANIFEST_ID_PROVEN");
  assert.equal(exitCodeForProvenance(out), 0);
  assert.equal(badgeState(out), "VERIFIED");
});

test("verify-provenance exit 3: valid manifest, authority does not own tx.from", async () => {
  const signer = seedKey(121);
  const manifest = await stampManifest({ signer });
  const out = await verifyProvenance(manifest, {
    chainId: CHAIN_ID,
    executionFrom: makeAddress(0x99), // someone else's tx.from
    executionBlock: "12345",
  });
  assert.match(out.summary, /FAIL_CLOSED/);
  assert.equal(exitCodeForProvenance(out), 3); // not proven, not invalid
});

test("verify-provenance exit 2: schema-invalid manifest (contradiction)", async () => {
  const signer = seedKey(122);
  const manifest = await stampManifest({ signer });
  manifest.manifestKind = "SCAM";
  const out = await verifyProvenance(manifest, {
    chainId: CHAIN_ID,
    executionFrom: signer.address,
    executionBlock: "12345",
  });
  assert.match(out.summary, /FAIL_CLOSED/);
  assert.equal(exitCodeForProvenance(out), 2);
});

test("verify-provenance exit 2: attacker-tampered manifest (signature breaks)", async () => {
  const signer = seedKey(123);
  const manifest = await stampManifest({ signer });
  manifest.declared.executorType = "MALICIOUS"; // swaps signed content
  const out = await verifyProvenance(manifest, {
    chainId: CHAIN_ID,
    executionFrom: signer.address,
    executionBlock: "12345",
  });
  assert.match(out.summary, /FAIL_CLOSED/);
  assert.equal(exitCodeForProvenance(out), 2);
});

test("verify-provenance exit 4: adapter unavailable -> NOT_RUN, inconclusive", async () => {
  const signer = seedKey(124);
  const manifest = await stampManifest({ signer });
  const out = await verifyProvenance(manifest, {
    chainId: CHAIN_ID,
    executionFrom: signer.address,
    executionBlock: "12345",
  }, { evm: null });
  assert.match(out.summary, /NOT_RUN/);
  assert.equal(exitCodeForProvenance(out), 4);
});

test("badge honesty: Human is DECLARED/NOT_PROVEN, never VERIFIED", async () => {
  const signer = seedKey(125);
  const manifest = await stampManifest({ signer, executorType: "HUMAN" });
  const out = await verifyProvenance(manifest, {
    chainId: CHAIN_ID,
    executionFrom: signer.address,
    executionBlock: "12345",
  });
  // Signer authorization passes, but human-ness is declared, never inferred.
  assert.equal(out.summary, "MANIFEST_ID_PROVEN");
  assert.equal(badgeState(out), "DECLARED");
  const line = renderBadge(out);
  assert.match(line, /Human/);
  assert.match(line, /DECLARED/);
  assert.doesNotMatch(line, /VERIFIED/);
});

test("badge honesty: AI agent verified state", async () => {
  const signer = seedKey(126);
  const manifest = await stampManifest({ signer, executorType: "AI_AGENT" });
  const out = await verifyProvenance(manifest, {
    chainId: CHAIN_ID,
    executionFrom: signer.address,
    executionBlock: "12345",
  });
  assert.equal(badgeState(out), "VERIFIED");
  assert.match(renderBadge(out), /Automated Agent/);
});

test("CLI entry: `node src/index.js verify-provenance` runs end-to-end (exit 0)", async () => {
  const signer = seedKey(127);
  const manifest = await stampManifest({ signer });
  const evidence = {
    chainId: CHAIN_ID,
    executionFrom: signer.address,
    executionBlock: "12345",
  };

  const dir = mkdtempSync(join(tmpdir(), "cg-vp-"));
  const manifestFile = join(dir, "manifest.json");
  const evidenceFile = join(dir, "evidence.json");
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2));

  const indexFile = join(dirname(fileURLToPath(import.meta.url)), "../../packages/cli/src/index.js");
  const stdout = execFileSync(process.execPath, [indexFile, "verify-provenance", "--manifest", manifestFile, "--evidence", evidenceFile], {
    encoding: "utf8",
  });
  assert.match(stdout, /CGEP\/1:VERIFY-PROVENANCE/);
  assert.match(stdout, /MANIFEST_ID_PROVEN/);
  assert.ok(CONTRACT.length > 0);
});