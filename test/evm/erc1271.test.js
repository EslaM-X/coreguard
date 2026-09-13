/**
 * Phase B-1 — EIP-1271 primitives conformance (spec §4 V1–V3).
 *
 * Pure deterministic vectors, no network. Pins the selector/magic identity,
 * calldata structure, and return decoding against the design spec
 * (spec/agent-provenance-eip1271.md).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ERC1271_MAGIC,
  ERC1271_FN_SIG,
  erc1271Selector,
  isValidSignatureCalldata,
  decodeIsValidSignatureReturn,
  isErc1271Magic,
} from "../../packages/evm/index.js";

// V1-digest is the Phase A constant for manifestId 0xab*32 on chain 1116
// (see test/evm/eip712.test.js) — pinned in the design spec §4 V2.
const V1_DIGEST = "0x9405da1aebd20c2e652140f5cbbd0b5dea8974458dad85396279b2df23766754";

test("erc1271 (V1): selector is the EIP-1271 magic value", () => {
  assert.equal(ERC1271_FN_SIG, "isValidSignature(bytes32,bytes)");
  assert.equal(ERC1271_MAGIC, "0x1626ba7e");
  // bytes4(keccak256("isValidSignature(bytes32,bytes)")) == 0x1626ba7e
  assert.equal(erc1271Selector(), ERC1271_MAGIC);
});

test("erc1271 (V2): calldata for the known manifest digest + empty signature is deterministic", () => {
  const calldata = isValidSignatureCalldata(V1_DIGEST, "0x");
  // selector ‖ digest ‖ offset 0x40 ‖ length 0
  assert.equal(
    calldata,
    "0x1626ba7e9405da1aebd20c2e652140f5cbbd0b5dea8974458dad85396279b2df23766754" +
      "0000000000000000000000000000000000000000000000000000000000000040" +
      "0000000000000000000000000000000000000000000000000000000000000000",
  );
});

test("erc1271 (V2b): calldata round-trips a non-empty signature (5 bytes → padded)", () => {
  const calldata = isValidSignatureCalldata(V1_DIGEST, "0xdeadbeef11"); // 5 bytes
  assert.match(calldata, /^0x1626ba7e/);
  // offset 0x40, length 5, then deadbeef11 + 27 pad bytes
  assert.ok(calldata.includes("0000000000000000000000000000000000000000000000000000000000000040"));
  assert.ok(calldata.includes("0000000000000000000000000000000000000000000000000000000000000005"));
  assert.equal(calldata.length, 2 + 8 + 64 + 64 + 64 + 64); // 0x… + 264 hex chars (4 head words + 1 data word)
});

test("erc1271 (V3): magic return decodes to OK; wrong magic/revert are NOT the magic", () => {
  const magicRet = "0x1626ba7e" + "00".repeat(28);
  assert.equal(decodeIsValidSignatureReturn(magicRet), "0x1626ba7e");
  assert.equal(isErc1271Magic(magicRet), true);

  assert.equal(isErc1271Magic("0xffffffff" + "00".repeat(28)), false);
  assert.equal(isErc1271Magic("0x"), false); // revert/empty return
  assert.equal(isErc1271Magic(null), false); // invalid input
  assert.equal(isErc1271Magic("0x00"), false); // too short
});

test("erc1271: calldata builder rejects non-pinned inputs", () => {
  assert.throws(() => isValidSignatureCalldata("0x1234"), /32-byte/);
  assert.throws(() => isValidSignatureCalldata(V1_DIGEST, "0x123"), /even-length/);
});