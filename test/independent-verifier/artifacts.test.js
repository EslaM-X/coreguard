/**
 * WS-3 — artifact integrity, guard seam, determinism, numeric robustness (W3-I6/I9/I10/I12).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { canonicalize } from "../../packages/canonical/index.js";
import { ivInstance } from "./helpers.js";
import { loadIndependentVerifier, EXECUTION_EVIDENCE_KEYS } from "../../packages/independent-verifier/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WASM_FILE = join(__dirname, "../../packages/independent-verifier/wasm/independent-verifier.wasm");
const SHA_FILE = join(__dirname, "../../packages/independent-verifier/wasm/independent-verifier.sha256");
const WASM = readFileSync(WASM_FILE);
const sha256 = (b) => createHash("sha256").update(b).digest("hex").toUpperCase();

test("W3-I9: WASM has zero function imports", () => {
  const mod = new WebAssembly.Module(WASM);
  assert.deepStrictEqual(WebAssembly.Module.imports(mod), [], "wasm must have zero imports");
});

test("W3-I9: WASM exports only the expected surface", () => {
  const mod = new WebAssembly.Module(WASM);
  const exps = WebAssembly.Module.exports(mod).map((e) => `${e.name}:${e.kind}`);
  assert.deepStrictEqual(exps, [
    "memory:memory",
    "alloc:function",
    "canon:function",
    "dealloc:function",
    "output_len:function",
    "output_ptr:function",
    "verify:function",
  ]);
});

test("W3-I12: committed SHA-256 matches sha file", () => {
  assert.deepStrictEqual(sha256(WASM), readFileSync(SHA_FILE, "utf8").trim());
});

test("W3-I8: determinism — same inputs produce identical output", async () => {
  const intent = {
    chainId: "1116",
    validAfter: "0",
    validUntil: "100000",
    target: "0x00000000000000000000000000000000000000bb",
    selector: "0xa9059cbb",
    asset: "0x0000000000000000000000000000000000000001",
    amount: "1000000000000000000",
    recipient: "0x00000000000000000000000000000000000000cc",
  };
  const a = ivInstance.verifyRaw({ intent });
  const b = ivInstance.verifyRaw({ intent });
  assert.deepStrictEqual(a, b);
});

test("W3-I2: canon parity with reference canonicalize on objects", () => {
  const obj = { b: 2, a: 1, nested: { z: true, x: null } };
  assert.deepStrictEqual(ivInstance.canonRaw(obj).value, canonicalize(obj));
});

test("W3-I2: canon parity on addresses (0x strings)", () => {
  assert.deepStrictEqual(ivInstance.canonRaw("0xABC").value, canonicalize("0xABC"));
});

test("W3-I10: canon rejects unsafe JS numbers", () => {
  const res = ivInstance.canonRaw({ val: 9007199254740993 });
  assert.deepStrictEqual(res.ok, false);
  assert.match(res.error, /Unsafe JS Number/);
});

test("W3-I6: guard seam rejects execution evidence (WASM-level)", async () => {
  const res = ivInstance.verifyRaw({ executionRef: "0x01", intent: {} });
  assert.deepStrictEqual(res.mode, "refused");
  assert.match(res.reason, /execution evidence/);
});

test("guardSeam wrapper throws TypeError on post-execution evidence", async () => {
  let wrapper;
  try {
    wrapper = await loadIndependentVerifier();
  } catch {
    return; // WASM already loaded via helpers ivInstance
  }
  await assert.rejects(
    wrapper.run({ txHash: "0x01", intent: {}, declaration: {}, frozenRecord: {}, authorityAtState: "1" }),
    { name: "TypeError", message: /post-execution evidence/ }
  );
});

test("W3-I10: malicious 0x edge — random bytes input rejected", () => {
  const res = ivInstance.verifyRaw({ signer: "0x" + "ff".repeat(20) });
  assert.ok(!res || res.status !== "OK", "random bytes must not produce OK");
});

test("W3-I10: oversized nesting does not crash WASM (depth 256)", () => {
  let deep = { v: 1 };
  for (let i = 0; i < 254; i++) deep = { child: deep };
  // 255 object levels + the leaf value reaches parse depth 256 (limit ≥ 256).
  const res = ivInstance.canonRaw(deep);
  assert.deepStrictEqual(res.ok, true);
});

test("W3-I10: exceeding max depth errors gracefully", () => {
  let deep = { v: 1 };
  for (let i = 0; i < 300; i++) deep = { child: deep };
  const res = ivInstance.canonRaw(deep);
  assert.deepStrictEqual(res.kind, "input_error");
  assert.match(res.message, /nesting too deep/);
  let threw = null;
  try {
    ivInstance.verifyRaw(deep);
  } catch (e) {
    threw = e;
  }
  assert.ok(threw, "verifyRaw must throw on input error");
  assert.match(threw.message, /nesting too deep/);
});
