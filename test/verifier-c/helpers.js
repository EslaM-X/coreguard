import assert from "node:assert/strict";

import { loadVerifierC, PACKAGE_ROOT } from "../../packages/verifier-c/index.js";

import { loadIndependentVerifier } from "../../packages/independent-verifier/index.js";

import { canonicalize as refCanonicalize } from "../../packages/canonical/index.js";
import { verifyBinding } from "../../packages/sdk/index.js";
import {
  EVM,
  CONTRACT_ADDR,
  makeAddress,
  eoaArgs,
  contractArgs,
  statePinnedProviders,
  callerContextProviders,
  flipRef,
} from "../sdk/helpers.js";
import {
  makeIntent,
  makeDeclaration,
  signDeclaration,
  seedKey,
} from "../firewall/helpers.js";

export const ivInstance = await loadIndependentVerifier();
export const cInstance = await loadVerifierC();
export const normalize = (o) => JSON.parse(JSON.stringify(o));

export const verifyRef = async (input) => normalize(await verifyBinding(input));
export const verifyWasm = async (input) => normalize(await ivInstance.run(input));
export const verifyC = async (input) => normalize(await cInstance.run(input));

/** Assert deep equality across the FULL three-way triple (A, B, C). */
export function assertEnvelopeEqual3(ref, wasm, c, label = "") {
  const render = (o) => JSON.stringify(o, null, 2);
  try {
    assert.deepStrictEqual(ref, wasm);
    assert.deepStrictEqual(wasm, c);
  } catch (e) {
    const msg = label ? `[${label}] ` : "";
    throw new Error(
      `${msg}Three-way envelope mismatch:\nREF: ${render(ref)}\nB:   ${render(wasm)}\nC:   ${render(c)}\n${e.message}`
    );
  }
}

export { EVM, CONTRACT_ADDR, makeAddress, makeIntent, makeDeclaration, signDeclaration, seedKey, eoaArgs, contractArgs, statePinnedProviders, callerContextProviders, flipRef };

export { PACKAGE_ROOT };