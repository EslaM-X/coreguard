/**
 * WS-3 — differential parity tests (W3-I2/I3/I11)
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
} from "./helpers.js";
import { verifyRef, verifyWasm, assertEnvelopeEqual } from "./helpers.js";

const WRONG_MAGIC = "0xffffffff" + "00".repeat(28);

test("EOA baseline — matched signer produces OK/BOUND", async () => {
  const args = await eoaArgs();
  const [ref, wasm] = await Promise.all([verifyRef(args), verifyWasm(args)]);
  assertEnvelopeEqual(ref, wasm, "eoa-baseline");
});

test("EIP-1271 baseline — magic returns OK/BOUND", async () => {
  const args = await contractArgs();
  const [ref, wasm] = await Promise.all([verifyRef(args), verifyWasm(args)]);
  assertEnvelopeEqual(ref, wasm, "eip1271-baseline");
});

test("EOA signer mismatch — tampered key", async () => {
  const args = await eoaArgs({ signWith: seedKey(2).priv });
  const [ref, wasm] = await Promise.all([verifyRef(args), verifyWasm(args)]);
  assertEnvelopeEqual(ref, wasm, "signer-mismatch");
});

test("EIP-1271 no code at state", async () => {
  const args = await contractArgs({
    contractAuth: {
      getCode: async () => "0x",
      ethCall: async () => ({ ok: true, data: "0x" }),
    },
  });
  const [ref, wasm] = await Promise.all([verifyRef(args), verifyWasm(args)]);
  assertEnvelopeEqual(ref, wasm, "no-code-at-state");
});

test("EIP-1271 code lookup error", async () => {
  const args = await contractArgs({
    contractAuth: {
      getCode: async () => {
        throw new Error("RPC down");
      },
      ethCall: async () => ({ ok: true, data: "0x" }),
    },
  });
  const [ref, wasm] = await Promise.all([verifyRef(args), verifyWasm(args)]);
  assertEnvelopeEqual(ref, wasm, "code-lookup-error");
});

test("EIP-1271 REVERTED", async () => {
  const args = await contractArgs({
    contractAuth: {
      getCode: async () => "0x60806040",
      ethCall: async () => ({ ok: true, code: "REVERTED", data: "0x" }),
    },
  });
  const [ref, wasm] = await Promise.all([verifyRef(args), verifyWasm(args)]);
  assertEnvelopeEqual(ref, wasm, "reverted");
});

test("EIP-1271 HISTORICAL_STATE_UNAVAILABLE", async () => {
  const args = await contractArgs({
    contractAuth: {
      getCode: async () => "0x60806040",
      ethCall: async () => ({ ok: true, code: "HISTORICAL_STATE_UNAVAILABLE" }),
    },
  });
  const [ref, wasm] = await Promise.all([verifyRef(args), verifyWasm(args)]);
  assertEnvelopeEqual(ref, wasm, "historical-state");
});

test("EIP-1271 NOT_MAGIC", async () => {
  const args = await contractArgs({
    contractAuth: {
      getCode: async () => "0x60806040",
      ethCall: async () => ({ ok: true, data: WRONG_MAGIC }),
    },
  });
  const [ref, wasm] = await Promise.all([verifyRef(args), verifyWasm(args)]);
  assertEnvelopeEqual(ref, wasm, "not-magic");
});

test("EIP-1271 provider error (ethCall throws)", async () => {
  const args = await contractArgs({
    contractAuth: {
      getCode: async () => "0x60806040",
      ethCall: async () => {
        throw new Error("no node");
      },
    },
  });
  const [ref, wasm] = await Promise.all([verifyRef(args), verifyWasm(args)]);
  assertEnvelopeEqual(ref, wasm, "ethcall-threw");
});

test("missing frozen record", async () => {
  const { frozenRecord, ...rest } = await eoaArgs();
  const [ref, wasm] = await Promise.all([verifyRef({ ...rest }), verifyWasm({ ...rest })]);
  assertEnvelopeEqual(ref, wasm, "missing-frozen-record");
});

test("invalid frozen record version", async () => {
  const args = await eoaArgs();
  args.frozenRecord = { ...args.frozenRecord, version: "WRONG" };
  const [ref, wasm] = await Promise.all([verifyRef(args), verifyWasm(args)]);
  assertEnvelopeEqual(ref, wasm, "invalid-frozen-version");
});

test("tampered scope", async () => {
  const args = await eoaArgs();
  args.intent = { ...args.intent, validAfter: "9999" };
  const [ref, wasm] = await Promise.all([verifyRef(args), verifyWasm(args)]);
  assertEnvelopeEqual(ref, wasm, "scope-mismatch");
});

test("mismatched callerBindingRef", async () => {
  const args = await eoaArgs();
  args.callerBindingRef = "0x" + "0".repeat(64);
  const [ref, wasm] = await Promise.all([verifyRef(args), verifyWasm(args)]);
  assertEnvelopeEqual(ref, wasm, "binding-ref-mismatch");
});

test("no authority state (EIP-1271)", async () => {
  const args = await contractArgs();
  delete args.authorityAtState;
  const [ref, wasm] = await Promise.all([verifyRef(args), verifyWasm(args)]);
  assertEnvelopeEqual(ref, wasm, "no-authority-state");
});

test("malformed envelope — bad v (EOA)", async () => {
  const args = await eoaArgs();
  args.declaration = {
    ...args.declaration,
    signature: { ...args.declaration.signature, v: 99 },
  };
  const [ref, wasm] = await Promise.all([verifyRef(args), verifyWasm(args)]);
  assertEnvelopeEqual(ref, wasm, "malformed-v");
});

test("EIP-1271 no providers (contractAuth missing)", async () => {
  const args = await contractArgs();
  args.contractAuth = undefined;
  const [ref, wasm] = await Promise.all([verifyRef(args), verifyWasm(args)]);
  assertEnvelopeEqual(ref, wasm, "no-providers");
});
