/**
 * CoreGuard Firewall — test fixtures & sign helpers.
 *
 * Deterministic secp256k1 keys (mirror test/provenance/helpers.js); builds
 * canonical intents (packages/intent), signed firewall declarations (EOA
 * EIP-712 envelope over the same ManifestDeclaration(bytes32 manifestId) digest
 * AgentProof uses), committed policies, and consistent simulation summaries.
 */

import { createIntent } from "../../packages/intent/index.js";
import { createPolicy } from "../../packages/policy/index.js";
import { typedDataDigest, signDigest, keccak, publicKeyFromPrivateKey, addressFromPublicKey } from "../../packages/evm/index.js";
import { computeDeclarationId } from "../../packages/firewall/binding.js";

const TYPES = { ManifestDeclaration: [{ name: "manifestId", type: "bytes32" }] };

const pad = (n, len) => String(n).padStart(len, "0");

export function seedKey(i) {
  const digest = keccak(`CGEP firewall test key ${i}`);
  const privHex = Buffer.from(digest).toString("hex");
  const pub = publicKeyFromPrivateKey(privHex);
  const address = addressFromPublicKey(pub);
  return { priv: privHex, address, i };
}

export function makeAddress(seed) {
  return "0x" + pad(seed.toString(16), 40);
}

export function makeTxHash(seed) {
  return "0x" + pad(seed.toString(16), 64);
}

export function makeIntent(overrides = {}) {
  const k = seedKey(overrides.key ?? 1);
  return createIntent({
    chainId: overrides.chainId ?? "1116",
    signer: overrides.signer ?? k.address,
    nonce: overrides.nonce ?? "1",
    validAfter: overrides.validAfter ?? "0",
    validUntil: overrides.validUntil ?? "100000",
    action: overrides.action ?? "TRANSFER",
    target: overrides.target ?? makeAddress(0xbb),
    selector: overrides.selector ?? "0xa9059cbb",
    asset: (overrides.asset ?? "0x0000000000000000000000000000000000000001"),
    amount: overrides.amount ?? "1000000000000000000",
    recipient: overrides.recipient ?? makeAddress(0xcc),
    minOut: overrides.minOut,
    constraints: overrides.constraints ?? [],
  });
}

export async function makeDeclaration({ intent, signerBinding, chainId, nonce, signature }) {
  const d = {
    version: "CGEP/1",
    kind: "INTENT_DECLARATION",
    chainId: String(chainId ?? intent.chainId),
    nonce: String(nonce ?? (intent.nonce ?? "0")),
    signerBinding: signerBinding ?? { address: intent.signer },
    intent,
  };
  d.manifestId = await computeDeclarationId(d);
  if (signature) d.signature = signature;
  return d;
}

export async function signDeclaration(declaration, priv, chainId) {
  const d = { ...declaration };
  delete d.manifestId;
  delete d.signature;
  d.manifestId = await computeDeclarationId(d);
  const digest = typedDataDigest("ManifestDeclaration", TYPES, { manifestId: d.manifestId }, chainId ?? d.chainId);
  const sig = await signDigest(digest, priv);
  d.signature = {
    scheme: "EIP-712",
    signer: d.signerBinding.address,
    ...sig,
    digest: "0x" + Buffer.from(digest).toString("hex"),
  };
  return d;
}

export function makePolicy(rules = [], policyId = "pol-default") {
  return createPolicy({ policyId, name: "firewall test policy", rules });
}

export function makeSimulation(overrides = {}, intent = makeIntent()) {
  return {
    target: overrides.target ?? intent.target,
    selector: overrides.selector ?? intent.selector,
    recipient: overrides.recipient ?? intent.recipient,
    amount: overrides.amount ?? intent.amount,
    gasUsed: overrides.gasUsed ?? "60000",
    blockTimestamp: overrides.blockTimestamp ?? "1",
    ...overrides,
  };
}

export const DEFAULT_REVIEW_PATH = (writers = [makeAddress(0x77)]) => ({
  configured: true,
  states: [],
  writers,
});