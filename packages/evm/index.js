/**
 * CoreGuard EVM signer adapter — public surface.
 *
 * Dependency-isolated: this is the ONLY @coreguard package that pulls in
 * @noble/curves + @noble/hashes. Consumers (packages/provenance, verifier)
 * either import from here directly or load it through an adapter gate, so the
 * zero-dependency core never sees noble tree-shake through it.
 */

export { keccak, keccakHex } from "./keccak256.js";
export { hexToBytes, asBytes, concat, bytesToHex } from "./bytes.js";
export {
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
  encodeUint256,
  encodeAddress,
  encodeString,
  encodeType,
  encodeData,
  domainSeparator,
  domainSeparatorOf,
  typedDataDigest,
  typedDataDigestWithDomain,
} from "./signer/eip712.js";
export {
  publicKeyFromPrivateKey,
  recoverSignerAddress,
  signDigest,
  to32,
} from "./signer/secp256k1.js";
export { addressFromPublicKey } from "./signer/address.js";
export {
  ERC1271_MAGIC,
  ERC1271_FN_SIG,
  erc1271Selector,
  isValidSignatureCalldata,
  decodeIsValidSignatureReturn,
  isErc1271Magic,
} from "./erc1271.js";