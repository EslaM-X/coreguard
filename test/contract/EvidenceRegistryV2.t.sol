// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Foundry tests for EvidenceRegistryV2 (Phase 0 P0.1).
 *
 * Self-contained: no forge-std dependency (repo has no lib/); the Vm
 * cheatcode interface is declared locally and assertions use require().
 * Run in CI (contracts job): forge test --match-path "test/contract/*".
 *
 * Mirrors the rules locally verified by test/anchor/registry-v2.test.mjs:
 *   - valid EOA commit + anchor                          => ACCEPT
 *   - wrong signer                                       => REJECT
 *   - expired (commit and anchor windows)                => REJECT
 *   - replay / id reuse (intentId + proofId)             => REJECT
 *   - version mismatch                                   => REJECT
 *   - cross-registry replay (different verifyingContract)=> REJECT
 *   - result code out of range                           => REJECT
 *   - EIP-1271 valid / invalid                           => ACCEPT / REJECT
 *   - unknown intent on anchor                           => REJECT
 */

import { EvidenceRegistryV2 } from "../../contracts/EvidenceRegistryV2.sol";

interface Vm {
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function warp(uint256) external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
}

contract Mock1271 {
    bool private _valid;

    constructor(bool valid) {
        _valid = valid;
    }

    function isValidSignature(bytes32, bytes calldata) external view returns (bytes4) {
        return _valid ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}

contract EvidenceRegistryV2Test {
    Vm constant vm = Vm(address(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D));

    EvidenceRegistryV2 internal registry;
    address internal alice;
    address internal bob;

    uint256 internal constant ALICE_KEY = 0x01;
    uint256 internal constant BOB_KEY = 0x02;
    uint256 internal constant WALLET_KEY = 0x03;

    bytes32 internal constant INTENT_ID = keccak256("intent-1");
    bytes32 internal constant INTENT_COMMITMENT = keccak256("intent-commitment-1");
    bytes32 internal constant PROOF_ID = keccak256("proof-1");
    bytes32 internal constant RECEIPT_ID = keccak256("receipt-1");
    bytes32 internal constant PROOF_COMMITMENT = keccak256("proof-commitment-1");
    bytes32 internal constant VERIFIER_V1 = keccak256("cg-verifier/0.1.0");
    bytes32 internal constant VERIFIER_V2 = keccak256("cg-verifier/0.2.0");

    uint256 internal constant NOW = 1000;
    uint256 internal constant VALID_UNTIL = 5000;

    function setUp() public {
        registry = new EvidenceRegistryV2();
        alice = vm.addr(ALICE_KEY);
        bob = vm.addr(BOB_KEY);
        vm.warp(NOW);
    }

    function _sign(bytes32 digest, uint256 key) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _commit(
        EvidenceRegistryV2 reg,
        bytes32 intentId,
        bytes32 commitment,
        address signer,
        uint256 validUntil,
        uint256 key
    ) internal {
        reg.commitIntent(intentId, commitment, signer, validUntil, _sign(reg.commitIntentDigest(intentId, commitment, validUntil, signer), key));
    }

    function _anchor(
        EvidenceRegistryV2 reg,
        bytes32 proofId,
        bytes32 intentId,
        bytes32 receiptId,
        bytes32 commitment,
        uint8 result,
        bytes32 verifierVersion,
        uint256 key
    ) internal {
        reg.anchorProof(
            proofId,
            intentId,
            receiptId,
            commitment,
            result,
            verifierVersion,
            _sign(reg.anchorProofDigest(proofId, intentId, receiptId, commitment, result, verifierVersion), key)
        );
    }

    function testVERSIONIsPinned() public {
        require(registry.VERSION() == registry.VERSION_KECCAK(), "VERSION not pinned");
    }

    function testCommitAccepted() public {
        _commit(registry, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
        (bytes32 storedCommitment, , , uint256 validUntil, address signer) = registry.intentCommits(INTENT_ID);
        require(storedCommitment == INTENT_COMMITMENT, "commitment not stored");
        require(validUntil == VALID_UNTIL, "validUntil not stored");
        require(signer == alice, "signer not stored");
    }

    function testAnchorAcceptedAndBound() public {
        _commit(registry, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
        _anchor(registry, PROOF_ID, INTENT_ID, RECEIPT_ID, PROOF_COMMITMENT, uint8(EvidenceRegistryV2.ProofResult.VALID), VERIFIER_V1, ALICE_KEY);
        (
            bytes32 receiptId,
            bytes32 intentCommitment,
            bytes32 proofCommitment,
            bytes32 verifierVersion,
            ,
            uint8 result,
            address signer
        ) = registry.proofAnchors(PROOF_ID);
        require(receiptId == RECEIPT_ID, "receiptId not bound");
        require(intentCommitment == INTENT_COMMITMENT, "intentCommitment not bound");
        require(proofCommitment == PROOF_COMMITMENT, "proofCommitment not bound");
        require(verifierVersion == VERIFIER_V1, "verifierVersion not bound");
        require(result == uint8(EvidenceRegistryV2.ProofResult.VALID), "result not bound");
        require(signer == alice, "signer not bound");
    }

    function testWrongSignerReverts() public {
        _commit(registry, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
        // Bob signs the anchor authorization for Alice's intent -> validate rejects.
        vm.expectRevert(EvidenceRegistryV2.InvalidAuthority.selector);
        _anchor(registry, PROOF_ID, INTENT_ID, RECEIPT_ID, PROOF_COMMITMENT, uint8(EvidenceRegistryV2.ProofResult.VALID), VERIFIER_V1, BOB_KEY);
    }

    function testCommitExpiredReverts() public {
        vm.expectRevert(abi.encodeWithSelector(EvidenceRegistryV2.Expired.selector, NOW, NOW - 1));
        _commit(registry, INTENT_ID, INTENT_COMMITMENT, alice, NOW - 1, ALICE_KEY);
    }

    function testAnchorExpiredReverts() public {
        _commit(registry, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
        vm.warp(VALID_UNTIL + 1);
        vm.expectRevert(abi.encodeWithSelector(EvidenceRegistryV2.Expired.selector, VALID_UNTIL + 1, VALID_UNTIL));
        _anchor(registry, PROOF_ID, INTENT_ID, RECEIPT_ID, PROOF_COMMITMENT, uint8(EvidenceRegistryV2.ProofResult.VALID), VERIFIER_V1, ALICE_KEY);
    }

    function testIntentIdReuseReverts() public {
        _commit(registry, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
        vm.expectRevert(abi.encodeWithSelector(EvidenceRegistryV2.AlreadyCommitted.selector, INTENT_ID));
        _commit(registry, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
    }

    function testProofIdReuseReverts() public {
        _commit(registry, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
        _anchor(registry, PROOF_ID, INTENT_ID, RECEIPT_ID, PROOF_COMMITMENT, uint8(EvidenceRegistryV2.ProofResult.VALID), VERIFIER_V1, ALICE_KEY);
        vm.expectRevert(abi.encodeWithSelector(EvidenceRegistryV2.AlreadyCommitted.selector, PROOF_ID));
        _anchor(registry, PROOF_ID, INTENT_ID, RECEIPT_ID, PROOF_COMMITMENT, uint8(EvidenceRegistryV2.ProofResult.VALID), VERIFIER_V1, ALICE_KEY);
    }

    function testVersionMismatchReverts() public {
        _commit(registry, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
        // Signed for verifier 0.2.0, submitted with 0.1.0 -> digest differs -> REJECT.
        vm.expectRevert(EvidenceRegistryV2.InvalidAuthority.selector);
        registry.anchorProof(
            PROOF_ID,
            INTENT_ID,
            RECEIPT_ID,
            PROOF_COMMITMENT,
            uint8(EvidenceRegistryV2.ProofResult.VALID),
            VERIFIER_V1,
            _sign(registry.anchorProofDigest(PROOF_ID, INTENT_ID, RECEIPT_ID, PROOF_COMMITMENT, uint8(EvidenceRegistryV2.ProofResult.VALID), VERIFIER_V2), ALICE_KEY)
        );
    }

    function testCrossRegistryReplayReverts() public {
        _commit(registry, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
        // Authorization signed for `registry`... re-submitted against a fresh instance.
        EvidenceRegistryV2 other = new EvidenceRegistryV2();
        vm.expectRevert(EvidenceRegistryV2.InvalidAuthority.selector);
        other.anchorProof(
            PROOF_ID,
            INTENT_ID,
            RECEIPT_ID,
            PROOF_COMMITMENT,
            uint8(EvidenceRegistryV2.ProofResult.VALID),
            VERIFIER_V1,
            _sign(registry.anchorProofDigest(PROOF_ID, INTENT_ID, RECEIPT_ID, PROOF_COMMITMENT, uint8(EvidenceRegistryV2.ProofResult.VALID), VERIFIER_V1), ALICE_KEY)
        );
    }

    function testResultCodeOutOfRangeReverts() public {
        _commit(registry, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
        vm.expectRevert(abi.encodeWithSelector(EvidenceRegistryV2.InvalidResultCode.selector, 3));
        registry.anchorProof(
            PROOF_ID,
            INTENT_ID,
            RECEIPT_ID,
            PROOF_COMMITMENT,
            3,
            VERIFIER_V1,
            _sign(registry.anchorProofDigest(PROOF_ID, INTENT_ID, RECEIPT_ID, PROOF_COMMITMENT, 3, VERIFIER_V1), ALICE_KEY)
        );
    }

    function testUnknownIntentReverts() public {
        vm.expectRevert(abi.encodeWithSelector(EvidenceRegistryV2.UnauthorizedIntention.selector, INTENT_ID));
        _anchor(registry, PROOF_ID, INTENT_ID, RECEIPT_ID, PROOF_COMMITMENT, uint8(EvidenceRegistryV2.ProofResult.VALID), VERIFIER_V1, ALICE_KEY);
    }

    function testEIP1271Accepted() public {
        Mock1271 wallet = new Mock1271(true);
        bytes32 walletIntentId = keccak256("intent-wallet");
        _commit(registry, walletIntentId, INTENT_COMMITMENT, address(wallet), VALID_UNTIL, WALLET_KEY);
        bytes32 walletProofId = keccak256("proof-wallet");
        registry.anchorProof(
            walletProofId,
            walletIntentId,
            RECEIPT_ID,
            PROOF_COMMITMENT,
            uint8(EvidenceRegistryV2.ProofResult.VALID),
            VERIFIER_V1,
            hex"deadbeef"
        );
        (bytes32 storedReceiptId, , , , , , address storedSigner) = registry.proofAnchors(walletProofId);
        require(storedReceiptId == RECEIPT_ID, "1271 anchor not stored");
        require(storedSigner == address(wallet), "1271 signer not stored");
    }

    function testEIP1271Rejected() public {
        Mock1271 wallet = new Mock1271(false);
        bytes32 walletIntentId = keccak256("intent-wallet-bad");
        _commit(registry, walletIntentId, INTENT_COMMITMENT, address(wallet), VALID_UNTIL, WALLET_KEY);
        vm.expectRevert(EvidenceRegistryV2.InvalidAuthority.selector);
        registry.anchorProof(
            keccak256("proof-wallet-bad"),
            walletIntentId,
            RECEIPT_ID,
            PROOF_COMMITMENT,
            uint8(EvidenceRegistryV2.ProofResult.VALID),
            VERIFIER_V1,
            hex"deadbeef"
        );
    }
}