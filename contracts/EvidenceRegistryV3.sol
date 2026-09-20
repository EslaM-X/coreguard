// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * EvidenceRegistryV3 — CoreGuard DApp on Core: evidence + flat commission.
 *
 * Superset of EvidenceRegistryV2 (EIP-712 EOA / EIP-1271 authorization, intent
 * commitment + proof anchoring) plus a self-sustaining commission surface the
 * CoreGuard DApp product charges per anchored proof:
 *
 *   - feeWei: a FLAT commission (in CORE wei) charged per anchorProof;
 *   - feeTo:  the CoreGuard treasury that collects commissions;
 *   - payer pays the exact feeWei with the anchor tx (msg.value == feeWei);
 *   - treasury is pure accounting — the DApp operator (feeTo) is the only
 *     address that can withdraw; no reentrancy, no silent deductions.
 *
 * This contract is NOT the live V1/V2 anchor (both remain untouched,
 * immutable, and live on Core Mainnet). V3 is the DApp product surface the
 * roadmap pitches. Same EIP-712 domain discipline: a V3 record can never
 * replay against V1/V2 and vice-versa (verifyingContract differs by
 * construction).
 *
 * Security properties inherited from V2 (unchanged):
 *   - AlreadyCommitted: intentId/proofId are singletons (replay resistant).
 *   - Expired: block.timestamp within validUntil for intent + anchor windows.
 *   - InvalidAuthority: recovered / magic-checked authorizer must equal signer.
 *   - InvalidResultCode(>2): result ∈ {VALID, INVALID, UNVERIFIED}.
 *   - Versioned immutably at construction (EvidenceRegistryV3.0).
 *
 * Commission properties (DApp surface):
 *   - FlatFeesDisabled: feeWei == 0 disables commission (pure V2 behavior).
 *   - CommissionMismatch: payer must send exactly feeWei; overpay/underpay
 *     both revert (deterministic, no refund loops).
 *   - Only feeTo can withdraw the treasury (InvalidAuthority otherwise).
 */

interface IERC1271 {
    function isValidSignature(bytes32 hash, bytes memory signature)
        external
        view
        returns (bytes4 magicValue);
}

