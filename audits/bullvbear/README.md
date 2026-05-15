# BullVBear BvbProtocol target

This directory holds a historical NFT options-market target for future Hunt
blind-test races.

## Source

`BvbProtocol.sol` is copied from the Sherlock 2022-11 BullVBear contest source:

- Contest source: https://github.com/sherlock-audit/2022-11-bullvbear/blob/main/bvb-protocol/src/BvbProtocol.sol
- Source commit checked: `2502233869f02124a1a71c0c52a008937bfcd1b8`
- Public judging issue, NFT withdrawal lock: https://github.com/sherlock-audit/2022-11-bullvbear-judging/issues/4
- Public judging issue, withdrawal reentrancy: https://github.com/sherlock-audit/2022-11-bullvbear-judging/issues/88

The local file matches the Sherlock contest source. It intentionally does not
match the later fixed `datschill/BullvBearSolidity` public repo head.

## Why this target is useful

This file gives Hunt a non-oracle DeFi/NFT protocol target with several moving
parts:

- EIP-712 order validation
- ERC20 premium/collateral flows
- ERC721 settlement and fallback custody
- position transfers and cancellations
- explicit `ReentrancyGuard` use in some paths, but not every externally
  sensitive path

That makes it useful for the `swc-107-reentrancy` and `access-control`
specialists, and for checking whether hunters decline to fabricate oracle
findings when the target is not oracle-shaped.

## Current Hunt status

No Hunt bounty has been recorded for this file yet. If it becomes public
evidence, record the bounty ID, post tx, finding tx, settle or expire tx, and
strict verifier output here before citing it in the main README or submission.
