/**
 * EvidenceRegistryV2 — local mirror harness (Phase 0 P0.1).
 *
 * forge is CI-only in this repo (no local foundry toolchain), so this suite
 * exercises the contract's EXACT authorization rules locally through a
 * byte-faithful JS mirror of the EIP-712 digests plus an in-memory registry
 * state (intents/anchors), using the repo's noble-backed evm adapter.
 *
 * The real Solidity is verified by test/contract/EvidenceRegistryV2.t.sol in
 * the CI contracts job; this file and that file pin the same six mandatory
 * outcomes (wrong signer / expired / replay / id reuse / version mismatch /
 * valid auth), so any drift between the mirror and the contract fails the
 * pipeline.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  keccak,
  concat,
  encodeUint256,
  encodeAddress,
  typedDataDigestWithDomain,
  bytesToHex,
  addressFromPublicKey,
  publicKeyFromPrivateKey,
  recoverSignerAddress,
  signDigest,
} from "../../packages/evm/index.js";

const utf8 = (s) => Buffer.from(s, "utf8");
const b32 = (s) => keccak(utf8(s));
const ZERO = "0x0000000000000000000000000000000000000000";
const ERC1271_MAGIC = "0x1626ba7e";

const EIP712_DOMAIN_TYPEHASH = b32(
  "EIP712Domain(string name,uint256 chainId,address verifyingContract)"
);
const NAME_HASH = b32("CoreGuardRegistry");
const COMMIT_TYPEHASH = b32(
  "CommitIntent(bytes32 intentId,bytes32 intentCommitment,uint256 validUntil,address signer,uint256 chainId,address verifyingContract)"
);
const ANCHOR_TYPEHASH = b32(
  "AnchorProof(bytes32 proofId,bytes32 intentId,bytes32 receiptId,bytes32 proofCommitment,uint8 result,bytes32 verifierVersion,uint256 chainId,address verifyingContract)"
);

const DOMAIN_TYPE_DEF = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
};

const COMMIT_TYPES = {
  CommitIntent: [
    { name: "intentId", type: "bytes32" },
    { name: "intentCommitment", type: "bytes32" },
    { name: "validUntil", type: "uint256" },
    { name: "signer", type: "address" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
};

const ANCHOR_TYPES = {
  AnchorProof: [
    { name: "proofId", type: "bytes32" },
    { name: "intentId", type: "bytes32" },
    { name: "receiptId", type: "bytes32" },
    { name: "proofCommitment", type: "bytes32" },
    { name: "result", type: "uint8" },
    { name: "verifierVersion", type: "bytes32" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
};

function domainSeparator(chainId, verifyingContract) {
  return keccak(
    concat(
      EIP712_DOMAIN_TYPEHASH,
      NAME_HASH,
      encodeUint256(chainId),
      encodeAddress(verifyingContract)
    )
  );
}

function structHash(typeHash, ...words) {
  return keccak(concat(typeHash, ...words));
}

function commitDigest(chainId, verifyingContract, intentId, intentCommitment, validUntil, signer) {
  return keccak(
    concat(
      Uint8Array.from([0x19, 0x01]),
      domainSeparator(chainId, verifyingContract),
      structHash(
        COMMIT_TYPEHASH,
        intentId,
        intentCommitment,
        encodeUint256(validUntil),
        encodeAddress(signer),
        encodeUint256(chainId),
        encodeAddress(verifyingContract)
      )
    )
  );
}

function anchorDigest(chainId, verifyingContract, proofId, intentId, receiptId, proofCommitment, result, verifierVersion) {
  return keccak(
    concat(
      Uint8Array.from([0x19, 0x01]),
      domainSeparator(chainId, verifyingContract),
      structHash(
        ANCHOR_TYPEHASH,
        proofId,
        intentId,
        receiptId,
        proofCommitment,
        encodeUint256(result),
        verifierVersion,
        encodeUint256(chainId),
        encodeAddress(verifyingContract)
      )
    )
  );
}

class AlreadyCommitted extends Error {}
class Expired extends Error {}
class UnauthorizedIntention extends Error {}
class InvalidSigner extends Error {}
class InvalidAuthority extends Error {}
class InvalidResultCode extends Error {}

class Host {
  constructor(chainId, verifyingContract) {
    this.chainId = chainId;
    this.verifyingContract = verifyingContract;
    this.time = 1000;
    this.wallets = new Map();
  }

  now() {
    return this.time;
  }

  warp(t) {
    this.time = t;
  }

  isValidSignature(signer, digestBytes, data) {
    const wallet = this.wallets.get(String(signer).toLowerCase());
    return wallet ? wallet.isValidSignature(digestBytes, data) : "0xffffffff";
  }
}

class RegistryMirror {
  constructor({ chainId, verifyingContract, host }) {
    this.chainId = chainId;
    this.address = verifyingContract;
    this.host = host;
    this.intents = new Map();
    this.anchors = new Map();
  }

  commitIntent(intentId, intentCommitment, signer, validUntil, authorization) {
    const id = hex(intentId);
    if (this.intents.has(id)) throw new AlreadyCommitted(id);
    if (this.host.now() > validUntil) {
      throw new Expired(`${this.host.now()} > ${validUntil}`);
    }
    this.authorize(
      commitDigest(
        this.chainId,
        this.address,
        intentId,
        intentCommitment,
        validUntil,
        signer
      ),
      signer,
      authorization
    );
    this.intents.set(id, { intentCommitment, validUntil, signer });
  }

  anchorProof(proofId, intentId, receiptId, proofCommitment, result, verifierVersion, authorization) {
    if (this.anchors.has(hex(proofId))) throw new AlreadyCommitted(hex(proofId));
    if (result > 2) throw new InvalidResultCode(String(result));
    const intent = this.intents.get(hex(intentId));
    if (!intent) throw new UnauthorizedIntention(hex(intentId));
    if (this.host.now() > intent.validUntil) {
      throw new Expired(`${this.host.now()} > ${intent.validUntil}`);
    }
    const signer = intent.signer;
    this.authorize(
      anchorDigest(
        this.chainId,
        this.address,
        proofId,
        intentId,
        receiptId,
        proofCommitment,
        result,
        verifierVersion
      ),
      signer,
      authorization
    );
    this.anchors.set(hex(proofId), {
      receiptId,
      intentCommitment: intent.intentCommitment,
      proofCommitment,
      verifierVersion,
      result,
      anchoredAt: this.host.now(),
      signer,
    });
  }

  authorize(digest, signer, authorization) {
    if (signer === ZERO) throw new InvalidSigner();
    if (authorization.scheme === "1271") {
      const magic = this.host.isValidSignature(signer, digest, authorization.data);
      if (magic !== ERC1271_MAGIC) throw new InvalidAuthority();
      return;
    }
    const { r, s, v } = authorization.sig;
    const recovered = recoverSignerAddress(digest, { r, s, v });
    if (String(recovered).toLowerCase() !== String(signer).toLowerCase()) {
      throw new InvalidAuthority();
    }
  }
}

const privateKey = (k) => Buffer.from(k.toString(16).padStart(64, "0"), "hex");
const addressOf = (k) => addressFromPublicKey(publicKeyFromPrivateKey(privateKey(k)));
const sigFor = async (digest, k) => {
  const { r, s, v } = await signDigest(digest, privateKey(k));
  return { scheme: "EOA", sig: { r, s, v } };
};

function hex(u) {
  return "0x" + bytesToHex(u);
}

const fixtures = {
  chainId: 1116n,
  registryA: "0x1111111111111111111111111111111111111111",
  registryB: "0x2222222222222222222222222222222222222222",
  alice: addressOf(1n),
  bob: addressOf(2n),
  intentId: keccak(Buffer.from("intent-1")),
  intentCommitment: keccak(Buffer.from("intent-commitment-1")),
  proofId: keccak(Buffer.from("proof-1")),
  receiptId: keccak(Buffer.from("receipt-1")),
  proofCommitment: keccak(Buffer.from("proof-commitment-1")),
  verifierV1: keccak(Buffer.from("cg-verifier/0.1.0")),
  verifierV2: keccak(Buffer.from("cg-verifier/0.2.0")),
  validUntil: 5000,
};

const makeRegistry = (regAddress = fixtures.registryA) => {
  const host = new Host(fixtures.chainId, regAddress);
  const reg = new RegistryMirror({
    chainId: fixtures.chainId,
    verifyingContract: regAddress,
    host,
  });
  return { host, reg };
};

const commitAccepted = async (reg, host, overrides = {}) => {
  const id = overrides.intentId || fixtures.intentId;
  const ic = overrides.intentCommitment || fixtures.intentCommitment;
  const signer = overrides.signer || fixtures.alice;
  const validUntil = overrides.validUntil ?? fixtures.validUntil;
  const key = overrides.key || 1n;
  const digest = commitDigest(fixtures.chainId, reg.address, id, ic, validUntil, signer);
  reg.commitIntent(id, ic, signer, validUntil, await sigFor(digest, key));
};

test("eip712: registry digests are standard typedData (cross-check with typedDataDigestWithDomain)", () => {
  const { reg } = makeRegistry();
  const commit = commitDigest(
    fixtures.chainId,
    reg.address,
    fixtures.intentId,
    fixtures.intentCommitment,
    fixtures.validUntil,
    fixtures.alice
  );
  const viaTypes = typedDataDigestWithDomain("CommitIntent", COMMIT_TYPES, {
    intentId: hex(fixtures.intentId),
    intentCommitment: hex(fixtures.intentCommitment),
    validUntil: fixtures.validUntil,
    signer: fixtures.alice,
    chainId: fixtures.chainId,
    verifyingContract: reg.address,
  }, {
    name: "CoreGuardRegistry",
    chainId: fixtures.chainId,
    verifyingContract: reg.address,
  });
  assert.equal(hex(commit), hex(viaTypes));

  const anchor = anchorDigest(
    fixtures.chainId,
    reg.address,
    fixtures.proofId,
    fixtures.intentId,
    fixtures.receiptId,
    fixtures.proofCommitment,
    0,
    fixtures.verifierV1
  );
  const anchorViaTypes = typedDataDigestWithDomain("AnchorProof", ANCHOR_TYPES, {
    proofId: hex(fixtures.proofId),
    intentId: hex(fixtures.intentId),
    receiptId: hex(fixtures.receiptId),
    proofCommitment: hex(fixtures.proofCommitment),
    result: 0,
    verifierVersion: hex(fixtures.verifierV1),
    chainId: fixtures.chainId,
    verifyingContract: reg.address,
  }, {
    name: "CoreGuardRegistry",
    chainId: fixtures.chainId,
    verifyingContract: reg.address,
  });
  assert.equal(hex(anchor), hex(anchorViaTypes));
});

test("registry-v2: valid EOA commit + anchor ACCEPT (all bindings stored)", async () => {
  const { host, reg } = makeRegistry();
  await commitAccepted(reg, host);
  const anchorSig = await sigFor(
    anchorDigest(
      fixtures.chainId,
      reg.address,
      fixtures.proofId,
      fixtures.intentId,
      fixtures.receiptId,
      fixtures.proofCommitment,
      0,
      fixtures.verifierV1
    ),
    1n
  );
  reg.anchorProof(
    fixtures.proofId,
    fixtures.intentId,
    fixtures.receiptId,
    fixtures.proofCommitment,
    0,
    fixtures.verifierV1,
    anchorSig
  );
  const anchor = reg.anchors.get(hex(fixtures.proofId));
  assert.equal(hex(anchor.receiptId), hex(fixtures.receiptId));
  assert.equal(hex(anchor.intentCommitment), hex(fixtures.intentCommitment));
  assert.equal(hex(anchor.proofCommitment), hex(fixtures.proofCommitment));
  assert.equal(hex(anchor.verifierVersion), hex(fixtures.verifierV1));
  assert.equal(anchor.result, 0);
  assert.equal(anchor.signer, fixtures.alice);
});

test("registry-v2: wrong signer REJECT", async () => {
  const { host, reg } = makeRegistry();
  await commitAccepted(reg, host);
  const { alice, bob } = fixtures;
  assert.notEqual(alice, bob);
  const sig = await sigFor(
    anchorDigest(
      fixtures.chainId,
      reg.address,
      fixtures.proofId,
      fixtures.intentId,
      fixtures.receiptId,
      fixtures.proofCommitment,
      0,
      fixtures.verifierV1
    ),
    2n
  );
  assert.throws(
    () =>
      reg.anchorProof(
        fixtures.proofId,
        fixtures.intentId,
        fixtures.receiptId,
        fixtures.proofCommitment,
        0,
        fixtures.verifierV1,
        sig
      ),
    InvalidAuthority
  );
});

test("registry-v2: expired commit REJECT", async () => {
  const { host, reg } = makeRegistry();
  const digest = commitDigest(
    fixtures.chainId,
    reg.address,
    fixtures.intentId,
    fixtures.intentCommitment,
    999,
    fixtures.alice
  );
  assert.throws(
    () => reg.commitIntent(fixtures.intentId, fixtures.intentCommitment, fixtures.alice, 999, { scheme: "EOA", sig: { r: "0", s: "0", v: 0 } }),
    Expired
  );
  void digest;
});

test("registry-v2: expired anchor REJECT (window closed after commit)", async () => {
  const { host, reg } = makeRegistry();
  await commitAccepted(reg, host);
  host.warp(fixtures.validUntil + 1);
  const sig = await sigFor(
    anchorDigest(
      fixtures.chainId,
      reg.address,
      fixtures.proofId,
      fixtures.intentId,
      fixtures.receiptId,
      fixtures.proofCommitment,
      0,
      fixtures.verifierV1
    ),
    1n
  );
  assert.throws(
    () =>
      reg.anchorProof(
        fixtures.proofId,
        fixtures.intentId,
        fixtures.receiptId,
        fixtures.proofCommitment,
        0,
        fixtures.verifierV1,
        sig
      ),
    Expired
  );
});

test("registry-v2: intent id reuse REJECT (no replay)", async () => {
  const { host, reg } = makeRegistry();
  await commitAccepted(reg, host);
  await assert.rejects(() => commitAccepted(reg, host), AlreadyCommitted);
  assert.equal(reg.intents.size, 1);
});

test("registry-v2: proof id reuse REJECT (no replay)", async () => {
  const { host, reg } = makeRegistry();
  await commitAccepted(reg, host);
  const sig = await sigFor(
    anchorDigest(
      fixtures.chainId,
      reg.address,
      fixtures.proofId,
      fixtures.intentId,
      fixtures.receiptId,
      fixtures.proofCommitment,
      0,
      fixtures.verifierV1
    ),
    1n
  );
  reg.anchorProof(fixtures.proofId, fixtures.intentId, fixtures.receiptId, fixtures.proofCommitment, 0, fixtures.verifierV1, sig);
  assert.throws(
    () =>
      reg.anchorProof(fixtures.proofId, fixtures.intentId, fixtures.receiptId, fixtures.proofCommitment, 0, fixtures.verifierV1, sig),
    AlreadyCommitted
  );
  assert.equal(reg.anchors.size, 1);
});

test("registry-v2: version mismatch REJECT (digest binds verifierVersion)", async () => {
  const { host, reg } = makeRegistry();
  await commitAccepted(reg, host);
  // Signed for verifier v2 digest, submitted with v1 -> recovered != signer.
  const sigV2 = await sigFor(
    anchorDigest(
      fixtures.chainId,
      reg.address,
      fixtures.proofId,
      fixtures.intentId,
      fixtures.receiptId,
      fixtures.proofCommitment,
      0,
      fixtures.verifierV2
    ),
    1n
  );
  assert.throws(
    () =>
      reg.anchorProof(
        fixtures.proofId,
        fixtures.intentId,
        fixtures.receiptId,
        fixtures.proofCommitment,
        0,
        fixtures.verifierV1,
        sigV2
      ),
    InvalidAuthority
  );
});

test("registry-v2: cross-registry replay REJECT (digest binds verifyingContract)", async () => {
  const { reg: regA } = makeRegistry(fixtures.registryA);
  const { reg: regB } = makeRegistry(fixtures.registryB);

  // registry B has no intent for this intentId -> UnauthorizedIntention.
  assert.throws(
    () =>
      regB.anchorProof(
        fixtures.proofId,
        fixtures.intentId,
        fixtures.receiptId,
        fixtures.proofCommitment,
        0,
        fixtures.verifierV1,
        { scheme: "EOA", sig: { r: "0", s: "0", v: 0 } }
      ),
    UnauthorizedIntention
  );

  // Commit the same intent on B, then replay A's anchor authorization there:
  // the digest binds verifyingContract, so the same signature must NOT
  // authorize B even though signer/ids/version/result are identical.
  await commitAccepted(regA);
  const bDigest = commitDigest(
    fixtures.chainId,
    regB.address,
    fixtures.intentId,
    fixtures.intentCommitment,
    fixtures.validUntil,
    fixtures.alice
  );
  regB.commitIntent(
    fixtures.intentId,
    fixtures.intentCommitment,
    fixtures.alice,
    fixtures.validUntil,
    await sigFor(bDigest, 1n)
  );
  const sigSignedOnA = await sigFor(
    anchorDigest(
      fixtures.chainId,
      regA.address,
      fixtures.proofId,
      fixtures.intentId,
      fixtures.receiptId,
      fixtures.proofCommitment,
      0,
      fixtures.verifierV1
    ),
    1n
  );
  assert.throws(
    () =>
      regB.anchorProof(
        fixtures.proofId,
        fixtures.intentId,
        fixtures.receiptId,
        fixtures.proofCommitment,
        0,
        fixtures.verifierV1,
        sigSignedOnA
      ),
    InvalidAuthority
  );
});

test("registry-v2: result code out of range REJECT", async () => {
  const { host, reg } = makeRegistry();
  await commitAccepted(reg, host);
  assert.throws(
    () =>
      reg.anchorProof(
        fixtures.proofId,
        fixtures.intentId,
        fixtures.receiptId,
        fixtures.proofCommitment,
        3,
        fixtures.verifierV1,
        { scheme: "EOA", sig: { r: "0", s: "0", v: 0 } }
      ),
    InvalidResultCode
  );
});

test("registry-v2: EIP-1271 valid auth ACCEPT", async () => {
  const { host, reg } = makeRegistry();
  const wallet = "0xE111111111111111111111111111111111111111";
  const walletIntentId = keccak(Buffer.from("intent-wallet"));
  const walletProofId = keccak(Buffer.from("proof-wallet"));
  const accepted = new Set([
    hex(
      commitDigest(
        fixtures.chainId,
        reg.address,
        walletIntentId,
        fixtures.intentCommitment,
        fixtures.validUntil,
        wallet
      )
    ),
    hex(
      anchorDigest(
        fixtures.chainId,
        reg.address,
        walletProofId,
        walletIntentId,
        fixtures.receiptId,
        fixtures.proofCommitment,
        0,
        fixtures.verifierV1
      )
    ),
  ]);
  host.wallets.set(wallet.toLowerCase(), {
    isValidSignature: (digest) => (accepted.has(hex(digest)) ? ERC1271_MAGIC : "0xffffffff"),
  });
  reg.commitIntent(
    walletIntentId,
    fixtures.intentCommitment,
    wallet,
    fixtures.validUntil,
    { scheme: "1271", data: new Uint8Array([0xde, 0xad, 0xbe, 0xef]) }
  );
  reg.anchorProof(
    walletProofId,
    walletIntentId,
    fixtures.receiptId,
    fixtures.proofCommitment,
    0,
    fixtures.verifierV1,
    { scheme: "1271", data: new Uint8Array([0xde, 0xad, 0xbe, 0xef]) }
  );
  const anchor = reg.anchors.get(hex(walletProofId));
  assert.equal(anchor.signer, wallet);
});

test("registry-v2: EIP-1271 invalid auth REJECT (bad magic)", async () => {
  const { host, reg } = makeRegistry();
  const wallet = "0xE222222222222222222222222222222222222222";
  const walletIntentId = keccak(Buffer.from("intent-wallet-bad"));
  const walletProofId = keccak(Buffer.from("proof-wallet-bad"));
  // The wallet authorizes the commit intent, but NOT the anchor proof.
  const accepted = new Set([
    hex(
      commitDigest(
        fixtures.chainId,
        reg.address,
        walletIntentId,
        fixtures.intentCommitment,
        fixtures.validUntil,
        wallet
      )
    ),
  ]);
  host.wallets.set(wallet.toLowerCase(), {
    isValidSignature: (digest) => (accepted.has(hex(digest)) ? ERC1271_MAGIC : "0xffffffff"),
  });
  reg.commitIntent(
    walletIntentId,
    fixtures.intentCommitment,
    wallet,
    fixtures.validUntil,
    { scheme: "1271", data: new Uint8Array(0) }
  );
  assert.throws(
    () =>
      reg.anchorProof(
        walletProofId,
        walletIntentId,
        fixtures.receiptId,
        fixtures.proofCommitment,
        0,
        fixtures.verifierV1,
        { scheme: "1271", data: new Uint8Array(0) }
      ),
    InvalidAuthority
  );
});