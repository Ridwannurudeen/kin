// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Kin — your AI earns money while you sleep.
/// @notice Skills as INFTs (ERC-7857-pattern). Jobs executed inside Sealed Inference.
///         Encrypted samples + brief on 0G Storage. Payment splits on-chain after dispute window.
/// @dev Single-contract design: SkillNFT + JobMarketplace + Reputation under one roof for
///      simpler deployment + lower client integration cost. Production would split into
///      separate contracts behind a proxy.
contract Kin {
    enum JobStatus { Open, Submitted, Accepted, Disputed, Expired }

    struct Skill {
        address owner;
        string  skillType;       // "writing", "code-review", "research", "design", ...
        string  description;     // human-readable: "M&A copywriting in NYT style"
        bytes32[] sampleRoots;   // 0G Storage roots of encrypted writing samples
        bytes   sealedKey;       // sealed AES key (encrypted to TEE pubkey)
        uint256 pricePerJob;     // wei (OG)
        uint64  jobsCompleted;
        uint64  totalRating;     // sum 1..5 per completed job; avg = totalRating / jobsCompleted
        uint64  totalEarnedWei;  // running total
        bool    paused;          // owner can pause new jobs
    }

    struct Job {
        uint256 skillId;
        address client;
        uint256 payment;          // escrowed
        bytes32 briefRoot;        // 0G Storage root of encrypted brief
        bytes32 outputRoot;       // 0G Storage root of encrypted output (set on submit)
        bytes32 attestationId;    // TEE attestation key from Sealed Inference
        JobStatus status;
        uint64 createdAt;
        uint64 deadline;          // job auto-refunds if no submission by this time
        uint64 submittedAt;       // when work was submitted (start of dispute window)
    }

    uint64 public constant DISPUTE_WINDOW = 24 hours;
    uint64 public constant DEFAULT_DEADLINE_DURATION = 7 days;

    mapping(uint256 => Skill) public skills;
    mapping(uint256 => Job)   public jobs;
    uint256 public nextSkillId;
    uint256 public nextJobId;
    address public teePubkey;

    event SkillMinted(uint256 indexed skillId, address indexed owner, string skillType, uint256 pricePerJob);
    event SkillUpdated(uint256 indexed skillId, bytes32[] sampleRoots, uint256 pricePerJob, bool paused);
    event SkillTransferred(uint256 indexed skillId, address indexed from, address indexed to);
    event JobPosted(uint256 indexed jobId, uint256 indexed skillId, address indexed client, uint256 payment, bytes32 briefRoot, uint64 deadline);
    event WorkSubmitted(uint256 indexed jobId, uint256 indexed skillId, address indexed agentOwner, bytes32 outputRoot, bytes32 attestationId);
    event JobAccepted(uint256 indexed jobId, uint256 indexed skillId, uint8 rating, uint256 paid);
    event JobDisputed(uint256 indexed jobId, uint256 indexed skillId, string reason);
    event JobExpired(uint256 indexed jobId, uint256 indexed skillId, uint256 refunded);
    event PaymentSplit(uint256 indexed jobId, address indexed agent, uint256 agentAmount);

    constructor(address _teePubkey) {
        teePubkey = _teePubkey;
    }

    // ─── Skill (INFT-pattern) ───────────────────────────────────────────

    function mintSkill(
        string calldata skillType,
        string calldata description,
        bytes32[] calldata sampleRoots,
        bytes calldata sealedKey,
        uint256 pricePerJob
    ) external returns (uint256 skillId) {
        require(bytes(skillType).length > 0, "skillType empty");
        require(sampleRoots.length > 0 && sampleRoots.length <= 20, "1..20 samples");
        require(pricePerJob > 0, "price 0");

        skillId = nextSkillId++;
        Skill storage s = skills[skillId];
        s.owner = msg.sender;
        s.skillType = skillType;
        s.description = description;
        s.sampleRoots = sampleRoots;
        s.sealedKey = sealedKey;
        s.pricePerJob = pricePerJob;

        emit SkillMinted(skillId, msg.sender, skillType, pricePerJob);
    }

    function updateSamples(uint256 skillId, bytes32[] calldata sampleRoots, uint256 pricePerJob, bool paused) external {
        Skill storage s = skills[skillId];
        require(s.owner == msg.sender, "not owner");
        require(sampleRoots.length > 0 && sampleRoots.length <= 20, "1..20 samples");
        require(pricePerJob > 0, "price 0");
        s.sampleRoots = sampleRoots;
        s.pricePerJob = pricePerJob;
        s.paused = paused;
        emit SkillUpdated(skillId, sampleRoots, pricePerJob, paused);
    }

    /// Simplified transfer (ERC-7857 oracle re-encryption is documented future work).
    function transferSkill(uint256 skillId, address to, bytes calldata newSealedKey) external {
        Skill storage s = skills[skillId];
        require(s.owner == msg.sender, "not owner");
        require(to != address(0) && to != msg.sender, "bad recipient");
        s.owner = to;
        s.sealedKey = newSealedKey;
        emit SkillTransferred(skillId, msg.sender, to);
    }

    // ─── Marketplace ────────────────────────────────────────────────────

    function postJob(uint256 skillId, bytes32 briefRoot) external payable returns (uint256 jobId) {
        Skill storage s = skills[skillId];
        require(s.owner != address(0), "skill not found");
        require(!s.paused, "skill paused");
        require(msg.value == s.pricePerJob, "exact price required");
        require(briefRoot != bytes32(0), "empty brief");
        require(msg.sender != s.owner, "client = owner");

        jobId = nextJobId++;
        Job storage j = jobs[jobId];
        j.skillId = skillId;
        j.client = msg.sender;
        j.payment = msg.value;
        j.briefRoot = briefRoot;
        j.status = JobStatus.Open;
        j.createdAt = uint64(block.timestamp);
        j.deadline = uint64(block.timestamp + DEFAULT_DEADLINE_DURATION);

        emit JobPosted(jobId, skillId, msg.sender, msg.value, briefRoot, j.deadline);
    }

    function submitWork(uint256 jobId, bytes32 outputRoot, bytes32 attestationId) external {
        Job storage j = jobs[jobId];
        Skill storage s = skills[j.skillId];
        require(s.owner == msg.sender, "not agent owner");
        require(j.status == JobStatus.Open, "job not open");
        require(outputRoot != bytes32(0), "empty output");
        require(block.timestamp <= j.deadline, "deadline passed");

        j.outputRoot = outputRoot;
        j.attestationId = attestationId;
        j.status = JobStatus.Submitted;
        j.submittedAt = uint64(block.timestamp);

        emit WorkSubmitted(jobId, j.skillId, s.owner, outputRoot, attestationId);
    }

    function acceptWork(uint256 jobId, uint8 rating) external {
        Job storage j = jobs[jobId];
        require(j.client == msg.sender, "not client");
        require(j.status == JobStatus.Submitted, "not submitted");
        require(rating >= 1 && rating <= 5, "rating 1..5");

        _settle(jobId, rating);
    }

    /// Anyone can release the escrow after the 24h dispute window with default rating 4.
    function releaseAfterTimeout(uint256 jobId) external {
        Job storage j = jobs[jobId];
        require(j.status == JobStatus.Submitted, "not submitted");
        require(block.timestamp >= j.submittedAt + DISPUTE_WINDOW, "window open");
        _settle(jobId, 4);
    }

    function disputeWork(uint256 jobId, string calldata reason) external {
        Job storage j = jobs[jobId];
        require(j.client == msg.sender, "not client");
        require(j.status == JobStatus.Submitted, "not submitted");
        require(block.timestamp < j.submittedAt + DISPUTE_WINDOW, "window closed");

        j.status = JobStatus.Disputed;
        emit JobDisputed(jobId, j.skillId, reason);

        // v1: dispute = full refund to client. v2 = arbitrator (Verdikt-style AI court).
        uint256 amount = j.payment;
        j.payment = 0;
        (bool ok,) = payable(j.client).call{value: amount}("");
        require(ok, "refund failed");
    }

    function expireJob(uint256 jobId) external {
        Job storage j = jobs[jobId];
        require(j.status == JobStatus.Open, "not open");
        require(block.timestamp >= j.deadline, "not expired yet");

        j.status = JobStatus.Expired;
        uint256 amount = j.payment;
        j.payment = 0;
        emit JobExpired(jobId, j.skillId, amount);
        (bool ok,) = payable(j.client).call{value: amount}("");
        require(ok, "refund failed");
    }

    function _settle(uint256 jobId, uint8 rating) internal {
        Job storage j = jobs[jobId];
        Skill storage s = skills[j.skillId];

        s.jobsCompleted++;
        s.totalRating += rating;
        s.totalEarnedWei += uint64(j.payment);

        uint256 amount = j.payment;
        j.payment = 0;
        j.status = JobStatus.Accepted;

        emit JobAccepted(jobId, j.skillId, rating, amount);
        emit PaymentSplit(jobId, s.owner, amount);

        (bool ok,) = payable(s.owner).call{value: amount}("");
        require(ok, "payment failed");
    }

    // ─── Views ──────────────────────────────────────────────────────────

    function getSkill(uint256 skillId) external view returns (Skill memory) { return skills[skillId]; }
    function getJob(uint256 jobId) external view returns (Job memory) { return jobs[jobId]; }
    function getSamples(uint256 skillId) external view returns (bytes32[] memory) { return skills[skillId].sampleRoots; }

    function avgRatingBps(uint256 skillId) external view returns (uint64) {
        Skill storage s = skills[skillId];
        return s.jobsCompleted == 0 ? 0 : (s.totalRating * 10000) / s.jobsCompleted;
    }

    function totalSkills() external view returns (uint256) { return nextSkillId; }
    function totalJobs() external view returns (uint256) { return nextJobId; }
}
