// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IHunt {
    struct ClassRep {
        uint32 wins;
        uint32 submissions;
        uint256 totalEarnedWei;
        uint64 sumSeverityCalibration;
        uint64 sumPrecision;
        uint64 sumCoverage;
        uint64 sumExploitability;
    }

    function getClassRep(uint256 hunterId, bytes32 cweClass) external view returns (ClassRep memory);
    function totalHunters() external view returns (uint256);
}

/// HuntReputationOracle - stable, cross-chain-readable view of per-domain
/// reputation accrued on Hunt. Wraps the deployed Hunt contract and exposes a
/// normalized interface that's safe for any chain to query via JSON-RPC or
/// future cross-chain message bridges.
contract HuntReputationOracle {
    address public immutable HUNT;
    address public admin;

    // Domain registry - admin registers a domain (string name) and its set of
    // canonical class strings (also strings). Both stored as keccak hashes.
    mapping(bytes32 => bytes32[]) public domainClasses;          // domain -> [classBytes32]
    mapping(bytes32 => string)    public domainName;             // domain -> readable name
    mapping(bytes32 => string)    public className;              // classBytes32 -> readable name
    bytes32[]                     public domains;

    event DomainRegistered(bytes32 indexed domain, string name);
    event ClassRegistered(bytes32 indexed domain, bytes32 indexed classBytes32, string name);

    constructor(address huntAddress) {
        require(huntAddress != address(0), "hunt=0");
        HUNT = huntAddress;
        admin = msg.sender;
    }

    function registerDomain(string memory name) external {
        require(msg.sender == admin, "not admin");
        bytes32 d = keccak256(bytes(name));
        if (bytes(domainName[d]).length == 0) {
            domains.push(d);
            domainName[d] = name;
            emit DomainRegistered(d, name);
        }
    }

    function registerClass(string memory domain, string memory classNameStr) external {
        require(msg.sender == admin, "not admin");
        bytes32 d = keccak256(bytes(domain));
        require(bytes(domainName[d]).length != 0, "domain not registered");
        bytes32 c = keccak256(bytes(classNameStr));
        // dedupe
        bytes32[] storage cs = domainClasses[d];
        for (uint256 i = 0; i < cs.length; i++) {
            if (cs[i] == c) return;
        }
        cs.push(c);
        className[c] = classNameStr;
        emit ClassRegistered(d, c, classNameStr);
    }

    function getDomains() external view returns (bytes32[] memory) { return domains; }
    function getClasses(bytes32 domain) external view returns (bytes32[] memory) { return domainClasses[domain]; }

    /// Get raw class rep for a specific hunter + class. Pass-through to Hunt.
    function getReputationByClass(uint256 hunterId, bytes32 classBytes32)
        external view returns (IHunt.ClassRep memory)
    {
        return IHunt(HUNT).getClassRep(hunterId, classBytes32);
    }

    struct AggregateView {
        uint256 totalWins;
        uint256 totalSubmissions;
        uint256 totalEarnedWei;
        uint256 hunterCount;       // number of hunters with any wins in this domain
    }

    /// Aggregate reputation across all hunters for a given domain. O(hunters x classes).
    /// Read-only and gas-limit-bound; reasonable for <=100 hunters x <=20 classes per domain.
    function aggregateDomain(bytes32 domain) external view returns (AggregateView memory v) {
        uint256 hunters = IHunt(HUNT).totalHunters();
        bytes32[] memory classes = domainClasses[domain];
        for (uint256 h = 0; h < hunters; h++) {
            uint256 hWins = 0;
            uint256 hSubs = 0;
            uint256 hEarn = 0;
            for (uint256 c = 0; c < classes.length; c++) {
                IHunt.ClassRep memory rep = IHunt(HUNT).getClassRep(h, classes[c]);
                hWins += rep.wins;
                hSubs += rep.submissions;
                hEarn += rep.totalEarnedWei;
            }
            v.totalWins += hWins;
            v.totalSubmissions += hSubs;
            v.totalEarnedWei += hEarn;
            if (hWins > 0) v.hunterCount += 1;
        }
    }

    function transferAdmin(address newAdmin) external {
        require(msg.sender == admin, "not admin");
        require(newAdmin != address(0), "admin=0");
        admin = newAdmin;
    }
}
