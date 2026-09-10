// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title EvidenceRegistry
/// @notice CoreGuard on-chain proof commitment registry
/// @dev Only commitments are stored on-chain. Full evidence stays off-chain.
contract EvidenceRegistry {
    error AlreadyCommitted(bytes32 id);
    error InvalidResultCode(uint8 result);

    mapping(bytes32 => bytes32) public proofCommitments;

    event IntentCommitted(
        bytes32 indexed intentId,
        bytes32 indexed commitment,
        uint256 timestamp
    );

    event ProofAnchored(
        bytes32 indexed proofId,
        bytes32 indexed commitment,
        uint8 result,
        uint256 timestamp
    );

    /// @notice Commit an intent hash before execution
    function commitIntent(bytes32 intentId, bytes32 commitment) external {
        if (proofCommitments[intentId] != bytes32(0)) {
            revert AlreadyCommitted(intentId);
        }
        proofCommitments[intentId] = commitment;
        emit IntentCommitted(intentId, commitment, block.timestamp);
    }

    /// @notice Anchor an execution proof after verification
    function anchorProof(
        bytes32 proofId,
        bytes32 commitment,
        uint8 result
    ) external {
        if (proofCommitments[proofId] != bytes32(0)) {
            revert AlreadyCommitted(proofId);
        }
        if (result > 2) {
            revert InvalidResultCode(result);
        }
        proofCommitments[proofId] = commitment;
        emit ProofAnchored(proofId, commitment, result, block.timestamp);
    }

    /// @notice Verify a commitment matches stored value
    function verifyCommitment(
        bytes32 id,
        bytes32 commitment
    ) external view returns (bool) {
        return proofCommitments[id] == commitment;
    }

    /// @notice Check if an ID has been committed
    function isCommitted(bytes32 id) external view returns (bool) {
        return proofCommitments[id] != bytes32(0);
    }
}
