# Staged bounty — HelixVault

## Narrative

HelixVault pretends to be a small CDP-style stablecoin: deposit a liquid-staking
token as collateral, mint `hUSD` against it, get liquidated if your position
drops below 150% collateralisation. Pricing is pulled from a Chainlink-style
aggregator. The team ships with a publicly advertised one-hour oracle staleness
guarantee and built the `setPrice` admin function to enforce it.

This is a single-file fictional protocol staged for the Hunt sealed bug-bounty
network. Do not deploy.

## Expected finding

- **Severity:** high
- **CWE class:** `oracle-manipulation`
- **Location:** `Vault.sol` — `_currentPrice()` (lines ~88–101) and every
  caller (`liquidate`, `withdraw`, `mint`, `_isHealthy`, `healthFactorBps`).
- **Class summary:** the live oracle read path validates round completeness
  (`answeredInRound >= roundId`) and a positive answer, but never compares
  `updatedAt` against `block.timestamp` or the contract's own
  `maxOracleStaleness` threshold. The freshness check that the protocol
  advertises in docs is implemented only in `setPrice`, an admin-only function
  whose snapshotted values (`lastRecordedAnswer`, `lastRecordedUpdatedAt`) are
  never read by the user-facing pricing path.

### Attack path

1. The underlying aggregator stops updating (sequencer downtime, frozen feed,
   or operator outage). `answeredInRound == roundId` still holds because the
   last completed round is intact; the answer is still positive.
2. The true market price of the collateral drops 20%.
3. Attacker calls `liquidate(victim, debtToCover)`. `_currentPrice()` returns
   the stale (pre-drop) high price, so the seized collateral calculation
   under-counts how much collateral the protocol is parting with for each
   unit of debt covered — the liquidator over-collects relative to fair value.
4. In the mirrored direction, an honest borrower trying to `withdraw` or
   `mint` against a stale-but-recovering price is incorrectly blocked or
   approved versus reality.
5. Repeat across positions until the vault is drained of healthy collateral
   at off-market prices.

The bug also breaks the design intent of the `liquidationBonus`: under a
stale price the bonus compounds on top of the liquidator's existing price
arbitrage gain.

### Fix

Replicate `setPrice`'s freshness check on the read path:

```solidity
function _currentPrice() internal view returns (uint256) {
    (uint80 roundId, int256 answer, , uint256 updatedAt, uint80 answeredInRound)
        = priceFeed.latestRoundData();
    require(answer > 0, "bad answer");
    require(answeredInRound >= roundId, "stale round");
    require(block.timestamp - updatedAt <= maxOracleStaleness, "stale price");
    return uint256(answer);
}
```

Alternatively, route all user-path reads through `lastRecordedAnswer` and
require `setPrice` to be called within `maxOracleStaleness` of each user
action — but that requires a keeper and pushes liveness onto the operator.

## Source inspiration

This is a modified fork of a recurring 2024–2025 audit pattern. Concrete
public references:

- Code4rena Prisma Finance contest (Mar 2024) — multiple findings around
  Chainlink aggregator integrations that read `answer` but skipped
  `updatedAt` validation against `block.timestamp`. See the public report at
  `https://code4rena.com/reports/2024-03-prismafi` (finding family:
  "Chainlink price feed staleness").
- Sherlock Angle Protocol contest (2024) — finding "Stale Chainlink price
  used in collateral health computations". Same shape: round-completeness
  checked, `updatedAt` ignored.
- The general Chainlink-recommended pattern is documented at
  `https://docs.chain.link/data-feeds/historical-data` and the Sherlock
  judging-handbook entry on oracle freshness reiterates it.

The staging modification here is that the protocol _did_ implement the
freshness check — just on the wrong code path. A hunter who pattern-matches
on "missing `updatedAt` check" will see `updatedAt` being read in
`_currentPrice` and may dismiss the finding; a hunter who pattern-matches on
"`maxOracleStaleness` exists" will see the state variable and assume it's
being used.

## Why this requires reasoning

Pure pattern-matching fails twice over: the contract _does_ read `updatedAt`
and _does_ define a `maxOracleStaleness` threshold, so naive linters and
grep-style detectors will mark both as "present". The bug only surfaces when
the auditor traces which function actually compares `updatedAt` against
`block.timestamp` — and notices that path is admin-only, while every user
entry point (`liquidate`, `withdraw`, `mint`, health math) bypasses the
recorded snapshot and goes straight to `latestRoundData()` without the
freshness gate. Identifying it requires call-flow reasoning, not regex.
