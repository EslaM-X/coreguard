/**
 * Phase A — Delegation chain validation (CGEP/1 §7 DELEGATION_CHAIN, Q3).
 *
 * Chain is labeled authority→grantee; EIP-712 signed per link. Root authority
 * must equal the declarer root (tx signer for STAMP). Fail-closed on every
 * discontinuity and every link whose recovered signer != link.authority.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { verifyDelegationChain, verifyDelegationLinkSignature, delegationDigest } from "../../packages/provenance/delegation.js";
import { signDigest } from "../../packages/evm/index.js";
import { seedKey, makeAddress } from "./helpers.js";

const EVM = await import("../../packages/evm/index.js");
const CHAIN_ID = "1116";

function signerFor(i) {
  const k = seedKey(i);
  return k.address;
}

async function signedLink({ authority, grantedTo, chainId = CHAIN_ID, scopeActionHash = "0", maxValue = "0", validAfter = "0", expiresAt = "0", priv }) {
  const digest = await delegationDigest(
    { authority, grantedTo, scopeActionHash, maxValue, validAfter, expiresAt },
    chainId,
    EVM,
  );
  const sig = await signDigest(digest, priv);
  return { authority, grantedTo, scopeActionHash, maxValue, validAfter, expiresAt, signature: sig };
}

async function validChain(n = 2) {
  const head = seedKey(10); // agent authority
  const links = [];
  let authority = head.address;
  for (let i = 0; i < n; i += 1) {
    const kid = 20 + i;
    const k = seedKey(kid);
    const grantedTo = k.address;
    const link = await signedLink({ authority, grantedTo, priv: i === 0 ? head.priv : seedKey(20 + (i - 1)).priv });
    links.push(link);
    authority = grantedTo;
  }
  return { links, root: head.address, grantee: links[links.length - 1].grantedTo };
}

test("delegation: a single signed link passes in isolation", async () => {
  const head = seedKey(30);
  const grantee = seedKey(31);
  const link = await signedLink({ authority: head.address, grantedTo: grantee.address, priv: head.priv });
  const r = await verifyDelegationLinkSignature(link, CHAIN_ID, EVM);
  assert.equal(r.valid, true);
  assert.equal(r.status, "OK");
  assert.equal(r.signer.toLowerCase(), head.address.toLowerCase());
});

test("delegation: tampered authorized-grantee breaks replay (FAIL)", async () => {
  const head = seedKey(32);
  const grantee = seedKey(33);
  const link = await signedLink({ authority: head.address, grantedTo: grantee.address, priv: head.priv });
  const tampered = { ...link, grantedTo: makeAddress(999) };
  const r = await verifyDelegationLinkSignature(tampered, CHAIN_ID, EVM);
  assert.equal(r.valid, false);
  assert.equal(r.status, "NOT_PROVEN");
});

test("delegation: link signed by stranger (recovered != authority) is FAIL", async () => {
  const head = seedKey(34);
  const grantee = seedKey(35);
  const stranger = seedKey(36);
  const link = await signedLink({ authority: head.address, grantedTo: grantee.address, priv: stranger.priv });
  const r = await verifyDelegationLinkSignature(link, CHAIN_ID, EVM);
  assert.equal(r.valid, false);
  assert.equal(r.status, "NOT_PROVEN");
  assert.match(r.reason, /authority/);
});

test("delegation: no EVM adapter → NOT_RUN (never fabricated)", async () => {
  const head = seedKey(30);
  const grantee = seedKey(31);
  const link = await signedLink({ authority: head.address, grantedTo: grantee.address, priv: head.priv });
  const r = await verifyDelegationLinkSignature(link, CHAIN_ID, null);
  assert.equal(r.valid, false);
  assert.equal(r.status, "NOT_RUN");
  assert.match(r.reason, /NOT_RUN/);

  const chain = await verifyDelegationChain([link], { chainId: CHAIN_ID, rootAuthority: head.address, evm: null });
  assert.equal(chain.valid, false);
  assert.equal(chain.status, "NOT_RUN");
});

test("delegation: valid 2-link chain passes with correct grantee", async () => {
  const { links, root, grantee } = await validChain(2);
  const r = await verifyDelegationChain(links, { chainId: CHAIN_ID, rootAuthority: root, evm: EVM });
  assert.equal(r.valid, true);
  assert.equal(r.status, "OK");
  assert.equal(r.grantee.toLowerCase(), grantee.toLowerCase());
});

test("delegation: discontinuous chain (break in authority continuity) is FAIL", async () => {
  const head = seedKey(40);
  const link1 = await signedLink({ authority: head.address, grantedTo: seedKey(41).address, priv: head.priv });
  // link2 claims authority = a DIFFERENT address than link1.grantedTo
  const link2 = await signedLink({ authority: seedKey(99).address, grantedTo: seedKey(42).address, priv: seedKey(99).priv });
  const r = await verifyDelegationChain([link1, link2], { chainId: CHAIN_ID, rootAuthority: head.address, evm: EVM });
  assert.equal(r.valid, false);
  assert.equal(r.status, "NOT_PROVEN");
  assert.match(r.reason, /continue|authority/);
});

test("delegation: root authority mismatch vs tx signer is FAIL", async () => {
  const { links, grantee } = await validChain(2);
  const r = await verifyDelegationChain(links, { chainId: CHAIN_ID, rootAuthority: makeAddress(555), evm: EVM });
  assert.equal(r.valid, false);
  assert.equal(r.status, "NOT_PROVEN");
  assert.match(r.reason, /root/);
});

test("delegation: empty chain is FAIL (fail-closed)", async () => {
  const r = await verifyDelegationChain([], { chainId: CHAIN_ID, rootAuthority: makeAddress(1), evm: EVM });
  assert.equal(r.valid, false);
  assert.equal(r.status, "NOT_PROVEN");
});

test("delegation: execution BEFORE validAfter is FAIL at that block", async () => {
  const head = seedKey(50);
  const grantee = seedKey(51);
  const link = await signedLink({ authority: head.address, grantedTo: grantee.address, validAfter: "1000", expiresAt: "5000", priv: head.priv });
  const r = await verifyDelegationChain([link], { chainId: CHAIN_ID, rootAuthority: head.address, executionBlock: "500", evm: EVM });
  assert.equal(r.valid, false);
  assert.match(r.reason, /validAfter/);
});

test("delegation: execution AFTER expiresAt is FAIL at that block", async () => {
  const head = seedKey(52);
  const grantee = seedKey(53);
  const link = await signedLink({ authority: head.address, grantedTo: grantee.address, validAfter: "1000", expiresAt: "5000", priv: head.priv });
  const r = await verifyDelegationChain([link], { chainId: CHAIN_ID, rootAuthority: head.address, executionBlock: "6000", evm: EVM });
  assert.equal(r.valid, false);
  assert.match(r.reason, /expiresAt/);
});

test("delegation: execution inside [validAfter, expiresAt] passes", async () => {
  const head = seedKey(54);
  const grantee = seedKey(55);
  const link = await signedLink({ authority: head.address, grantedTo: grantee.address, validAfter: "1000", expiresAt: "5000", priv: head.priv });
  const r = await verifyDelegationChain([link], { chainId: CHAIN_ID, rootAuthority: head.address, executionBlock: "3000", evm: EVM });
  assert.equal(r.valid, true);
});

test("delegation: in-manifest revokedAt <= executionBlock makes link unusable (§5b)", async () => {
  const head = seedKey(56);
  const grantee = seedKey(57);
  const link = await signedLink({ authority: head.address, grantedTo: grantee.address, priv: head.priv });
  const revoked = { ...link, revokedAt: "4000" };
  const r = await verifyDelegationChain([revoked], { chainId: CHAIN_ID, rootAuthority: head.address, executionBlock: "4999", evm: EVM });
  assert.equal(r.valid, false);
  assert.match(r.reason, /revokedAt/);
});

test("delegation: chainId mismatch changes digest → replay FAIL", async () => {
  const head = seedKey(58);
  const grantee = seedKey(59);
  const link = await signedLink({ authority: head.address, grantedTo: grantee.address, chainId: "1116", priv: head.priv });
  // verify with a DIFFERENT chainId — digest differs, recovered != authority
  const r = await verifyDelegationLinkSignature(link, "1114", EVM);
  assert.equal(r.valid, false);
});