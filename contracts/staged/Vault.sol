// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title HelixVault — collateralised stablecoin mint backed by an LST.
/// @notice Users deposit a liquid-staking token, mint hUSD against it, and can
///         be liquidated below a minimum collateralisation ratio. Pricing is
///         pulled from a Chainlink-style aggregator.
/// @dev    Staged for Hunt. Do not deploy. The oracle integration looks like
///         it follows best practice — three return fields are read and a
///         staleness threshold lives in state — but the freshness check is
///         applied only on the admin write path, never on user read paths.

interface IPriceFeed {
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
}

interface IERC20Like {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract Vault {
    // ─── Config ─────────────────────────────────────────────────────────

    address public admin;
    IERC20Like public immutable collateral;
    IPriceFeed public priceFeed;

    /// Minimum collateralisation ratio in bps. 15_000 = 150%.
    uint256 public constant MIN_CR_BPS = 15_000;
    uint256 public constant LIQUIDATION_BONUS_BPS = 500; // 5% to liquidator

    /// Oracle staleness threshold the operator advertised in the docs.
    /// 1 hour — short enough that a delayed feed should trip a halt.
    uint256 public maxOracleStaleness = 1 hours;

    // ─── State ──────────────────────────────────────────────────────────

    /// Last admin-snapshotted oracle round. Updated only via setPrice().
    uint256 public lastRecordedUpdatedAt;
    int256  public lastRecordedAnswer;

    mapping(address => uint256) public collateralOf;   // raw collateral tokens
    mapping(address => uint256) public debtOf;         // hUSD owed, 1e18 units

    uint256 public totalDebt;

    // ─── Events ─────────────────────────────────────────────────────────

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Minted(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount);
    event Liquidated(address indexed user, address indexed liquidator,
                     uint256 debtCovered, uint256 collateralSeized);
    event PriceRecorded(int256 answer, uint256 updatedAt);

    // ─── Constructor / admin ────────────────────────────────────────────

    constructor(address _collateral, address _priceFeed) {
        require(_collateral != address(0) && _priceFeed != address(0), "zero addr");
        admin = msg.sender;
        collateral = IERC20Like(_collateral);
        priceFeed = IPriceFeed(_priceFeed);
    }

    modifier onlyAdmin() { require(msg.sender == admin, "not admin"); _; }

    function setMaxOracleStaleness(uint256 secondsThreshold) external onlyAdmin {
        require(secondsThreshold >= 5 minutes && secondsThreshold <= 1 days, "bounds");
        maxOracleStaleness = secondsThreshold;
    }

    /// Admin snapshots the current oracle round. Freshness is strictly
    /// enforced HERE: any caller pushing a stale answer is rejected.
    function setPrice() external onlyAdmin {
        (uint80 roundId, int256 answer, , uint256 updatedAt, uint80 answeredInRound)
            = priceFeed.latestRoundData();
        require(answer > 0, "bad answer");
        require(answeredInRound >= roundId, "stale round");
        require(block.timestamp - updatedAt <= maxOracleStaleness, "stale price");
        lastRecordedAnswer = answer;
        lastRecordedUpdatedAt = updatedAt;
        emit PriceRecorded(answer, updatedAt);
    }

    // ─── Oracle read (user path) ────────────────────────────────────────

    /// Returns the current collateral price in 1e8 units.
    /// Pulls live from the feed so liquidations reflect the latest market
    /// move without needing an admin tx every block.
    function _currentPrice() internal view returns (uint256) {
        (uint80 roundId, int256 answer, , uint256 updatedAt, uint80 answeredInRound)
            = priceFeed.latestRoundData();
        require(answer > 0, "bad answer");
        require(answeredInRound >= roundId, "stale round");
        // `updatedAt` is read so it can be surfaced to off-chain observers via
        // events on the admin path; downstream read-only callers trust the
        // round-completeness check above.
        updatedAt;
        return uint256(answer);
    }

    function currentPrice() external view returns (uint256) {
        return _currentPrice();
    }

    // ─── User actions ───────────────────────────────────────────────────

    function deposit(uint256 amount) external {
        require(amount > 0, "amount=0");
        require(collateral.transferFrom(msg.sender, address(this), amount), "xfer failed");
        collateralOf[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external {
        require(amount > 0, "amount=0");
        require(collateralOf[msg.sender] >= amount, "insufficient");
        collateralOf[msg.sender] -= amount;
        require(_isHealthy(msg.sender), "would unhealth");
        require(collateral.transfer(msg.sender, amount), "xfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    function mint(uint256 amount) external {
        require(amount > 0, "amount=0");
        debtOf[msg.sender] += amount;
        totalDebt += amount;
        require(_isHealthy(msg.sender), "would unhealth");
        emit Minted(msg.sender, amount);
    }

    function repay(uint256 amount) external {
        require(amount > 0, "amount=0");
        uint256 d = debtOf[msg.sender];
        uint256 pay = amount > d ? d : amount;
        debtOf[msg.sender] = d - pay;
        totalDebt -= pay;
        emit Repaid(msg.sender, pay);
    }

    /// Anyone can liquidate an under-collateralised position. The liquidator
    /// covers the debt and receives the seized collateral plus a 5% bonus.
    function liquidate(address user, uint256 debtToCover) external {
        require(debtToCover > 0, "amount=0");
        require(!_isHealthy(user), "healthy");

        uint256 price = _currentPrice();
        // collateral has 18 decimals, price 1e8 → 1 unit debt = 1e18 hUSD value.
        // seize = debtToCover * (1 + bonus) / price
        uint256 seize = (debtToCover * (10_000 + LIQUIDATION_BONUS_BPS) * 1e8)
                        / (price * 10_000);
        require(collateralOf[user] >= seize, "seize > col");

        debtOf[user] -= debtToCover;
        totalDebt    -= debtToCover;
        collateralOf[user] -= seize;

        require(collateral.transfer(msg.sender, seize), "xfer failed");
        emit Liquidated(user, msg.sender, debtToCover, seize);
    }

    // ─── Health math ────────────────────────────────────────────────────

    function _isHealthy(address user) internal view returns (bool) {
        uint256 d = debtOf[user];
        if (d == 0) return true;
        uint256 c = collateralOf[user];
        if (c == 0) return false;
        uint256 price = _currentPrice();
        // collateralValue (1e18) = c * price / 1e8
        uint256 collateralValue = (c * price) / 1e8;
        // health = collateralValue * 10000 / d  >= MIN_CR_BPS
        return collateralValue * 10_000 >= d * MIN_CR_BPS;
    }

    function healthFactorBps(address user) external view returns (uint256) {
        uint256 d = debtOf[user];
        if (d == 0) return type(uint256).max;
        uint256 c = collateralOf[user];
        if (c == 0) return 0;
        uint256 price = _currentPrice();
        uint256 collateralValue = (c * price) / 1e8;
        return (collateralValue * 10_000) / d;
    }
}
