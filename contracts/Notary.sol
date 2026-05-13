// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// HuntNotary - public-good AI attestation registry.
///
/// Any caller can record that a specific AI model produced a specific output
/// for a specific (hashed) input at a specific time. The contract does NOT
/// store the input or output - only the keccak hashes. Used as a notarized
/// timestamp + provenance receipt that anyone can later prove they had at
/// a given block height.
///
/// No payment, no escrow, no reputation accounting - that's Hunt v1's job.
/// This contract is a thin notary log on top of the same v1 primitive.
contract HuntNotary {
    struct Attestation {
        address    user;            // who recorded this attestation
        bytes32    contentHash;     // keccak256 of the AI conversation transcript
        bytes32    modelDigest;     // keccak256(utf8(modelName + version))
        bytes32    domain;          // keccak256(utf8(domain name)) - "medical", "legal", "general"
        uint64     attestedAt;      // block.timestamp
        bytes32    sealedInputRoot; // 0G Storage root of the sealed transcript (optional, 0x0 if not used)
    }

    Attestation[] public attestations;

    event AttestationRecorded(
        uint256 indexed attestId,
        address indexed user,
        bytes32 indexed modelDigest,
        bytes32 contentHash,
        bytes32 domain,
        uint64  attestedAt,
        bytes32 sealedInputRoot
    );

    /// Anyone can record an attestation. Returns the attestId.
    function attest(
        bytes32 contentHash,
        bytes32 modelDigest,
        bytes32 domain,
        bytes32 sealedInputRoot
    ) external returns (uint256 attestId) {
        require(contentHash != bytes32(0), "empty content");
        require(modelDigest != bytes32(0), "empty modelDigest");
        attestId = attestations.length;
        attestations.push(Attestation({
            user: msg.sender,
            contentHash: contentHash,
            modelDigest: modelDigest,
            domain: domain,
            attestedAt: uint64(block.timestamp),
            sealedInputRoot: sealedInputRoot
        }));
        emit AttestationRecorded(attestId, msg.sender, modelDigest, contentHash, domain, uint64(block.timestamp), sealedInputRoot);
    }

    function getAttestation(uint256 attestId) external view returns (Attestation memory) {
        require(attestId < attestations.length, "out of range");
        return attestations[attestId];
    }

    function totalAttestations() external view returns (uint256) {
        return attestations.length;
    }
}
