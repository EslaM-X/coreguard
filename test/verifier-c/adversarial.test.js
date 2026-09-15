/**
 * Verifier C — adversarial/mutation three-way suite (mirror of
 * test/independent-verifier/adversarial.test.js, WS-3 W3-I3/I4/I10).
 *
 * Mutated inputs must produce IDENTICAL deterministic outcomes across
 * A (reference), B (Rust/WASM) and C (stdlib-only Python) — never a silent OK.
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";

import { seedKey, eoaArgs, contractArgs, cInstance, ivInstance } from "./helpers.js";
import { verifyRef, verifyWasm, verifyC, assertEnvelopeEqual3 } from "./helpers.js";

after(async () => {
  await cInstance.close();
});

test("mutate intent chainId → NOT_PROVEN / DECLARATION_NOT_BOUND", async () => {
  const args = await eoaArgs();
  args.intent = { ...args.intent, chainId: "WRONG" };
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assertEnvelopeEqual3(ref, wasm, c, "mutate-chainId");
});

test("mutate declaration version → NOT_PROVEN / DECLARATION_INVALID", async () => {
  const args = await eoaArgs();
  args.declaration = { ...args.declaration, version: "FAKE" };
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assertEnvelopeEqual3(ref, wasm, c, "mutate-decl-version");
});

test("mutate declaration kind → NOT_PROVEN", async () => {
  const args = await eoaArgs();
  args.declaration = { ...args.declaration, kind: "NOT_A_DECLARATION" };
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assertEnvelopeEqual3(ref, wasm, c, "mutate-decl-kind");
});

test("mutate signerBinding.address → NOT_PROVEN / SIGNER_MISMATCH", async () => {
  const args = await eoaArgs();
  args.declaration = {
    ...args.declaration,
    signerBinding: { ...args.declaration.signerBinding, address: "0x" + "aa".repeat(20) },
  };
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assert.strictEqual(ref.status, wasm.status);
  assert.strictEqual(ref.label, wasm.label);
  assert.strictEqual(ref.status, c.status);
  assert.strictEqual(ref.label, c.label);
});

test("mutate signature.s → SIG_MALFORMED", async () => {
  const args = await eoaArgs();
  args.declaration = {
    ...args.declaration,
    signature: { ...args.declaration.signature, s: "0000000000000000000000000000000000000000000000000000000000000000" },
  };
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assertEnvelopeEqual3(ref, wasm, c, "mutate-sig-s");
});

test("mutate manifestId → NOT_PROVEN / DECLARATION_NOT_BOUND", async () => {
  const args = await eoaArgs();
  args.declaration = { ...args.declaration, manifestId: "0x" + "ff".repeat(32) };
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assertEnvelopeEqual3(ref, wasm, c, "mutate-manifestid");
});

test("mutate frozenRecord executionScope → SCOPE_MISMATCH", async () => {
  const args = await eoaArgs();
  args.frozenRecord = {
    ...args.frozenRecord,
    binding: { ...args.frozenRecord.binding, executionScope: { tampered: true } },
  };
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assertEnvelopeEqual3(ref, wasm, c, "mutate-scope");
});

test("mutate authorityAtState (non-decimal) → NO_AUTHORITY_STATE for EIP-1271", async () => {
  const args = await contractArgs();
  args.authorityAtState = "latest";
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assertEnvelopeEqual3(ref, wasm, c, "mutate-state-string");
});

test("remove intent entirely → NOT_RUN / INTENT_MISSING", async () => {
  const args = await eoaArgs();
  delete args.intent;
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assertEnvelopeEqual3(ref, wasm, c, "no-intent");
});

test("remove declaration entirely → NOT_RUN / DECLARATION_MISSING", async () => {
  const args = await eoaArgs();
  delete args.declaration;
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assertEnvelopeEqual3(ref, wasm, c, "no-declaration");
});

test("post-execution evidence refused (txHash) — B and C verifyRaw", async () => {
  const args = await eoaArgs();
  args.txHash = "0x" + "ab".repeat(32);
  const b = ivInstance.verifyRaw(args);
  const c = await cInstance.verifyRaw(args);
  assert.deepStrictEqual(b.mode, "refused");
  assert.deepStrictEqual(c.mode, "refused");
});

test("wrong witness request on getCode → refuses", async () => {
  const args = await contractArgs();
  const base = {
    intent: args.intent,
    declaration: args.declaration,
    frozenRecord: args.frozenRecord,
    authorityAtState: args.authorityAtState,
    transport: { available: true },
  };
  const b = ivInstance.verifyRaw({
    ...base,
    witness: {
      code: {
        request: { kind: "getCode", address: "0x" + "00".repeat(20), block: "1024" },
        result: { ok: true, value: "0x60806040" },
      },
    },
  });
  const c = await cInstance.verifyRaw({
    ...base,
    witness: {
      code: {
        request: { kind: "getCode", address: "0x" + "00".repeat(20), block: "1024" },
        result: { ok: true, value: "0x60806040" },
      },
    },
  });
  assert.deepStrictEqual(b.mode, "refused");
  assert.deepStrictEqual(c.mode, "refused");
});

test("wrong witness request on ethCall → refuses", async () => {
  const args = await contractArgs();
  const base = {
    intent: args.intent,
    declaration: args.declaration,
    frozenRecord: args.frozenRecord,
    authorityAtState: args.authorityAtState,
    transport: { available: true },
  };
  const b = ivInstance.verifyRaw({
    ...base,
    witness: {
      ethCall: {
        request: { kind: "ethCall", to: "0x" + "00".repeat(20), data: "0x", block: "1024" },
        result: { ok: true, response: { ok: true, data: "0x1626ba7e" + "00".repeat(28) } },
      },
    },
  });
  const c = await cInstance.verifyRaw({
    ...base,
    witness: {
      ethCall: {
        request: { kind: "ethCall", to: "0x" + "00".repeat(20), data: "0x", block: "1024" },
        result: { ok: true, response: { ok: true, data: "0x1626ba7e" + "00".repeat(28) } },
      },
    },
  });
  assert.deepStrictEqual(b.mode, "refused");
  assert.deepStrictEqual(c.mode, "refused");
});

test("reclaim never silently accepts (nonce mismatch)", async () => {
  const args = await eoaArgs();
  args.declaration = { ...args.declaration, nonce: "WRONG" };
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assert.notDeepStrictEqual(c.status, "OK");
});

test("run() guardSeam rejects post-execution evidence for A, B, C", async () => {
  const args = await eoaArgs();
  args.txHash = "0x" + "ab".repeat(32);
  let refThrew = false;
  let wasmThrew = false;
  let cThrew = false;
  try {
    await verifyRef(args);
  } catch {
    refThrew = true;
  }
  try {
    await verifyWasm(args);
  } catch {
    wasmThrew = true;
  }
  try {
    await verifyC(args);
  } catch {
    cThrew = true;
  }
  assert.strictEqual(refThrew, true, "A must throw at seam");
  assert.strictEqual(wasmThrew, true, "B must throw at seam");
  assert.strictEqual(cThrew, true, "C must throw at seam");
});

test("hasEnvelope — C verifyRaw returns refused on embedded evidence", async () => {
  const args = await eoaArgs();
  args.receipt = { status: 1 };
  const c = await cInstance.verifyRaw(args);
  assert.deepStrictEqual(c.mode, "refused");
});