contract EvidenceRegistryV3 {
    bytes32 public immutable VERSION;
    bytes32 public constant VERSION_KECCAK = keccak256("EvidenceRegistryV3.0");

    bytes32 private constant _EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)");
    bytes32 private constant _NAME_HASH = keccak256("CoreGuardRegistry");
    bytes32 private constant _COMMIT_INTENT_TYPEHASH =
        keccak256(
            "CommitIntent(bytes32 intentId,bytes32 intentCommitment,uint256 validUntil,address signer,uint256 chainId,address verifyingContract)"
        );
    bytes32 private constant _ANCHOR_PROOF_TYPEHASH =
        keccak256(
            "AnchorProof(bytes32 proofId,bytes32 intentId,bytes32 receiptId,bytes32 proofCommitment,uint8 result,bytes32 verifierVersion,uint256 chainId,address verifyingContract)"
        );
    bytes4 private constant _ERC1271_MAGIC = 0x1626ba7e;

    error AlreadyCommitted(bytes32 id);
    error Expired(uint256 nowTimestamp, uint256 validUntil);
    error UnauthorizedIntention(bytes32 intentId);
    error InvalidSigner();
    error InvalidAuthority();
    error InvalidResultCode(uint8 result);
    error CommissionMismatch(uint256 required, uint256 provided);

    enum ProofResult { VALID, INVALID, UNVERIFIED }

    struct IntentCommit {
        bytes32 intentCommitment;
        bytes32 proofCommitment;
        bytes32 receiptId;
        uint256 validUntil;
        address signer;
    }

    struct ProofAnchor {
        bytes32 receiptId;
        bytes32 intentCommitment;
        bytes32 proofCommitment;
        bytes32 verifierVersion;
        uint256 anchoredAt;
        uint8 result;
        address signer;
        uint256 commissionPaid;
    }

    mapping(bytes32 => IntentCommit) public intentCommits;
    mapping(bytes32 => ProofAnchor) public proofAnchors;

    // DApp commission: flat CORE fee per anchor + treasury that collects it.
    address public immutable feeTo;
    uint256 public immutable feeWei;
    uint256 public treasuryBalance;

    event IntentCommitted(
        bytes32 indexed intentId,
        bytes32 indexed intentCommitment,
        address indexed signer,
        uint256 validUntil,
        uint256 chainId,
        uint256 timestamp
    );

    event ProofAnchored(
        bytes32 indexed proofId,
        bytes32 indexed receiptId,
        address indexed signer,
        uint8 result,
        bytes32 verifierVersion,
        uint256 chainId,
        uint256 timestamp,
        uint256 commissionPaid
    );

    event CommissionForwarded(address indexed payer, uint256 amount, uint256 timestamp);

    event TreasuryWithdrawn(address indexed to, uint256 amount, uint256 timestamp);

    constructor(address feeTreasury, uint256 commissionWei) {
        VERSION = VERSION_KECCAK;
        require(feeTreasury != address(0), "feeTreasury zero");
        feeTo = feeTreasury;
        feeWei = commissionWei;
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(_EIP712_DOMAIN_TYPEHASH, _NAME_HASH, block.chainid, address(this))
        );
    }

    function commitIntentDigest(
        bytes32 intentId,
        bytes32 intentCommitment,
        uint256 validUntil,
        address signer
    ) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                domainSeparator(),
                keccak256(
                    abi.encode(
                        _COMMIT_INTENT_TYPEHASH,
                        intentId,
                        intentCommitment,
                        validUntil,
                        signer,
                        block.chainid,
                        address(this)
                    )
                )
            )
        );
    }

    function anchorProofDigest(
        bytes32 proofId,
        bytes32 intentId,
        bytes32 receiptId,
        bytes32 proofCommitment,
        uint8 result,
        bytes32 verifierVersion
    ) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                domainSeparator(),
                keccak256(
                    abi.encode(
                        _ANCHOR_PROOF_TYPEHASH,
                        proofId,
                        intentId,
                        receiptId,
                        proofCommitment,
                        result,
                        verifierVersion,
                        block.chainid,
                        address(this)
                    )
                )
            )
        );
    }

    function _authorize(bytes32 digest, address signer, bytes calldata authorization)
        private
        view
    {
        if (signer == address(0)) revert InvalidSigner();

        uint256 codeSize;
        assembly {
            codeSize := extcodesize(signer)
        }

        if (codeSize > 0) {
            IERC1271 wallet = IERC1271(signer);
            try wallet.isValidSignature(digest, authorization) returns (bytes4 magic) {
                if (magic != _ERC1271_MAGIC) revert InvalidAuthority();
            } catch {
                revert InvalidAuthority();
            }
        } else {
            if (authorization.length != 65) revert InvalidAuthority();
            bytes32 r;
            bytes32 s;
            uint8 v;
            assembly {
                r := calldataload(authorization.offset)
                s := calldataload(add(authorization.offset, 0x20))
                v := byte(0, calldataload(add(authorization.offset, 0x40)))
            }
            address recovered = ecrecover(digest, v, r, s);
            if (recovered != signer) revert InvalidAuthority();
        }
    }

    /**
     * Commit an intent. Same surface as V2 (commission-free).
     */
    function commitIntent(
        bytes32 intentId,
        bytes32 intentCommitment,
        address signer,
        uint256 validUntil,
        bytes calldata authorization
    ) external {
        if (intentCommits[intentId].signer != address(0)) revert AlreadyCommitted(intentId);
        if (block.timestamp > validUntil) revert Expired(block.timestamp, validUntil);

        _authorize(
            commitIntentDigest(intentId, intentCommitment, validUntil, signer),
            signer,
            authorization
        );

        intentCommits[intentId] = IntentCommit({
            intentCommitment: intentCommitment,
            proofCommitment: bytes32(0),
            receiptId: bytes32(0),
            validUntil: validUntil,
            signer: signer
        });

        emit IntentCommitted(intentId, intentCommitment, signer, validUntil, block.chainid, block.timestamp);
    }

    /**
     * Anchor an execution proof and forward the flat DApp commission.
     *
     * When feeWei > 0 the payer must send exactly feeWei as msg.value; any
     * other value reverts CommissionMismatch. When feeWei == 0 the anchor is
     * free (pure V2 behavior). The commission lands in the treasury bucket
     * (pure accounting, no external call, no reentrancy surface).
     */
    function anchorProof(
        bytes32 proofId,
        bytes32 intentId,
        bytes32 receiptId,
        bytes32 proofCommitment,
        uint8 result,
        bytes32 verifierVersion,
        bytes calldata authorization
    ) external payable {
        if (proofAnchors[proofId].receiptId != bytes32(0)) revert AlreadyCommitted(proofId);
        if (result > uint8(ProofResult.UNVERIFIED)) revert InvalidResultCode(result);

        IntentCommit storage intent = intentCommits[intentId];
        if (intent.signer == address(0)) revert UnauthorizedIntention(intentId);
        if (block.timestamp > intent.validUntil) revert Expired(block.timestamp, intent.validUntil);

        address signer = intent.signer;
        _authorize(
            anchorProofDigest(proofId, intentId, receiptId, proofCommitment, result, verifierVersion),
            signer,
            authorization
        );

        if (feeWei > 0 && msg.value != feeWei) revert CommissionMismatch(feeWei, msg.value);

        proofAnchors[proofId] = ProofAnchor({
            receiptId: receiptId,
            intentCommitment: intent.intentCommitment,
            proofCommitment: proofCommitment,
            verifierVersion: verifierVersion,
            anchoredAt: block.timestamp,
            result: result,
            signer: signer,
            commissionPaid: msg.value
        });

        emit ProofAnchored(proofId, receiptId, signer, result, verifierVersion, block.chainid, block.timestamp, msg.value);

        // Treasury is accounting-only; value is already at this contract via
        // msg.value (payable). No external calls until the operator withdraws.
        treasuryBalance += msg.value;
        emit CommissionForwarded(msg.sender, msg.value, block.timestamp);
    }

    /**
     * The DApp operator (immutable feeTo) collects collected commissions.
     */
    function withdrawTreasury(address to) external {
        if (msg.sender != feeTo) revert InvalidAuthority();
        uint256 amount = treasuryBalance;
        treasuryBalance = 0;
        (bool ok, ) = to.call{ value: amount }("");
        require(ok, "withdraw failed");
        emit TreasuryWithdrawn(to, amount, block.timestamp);
    }

    /**
     * Read-only helper the DApp shows before sending the tx.
     */
    function commissionRequired() external view returns (uint256) {
        return feeWei;
    }
}