/**
 * Verifier C — three-way differential parity (A=reference SDK, B=Rust/WASM,
 * C=stdlib-only Python re-derivation). Each scenario is run identically
 * through all three pipelines and asserted byte-identical envelope-for-envelope.
 *
 * The scenario corpus mirrors test/independent-verifier/differential.test.js
 * (WS-3 W3-I2/I3/I11) — proving C shadows B exactly over the full corpus.
 */

import { test, after } from "node:test";

import { seedKey, eoaArgs, contractArgs } from "./helpers.js";
import { verifyRef, verifyWasm, verifyC, assertEnvelopeEqual3 } from "./helpers.js";

const WRONG_MAGIC = "0xffffffff" + "00".repeat(28);

after(async () => {
  const { cInstance } = await import("./helpers.js");
  await cInstance.close();
});

test("EOA baseline — matched signer produces OK/BOUND", async () => {
  const args = await eoaArgs();
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assertEnvelopeEqual3(ref, wasm, c, "eoa-baseline");
});

test("EIP-1271 baseline — magic returns OK/BOUND", async () => {
  const args = await contractArgs();
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assertEnvelopeEqual3(ref, wasm, c, "eip1271-baseline");
});

test("EOA signer mismatch — tampered key", async () => {
  const args = await eoaArgs({ signWith: seedKey(2).priv });
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assertEnvelopeEqual3(ref, wasm, c, "signer-mismatch");
});

test("EIP-1271 no code at state", async () => {
  const args = await contractArgs({
    contractAuth: {
      getCode: async () => "0x",
      ethCall: async () => ({ ok: true, data: "0x" }),
    },
  });
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assertEnvelopeEqual3(ref, wasm, c, "no-code-at-state");
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
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assertEnvelopeEqual3(ref, wasm, c, "code-lookup-error");
});

test("EIP-1271 REVERTED", async () => {
  const args = await contractArgs({
    contractAuth: {
      getCode: async () => "0x60806040",
      ethCall: async () => ({ ok: true, code: "REVERTED", data: "0x" }),
    },
  });
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assertEnvelopeEqual3(ref, wasm, c, "reverted");
});

test("EIP-1271 HISTORICAL_STATE_UNAVAILABLE", async () => {
  const args = await contractArgs({
    contractAuth: {
      getCode: async () => "0x60806040",
      ethCall: async () => ({ ok: true, code: "HISTORICAL_STATE_UNAVAILABLE" }),
    },
  });
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assertEnvelopeEqual3(ref, wasm, c, "historical-state");
});

test("EIP-1271 NOT_MAGIC", async () => {
  const args = await contractArgs({
    contractAuth: {
      getCode: async () => "0x60806040",
      ethCall: async () => ({ ok: true, data: WRONG_MAGIC }),
    },
  });
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assertEnvelopeEqual3(ref, wasm, c, "not-magic");
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
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assertEnvelopeEqual3(ref, wasm, c, "ethcall-threw");
});

test("missing frozen record", async () => {
  const { frozenRecord, ...rest } = await eoaArgs();
  const [ref, wasm, c] = await Promise.all([verifyRef(rest), verifyWasm(rest), verifyC(rest)]);
  assertEnvelopeEqual3(ref, wasm, c, "missing-frozen-record");
});

test("invalid frozen record version", async () => {
  const args = await eoaArgs();
  args.frozenRecord = { ...args.frozenRecord, version: "WRONG" };
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assertEnvelopeEqual3(ref, wasm, c, "invalid-frozen-version");
});

test("tampered scope", async () => {
  const args = await eoaArgs();
  args.intent = { ...args.intent, validAfter: "9999" };
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assertEnvelopeEqual3(ref, wasm, c, "scope-mismatch");
});

test("mismatched callerBindingRef", async () => {
  const args = await eoaArgs();
  args.callerBindingRef = "0x" + "0".repeat(64);
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assertEnvelopeEqual3(ref, wasm, c, "binding-ref-mismatch");
});

test("no authority state (EIP-1271)", async () => {
  const args = await contractArgs();
  delete args.authorityAtState;
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assertEnvelopeEqual3(ref, wasm, c, "no-authority-state");
});

test("malformed envelope — bad v (EOA)", async () => {
  const args = await eoaArgs();
  args.declaration = {
    ...args.declaration,
    signature: { ...args.declaration.signature, v: 99 },
  };
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assertEnvelopeEqual3(ref, wasm, c, "malformed-v");
});

test("EIP-1271 no providers (contractAuth missing)", async () => {
  const args = await contractArgs();
  args.contractAuth = undefined;
  const [ref, wasm, c] = await Promise.all([verifyRef(args), verifyWasm(args), verifyC(args)]);
  assertEnvelopeEqual3(ref, wasm, c, "no-providers");
});