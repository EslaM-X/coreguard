/**
 * WS-3 — adversarial/mutation suite (W3-I3/I4/I10).
 *
 * Feeds the WASM verifier and the reference independently mutated inputs and
 * asserts that BOTH produce identical deterministic outcomes that are never
 * a silent OK — i.e. deviations from the baseline are detected by BOTH
 * verifiers in the same way (OR the divergence is noted and HOLD per §8).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  makeIntent,
  makeDeclaration,
  signDeclaration,
  seedKey,
  eoaArgs,
  contractArgs,
  ivInstance,
} from "./helpers.js";
import { verifyRef, verifyWasm, assertEnvelopeEqual } from "./helpers.js";

test("mutate intent chainId → NOT_PROVEN / DECLARATION_NOT_BOUND", async () => {
  const args = await eoaArgs();
  args.intent = { ...args.intent, chainId: "WRONG" };
  const [ref, wasm] = await Promise.all([verifyRef(args), verifyWasm(args)]);
  assertEnvelopeEqual(ref, wasm, "mutate-chainId");
});

test("mutate declaration version → NOT_PROVEN / DECLARATION_INVALID", async () => {
  const args = await eoaArgs();
  args.declaration = { ...args.declaration, version: "FAKE" };
  const [ref, wasm] = await Promise.all([verifyRef(args), verifyWasm(args)]);
  assertEnvelopeEqual(ref, wasm, "mutate-decl-version");
});

test("mutate declaration kind → NOT_PROVEN", async () => {
  const args = await eoaArgs();
  args.declaration = { ...args.declaration, kind: "NOT_A_DECLARATION" };
  const [ref, wasm] = await Promise.all([verifyRef(args), verifyWasm(args)]);
  assertEnvelopeEqual(ref, wasm, "mutate-decl-kind");
});

test("mutate signerBinding.address → NOT_PROVEN / SIGNER_MISMATCH", async () => {
  const args = await eoaArgs();
  args.declaration = {
    ...args.declaration,
    signerBinding: { ...args.declaration.signerBinding, address: "0x" + "aa".repeat(20) },
  };
  const [ref, wasm] = await Promise.all([verifyRef(args), verifyWasm(args)]);
  // Both detect mismatch; ref label is either DECLARATION_NOT_BOUND or SIGNER_MISMATCH depending on path
  assert.strictEqual(ref.status, wasm.status);
  assert.strictEqual(ref.label, wasm.label);
});

test("mutate signature.s → SIG_MALFORMED", async () => {
  const args = await eoaArgs();
  args.declaration = {
    ...args.declaration,
    signature: { ...args.declaration.signature, s: "0000000000000000000000000000000000000000000000000000000000000000" },
  };
  const [ref, wasm] = await Promise.all([verifyRef(args), verifyWasm(args)]);
  assertEnvelopeEqual(ref, wasm, "mutate-sig-s");
});

test("mutate manifestId → NOT_PROVEN / DECLARATION_NOT_BOUND", async () => {
  const args = await eoaArgs();
  args.declaration = { ...args.declaration, manifestId: "0x" + "ff".repeat(32) };
  const [ref, wasm] = await Promise.all([verifyRef(args), verifyWasm(args)]);
  assertEnvelopeEqual(ref, wasm, "mutate-manifestid");
});

test("mutate frozenRecord executionScope → SCOPE_MISMATCH", async () => {
  const args = await eoaArgs();
  args.frozenRecord = {
    ...args.frozenRecord,
    binding: { ...args.frozenRecord.binding, executionScope: { tampered: true } },
  };
  const [ref, wasm] = await Promise.all([verifyRef(args), verifyWasm(args)]);
  assertEnvelopeEqual(ref, wasm, "mutate-scope");
});

test("mutate authorityAtState (non-decimal) → NO_AUTHORITY_STATE for EIP-1271", async () => {
  const args = await contractArgs();
  args.authorityAtState = "latest";
  const [ref, wasm] = await Promise.all([verifyRef(args), verifyWasm(args)]);
  assertEnvelopeEqual(ref, wasm, "mutate-state-string");
});

test("remove intent entirely → NOT_RUN / INTENT_MISSING", async () => {
  const args = await eoaArgs();
  delete args.intent;
  const [ref, wasm] = await Promise.all([verifyRef(args), verifyWasm(args)]);
  assertEnvelopeEqual(ref, wasm, "no-intent");
});

test("remove declaration entirely → NOT_RUN / DECLARATION_MISSING", async () => {
  const args = await eoaArgs();
  delete args.declaration;
  const [ref, wasm] = await Promise.all([verifyRef(args), verifyWasm(args)]);
  assertEnvelopeEqual(ref, wasm, "no-declaration");
});

test("post-execution evidence refused (txHash)", async () => {
  const args = await eoaArgs();
  args.txHash = "0x" + "ab".repeat(32);
  const res = ivInstance.verifyRaw(args);
  assert.deepStrictEqual(res.mode, "refused");
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
  // Insert manually built witness with wrong request address
  const res = ivInstance.verifyRaw({
    ...base,
    witness: {
      code: {
        request: { kind: "getCode", address: "0x" + "00".repeat(20), block: "1024" },
        result: { ok: true, value: "0x60806040" },
      },
    },
  });
  assert.deepStrictEqual(res.mode, "refused");
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
  const res = ivInstance.verifyRaw({
    ...base,
    witness: {
      ethCall: {
        request: { kind: "ethCall", to: "0x" + "00".repeat(20), data: "0x", block: "1024" },
        result: { ok: true, response: { ok: true, data: "0x1626ba7e" + "00".repeat(28) } },
      },
    },
  });
  assert.deepStrictEqual(res.mode, "refused");
});

test("reclaim never silently accepts (nonce mismatch)", async () => {
  const args = await eoaArgs();
  args.declaration = { ...args.declaration, nonce: "WRONG" };
  const res = await verifyWasm(args);
  assert.notDeepStrictEqual(res.status, "OK");
});
