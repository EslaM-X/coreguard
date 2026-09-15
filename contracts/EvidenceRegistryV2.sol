// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * EvidenceRegistryV2 — CoreGuard on-chain evidence registry (hardened surface).
 *
 * Phase 0 P0.1 (docs/plan-90d-repo.md): the immutable, versioned successor to
 * EvidenceRegistry (V1). V1 is untouched, remains the live Mainnet anchor, and
 * may coexist with V2 registries; this contract does NOT use an upgradeable
 * proxy and binds every record to THIS contract's EIP-712 domain so a record
 * committed here can never be replayed against a different registry.
 *
 * Authorization — EIP-712 (EOA via ecrecover) or EIP-1271 (contract wallet via
 * isValidSignature) — binds each commitment's full semantic context:
 *
 *   commitIntent(intentId, intentCommitment, signer, validUntil)
 *     digest binds: intentId, intentCommitment, validUntil, signer,
 *                   chainId, verifyingContract
 *   anchorProof(proofId, intentId, receiptId, proofCommitment, result,
 *               verifierVersion)
 *     digest binds: proofId, intentId, receiptId, proofCommitment, result,
 *                   verifierVersion, chainId, verifyingContract
 *     intentCommitment is taken from the stored IntentCommit for intentId,
 *     so the anchored proof is transitively bound to the intent.
 *
 * Security properties enforced on-chain:
 *   - AlreadyCommitted: intentId and proofId are singletons (replay resistant).
 *   - Expired: block.timestamp must be within validUntil for both intents and
 *     their anchors.
 *   - InvalidAuthority: recovered/magic-checked authorizer must equal the
 *     recorded signer; cross-registry or cross-chain replays fail because the
 *     digest domain includes chainId and verifyingContract.
 *   - InvalidResultCode(>2): result must be in {VALID=0, INVALID=1, UNVERIFIED=2}.
 *   - Versioned: VERSION is fixed at construction (EvidenceRegistryV2.1).
 */

interface IERC1271 {
    function isValidSignature(bytes32 hash, bytes memory signature)
        external
        view
        returns (bytes4 magicValue);
}

contract EvidenceRegistryV2 {
    bytes32 public immutable VERSION;
    bytes32 public constant VERSION_KECCAK = keccak256("EvidenceRegistryV2.1");

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
    }

    mapping(bytes32 => IntentCommit) public intentCommits;
    mapping(bytes32 => ProofAnchor) public proofAnchors;

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
        uint256 timestamp
    );

    constructor() {
        VERSION = VERSION_KECCAK;
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
     * Commit an intent. Reverts if intentId is already committed, if the
     * intent time window has already expired, or if the EIP-712/1271
     * authorization does not resolve to `signer`.
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
     * Anchor an execution proof for a previously committed intent. Reverts on
     * proofId reuse, unknown/expired intent, out-of-range result code, or an
     * authorization that does not resolve to the intent's recorded signer.
     */
    function anchorProof(
        bytes32 proofId,
        bytes32 intentId,
        bytes32 receiptId,
        bytes32 proofCommitment,
        uint8 result,
        bytes32 verifierVersion,
        bytes calldata authorization
    ) external {
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

        proofAnchors[proofId] = ProofAnchor({
            receiptId: receiptId,
            intentCommitment: intent.intentCommitment,
            proofCommitment: proofCommitment,
            verifierVersion: verifierVersion,
            anchoredAt: block.timestamp,
            result: result,
            signer: signer
        });

        emit ProofAnchored(proofId, receiptId, signer, result, verifierVersion, block.chainid, block.timestamp);
    }
}