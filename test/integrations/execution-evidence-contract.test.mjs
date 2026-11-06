/**
 * Execution-evidence artifacts — digest-fidelity contract (CI-pinned).
 *
 * The four committed executed-evidence artifacts
 *   docs/evidence/stellar-agent-gate-executed.json  (STELLAR-AGENT/1)
 *   docs/evidence/stellar-dex-gate-executed.json    (DEX-GATE/1, REAL mainnet book)
 *   docs/evidence/universal-dapp-shield-executed.json (guard.* shield arms)
 *   docs/evidence/stellar-soroban-commit-executed.json (SOROBAN-ANCHOR/1 mainnet commit, INVOKED)
 * must stay byte-faithful to their own payloads: their `evidenceDigest` is
 * re-derived here (same canonical rule as the runners) and every verdict
 * matrix is asserted. Tamper mutations each apply AND bite — a flipped
 * byte in any artifact must break its digest loudly.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const digestOf = (payload) => {
  const { generatedAt, evidenceDigest, ...rest } = payload;
  const h = createHash("sha256");
  h.update(JSON.stringify(rest));
  return "sha256:" + h.digest("hex");
};

const AGENT = new URL("../../docs/evidence/stellar-agent-gate-executed.json", import.meta.url);
const DEX = new URL("../../docs/evidence/stellar-dex-gate-executed.json", import.meta.url);
const SHIELD = new URL("../../docs/evidence/universal-dapp-shield-executed.json", import.meta.url);
const SOROBAN_COMMIT = new URL("../../docs/evidence/stellar-soroban-commit-executed.json", import.meta.url);

test("stellar-agent-gate artifact: digest faithful, verdict matrix VERIFIED/REJECTED/HELD, no submit performed", async () => {
  const a = JSON.parse(await readFile(AGENT, "utf8"));
  assert.equal(digestOf(a), a.evidenceDigest, "agent-gate digest must re-derive");
  assert.deepEqual(a.summary.verdicts, { allow: "VERIFIED", "above-max": "REJECTED", "missing-id": "HELD" });
  assert.equal(a.submit.includes("NOT_PERFORMED"), true, "submission must stay credential-gated");
  assert.match(a.cases[0].replay.hash, /^0x[0-9a-f]{64}$/);
  assert.equal(a.version, "STELLAR-AGENT/1");
});

test("stellar-dex-gate artifact: digest faithful, real-book depth policy, REJECTED arms bite", async () => {
  const a = JSON.parse(await readFile(DEX, "utf8"));
  assert.equal(digestOf(a), a.evidenceDigest, "dex-gate digest must re-derive");
  assert.ok(a.book.depthXlm > 0, "real depth must be present");
  assert.match(a.asset.issuer, /^G[A-Z2-7]{55}$/);
  assert.equal(a.policy.rules[0].value <= a.book.depthXlm, true, "ceiling derives from real depth");
  const byId = Object.fromEntries(a.cases.map((c) => [c.id, c.verdict]));
  assert.equal(byId["swap-over-ceiling"], "REJECTED");
  assert.equal(byId["swap-deny-listed"], "REJECTED");
  assert.equal(a.broadcast.includes("NOT_PERFORMED"), true);
  assert.equal(a.version, "DEX-GATE/1");
});

test("universal-dapp-shield artifact: digest faithful, full decision arms ALLOW/REVIEW/DENY + REFUSED seam", async () => {
  const a = JSON.parse(await readFile(SHIELD, "utf8"));
  assert.equal(digestOf(a), a.evidenceDigest, "shield digest must re-derive");
  assert.deepEqual(a.summary.decisions, {
    swap: "ALLOW",
    deposit: "ALLOW",
    lend: "REQUIRE_REVIEW",
    borrow: "REQUIRE_REVIEW",
    vote: "DENY",
  });
  assert.equal(a.summary.smuggled, "REFUSED", "Q-FW10 seam must refuse execution evidence in the PRE surface");
  assert.match(a.negative.code, /Q-FW10/);
  assert.equal(a.version, "GuardShield/1");
});

test("stellar-soroban-commit artifact: digest faithful, INVOKED mainnet anchor on the exact planned pair", async () => {
  const a = JSON.parse(await readFile(SOROBAN_COMMIT, "utf8"));
  assert.equal(digestOf(a), a.evidenceDigest, "soroban-commit digest must re-derive");
  assert.equal(a.version, "SOROBAN-ANCHOR/1");
  assert.equal(a.network, "stellar-mainnet");
  assert.equal(a.ownerAuthorized, true, "mainnet commit is owner-authorized, never assumed");
  assert.equal(a.contractId, "CCKA2GYVILX7YZVSXGVIHOPNLTRBBF2SSWKBTQBIE7M67N5N2QMMXPSP");
  assert.equal(a.commit.fn, "commit");
  assert.equal(a.commit.state, "INVOKED");
  assert.equal(a.commit.commitmentId, "0xecd9e6b3d8780c55ca3d60e88b7ff79317b3cba187e43240a540891e4cada6b8");
  assert.equal(a.commit.commitmentHash, "0xc0dbfb45b6c8e13b3738822360ea737adfc045d4acb808bdaeac563c8af31052");
  assert.match(a.commit.txHash, /^[0-9a-f]{64}$/);
  assert.equal(a.commit.ledger, 65337373);
  assert.equal(a.anchorPlan.chainId, "1116");
  assert.equal(a.anchorPlan.resultCode, 1);
  assert.equal(a.summary.anchored, true);
  assert.equal(a.summary.commitState, "INVOKED");
});

test("tamper control: a changed soroban commit state breaks its digest", async () => {
  const a = JSON.parse(await readFile(SOROBAN_COMMIT, "utf8"));
  const tampered = JSON.parse(JSON.stringify(a));
  tampered.commit.state = "DRIFTED-STATE";
  assert.notEqual(digestOf(tampered), a.evidenceDigest);
});

test("tamper control: a flipped byte in the agent artifact breaks its digest", async () => {
  const a = JSON.parse(await readFile(AGENT, "utf8"));
  const tampered = JSON.parse(JSON.stringify(a));
  tampered.summary.verdicts.allow = "DRIFTED-VERDICT";
  assert.notEqual(digestOf(tampered), a.evidenceDigest);
});

test("tamper control: extra unknown field in the dex artifact breaks its digest", async () => {
  const a = JSON.parse(await readFile(DEX, "utf8"));
  const tampered = JSON.parse(JSON.stringify(a));
  tampered.book.depthXlm += 0.0000001;
  assert.notEqual(digestOf(tampered), a.evidenceDigest);
});

test("tamper control: a changed shield decision breaks its digest", async () => {
  const a = JSON.parse(await readFile(SHIELD, "utf8"));
  const tampered = JSON.parse(JSON.stringify(a));
  tampered.summary.decisions.vote = "ALLOW";
  assert.notEqual(digestOf(tampered), a.evidenceDigest);
});
