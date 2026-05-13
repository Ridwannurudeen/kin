// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MedicalRecordsVault — patient-owned encrypted medical history with time-bound doctor access
/// @notice Records are encrypted client-side with a per-patient key; the key itself is sealed to a TEE
///         pubkey so queries can run inside Sealed Inference without leaking plaintext to anyone.
///         Doctors get time-bound permission to query (not to download) records.
/// @dev INFT pattern (ERC-7857-inspired): metadata = encrypted blob on 0G Storage; on-chain stores
///      only root hashes + sealed key + access policy. Transfer requires re-sealing key for new owner.
contract MedicalRecordsVault {
    struct Record {
        bytes32 storageRoot;   // 0G Storage root hash of encrypted blob
        string  recordType;    // e.g. "lab", "prescription", "diagnosis", "imaging", "history"
        uint64  timestamp;     // when added (unix seconds)
    }

    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => Record[]) private _records;
    mapping(uint256 => mapping(address => uint64)) public authorizedUntil; // tokenId => doctor => expiry ts
    mapping(uint256 => bytes) public encryptedKey;                          // sealed AES key per vault
    uint256 public nextTokenId;
    address public teePubkey;                                               // TEE oracle (Sealed Inference)

    event VaultMinted(uint256 indexed tokenId, address indexed patient);
    event RecordAdded(uint256 indexed tokenId, uint256 idx, bytes32 storageRoot, string recordType, uint64 timestamp);
    event AccessGranted(uint256 indexed tokenId, address indexed doctor, uint64 until);
    event AccessRevoked(uint256 indexed tokenId, address indexed doctor);
    event QueryExecuted(uint256 indexed tokenId, address indexed querier, bytes32 questionHash, bytes32 attestationId, uint64 timestamp);
    event Transferred(uint256 indexed tokenId, address indexed from, address indexed to);

    constructor(address _teePubkey) {
        teePubkey = _teePubkey;
    }

    /// Patient mints their vault. `_encryptedKey` is the AES key sealed to the TEE pubkey.
    function mintVault(bytes calldata _encryptedKey) external returns (uint256 tokenId) {
        tokenId = nextTokenId++;
        ownerOf[tokenId] = msg.sender;
        encryptedKey[tokenId] = _encryptedKey;
        emit VaultMinted(tokenId, msg.sender);
    }

    /// Patient appends a new record (encrypted blob already uploaded to 0G Storage).
    function addRecord(uint256 tokenId, bytes32 storageRoot, string calldata recordType) external {
        require(ownerOf[tokenId] == msg.sender, "not owner");
        require(storageRoot != bytes32(0), "empty root");
        uint64 ts = uint64(block.timestamp);
        _records[tokenId].push(Record(storageRoot, recordType, ts));
        emit RecordAdded(tokenId, _records[tokenId].length - 1, storageRoot, recordType, ts);
    }

    /// Patient grants a doctor time-bound query access. Max 30 days.
    function authorize(uint256 tokenId, address doctor, uint64 durationSecs) external {
        require(ownerOf[tokenId] == msg.sender, "not owner");
        require(doctor != address(0) && doctor != msg.sender, "bad doctor");
        require(durationSecs > 0 && durationSecs <= 30 days, "0<dur<=30d");
        uint64 until = uint64(block.timestamp) + durationSecs;
        authorizedUntil[tokenId][doctor] = until;
        emit AccessGranted(tokenId, doctor, until);
    }

    /// Patient revokes a doctor's access early.
    function revoke(uint256 tokenId, address doctor) external {
        require(ownerOf[tokenId] == msg.sender, "not owner");
        delete authorizedUntil[tokenId][doctor];
        emit AccessRevoked(tokenId, doctor);
    }

    function isAuthorized(uint256 tokenId, address user) public view returns (bool) {
        return ownerOf[tokenId] == user || authorizedUntil[tokenId][user] > block.timestamp;
    }

    function recordCount(uint256 tokenId) external view returns (uint256) {
        return _records[tokenId].length;
    }

    function getRecord(uint256 tokenId, uint256 idx) external view returns (bytes32 storageRoot, string memory recordType, uint64 timestamp) {
        Record memory r = _records[tokenId][idx];
        return (r.storageRoot, r.recordType, r.timestamp);
    }

    /// Audit: every Sealed Inference query against the vault is logged on-chain.
    /// `questionHash` = keccak(question text) — patient/doctor commits to what they asked.
    /// `attestationId` = the TEE attestation key returned by Sealed Inference.
    function logQuery(uint256 tokenId, bytes32 questionHash, bytes32 attestationId) external {
        require(isAuthorized(tokenId, msg.sender), "not authorized");
        emit QueryExecuted(tokenId, msg.sender, questionHash, attestationId, uint64(block.timestamp));
    }

    /// Transfer the vault. New owner must supply a fresh sealed key (re-encrypted off-chain).
    /// Simplified vs ERC-7857 oracle re-encryption — for hackathon scope; TEE-mediated re-seal is future work.
    function transfer(uint256 tokenId, address to, bytes calldata newEncryptedKey) external {
        require(ownerOf[tokenId] == msg.sender, "not owner");
        require(to != address(0), "to=0");
        address from = msg.sender;
        ownerOf[tokenId] = to;
        encryptedKey[tokenId] = newEncryptedKey;
        emit Transferred(tokenId, from, to);
    }
}
