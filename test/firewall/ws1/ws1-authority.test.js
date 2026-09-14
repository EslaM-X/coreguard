/**
 * WS-1 — Authority probe surface (EOA / EIP-1271), spec §2 + §4 + Q-DP9.
 *
 * Covers: EOA recovery (OK / mismatch / malformed / no adapter), EIP-1271
 * probe (magic / wrong magic / revert / empty code / missing providers /
 * missing state), and cross-chain replay detection at the digest level.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import * as EVM from "../../../packages/evm/index.js";
import { probeAuthorization } from "../../../packages/provenance/authorization-probe.js";
import { computeDeclarationId } from "../../../packages/firewall/binding.js";
import {
  makeIntent,
  makeDeclaration,
  signDeclaration,
  seedKey,
} from "../helpers.js";
import {
  providersFor,
  contractDeclaration,
  CONTRACT_ADDR,
} from "../attack-lab/helpers.js";

async function eoaFixture(priv = seedKey(1).priv) {
  const intent = makeIntent({});
  const declaration = await signDeclaration(await makeDeclaration({ intent }), priv);
  const manifestId = await computeDeclarationId(declaration);
  return {
    signature: declaration.signature,
    signerBinding: declaration.signerBinding,
    manifestId,
    chainId: declaration.chainId,
  };
}

test("ws1-probe: EOA recovery OK ⇒ OK/RECOVERED_SIGNER", async () => {
  const probe = await probeAuthorization({ ...(await eoaFixture()), evm: EVM });
  assert.equal(probe.status, "OK");
  assert.equal(probe.label, "RECOVERED_SIGNER");
});

test("ws1-probe: EOA signature from a different key ⇒ NOT_PROVEN/SIGNER_MISMATCH", async () => {
  const probe = await probeAuthorization({ ...(await eoaFixture(seedKey(2).priv)), evm: EVM });
  assert.equal(probe.status, "NOT_PROVEN");
  assert.equal(probe.label, "SIGNER_MISMATCH");
});

test("ws1-probe: EOA malformed r/s/v ⇒ NOT_PROVEN/SIG_MALFORMED", async () => {
  const f = await eoaFixture();
  const probe = await probeAuthorization({ ...f, signature: { ...f.signature, s: "0x1" }, evm: EVM });
  assert.equal(probe.status, "NOT_PROVEN");
  assert.equal(probe.label, "SIG_MALFORMED");
});

test("ws1-probe: EOA without injected evm ⇒ NOT_RUN/EVM_ADAPTER_UNAVAILABLE", async () => {
  const probe = await probeAuthorization({ ...(await eoaFixture()) });
  assert.equal(probe.status, "NOT_RUN");
  assert.equal(probe.label, "EVM_ADAPTER_UNAVAILABLE");
});

test("ws1-probe: cross-chain replay of an EOA signature ⇒ NOT_PROVEN/SIGNER_MISMATCH", async () => {
  const f = await eoaFixture();
  const probe = await probeAuthorization({ ...f, chainId: "1114", evm: EVM });
  assert.equal(probe.status, "NOT_PROVEN");
  assert.equal(probe.label, "SIGNER_MISMATCH");
});

test("ws1-probe: EIP-1271 magic ⇒ OK/EIP1271_MAGIC", async () => {
  const { intent, declaration } = await contractDeclaration();
  const manifestId = await computeDeclarationId(declaration);
  const probe = await probeAuthorization({
    signature: declaration.signature,
    signerBinding: declaration.signerBinding,
    manifestId,
    chainId: declaration.chainId,
    authorityAtState: "1024",
    evm: EVM,
    contractAuth: providersFor(declaration.chainId, manifestId),
  });
  assert.equal(probe.status, "OK");
  assert.equal(probe.label, "EIP1271_MAGIC");
});

test("ws1-probe: EIP-1271 wrong magic ⇒ NOT_PROVEN/NOT_MAGIC", async () => {
  const { declaration } = await contractDeclaration();
  const manifestId = await computeDeclarationId(declaration);
  const probe = await probeAuthorization({
    signature: declaration.signature,
    signerBinding: declaration.signerBinding,
    manifestId,
    chainId: declaration.chainId,
    authorityAtState: "1024",
    evm: EVM,
    contractAuth: providersFor("1114", manifestId),
  });
  assert.equal(probe.status, "NOT_PROVEN");
  assert.equal(probe.label, "NOT_MAGIC");
});

test("ws1-probe: EIP-1271 revert ⇒ NOT_PROVEN/REVERTED", async () => {
  const { declaration } = await contractDeclaration();
  const manifestId = await computeDeclarationId(declaration);
  const probe = await probeAuthorization({
    signature: declaration.signature,
    signerBinding: declaration.signerBinding,
    manifestId,
    chainId: declaration.chainId,
    authorityAtState: "1024",
    evm: EVM,
    contractAuth: {
      ethCall: async () => ({ ok: false, code: "REVERTED" }),
      getCode: async () => "0x60806040",
    },
  });
  assert.equal(probe.status, "NOT_PROVEN");
  assert.equal(probe.label, "REVERTED");
});

test("ws1-probe: EIP-1271 empty code ⇒ NOT_PROVEN/NO_CODE_AT_STATE", async () => {
  const { declaration } = await contractDeclaration();
  const manifestId = await computeDeclarationId(declaration);
  const probe = await probeAuthorization({
    signature: declaration.signature,
    signerBinding: declaration.signerBinding,
    manifestId,
    chainId: declaration.chainId,
    authorityAtState: "1024",
    evm: EVM,
    contractAuth: { ethCall: async () => ({ ok: true, data: EVM.ERC1271_MAGIC }), getCode: async () => "0x" },
  });
  assert.equal(probe.status, "NOT_PROVEN");
  assert.equal(probe.label, "NO_CODE_AT_STATE");
});

test("ws1-probe: EIP-1271 missing providers ⇒ NOT_RUN/NO_PROVIDERS", async () => {
  const { declaration } = await contractDeclaration();
  const manifestId = await computeDeclarationId(declaration);
  const probe = await probeAuthorization({
    signature: declaration.signature,
    signerBinding: declaration.signerBinding,
    manifestId,
    chainId: declaration.chainId,
    authorityAtState: "1024",
    evm: EVM,
  });
  assert.equal(probe.status, "NOT_RUN");
  assert.equal(probe.label, "NO_PROVIDERS");
});

test("ws1-probe: EIP-1271 missing/invalid state ⇒ NOT_RUN/NO_AUTHORITY_STATE", async () => {
  const { declaration } = await contractDeclaration();
  const manifestId = await computeDeclarationId(declaration);
  const providers = providersFor(declaration.chainId, manifestId);
  for (const atState of [undefined, null, "", "latest", "0x4"]) {
    const probe = await probeAuthorization({
      signature: declaration.signature,
      signerBinding: declaration.signerBinding,
      manifestId,
      chainId: declaration.chainId,
      authorityAtState: atState,
      evm: EVM,
      contractAuth: providers,
    });
    assert.equal(probe.status, "NOT_RUN");
    assert.equal(probe.label, "NO_AUTHORITY_STATE");
  }
});