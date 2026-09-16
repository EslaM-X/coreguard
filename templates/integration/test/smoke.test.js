/**
 * CoreGuard {{NAME}} — smoke tests (node:test).
 *
 *   node --test
 *
 * These exercise the PUBLIC @coreguard/sdk guard.* surfaces against the
 * checked-in fixtures. They are the integration baseline every change must
 * keep green.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createGuard } from "@coreguard/sdk";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const load = (f) => readFile(resolve(root, f), "utf8").then(JSON.parse);

const guard = createGuard();

test("verify derives a VERIFIED receipt from the fixtures", async () => {
  const intent = await load("intent.json");
  const policy = await load("policy.json");
  const trace = await load("trace.json");

  const result = await guard.verify({ chain: intent.chainId, intent, policy, trace });
  assert.equal(result.verdict, "VERIFIED");
  assert.ok(result.receiptId && result.receiptId.startsWith("0x"));
});

test("mutation of the recipient is detected (calldata tamper)", async () => {
  const intent = await load("intent.json");
  const policy = await load("policy.json");
  const trace = await load("trace.json");

  const attacker = "0x0000000000000000000000000000000000000099";
  const mutated = {
    ...trace,
    calldata:
      "0xa9059cbb" +
      attacker.slice(2).padStart(64, "0") +
      "0000000000000000000000000000000000000000000000000000000005f5e100",
  };

  const result = await guard.verify({ chain: intent.chainId, intent, policy, trace: mutated });
  assert.equal(result.verdict, "INVALID");
});

test("anchor plans a consistent commitment + proofId", async () => {
  const intent = await load("intent.json");
  const policy = await load("policy.json");
  const trace = await load("trace.json");

  const v = await guard.verify({ chain: intent.chainId, intent, policy, trace });
  const plan = await guard.anchor(v.receipt);

  assert.equal(plan.status, "PLAN");
  assert.equal(plan.receiptId, v.receiptId);
  assert.ok(plan.commitment.startsWith("0x"));
  assert.ok(plan.proofId.startsWith("0x"));
  assert.notEqual(plan.proofId, plan.commitment);
});