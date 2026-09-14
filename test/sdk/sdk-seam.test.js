/**
 * WS-2 — SDK seam integrity + zero-dep boundary (spec §4.0/§4.2, oracles
 * W2-I2/I5/I9).
 *
 * W2-I2 (red-line inversion): claim channels fed as inputs change nothing and
 * never appear as outputs.
 * W2-I5 (seam deep-scan): no PRE-execution path accepts execution evidence
 * (typed rejection), and no result carries execution/conformance artifacts.
 * W2-I9 (boundary-conserved): the SDK imports only local zero-dep cores; its
 * package declares no dependencies.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  verifyBinding,
  FW_DECISION_DOMAIN,
  FW_DECISION_RECORD_VERSION,
} from "../../packages/sdk/index.js";
import { DECISION_DOMAIN, DECISION_RECORD_VERSION } from "../../packages/firewall/decision-record.js";
import {
  EVM,
  eoaArgs,
  contractArgs,
  verifyEOA,
  verifyContract,
  decisionRecordFor,
  flipRef,
  makeAddress,
} from "./helpers.js";
import {
  FORBIDDEN_TOKENS,
  FORBIDDEN_EQUIVALENTS,
} from "../firewall/attack-lab/helpers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SDK_DIR = join(__dirname, "../../packages/sdk");

test("W2-I5: execution evidence into a PRE binding call is typed-rejected (A6/A12)", async () => {
  const base = await eoaArgs();
  const claims = {
    executionRef: "0x" + "ab".repeat(32),
    txHash: "0x" + "ab".repeat(32),
    receipt: { status: "0x1", logs: [] },
    CONTRACT_AUTHORIZATION: { magic: true },
    CONTRACT_EXECUTION_BINDING: { rule: "TRACE_CALLER" },
    executionBlock: { number: "5", hash: "0x" + "ab".repeat(32) },
  };
  for (const [key, value] of Object.entries(claims)) {
    await assert.rejects(
      () => verifyBinding({ ...base, [key]: value }),
      (err) => err instanceof TypeError && /Q-FW10 seam/.test(err.message),
      `expected TypeError for ${key}`,
    );
  }
});

test("W2-I5: no PRE-execution result carries execution or conformance artifacts", async () => {
  const scan = (obj) => {
    const text = JSON.stringify(obj);
    const tokens = [...FORBIDDEN_TOKENS, ...FORBIDDEN_EQUIVALENTS, "CONFORMANCE", "VERIFIED"];
    const found = tokens.filter((t) => text.toLowerCase().includes(t.toLowerCase()));
    assert.deepEqual(found, [], `post-execution/conformance artifact in SDK result: ${found.join(", ")}`);
    return text;
  };

  const eoa = await verifyEOA();
  const contract = await verifyContract();
  const mismatch = await verifyEOA({ callerBindingRef: flipRef(eoa.recomputed.bindingRef) });
  const notBound = await verifyBinding({ intent: undefined });

  for (const r of [eoa, contract, mismatch, notBound]) {
    scan(r);
    assert.ok(!Object.hasOwn(r, "authorized"), "result must not carry an authorized claim");
    assert.ok(!Object.hasOwn(r, "relayer"), "result must not carry a relayer field");
  }
});

test("W2-I2: red-line inversion — feeding claim channels changes NOTHING the SDK returns", async () => {
  const base = await eoaArgs();
  const clean = await verifyBinding(base);

  const poisoned = await verifyBinding({
    ...base,
    bindingRef: "0x" + "ab".repeat(32),
    executionScope: { chainId: "1", amount: "1", recipient: makeAddress(0x999) },
    authorized: true,
    relayer: makeAddress(0x555),
    from: makeAddress(0x666),
  });

  assert.deepEqual(poisoned, clean);
  assert.equal(poisoned.status, "OK");
  assert.equal(poisoned.label, "BOUND");
  // The caller-supplied values never appear as outputs (only derived ones do).
  assert.ok(!Object.hasOwn(poisoned, "bindingRef"));
  assert.ok(!Object.hasOwn(poisoned, "authorized"));
  assert.ok(!Object.hasOwn(poisoned, "relayer"));
  assert.deepEqual(poisoned.recomputed.bindingRef, clean.recomputed.bindingRef);
  assert.deepEqual(poisoned.executionScope, clean.executionScope);
});

test("W2-I2: claim channels never change an OK result on the EIP-1271 path either", async () => {
  const c = await contractArgs();
  const clean = await verifyContract();
  const poisoned = await verifyBinding({
    ...c,
    bindingRef: "0x" + "cd".repeat(32),
    executionScope: { chainId: "1" },
    authorized: true,
    relayer: makeAddress(0x222),
    from: makeAddress(0x333),
  });
  assert.deepEqual(poisoned, clean);
  assert.equal(poisoned.status, "OK");
  void EVM;
});

test("W2-I9: the SDK declares no dependencies and exposes ESM only", async () => {
  const pkg = JSON.parse(readFileSync(join(SDK_DIR, "package.json"), "utf8"));
  assert.equal(pkg.name, "@coreguard/sdk");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.main, "index.js");
  const depKeys = Object.keys(pkg).filter((k) => /dependencies$/i.test(k));
  assert.deepEqual(depKeys, [], "SDK must declare zero dependencies (Q-SDK9)");
});

test("W2-I9: static imports only from local zero-dep cores (no external/adapter reach)", async () => {
  const sources = ["index.js", "verify-binding.js"].map((f) =>
    readFileSync(join(SDK_DIR, f), "utf8"),
  );
  const statements = sources.flatMap((src) =>
    [...src.matchAll(/^\s*import\s+[^;]*?from\s+["']([^"']+)["'];?/gm)].map((m) => m[1]),
  );
  assert.ok(statements.length > 0, "expected static imports to exist");
  for (const spec of statements) {
    assert.ok(
      spec.startsWith("../") && !spec.includes("node_modules"),
      `SDK must import only local zero-dep cores, got: ${spec}`,
    );
    assert.ok(!spec.includes("/evm/"), `SDK must not touch the EVM adapter path statically: ${spec}`);
  }
});

test("W2-I9: SDK decision-domain/version conventions cross-check with the Firewall", async () => {
  assert.equal(FW_DECISION_DOMAIN, DECISION_DOMAIN);
  assert.equal(FW_DECISION_RECORD_VERSION, DECISION_RECORD_VERSION);
});

test("W2-I9: sdk helper decision records freeze with the Firewall's exact content-address", async () => {
  const { intent, declaration } = await eoaArgs();
  const { record, decisionRef } = await decisionRecordFor({ intent, declaration });
  assert.equal(record.kind, "DECISION");
  assert.equal(record.version, DECISION_RECORD_VERSION);
  assert.equal(record.decisionRef, decisionRef);
});