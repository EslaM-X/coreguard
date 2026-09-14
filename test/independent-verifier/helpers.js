import assert from "node:assert/strict";

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
export const normalize = (o) => JSON.parse(JSON.stringify(o));

export const verifyRef = async (input) => normalize(await verifyBinding(input));

export const verifyWasm = async (input) => normalize(await ivInstance.run(input));

/** Assert deep equality on the full verifyBinding envelope. */
export function assertEnvelopeEqual(ref, wasm, label = "") {
  try {
    assert.deepStrictEqual(ref, wasm);
  } catch (e) {
    const msg = label ? `[${label}] ` : "";
    throw new Error(
      `${msg}Envelope mismatch:\nREF: ${JSON.stringify(ref, null, 2)}\nWASM: ${JSON.stringify(wasm, null, 2)}\n${e.message}`
    );
  }
}

export {
  EVM,
  CONTRACT_ADDR,
  makeAddress,
  makeIntent,
  makeDeclaration,
  signDeclaration,
  seedKey,
  eoaArgs,
  contractArgs,
  statePinnedProviders,
  callerContextProviders,
  flipRef,
};