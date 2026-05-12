// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Kin v2 — the marketplace senior engineers will actually use.
/// @notice Code-review skills as INFTs (ERC-7857-pattern). Mint requires a verifier-signed
///         GitHub Credential + a TEE-signed sample fingerprint. Jobs use structured briefs +
///         4-axis acceptance rubrics + on-chain TEE attestation. Sybil-gated by stake / verified-
///         GitHub fast-path / 7-day wait. Quality enforced at every layer (see doc/V2_SPEC.md §8).
/// @dev    Single-file. Storage layout is not upgrade-compatible with v1 — fresh deploy.
contract Kin {
    // ─── Types ──────────────────────────────────────────────────────────

    enum JobStatus { Open, Submitted, Accepted, Disputed, Expired }

    /// Verifier-signed proof that the wallet controls a GitHub account meeting the activity bar.
    struct Credential {
        bytes32 githubHandleHash;   // keccak256(githubLogin) — no PII on-chain
        uint32  accountAgeDays;
        uint32  mergedPRs;
        uint32  codeReviewCount;    // last 12 months
        uint64  verifiedAt;
        address verifier;           // expected to match this contract's verifier
        bytes   sig;                // verifier sig over (wallet, githubHandleHash, fields, verifiedAt)
    }

    /// TEE-signed sample quality scores. All scores 0..10000 bps.
    struct SampleFingerprint {
        uint16  vocabEntropyBps;
        uint16  domainTermBps;
        uint16  structuralBps;
        uint16  specificityBps;
        uint16  overallBps;         // weighted aggregate — must be >= MIN_QUALITY_BPS
        bytes32 modelDigest;        // hash of evaluator model + version + config
        bytes   teeSig;             // TEE sig over (sampleRoots, scores, modelDigest)
    }

    struct PerDimReputation {
        uint64 jobsCompleted;
        uint64 sumVoiceMatch;       // each rating 1..5; avg = sum * 10000 / count, in bps
        uint64 sumCompleteness;
        uint64 sumAccuracy;
        uint64 sumStructure;
        uint64 totalEarnedWei;
    }

    struct Skill {
        address owner;
        Credential credential;
        bytes32[] sampleRoots;      // encrypted sample blobs on 0G Storage (ECDH to teePubkey)
        bytes32[] embedRoots;       // 1:1 with sampleRoots — per-sample embedding blobs
        SampleFingerprint fingerprint;
        string  language;           // from LANGUAGES enum below (validated on mint)
        string  description;        // <= 280 chars
        uint256 pricePerJob;
        PerDimReputation rep;
        bool    paused;
    }

    /// Client-supplied structured brief metadata. Actual brief content is encrypted off-chain
    /// and uploaded to 0G Storage; only the root + size hints + urgency are on-chain.
    struct StructuredBrief {
        uint8   briefSchemaVersion; // must equal 1 in v2
        bytes32 briefRoot;          // 0G Storage root of ECDH-encrypted brief JSON
        bytes32 repoFingerprint;    // optional keccak of repo URL for analytics; 0 if undisclosed
        uint16  diffLinesEstimate;  // client-asserted; TEE re-checks
        uint8   urgency;            // 0 = normal, 1 = fast (24h SLA — UX hint, not enforced)
    }

    struct PerDimRating {
        uint8 voiceMatch;           // 0 = unrated; 1..5 valid on accept
        uint8 completeness;
        uint8 accuracy;
        uint8 structure;
    }

    struct Job {
        uint256 skillId;
        address client;
        uint256 payment;            // escrowed, set to 0 on settle/refund
        StructuredBrief brief;
        bytes32 outputRoot;         // 0G Storage root of output (encrypted to buyer pubkey)
        bytes32 attestationDigest;  // keccak(jobId, outputRoot, qualityScore, modelDigest)
        bytes   attestationSig;     // TEE sig over attestationDigest
        uint16  qualityScore;       // TEE self-eval, 0..10000 bps
        JobStatus status;
        PerDimRating rating;
        uint64  createdAt;
        uint64  deadline;
        uint64  submittedAt;
    }

    // ─── Constants ──────────────────────────────────────────────────────

    uint16  public constant MIN_QUALITY_BPS         = 6000;
    uint16  public constant MIN_OUTPUT_QUALITY_BPS  = 7000;
    uint64  public constant DISPUTE_WINDOW          = 24 hours;
    uint64  public constant DEFAULT_DEADLINE        = 7 days;
    uint64  public constant CLIENT_WAIT_DURATION    = 7 days;
    uint256 public constant CLIENT_STAKE_AMOUNT     = 0.05 ether;

    // Credential bar (v2 starting values per V2_SPEC §16)
    uint32  public constant MIN_ACCOUNT_AGE_DAYS    = 730;
    uint32  public constant MIN_MERGED_PRS          = 20;
    uint32  public constant MIN_CODE_REVIEW_COUNT   = 10;

    uint8   public constant BRIEF_SCHEMA_V1         = 1;

    // ─── State ──────────────────────────────────────────────────────────

    address public teeSigner;   // address derived from TEE's secp256k1 pubkey (ecrecover target)
    address public verifier;    // GitHub verifier service signing address
    address public admin;       // can rotate teeSigner / verifier

    mapping(uint256 => Skill) internal skillsMap;
    mapping(uint256 => Job)   internal jobsMap;
    uint256 public nextSkillId;
    uint256 public nextJobId;

    // Sybil-resistance state (client side)
    mapping(address => uint256) public clientStakeBalance;
    mapping(address => bool)    public clientVerified;
    mapping(address => uint64)  public clientFirstSeen;

    // Replay protection on credential reuse — a credential signature is consumed on mint or verifyClient
    mapping(bytes32 => bool) public credentialUsed;

    // ─── Events ─────────────────────────────────────────────────────────

    event SkillMinted(uint256 indexed skillId, address indexed owner, bytes32 indexed githubHandleHash,
                      string language, uint16 fingerprintOverallBps, uint256 pricePerJob);
    event SkillUpdated(uint256 indexed skillId, uint256 pricePerJob, bool paused);
    event JobPosted(uint256 indexed jobId, uint256 indexed skillId, address indexed client,
                    uint256 payment, bytes32 briefRoot, uint8 urgency);
    event BriefReposted(uint256 indexed jobId, bytes32 newBriefRoot);
    event WorkSubmitted(uint256 indexed jobId, uint256 indexed skillId, bytes32 outputRoot,
                        uint16 qualityScore, bytes32 attestationDigest);
    event JobAccepted(uint256 indexed jobId, uint256 indexed skillId, uint8 voiceMatch,
                      uint8 completeness, uint8 accuracy, uint8 structure, uint256 paid);
    event JobDisputed(uint256 indexed jobId, string reason);
    event JobExpired(uint256 indexed jobId, uint256 refunded);
    event JobReleased(uint256 indexed jobId, uint256 paid);

    event ClientStaked(address indexed client, uint256 amount);
    event ClientStakeRefunded(address indexed client, uint256 amount);
    event ClientVerified(address indexed client, bytes32 indexed githubHandleHash);
    event ClientWaitStarted(address indexed client, uint64 firstSeen);

    event TeeSignerRotated(address indexed previous, address indexed current);
    event VerifierRotated(address indexed previous, address indexed current);

    // ─── Constructor / admin ────────────────────────────────────────────

    constructor(address _teeSigner, address _verifier) {
        require(_teeSigner != address(0), "tee=0");
        require(_verifier != address(0), "verifier=0");
        teeSigner = _teeSigner;
        verifier = _verifier;
        admin = msg.sender;
    }

    modifier onlyAdmin() { require(msg.sender == admin, "not admin"); _; }

    function setTeeSigner(address newSigner) external onlyAdmin {
        require(newSigner != address(0), "tee=0");
        emit TeeSignerRotated(teeSigner, newSigner);
        teeSigner = newSigner;
    }

    function setVerifier(address newVerifier) external onlyAdmin {
        require(newVerifier != address(0), "verifier=0");
        emit VerifierRotated(verifier, newVerifier);
        verifier = newVerifier;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "admin=0");
        admin = newAdmin;
    }

    // ─── Skill (mint / update) ──────────────────────────────────────────

    function mintSkill(
        Credential calldata cred,
        bytes32[] calldata sampleRoots,
        bytes32[] calldata embedRoots,
        SampleFingerprint calldata fp,
        string calldata language,
        string calldata description,
        uint256 pricePerJob
    ) external returns (uint256 skillId) {
        require(sampleRoots.length >= 3 && sampleRoots.length <= 20, "samples 3..20");
        require(sampleRoots.length == embedRoots.length, "sample/embed length mismatch");
        require(pricePerJob > 0, "price 0");
        require(bytes(description).length <= 280, "desc>280");
        require(_isValidLanguage(language), "bad language");
        require(fp.overallBps >= MIN_QUALITY_BPS, "fingerprint below bar");

        // Identity gate
        require(cred.verifier == verifier, "wrong verifier");
        require(cred.accountAgeDays >= MIN_ACCOUNT_AGE_DAYS, "github age");
        require(cred.mergedPRs >= MIN_MERGED_PRS, "merged PRs");
        require(cred.codeReviewCount >= MIN_CODE_REVIEW_COUNT, "review count");
        bytes32 credDigest = _credDigest(msg.sender, cred);
        require(!credentialUsed[credDigest], "credential reused");
        require(_recoverEth(credDigest, cred.sig) == verifier, "bad cred sig");

        // Fingerprint gate
        bytes32 fpDigest = _fingerprintDigest(sampleRoots, fp);
        require(_recoverEth(fpDigest, fp.teeSig) == teeSigner, "bad fingerprint sig");

        // Consume credential
        credentialUsed[credDigest] = true;

        // Persist
        skillId = nextSkillId++;
        Skill storage s = skillsMap[skillId];
        s.owner = msg.sender;
        s.credential = cred;
        s.sampleRoots = sampleRoots;
        s.embedRoots = embedRoots;
        s.fingerprint = fp;
        s.language = language;
        s.description = description;
        s.pricePerJob = pricePerJob;

        emit SkillMinted(skillId, msg.sender, cred.githubHandleHash, language, fp.overallBps, pricePerJob);
    }

    function updateSkill(uint256 skillId, uint256 pricePerJob, bool paused) external {
        Skill storage s = skillsMap[skillId];
        require(s.owner == msg.sender, "not owner");
        require(pricePerJob > 0, "price 0");
        s.pricePerJob = pricePerJob;
        s.paused = paused;
        emit SkillUpdated(skillId, pricePerJob, paused);
    }

    // ─── Sybil gate (client side) ───────────────────────────────────────

    /// Path A: deposit a refundable stake. Refunded on first successful acceptance.
    function stakeForJobAccess() external payable {
        require(msg.value == CLIENT_STAKE_AMOUNT, "stake amount mismatch");
        require(clientStakeBalance[msg.sender] == 0, "already staked");
        clientStakeBalance[msg.sender] = msg.value;
        emit ClientStaked(msg.sender, msg.value);
    }

    /// Path B: present a verifier-signed Credential. Same bar as skill owners.
    function verifyClient(Credential calldata cred) external {
        require(cred.verifier == verifier, "wrong verifier");
        require(cred.accountAgeDays >= MIN_ACCOUNT_AGE_DAYS, "github age");
        require(cred.mergedPRs >= MIN_MERGED_PRS, "merged PRs");
        require(cred.codeReviewCount >= MIN_CODE_REVIEW_COUNT, "review count");
        bytes32 d = _credDigest(msg.sender, cred);
        require(!credentialUsed[d], "credential reused");
        require(_recoverEth(d, cred.sig) == verifier, "bad cred sig");
        credentialUsed[d] = true;
        clientVerified[msg.sender] = true;
        emit ClientVerified(msg.sender, cred.githubHandleHash);
    }

    /// Path C: register and wait CLIENT_WAIT_DURATION (7 days).
    function startClientWait() external {
        require(clientFirstSeen[msg.sender] == 0, "already started");
        clientFirstSeen[msg.sender] = uint64(block.timestamp);
        emit ClientWaitStarted(msg.sender, uint64(block.timestamp));
    }

    function _clientEligible(address c) internal view returns (bool) {
        if (clientStakeBalance[c] > 0) return true;
        if (clientVerified[c]) return true;
        uint64 seen = clientFirstSeen[c];
        if (seen != 0 && block.timestamp - seen >= CLIENT_WAIT_DURATION) return true;
        return false;
    }

    // ─── Job lifecycle ──────────────────────────────────────────────────

    function postJob(uint256 skillId, StructuredBrief calldata brief)
        external payable returns (uint256 jobId)
    {
        Skill storage s = skillsMap[skillId];
        require(s.owner != address(0), "skill not found");
        require(!s.paused, "skill paused");
        require(msg.sender != s.owner, "client == owner");
        require(msg.value == s.pricePerJob, "exact price required");
        require(brief.briefSchemaVersion == BRIEF_SCHEMA_V1, "bad schema");
        require(brief.briefRoot != bytes32(0), "empty brief");
        require(_clientEligible(msg.sender), "sybil gate: stake/verify/wait first");

        jobId = nextJobId++;
        Job storage j = jobsMap[jobId];
        j.skillId = skillId;
        j.client = msg.sender;
        j.payment = msg.value;
        j.brief = brief;
        j.status = JobStatus.Open;
        j.createdAt = uint64(block.timestamp);
        j.deadline = uint64(block.timestamp) + DEFAULT_DEADLINE;

        emit JobPosted(jobId, skillId, msg.sender, msg.value, brief.briefRoot, brief.urgency);
    }

    /// Client can update the brief root while the job is still Open and not yet expired.
    /// Used when the TEE returns a clarification request off-chain.
    function repostBrief(uint256 jobId, bytes32 newBriefRoot) external {
        Job storage j = jobsMap[jobId];
        require(j.client == msg.sender, "not client");
        require(j.status == JobStatus.Open, "not open");
        require(block.timestamp <= j.deadline, "deadline passed");
        require(newBriefRoot != bytes32(0), "empty brief");
        j.brief.briefRoot = newBriefRoot;
        emit BriefReposted(jobId, newBriefRoot);
    }

    function submitWork(
        uint256 jobId,
        bytes32 outputRoot,
        uint16  qualityScore,
        bytes32 modelDigest,
        bytes calldata attestationSig
    ) external {
        Job storage j = jobsMap[jobId];
        Skill storage s = skillsMap[j.skillId];
        require(s.owner == msg.sender, "not agent owner");
        require(j.status == JobStatus.Open, "not open");
        require(outputRoot != bytes32(0), "empty output");
        require(block.timestamp <= j.deadline, "deadline passed");
        require(qualityScore >= MIN_OUTPUT_QUALITY_BPS, "quality below bar");

        bytes32 digest = keccak256(abi.encode(jobId, outputRoot, qualityScore, modelDigest));
        require(_recoverEth(digest, attestationSig) == teeSigner, "bad attestation sig");

        j.outputRoot = outputRoot;
        j.attestationDigest = digest;
        j.attestationSig = attestationSig;
        j.qualityScore = qualityScore;
        j.status = JobStatus.Submitted;
        j.submittedAt = uint64(block.timestamp);

        emit WorkSubmitted(jobId, j.skillId, outputRoot, qualityScore, digest);
    }

    function acceptWork(uint256 jobId, PerDimRating calldata r) external {
        Job storage j = jobsMap[jobId];
        require(j.client == msg.sender, "not client");
        require(j.status == JobStatus.Submitted, "not submitted");
        require(_ratingValid(r), "rating 1..5 all dims");

        j.rating = r;
        _settle(jobId, r);
    }

    /// After the 24h dispute window, anyone can release escrow with default (4,4,4,4) rating.
    function releaseAfterTimeout(uint256 jobId) external {
        Job storage j = jobsMap[jobId];
        require(j.status == JobStatus.Submitted, "not submitted");
        require(block.timestamp >= j.submittedAt + DISPUTE_WINDOW, "window open");
        PerDimRating memory defaultR = PerDimRating(4, 4, 4, 4);
        j.rating = defaultR;
        _settle(jobId, defaultR);
        emit JobReleased(jobId, 0);  // amount logged in _settle's JobAccepted event
    }

    function disputeWork(uint256 jobId, string calldata reason) external {
        Job storage j = jobsMap[jobId];
        require(j.client == msg.sender, "not client");
        require(j.status == JobStatus.Submitted, "not submitted");
        require(block.timestamp < j.submittedAt + DISPUTE_WINDOW, "window closed");

        j.status = JobStatus.Disputed;
        emit JobDisputed(jobId, reason);

        // v2: full refund to client (v3 = AI arbitrator per FUTURE.md)
        uint256 amount = j.payment;
        j.payment = 0;
        (bool ok,) = payable(j.client).call{value: amount}("");
        require(ok, "refund failed");
    }

    function expireJob(uint256 jobId) external {
        Job storage j = jobsMap[jobId];
        require(j.status == JobStatus.Open, "not open");
        require(block.timestamp >= j.deadline, "not expired yet");

        j.status = JobStatus.Expired;
        uint256 amount = j.payment;
        j.payment = 0;
        emit JobExpired(jobId, amount);
        (bool ok,) = payable(j.client).call{value: amount}("");
        require(ok, "refund failed");
    }

    function _settle(uint256 jobId, PerDimRating memory r) internal {
        Job storage j = jobsMap[jobId];
        Skill storage s = skillsMap[j.skillId];

        s.rep.jobsCompleted++;
        s.rep.sumVoiceMatch     += r.voiceMatch;
        s.rep.sumCompleteness   += r.completeness;
        s.rep.sumAccuracy       += r.accuracy;
        s.rep.sumStructure      += r.structure;
        s.rep.totalEarnedWei    += uint64(j.payment);

        uint256 amount = j.payment;
        j.payment = 0;
        j.status = JobStatus.Accepted;

        emit JobAccepted(jobId, j.skillId, r.voiceMatch, r.completeness, r.accuracy, r.structure, amount);

        (bool ok,) = payable(s.owner).call{value: amount}("");
        require(ok, "payment failed");

        // Refund client stake on first successful acceptance, if any
        uint256 stake = clientStakeBalance[j.client];
        if (stake > 0) {
            clientStakeBalance[j.client] = 0;
            (bool ok2,) = payable(j.client).call{value: stake}("");
            require(ok2, "stake refund failed");
            emit ClientStakeRefunded(j.client, stake);
        }
    }

    // ─── Verification helpers ───────────────────────────────────────────

    function _credDigest(address wallet, Credential calldata c) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            wallet,
            c.githubHandleHash,
            c.accountAgeDays,
            c.mergedPRs,
            c.codeReviewCount,
            c.verifiedAt,
            c.verifier
        ));
    }

    function _fingerprintDigest(bytes32[] calldata sampleRoots, SampleFingerprint calldata fp)
        internal pure returns (bytes32)
    {
        return keccak256(abi.encode(
            sampleRoots,
            fp.vocabEntropyBps,
            fp.domainTermBps,
            fp.structuralBps,
            fp.specificityBps,
            fp.overallBps,
            fp.modelDigest
        ));
    }

    /// EIP-191 prefixed ecrecover. Verifier and TEE both sign hash with `eth_sign` (prefixed).
    function _recoverEth(bytes32 hash, bytes memory sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);
        // EIP-2 high-s rejection
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return address(0);
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        return ecrecover(ethHash, v, r, s);
    }

    function _ratingValid(PerDimRating calldata r) internal pure returns (bool) {
        return r.voiceMatch   >= 1 && r.voiceMatch   <= 5
            && r.completeness >= 1 && r.completeness <= 5
            && r.accuracy     >= 1 && r.accuracy     <= 5
            && r.structure    >= 1 && r.structure    <= 5;
    }

    function _isValidLanguage(string calldata lang) internal pure returns (bool) {
        bytes32 h = keccak256(bytes(lang));
        return h == keccak256("any")
            || h == keccak256("javascript")
            || h == keccak256("typescript")
            || h == keccak256("python")
            || h == keccak256("rust")
            || h == keccak256("go")
            || h == keccak256("solidity")
            || h == keccak256("java")
            || h == keccak256("c")
            || h == keccak256("cpp");
    }

    // ─── Views ──────────────────────────────────────────────────────────

    function getSkill(uint256 skillId) external view returns (Skill memory) { return skillsMap[skillId]; }
    function getJob(uint256 jobId) external view returns (Job memory) { return jobsMap[jobId]; }
    function getSampleRoots(uint256 skillId) external view returns (bytes32[] memory) { return skillsMap[skillId].sampleRoots; }
    function getEmbedRoots(uint256 skillId)  external view returns (bytes32[] memory) { return skillsMap[skillId].embedRoots; }

    /// Per-dimension averages in bps (0..50000 since each rating is 1..5 and we report sum*10000/count).
    /// Reported in bps where 1.0 rating = 10000 bps, so a perfect-5 avg = 50000.
    function avgPerDim(uint256 skillId)
        external view
        returns (uint64 voiceMatchBps, uint64 completenessBps, uint64 accuracyBps, uint64 structureBps)
    {
        PerDimReputation storage rep = skillsMap[skillId].rep;
        if (rep.jobsCompleted == 0) return (0, 0, 0, 0);
        uint64 n = rep.jobsCompleted;
        voiceMatchBps   = (rep.sumVoiceMatch   * 10000) / n;
        completenessBps = (rep.sumCompleteness * 10000) / n;
        accuracyBps     = (rep.sumAccuracy     * 10000) / n;
        structureBps    = (rep.sumStructure    * 10000) / n;
    }

    function totalSkills() external view returns (uint256) { return nextSkillId; }
    function totalJobs()   external view returns (uint256) { return nextJobId;   }

    function clientEligible(address c) external view returns (bool) { return _clientEligible(c); }
}
