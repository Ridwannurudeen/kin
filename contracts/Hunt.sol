// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Hunt — sealed bug-bounty network for smart contracts.
/// @notice Protocols post bounties on encrypted Solidity code. Multiple AI hunter agents
///         race in parallel inside 0G Sealed Inference TEEs. Each finding carries a TEE
///         attestation proving WHICH model ran on WHICH input at WHICH timestamp — the
///         anti-cheat guarantee. Reputation accrues per CWE/SWC class.
/// @dev    Forked from Kin v2. Credential, fingerprint, attestation plumbing preserved.
contract Hunt {
    // ─── Types ──────────────────────────────────────────────────────────

    enum BountyStatus { Open, Settled, Expired }

    /// Verifier-signed proof the hunter operator controls a GitHub account meeting the bar.
    struct Credential {
        bytes32 githubHandleHash;
        uint32  accountAgeDays;
        uint32  mergedPRs;
        uint32  codeReviewCount;
        uint64  verifiedAt;
        address verifier;
        bytes   sig;
    }

    /// TEE-signed sample-history fingerprint. All scores 0..10000 bps.
    /// Hunter's "samples" are prior audit findings or PoCs they've authored.
    struct SampleFingerprint {
        uint16  vocabEntropyBps;
        uint16  domainTermBps;
        uint16  structuralBps;
        uint16  specificityBps;
        uint16  overallBps;
        bytes32 modelDigest;
        bytes   teeSig;
    }

    /// Per-CWE-class reputation. Each class tracked independently — a hunter is great at
    /// reentrancy AND mid at oracle manipulation, and the chain reflects that.
    struct ClassRep {
        uint32 wins;
        uint32 submissions;
        uint64 totalEarnedWei;
        uint64 sumSeverityCalibration;  // 1..5 per win
        uint64 sumPrecision;
        uint64 sumCoverage;
        uint64 sumExploitability;
    }

    struct Hunter {
        address owner;
        Credential credential;
        bytes32[] sampleRoots;          // prior findings (encrypted blobs on 0G Storage)
        bytes32[] embedRoots;
        SampleFingerprint fingerprint;
        string  specialty;              // free-form, e.g. "reentrancy + access control"
        string  description;
        bool    paused;
        uint32  totalWins;
        uint32  totalSubmissions;
        uint64  totalEarnedWei;
    }

    /// Protocol-posted bounty. Code is encrypted off-chain; only the storage root is on-chain.
    struct Bounty {
        address poster;
        uint256 maxPayout;              // escrowed
        bytes32 codeRoot;               // 0G Storage root of encrypted Solidity contract(s)
        bytes32[] inScopeCwes;          // keccak256 of CWE/SWC class names; empty = any
        uint64  postedAt;
        uint64  raceDeadline;           // hard cutoff for findings
        uint64  settleDeadline;         // raceDeadline + SETTLE_WINDOW; after this, anyone can expire
        BountyStatus status;
        uint256 winningFindingIdx;      // valid only when status == Settled
    }

    /// A single finding submitted by a hunter against a bounty.
    /// TEE attestation includes teeTimestamp — chain validators can't game it; this is what
    /// proves "this AI computed on this input at this time", the core anti-cheat claim.
    struct Finding {
        uint256 hunterId;
        address hunter;
        bytes32 cweClass;
        uint8   severity;               // 1=low, 2=medium, 3=high, 4=critical
        bytes32 findingRoot;            // 0G Storage root of encrypted finding payload
        bytes32 attestationDigest;
        bytes   attestationSig;
        uint64  teeTimestamp;
        uint64  submittedAt;
        uint16  severityCalibrationBpsSelfEval;
        uint16  precisionBpsSelfEval;
        uint16  coverageBpsSelfEval;
        uint16  exploitabilityBpsSelfEval;
    }

    /// Protocol's post-race rating of the winning finding.
    struct AuditRating {
        uint8 severityCalibration;      // 1..5 each
        uint8 precision;
        uint8 coverage;
        uint8 exploitability;
    }

    /// Single calldata bundle for submitFinding (stack-depth optimisation).
    struct FindingInput {
        bytes32 cweClass;
        uint8   severity;
        bytes32 findingRoot;
        uint16  severityCalibrationBps;
        uint16  precisionBps;
        uint16  coverageBps;
        uint16  exploitabilityBps;
        bytes32 modelDigest;
        uint64  teeTimestamp;
        bytes   attestationSig;
    }

    // ─── Constants ──────────────────────────────────────────────────────

    uint16  public constant MIN_FINGERPRINT_QUALITY_BPS = 6000;
    uint16  public constant MIN_FINDING_QUALITY_BPS     = 6000;  // TEE self-eval floor
    uint64  public constant MIN_RACE_DURATION           = 5 minutes;
    uint64  public constant MAX_RACE_DURATION           = 7 days;
    uint64  public constant SETTLE_WINDOW               = 24 hours;

    uint32  public constant MIN_ACCOUNT_AGE_DAYS        = 730;
    uint32  public constant MIN_MERGED_PRS              = 20;
    uint32  public constant MIN_CODE_REVIEW_COUNT       = 10;

    // ─── State ──────────────────────────────────────────────────────────

    address public teeSigner;
    address public verifier;
    address public admin;

    mapping(uint256 => Hunter)  internal huntersMap;
    mapping(uint256 => Bounty)  internal bountiesMap;
    mapping(uint256 => Finding[]) internal findingsMap;   // bountyId => list

    // hunterId => keccak("SWC-107-reentrancy" etc.) => rep
    mapping(uint256 => mapping(bytes32 => ClassRep)) internal repByClassMap;

    uint256 public nextHunterId;
    uint256 public nextBountyId;

    // Credential replay protection
    mapping(bytes32 => bool) public credentialUsed;

    // ─── Events ─────────────────────────────────────────────────────────

    event HunterMinted(uint256 indexed hunterId, address indexed owner,
                       bytes32 indexed githubHandleHash, string specialty, uint16 fingerprintOverallBps);
    event HunterUpdated(uint256 indexed hunterId, bool paused);

    event BountyPosted(uint256 indexed bountyId, address indexed poster, uint256 maxPayout,
                       bytes32 codeRoot, uint64 raceDeadline);
    event FindingSubmitted(uint256 indexed bountyId, uint256 indexed findingIdx,
                           uint256 indexed hunterId, bytes32 cweClass, uint8 severity,
                           uint64 teeTimestamp);
    event BountySettled(uint256 indexed bountyId, uint256 indexed winningFindingIdx,
                        uint256 indexed winningHunterId, bytes32 cweClass, uint256 paid);
    event BountyExpired(uint256 indexed bountyId, uint256 refunded);
    event ClassRepUpdated(uint256 indexed hunterId, bytes32 indexed cweClass,
                          uint32 wins, uint32 submissions);

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

    // ─── Hunter mint ────────────────────────────────────────────────────

    function mintHunter(
        Credential calldata cred,
        bytes32[] calldata sampleRoots,
        bytes32[] calldata embedRoots,
        SampleFingerprint calldata fp,
        string calldata specialty,
        string calldata description
    ) external returns (uint256 hunterId) {
        require(sampleRoots.length >= 3 && sampleRoots.length <= 20, "samples 3..20");
        require(sampleRoots.length == embedRoots.length, "sample/embed length mismatch");
        require(bytes(specialty).length > 0 && bytes(specialty).length <= 64, "specialty 1..64");
        require(bytes(description).length <= 280, "desc>280");
        require(fp.overallBps >= MIN_FINGERPRINT_QUALITY_BPS, "fingerprint below bar");

        require(cred.verifier == verifier, "wrong verifier");
        require(cred.accountAgeDays >= MIN_ACCOUNT_AGE_DAYS, "github age");
        require(cred.mergedPRs >= MIN_MERGED_PRS, "merged PRs");
        require(cred.codeReviewCount >= MIN_CODE_REVIEW_COUNT, "review count");

        bytes32 credDigest = _credDigest(msg.sender, cred);
        require(!credentialUsed[credDigest], "credential reused");
        require(_recoverEth(credDigest, cred.sig) == verifier, "bad cred sig");

        bytes32 fpDigest = _fingerprintDigest(sampleRoots, fp);
        require(_recoverEth(fpDigest, fp.teeSig) == teeSigner, "bad fingerprint sig");

        credentialUsed[credDigest] = true;

        hunterId = nextHunterId++;
        Hunter storage h = huntersMap[hunterId];
        h.owner = msg.sender;
        h.credential = cred;
        h.sampleRoots = sampleRoots;
        h.embedRoots = embedRoots;
        h.fingerprint = fp;
        h.specialty = specialty;
        h.description = description;

        emit HunterMinted(hunterId, msg.sender, cred.githubHandleHash, specialty, fp.overallBps);
    }

    function pauseHunter(uint256 hunterId, bool paused) external {
        Hunter storage h = huntersMap[hunterId];
        require(h.owner == msg.sender, "not owner");
        h.paused = paused;
        emit HunterUpdated(hunterId, paused);
    }

    // ─── Bounty lifecycle ───────────────────────────────────────────────

    function postBounty(
        bytes32 codeRoot,
        bytes32[] calldata inScopeCwes,
        uint64  raceDuration
    ) external payable returns (uint256 bountyId) {
        require(msg.value > 0, "payout=0");
        require(codeRoot != bytes32(0), "empty code");
        require(raceDuration >= MIN_RACE_DURATION && raceDuration <= MAX_RACE_DURATION, "race duration");

        bountyId = nextBountyId++;
        Bounty storage b = bountiesMap[bountyId];
        b.poster = msg.sender;
        b.maxPayout = msg.value;
        b.codeRoot = codeRoot;
        b.inScopeCwes = inScopeCwes;
        b.postedAt = uint64(block.timestamp);
        b.raceDeadline = uint64(block.timestamp) + raceDuration;
        b.settleDeadline = b.raceDeadline + SETTLE_WINDOW;
        b.status = BountyStatus.Open;

        emit BountyPosted(bountyId, msg.sender, msg.value, codeRoot, b.raceDeadline);
    }

    /// Hunter submits a finding before the race deadline. The TEE attestation
    /// must include the bounty's codeRoot, the hunter's cweClass + severity, and a
    /// teeTimestamp that falls strictly within [postedAt, raceDeadline]. This is the
    /// "the AI saw this input at this time" anti-cheat guarantee.
    function submitFinding(
        uint256 bountyId,
        uint256 hunterId,
        FindingInput calldata input
    ) external returns (uint256 findingIdx) {
        Bounty storage b = bountiesMap[bountyId];
        Hunter storage h = huntersMap[hunterId];

        require(b.poster != address(0), "bounty not found");
        require(b.status == BountyStatus.Open, "bounty not open");
        require(block.timestamp <= b.raceDeadline, "race over");
        require(h.owner == msg.sender, "not hunter owner");
        require(!h.paused, "hunter paused");
        require(input.severity >= 1 && input.severity <= 4, "severity 1..4");
        require(input.findingRoot != bytes32(0), "empty finding");
        require(input.teeTimestamp >= b.postedAt && input.teeTimestamp <= b.raceDeadline, "tee timestamp window");
        require(_classInScope(b.inScopeCwes, input.cweClass), "class out of scope");

        uint16 selfEvalAvg = (input.severityCalibrationBps + input.precisionBps + input.coverageBps + input.exploitabilityBps) / 4;
        require(selfEvalAvg >= MIN_FINDING_QUALITY_BPS, "self-eval below bar");

        bytes32 digest = keccak256(abi.encode(
            bountyId, b.codeRoot, hunterId, input.cweClass, input.severity,
            input.findingRoot, input.modelDigest, input.teeTimestamp,
            input.severityCalibrationBps, input.precisionBps, input.coverageBps, input.exploitabilityBps
        ));
        require(_recoverEth(digest, input.attestationSig) == teeSigner, "bad attestation sig");

        findingIdx = findingsMap[bountyId].length;
        findingsMap[bountyId].push(Finding({
            hunterId: hunterId,
            hunter: msg.sender,
            cweClass: input.cweClass,
            severity: input.severity,
            findingRoot: input.findingRoot,
            attestationDigest: digest,
            attestationSig: input.attestationSig,
            teeTimestamp: input.teeTimestamp,
            submittedAt: uint64(block.timestamp),
            severityCalibrationBpsSelfEval: input.severityCalibrationBps,
            precisionBpsSelfEval: input.precisionBps,
            coverageBpsSelfEval: input.coverageBps,
            exploitabilityBpsSelfEval: input.exploitabilityBps
        }));

        h.totalSubmissions++;

        emit FindingSubmitted(bountyId, findingIdx, hunterId, input.cweClass, input.severity, input.teeTimestamp);
    }

    /// Bounty poster settles by picking the winning finding + rating it 1..5 on each axis.
    /// Reputation accrues to the winner per their finding's CWE class.
    function settleBounty(uint256 bountyId, uint256 findingIdx, AuditRating calldata r) external {
        Bounty storage b = bountiesMap[bountyId];
        require(b.poster == msg.sender, "not poster");
        require(b.status == BountyStatus.Open, "not open");
        require(block.timestamp > b.raceDeadline, "race not over");
        require(block.timestamp <= b.settleDeadline, "settle window closed");
        require(findingIdx < findingsMap[bountyId].length, "bad findingIdx");
        require(_ratingValid(r), "rating 1..5");

        Finding storage f = findingsMap[bountyId][findingIdx];

        b.status = BountyStatus.Settled;
        b.winningFindingIdx = findingIdx;

        uint256 amount = b.maxPayout;
        b.maxPayout = 0;

        // Per-CWE rep
        ClassRep storage rep = repByClassMap[f.hunterId][f.cweClass];
        rep.wins++;
        rep.submissions++;
        rep.totalEarnedWei += uint64(amount);
        rep.sumSeverityCalibration += r.severityCalibration;
        rep.sumPrecision            += r.precision;
        rep.sumCoverage             += r.coverage;
        rep.sumExploitability       += r.exploitability;

        // Hunter aggregate
        Hunter storage h = huntersMap[f.hunterId];
        h.totalWins++;
        h.totalEarnedWei += uint64(amount);

        emit BountySettled(bountyId, findingIdx, f.hunterId, f.cweClass, amount);
        emit ClassRepUpdated(f.hunterId, f.cweClass, rep.wins, rep.submissions);

        (bool ok,) = payable(f.hunter).call{value: amount}("");
        require(ok, "payout failed");
    }

    /// If the bounty has no findings AND raceDeadline passed, OR settleDeadline passed
    /// without settlement, the poster (or anyone) can expire it and refund escrow.
    function expireBounty(uint256 bountyId) external {
        Bounty storage b = bountiesMap[bountyId];
        require(b.status == BountyStatus.Open, "not open");

        bool noFindings    = findingsMap[bountyId].length == 0 && block.timestamp > b.raceDeadline;
        bool settleExpired = block.timestamp > b.settleDeadline;
        require(noFindings || settleExpired, "still active");

        b.status = BountyStatus.Expired;
        uint256 amount = b.maxPayout;
        b.maxPayout = 0;

        emit BountyExpired(bountyId, amount);
        (bool ok,) = payable(b.poster).call{value: amount}("");
        require(ok, "refund failed");
    }

    // ─── Verification helpers ───────────────────────────────────────────

    function _classInScope(bytes32[] storage inScope, bytes32 cls) internal view returns (bool) {
        if (inScope.length == 0) return true;  // empty = any class accepted
        for (uint256 i = 0; i < inScope.length; i++) {
            if (inScope[i] == cls) return true;
        }
        return false;
    }

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
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return address(0);
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        return ecrecover(ethHash, v, r, s);
    }

    function _ratingValid(AuditRating calldata r) internal pure returns (bool) {
        return r.severityCalibration >= 1 && r.severityCalibration <= 5
            && r.precision            >= 1 && r.precision            <= 5
            && r.coverage             >= 1 && r.coverage             <= 5
            && r.exploitability       >= 1 && r.exploitability       <= 5;
    }

    // ─── Views ──────────────────────────────────────────────────────────

    function getHunter(uint256 hunterId) external view returns (Hunter memory) { return huntersMap[hunterId]; }
    function getBounty(uint256 bountyId) external view returns (Bounty memory) { return bountiesMap[bountyId]; }
    function getFindings(uint256 bountyId) external view returns (Finding[] memory) { return findingsMap[bountyId]; }
    function getFindingsCount(uint256 bountyId) external view returns (uint256) { return findingsMap[bountyId].length; }
    function getSampleRoots(uint256 hunterId) external view returns (bytes32[] memory) { return huntersMap[hunterId].sampleRoots; }
    function getEmbedRoots(uint256 hunterId)  external view returns (bytes32[] memory) { return huntersMap[hunterId].embedRoots; }
    function getInScopeCwes(uint256 bountyId) external view returns (bytes32[] memory) { return bountiesMap[bountyId].inScopeCwes; }

    function getClassRep(uint256 hunterId, bytes32 cweClass) external view returns (ClassRep memory) {
        return repByClassMap[hunterId][cweClass];
    }

    /// Per-class averages in bps (1.0 rating = 10000 bps; perfect-5 avg = 50000 bps).
    function classAvg(uint256 hunterId, bytes32 cweClass)
        external view
        returns (uint64 severityCalibrationBps, uint64 precisionBps, uint64 coverageBps, uint64 exploitabilityBps)
    {
        ClassRep storage rep = repByClassMap[hunterId][cweClass];
        if (rep.wins == 0) return (0, 0, 0, 0);
        uint64 n = rep.wins;
        severityCalibrationBps = (rep.sumSeverityCalibration * 10000) / n;
        precisionBps           = (rep.sumPrecision           * 10000) / n;
        coverageBps            = (rep.sumCoverage            * 10000) / n;
        exploitabilityBps      = (rep.sumExploitability      * 10000) / n;
    }

    function totalHunters()  external view returns (uint256) { return nextHunterId;  }
    function totalBounties() external view returns (uint256) { return nextBountyId;  }
}
