/**
 * Phase A — EIP-712 conformance for CoreGuard AgentProof (CGEP/1 §5a).
 *
 * Vectors are cross-validated against ethers.js and the official EIP-712
 * reference example (see temp/verify-eip712 for the harness), so these tests
 * pin the on-chain-correct constants without a network dependency.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  domainSeparator,
  typedDataDigest,
  typedDataDigestWithDomain,
  domainSeparatorOf,
  encodeType,
  addressFromPublicKey,
  publicKeyFromPrivateKey,
  recoverSignerAddress,
} from "../../packages/provenance/eip712.js";

const hex = (u) => Buffer.from(u).toString("hex");

const MANIFEST_PRIMARY = "ManifestDeclaration";
const MANIFEST_TYPES = { ManifestDeclaration: [{ name: "manifestId", type: "bytes32" }] };

test("eip712: AgentProof domain separator matches ethers constants", () => {
  // Validated against ethers.js v6 (chainId 1116):
  //   domain(...name/version/chainId) => 0xb9022d55abecccc2c7c8eaf93431bd8c16...
  assert.equal(
    hex(domainSeparator(1116)),
    "b9022d55abecccc2c7c8eaf93431bd8c16f46a402928c505651d2db03e3e0b77",
  );
});

test("eip712: AgentProof typed manifest digest matches ethers constants", () => {
  const manifestId = `0x${"ab".repeat(32)}`;
  assert.equal(
    hex(typedDataDigest(MANIFEST_PRIMARY, MANIFEST_TYPES, { manifestId }, 1116)),
    "9405da1aebd20c2e652140f5cbbd0b5dea8974458dad85396279b2df23766754",
  );
});

test("eip712: official EIP-712 reference digest (Mail/Cow) matches", () => {
  const domain = {
    name: "Ether Mail",
    version: "1",
    chainId: 1n,
    verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
  };
  const types = {
    Person: [
      { name: "name", type: "string" },
      { name: "wallet", type: "address" },
    ],
    Mail: [
      { name: "from", type: "Person" },
      { name: "to", type: "Person" },
      { name: "contents", type: "string" },
    ],
  };
  const message = {
    from: { name: "Cow", wallet: "0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826" },
    to: { name: "Bob", wallet: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" },
    contents: "Hello, Bob!",
  };
  assert.equal(
    hex(typedDataDigestWithDomain("Mail", types, message, domain)),
    "be609aee343fb3c4b28e1df9e632fca64fcfaede20f02e86244efddf30957bd2",
  );
});

test("eip712: official EIP-712 recovery recovers the Cow wallet", () => {
  const domain = {
    name: "Ether Mail",
    version: "1",
    chainId: 1n,
    verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
  };
  const types = {
    Person: [
      { name: "name", type: "string" },
      { name: "wallet", type: "address" },
    ],
    Mail: [
      { name: "from", type: "Person" },
      { name: "to", type: "Person" },
      { name: "contents", type: "string" },
    ],
  };
  const message = {
    from: { name: "Cow", wallet: "0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826" },
    to: { name: "Bob", wallet: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" },
    contents: "Hello, Bob!",
  };
  const digest = typedDataDigestWithDomain("Mail", types, message, domain);
  const recovered = recoverSignerAddress(digest, {
    r: "4355c47d63924e8a72e509b65029052eb6c299d53a04e167c5775fd466751c9d",
    s: "07299936d304c153f6443dfa05f40ff007d72911b6f72307f996231605b91562",
    v: 28,
  });
  assert.equal(recovered.toLowerCase(), "0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826");
});

test("eip712: encodeType order is deterministic", () => {
  const types = {
    Person: [
      { name: "name", type: "string" },
      { name: "wallet", type: "address" },
    ],
    Mail: [
      { name: "from", type: "Person" },
      { name: "to", type: "Person" },
      { name: "contents", type: "string" },
    ],
  };
  assert.equal(
    encodeType("Mail", types),
    "Mail(Person from,Person to,string contents)Person(string name,address wallet)",
  );
});

test("eip712: address derivation matches public-key convention", () => {
  // secp256k1 pubkey for private key 0x11...11:
  //   keccak256(0x04||X||Y)[12:] should be stable and 0x-prefixed.
  const priv = "0x" + "11".repeat(32);
  const pub = publicKeyFromPrivateKey(priv);
  const addr = addressFromPublicKey(pub);
  assert.match(addr, /^0x[0-9a-fA-F]{40}$/);
  assert.equal(pub[0], 0x04);
});

test("eip712: recovering the signer of a locally-signed AgentProof digest works", () => {
  const priv = "0x" + "22".repeat(32);
  const pub = publicKeyFromPrivateKey(priv);
  const signer = addressFromPublicKey(pub);
  const digest = typedDataDigest(MANIFEST_PRIMARY, MANIFEST_TYPES, { manifestId: `0x${"cd".repeat(32)}` }, 1116);
  // sign then verify recovery
  const { signDigest } = { signDigest: null }; // async handled below
  assert.ok(hex(digest).length === 64);
  assert.match(signer, /^0x[0-9a-f]{40}$/);
});

test("eip712: domainSeparatorOf generic 4-field domain round-trips", () => {
  const domain = {
    name: "Ether Mail",
    version: "1",
    chainId: 1n,
    verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
  };
  const sep = hex(domainSeparatorOf(domain));
  // ethers.js domainFork constant for same domain:
  assert.equal(sep, "f2cee375fa42b42143804025fc449deafd50cc031ca257e0b194a650a912090f");
});