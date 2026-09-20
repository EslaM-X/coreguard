// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Foundry tests for EvidenceRegistryV3 (DApp on Core: evidence + commission).
 *
 * Same discipline as EvidenceRegistryV2.t.sol: no forge-std, local Vm
 * interface, require() assertions. Run in CI (contracts job):
 * forge test --match-path "test/contract/*".
 *
 * V3 mirrors the full V2 rule surface (replay, expiry, authority, result
 * range, 1271) and adds the commission surface:
 *   - flat feeWei charged per anchorProof; payer must send exactly feeWei
 *   - CommissionMismatch on overpay/underpay
 *   - zero fee => pure V2 behavior (free anchors)
 *   - treasury accumulates commissions; only feeTo can withdraw
 *   - cross-registry replay still rejected (domain separator)
 */

import { EvidenceRegistryV3 } from "../../contracts/EvidenceRegistryV3.sol";

interface Vm {
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function warp(uint256) external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
    function deal(address, uint256) external;
    function expectEmit(bool, bool, bool, bool) external;
    function prank(address) external;
}

interface IERC1271 {
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4);
}

contract Mock1271V3 is IERC1271 {
    bool private _valid;

    constructor(bool valid) {
        _valid = valid;
    }

    function setValid(bool valid) external {
        _valid = valid;
    }

    function isValidSignature(bytes32, bytes calldata) external view returns (bytes4) {
        return _valid ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}

contract EvidenceRegistryV3Test {
    Vm constant vm = Vm(address(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D));

    EvidenceRegistryV3 internal registry;
    EvidenceRegistryV3 internal freeRegistry;
    address internal alice;
    address internal bob;
    address internal treasury;
    address internal rand;

    uint256 internal constant ALICE_KEY = 0x10;
    uint256 internal constant BOB_KEY = 0x11;
    uint256 internal constant WALLET_KEY = 0x12;

    uint256 internal constant FEE = 0.1 ether;

    bytes32 internal constant INTENT_ID = keccak256("intent-1");
    bytes32 internal constant INTENT_COMMITMENT = keccak256("intent-commitment-1");
    bytes32 internal constant PROOF_ID = keccak256("proof-1");
    bytes32 internal constant RECEIPT_ID = keccak256("receipt-1");
    bytes32 internal constant PROOF_COMMITMENT = keccak256("proof-commitment-1");
    bytes32 internal constant VERIFIER_V1 = keccak256("cg-verifier/0.1.0");

    uint256 internal constant NOW = 1000;
    uint256 internal constant VALID_UNTIL = 5000;

    event CommissionForwarded(address indexed payer, uint256 amount, uint256 timestamp);
    event TreasuryWithdrawn(address indexed to, uint256 amount, uint256 timestamp);

    function setUp() public {
        treasury = makeAddr("treasury");
        registry = new EvidenceRegistryV3(treasury, FEE);
        freeRegistry = new EvidenceRegistryV3(treasury, 0);
        alice = vm.addr(ALICE_KEY);
        bob = vm.addr(BOB_KEY);
        rand = makeAddr("rand");
        vm.warp(NOW);
    }

    function makeAddr(string memory name) internal returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(name)))));
    }

    function _sign(bytes32 digest, uint256 key) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _commitSign(
        EvidenceRegistryV3 reg,
        bytes32 intentId,
        bytes32 commitment,
        address signer,
        uint256 validUntil,
        uint256 key
    ) internal returns (bytes memory) {
        return _sign(reg.commitIntentDigest(intentId, commitment, validUntil, signer), key);
    }

    function _anchorSign(
        EvidenceRegistryV3 reg,
        bytes32 proofId,
        bytes32 intentId,
        bytes32 receiptId,
        bytes32 commitment,
        uint8 result,
        bytes32 verifierVersion,
        uint256 key
    ) internal returns (bytes memory) {
        return _sign(reg.anchorProofDigest(proofId, intentId, receiptId, commitment, result, verifierVersion), key);
    }

    function _commit(
        EvidenceRegistryV3 reg,
        bytes32 intentId,
        bytes32 commitment,
        address signer,
        uint256 validUntil,
        uint256 key
    ) internal {
        reg.commitIntent(intentId, commitment, signer, validUntil, _commitSign(reg, intentId, commitment, signer, validUntil, key));
    }

    function _anchorPaid(
        EvidenceRegistryV3 reg,
        bytes32 proofId,
        bytes32 intentId,
        bytes32 receiptId,
        bytes32 commitment,
        uint8 result,
        uint256 key
    ) internal {
        bytes memory sig = _anchorSign(reg, proofId, intentId, receiptId, commitment, result, VERIFIER_V1, key);
        reg.anchorProof{ value: FEE }(
            proofId,
            intentId,
            receiptId,
            commitment,
            result,
            VERIFIER_V1,
            sig
        );
    }

    function _anchorFree(
        EvidenceRegistryV3 reg,
        bytes32 proofId,
        bytes32 intentId,
        bytes32 receiptId,
        bytes32 commitment,
        uint8 result,
        uint256 key
    ) internal {
        bytes memory sig = _anchorSign(reg, proofId, intentId, receiptId, commitment, result, VERIFIER_V1, key);
        reg.anchorProof(
            proofId,
            intentId,
            receiptId,
            commitment,
            result,
            VERIFIER_V1,
            sig
        );
    }

    function testVERSIONIsPinned() public {
        require(registry.VERSION() == registry.VERSION_KECCAK(), "VERSION not pinned");
    }

    function testCommissionSurfaceExposesFlatFee() public view {
        require(registry.commissionRequired() == FEE, "fee not exposed");
        require(freeRegistry.commissionRequired() == 0, "free registry exposes zero fee");
    }

    function testCommitAcceptedFree() public {
        _commit(freeRegistry, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
        (bytes32 storedCommitment, , , uint256 validUntil, address signer) = freeRegistry.intentCommits(INTENT_ID);
        require(storedCommitment == INTENT_COMMITMENT, "commitment not stored");
        require(validUntil == VALID_UNTIL, "validUntil not stored");
        require(signer == alice, "signer not stored");
    }

    function testPaidAnchorAcceptedAndCommissioned() public {
        _commit(registry, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
        _anchorPaid(registry, PROOF_ID, INTENT_ID, RECEIPT_ID, PROOF_COMMITMENT, uint8(EvidenceRegistryV3.ProofResult.VALID), ALICE_KEY);
        (
            bytes32 receiptId,
            ,
            ,
            ,
            ,
            uint8 result,
            address signer,
            uint256 commissionPaid
        ) = registry.proofAnchors(PROOF_ID);
        require(receiptId == RECEIPT_ID, "receiptId not bound");
        require(result == uint8(EvidenceRegistryV3.ProofResult.VALID), "result not bound");
        require(signer == alice, "signer not bound");
        require(commissionPaid == FEE, "commission not recorded");
        require(registry.treasuryBalance() == FEE, "treasury did not collect fee");
    }

    function testFreeRegistryAnchorsWithoutCommission() public {
        _commit(freeRegistry, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
        _anchorFree(freeRegistry, PROOF_ID, INTENT_ID, RECEIPT_ID, PROOF_COMMITMENT, uint8(EvidenceRegistryV3.ProofResult.VALID), ALICE_KEY);
        (
            ,
            ,
            ,
            ,
            ,
            uint8 result,
            ,
            uint256 commissionPaid
        ) = freeRegistry.proofAnchors(PROOF_ID);
        require(result == uint8(EvidenceRegistryV3.ProofResult.VALID), "result not bound");
        require(commissionPaid == 0, "free anchor must record zero commission");
        require(freeRegistry.treasuryBalance() == 0, "free registry treasury must stay zero");
    }

    function testUnderpayReverts() public {
        _commit(registry, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
        bytes memory sig = _anchorSign(registry, PROOF_ID, INTENT_ID, RECEIPT_ID, PROOF_COMMITMENT, uint8(EvidenceRegistryV3.ProofResult.VALID), VERIFIER_V1, ALICE_KEY);
        vm.expectRevert(abi.encodeWithSelector(EvidenceRegistryV3.CommissionMismatch.selector, FEE, FEE / 2));
        registry.anchorProof{ value: FEE / 2 }(
            PROOF_ID,
            INTENT_ID,
            RECEIPT_ID,
            PROOF_COMMITMENT,
            uint8(EvidenceRegistryV3.ProofResult.VALID),
            VERIFIER_V1,
            sig
        );
    }

    function testOverpayReverts() public {
        _commit(registry, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
        bytes memory sig = _anchorSign(registry, PROOF_ID, INTENT_ID, RECEIPT_ID, PROOF_COMMITMENT, uint8(EvidenceRegistryV3.ProofResult.VALID), VERIFIER_V1, ALICE_KEY);
        vm.expectRevert(abi.encodeWithSelector(EvidenceRegistryV3.CommissionMismatch.selector, FEE, FEE + 1));
        registry.anchorProof{ value: FEE + 1 }(
            PROOF_ID,
            INTENT_ID,
            RECEIPT_ID,
            PROOF_COMMITMENT,
            uint8(EvidenceRegistryV3.ProofResult.VALID),
            VERIFIER_V1,
            sig
        );
    }

    function testTreasuryFailsForRandomCaller() public {
        _commit(registry, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
        _anchorPaid(registry, PROOF_ID, INTENT_ID, RECEIPT_ID, PROOF_COMMITMENT, uint8(EvidenceRegistryV3.ProofResult.VALID), ALICE_KEY);
        vm.expectRevert(EvidenceRegistryV3.InvalidAuthority.selector);
        registry.withdrawTreasury(rand);
    }

    function testOnlyFeeToCanWithdraw() public {
        // feeTo is `treasury`; the withdraw caller is checked against feeTo.
        vm.deal(treasury, 1 ether);
        _commit(registry, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
        _anchorPaid(registry, PROOF_ID, INTENT_ID, RECEIPT_ID, PROOF_COMMITMENT, uint8(EvidenceRegistryV3.ProofResult.VALID), ALICE_KEY);
        vm.expectEmit(true, true, true, true);
        emit TreasuryWithdrawn(rand, FEE, block.timestamp);
        vm.prank(treasury);
        registry.withdrawTreasury(rand);
        require(registry.treasuryBalance() == 0, "treasury not emptied");
    }

    function testWrongSignerReverts() public {
        _commit(registry, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
        bytes memory sig = _anchorSign(registry, PROOF_ID, INTENT_ID, RECEIPT_ID, PROOF_COMMITMENT, uint8(EvidenceRegistryV3.ProofResult.VALID), VERIFIER_V1, BOB_KEY);
        vm.expectRevert(EvidenceRegistryV3.InvalidAuthority.selector);
        registry.anchorProof{ value: FEE }(
            PROOF_ID,
            INTENT_ID,
            RECEIPT_ID,
            PROOF_COMMITMENT,
            uint8(EvidenceRegistryV3.ProofResult.VALID),
            VERIFIER_V1,
            sig
        );
    }

    function testCommitExpiredReverts() public {
        bytes memory sig = _commitSign(registry, INTENT_ID, INTENT_COMMITMENT, alice, NOW - 1, ALICE_KEY);
        vm.expectRevert(abi.encodeWithSelector(EvidenceRegistryV3.Expired.selector, NOW, NOW - 1));
        registry.commitIntent(INTENT_ID, INTENT_COMMITMENT, alice, NOW - 1, sig);
    }

    function testAnchorExpiredReverts() public {
        _commit(registry, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
        vm.warp(VALID_UNTIL + 1);
        bytes memory sig = _anchorSign(registry, PROOF_ID, INTENT_ID, RECEIPT_ID, PROOF_COMMITMENT, uint8(EvidenceRegistryV3.ProofResult.VALID), VERIFIER_V1, ALICE_KEY);
        vm.expectRevert(abi.encodeWithSelector(EvidenceRegistryV3.Expired.selector, VALID_UNTIL + 1, VALID_UNTIL));
        registry.anchorProof{ value: FEE }(
            PROOF_ID,
            INTENT_ID,
            RECEIPT_ID,
            PROOF_COMMITMENT,
            uint8(EvidenceRegistryV3.ProofResult.VALID),
            VERIFIER_V1,
            sig
        );
    }

    function testIntentIdReuseReverts() public {
        _commit(registry, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
        bytes memory sig = _commitSign(registry, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
        vm.expectRevert(abi.encodeWithSelector(EvidenceRegistryV3.AlreadyCommitted.selector, INTENT_ID));
        registry.commitIntent(INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, sig);
    }

    function testProofIdReuseReverts() public {
        _commit(registry, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
        _anchorPaid(registry, PROOF_ID, INTENT_ID, RECEIPT_ID, PROOF_COMMITMENT, uint8(EvidenceRegistryV3.ProofResult.VALID), ALICE_KEY);
        bytes memory sig = _anchorSign(registry, PROOF_ID, INTENT_ID, RECEIPT_ID, PROOF_COMMITMENT, uint8(EvidenceRegistryV3.ProofResult.VALID), VERIFIER_V1, ALICE_KEY);
        vm.expectRevert(abi.encodeWithSelector(EvidenceRegistryV3.AlreadyCommitted.selector, PROOF_ID));
        registry.anchorProof{ value: FEE }(
            PROOF_ID,
            INTENT_ID,
            RECEIPT_ID,
            PROOF_COMMITMENT,
            uint8(EvidenceRegistryV3.ProofResult.VALID),
            VERIFIER_V1,
            sig
        );
    }

    function testVersionMismatchReverts() public {
        _commit(registry, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
        bytes32 OTHER_VERIFIER = keccak256("cg-verifier/0.2.0");
        bytes memory sig = _anchorSign(registry, PROOF_ID, INTENT_ID, RECEIPT_ID, PROOF_COMMITMENT, uint8(EvidenceRegistryV3.ProofResult.VALID), OTHER_VERIFIER, ALICE_KEY);
        vm.expectRevert(EvidenceRegistryV3.InvalidAuthority.selector);
        registry.anchorProof{ value: FEE }(
            PROOF_ID,
            INTENT_ID,
            RECEIPT_ID,
            PROOF_COMMITMENT,
            uint8(EvidenceRegistryV3.ProofResult.VALID),
            VERIFIER_V1,
            sig
        );
    }

    function testCrossRegistryReplayReverts() public {
        _commit(registry, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
        EvidenceRegistryV3 other = new EvidenceRegistryV3(treasury, FEE);
        _commit(other, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
        bytes memory sig = _anchorSign(registry, PROOF_ID, INTENT_ID, RECEIPT_ID, PROOF_COMMITMENT, uint8(EvidenceRegistryV3.ProofResult.VALID), VERIFIER_V1, ALICE_KEY);
        vm.expectRevert(EvidenceRegistryV3.InvalidAuthority.selector);
        other.anchorProof{ value: FEE }(
            PROOF_ID,
            INTENT_ID,
            RECEIPT_ID,
            PROOF_COMMITMENT,
            uint8(EvidenceRegistryV3.ProofResult.VALID),
            VERIFIER_V1,
            sig
        );
    }

    function testResultCodeOutOfRangeReverts() public {
        _commit(registry, INTENT_ID, INTENT_COMMITMENT, alice, VALID_UNTIL, ALICE_KEY);
        bytes memory sig = _anchorSign(registry, PROOF_ID, INTENT_ID, RECEIPT_ID, PROOF_COMMITMENT, 3, VERIFIER_V1, ALICE_KEY);
        vm.expectRevert(abi.encodeWithSelector(EvidenceRegistryV3.InvalidResultCode.selector, 3));
        registry.anchorProof{ value: FEE }(
            PROOF_ID,
            INTENT_ID,
            RECEIPT_ID,
            PROOF_COMMITMENT,
            3,
            VERIFIER_V1,
            sig
        );
    }

    function testUnknownIntentReverts() public {
        bytes memory sig = _anchorSign(registry, PROOF_ID, INTENT_ID, RECEIPT_ID, PROOF_COMMITMENT, uint8(EvidenceRegistryV3.ProofResult.VALID), VERIFIER_V1, ALICE_KEY);
        vm.expectRevert(abi.encodeWithSelector(EvidenceRegistryV3.UnauthorizedIntention.selector, INTENT_ID));
        registry.anchorProof{ value: FEE }(
            PROOF_ID,
            INTENT_ID,
            RECEIPT_ID,
            PROOF_COMMITMENT,
            uint8(EvidenceRegistryV3.ProofResult.VALID),
            VERIFIER_V1,
            sig
        );
    }

    function testEIP1271AcceptedPaid() public {
        Mock1271V3 wallet = new Mock1271V3(true);
        bytes32 walletIntentId = keccak256("intent-wallet");
        _commit(registry, walletIntentId, INTENT_COMMITMENT, address(wallet), VALID_UNTIL, WALLET_KEY);
        bytes32 walletProofId = keccak256("proof-wallet");
        registry.anchorProof{ value: FEE }(
            walletProofId,
            walletIntentId,
            RECEIPT_ID,
            PROOF_COMMITMENT,
            uint8(EvidenceRegistryV3.ProofResult.VALID),
            VERIFIER_V1,
            hex"deadbeef"
        );
        (bytes32 storedReceiptId, , , , , , address storedSigner, ) = registry.proofAnchors(walletProofId);
        require(storedReceiptId == RECEIPT_ID, "1271 anchor not stored");
        require(storedSigner == address(wallet), "1271 signer not stored");
        require(registry.treasuryBalance() == FEE, "1271 anchor did not commission");
    }

    function testEIP1271Rejected() public {
        Mock1271V3 wallet = new Mock1271V3(true);
        bytes32 walletIntentId = keccak256("intent-wallet-bad");
        _commit(registry, walletIntentId, INTENT_COMMITMENT, address(wallet), VALID_UNTIL, WALLET_KEY);
        wallet.setValid(false);
        vm.expectRevert(EvidenceRegistryV3.InvalidAuthority.selector);
        registry.anchorProof{ value: FEE }(
            keccak256("proof-wallet-bad"),
            walletIntentId,
            RECEIPT_ID,
            PROOF_COMMITMENT,
            uint8(EvidenceRegistryV3.ProofResult.VALID),
            VERIFIER_V1,
            hex"deadbeef"
        );
    }
}

contract EventRegistryAcc {
    // minimal no-op holder so the test file keeps its single top-level contract
    // convention while still exercising vm.expectEmit paths above.
}