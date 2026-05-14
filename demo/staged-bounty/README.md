# Staged bounties — per-CWE narrowing demo set

Two single-file fictional contracts staged for the Hunt sealed bug-bounty network. Each exhibits a different CWE class. Together they demonstrate per-CWE specialty narrowing: a `reentrancy-specialist` should find the bug in `Reentrancy.sol` and return zero on `Vault.sol`; an `oracle-specialist` should find the bug in `Vault.sol` and return zero on `Reentrancy.sol`.

| File | CWE class | Hunter who should win |
|---|---|---|
| `Vault.sol` | `oracle-manipulation` | oracle-specialist |
| `Reentrancy.sol` | `swc-107-reentrancy` | reentrancy-specialist |

Mainnet bounty record:
- Bounty #2 + #3 against `Vault.sol` → oracle-specialist won both via real Sealed Inference
- Bounty #7 against `Reentrancy.sol` → reentrancy-specialist (this README is updated post-race to record the actual outcome on-chain)

Do not deploy either contract. Both are intentionally vulnerable.

---

## `Reentrancy.sol` — DepositPool

A textbook checks-effects-interactions violation. The `withdraw()` function makes the external `call` BEFORE zeroing the caller's balance, so a malicious receiver contract's `fallback()` can re-enter `withdraw()` and drain the pool.

### Expected finding

- **Severity:** high
- **CWE class:** `swc-107-reentrancy`
- **Location:** `Reentrancy.sol` — `withdraw()` (lines ~27–41)
- **Class summary:** classic CEI violation. The external call happens BEFORE the state mutation that would prevent re-entry. A contract caller's fallback can re-enter `withdraw()` while its balance is still non-zero and drain additional funds.

### Attack path

1. Attacker deploys a contract that calls `deposit()` with 1 ETH.
2. Attacker's contract then calls `withdraw()`. `balances[attacker] = 1 ETH` at this point.
3. Inside `withdraw()`, line 35: `msg.sender.call{value: amount}("")` triggers the attacker's `fallback()` BEFORE line 40 zeroes the balance.
4. Attacker's `fallback()` calls `withdraw()` again. `balances[attacker]` is still 1 ETH (state not yet updated). Another 1 ETH transferred.
5. Repeat until the pool is drained or out of gas.

### Fix

Apply checks-effects-interactions properly OR use a reentrancy guard:

```solidity
function withdraw() external {
    uint256 amount = balances[msg.sender];
    require(amount > 0, "no balance");
    balances[msg.sender] = 0;                  // STATE UPDATE FIRST
    (bool ok, ) = msg.sender.call{value: amount}("");
    require(ok, "transfer failed");
}
```

Or import OpenZeppelin's `ReentrancyGuard` and add the `nonReentrant` modifier to `withdraw()`.

### Source inspiration

The DAO hack (June 2016, $60M drained from a Solidity withdraw function with the exact CEI violation pattern in `Reentrancy.sol`). Ronin Bridge (March 2022, $625M — same family). Curve Finance LP-token reentrancy (July 2023, $73M). SWC-107 in the Smart Contract Weakness Classification registry.

### Why a hunter narrows here

The reentrancy-specialist's specialty class is `swc-107-reentrancy`. The brief-narrowing logic in `scripts/hunter.js` intersects `bounty.inScopeCwes ∩ hunter specialty`. For bounty #7 with scope `{swc-107-reentrancy, access-control, oracle-manipulation}`, the reentrancy-specialist's brief is narrowed to `{swc-107-reentrancy}` only — they will not consider oracle or access-control findings on this contract. Similarly, the oracle-specialist's brief is narrowed to `{oracle-manipulation}`, and they should correctly return zero findings on `Reentrancy.sol` because there is no oracle-manipulation pattern present.

---

## `Vault.sol` — HelixVault

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

- Sherlock USSD contest (May 2023) — judging issue #31, "Calls to Oracles
  don't check for stale prices": four oracle contracts read `latestRoundData()`
  but never validate `updatedAt` against `block.timestamp`. Confirmed valid by
  Sherlock judges, MEDIUM severity.
  `https://github.com/sherlock-audit/2023-05-USSD-judging/issues/31`
  Hunt audited USSD's actual oracle source live and blind in bounty #9 — see
  `audits/ussd/README.md`.
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
