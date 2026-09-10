// CoreGuard EvidenceRegistry deployment script.
//
// Usage (Core Testnet2, chain ID 1114 — requires --legacy):
//   forge script script/Deploy.s.sol:DeployEvidenceRegistry \
//     --rpc-url ${RPC_TESTNET2} \
//     --private-key ${PRIVATE_KEY} \
//     --legacy \
//     --broadcast
//
// Verify on CoreScan:
//   forge verify-contract \
//     --chain 1114 \
//     --rpc-url ${RPC_TESTNET2} \
//     --compiler-version 0.8.24 \
//     <DEPLOYED_ADDRESS> \
//     contracts/EvidenceRegistry.sol:EvidenceRegistry
//
// Faucet: https://scan.test2.btcs.network/faucet

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EvidenceRegistry} from "../contracts/EvidenceRegistry.sol";

contract DeployEvidenceRegistry {
  function run() external returns (EvidenceRegistry registry) {
    registry = new EvidenceRegistry();
  }
}