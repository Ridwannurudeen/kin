# Blueberry ChainlinkAdapterOracle target

This directory holds a compact historical DeFi oracle target for future Hunt
blind-test races.

## Source

`ChainlinkAdapterOracle.sol` is copied from the Sherlock 2023-02 Blueberry
contest source:

- Contest source: https://github.com/sherlock-audit/2023-02-blueberry/blob/main/contracts/oracle/ChainlinkAdapterOracle.sol
- Source commit checked: `0828dd2afbc1fd0feb137c78048a445d9cf0eabe`
- Public judging issue: https://github.com/sherlock-audit/2023-02-blueberry-judging/issues/94

The local Solidity body matches the contest source; only final-newline
normalization may differ.

## Why this target is useful

The contract is small enough for a one-race Hunt run, but it still exercises a
real oracle-adapter pattern:

- Chainlink feed registry reads
- token remapping
- max-delay freshness policy
- 18-decimal normalization

That makes it a clean target for the `oracle-manipulation` specialist without
requiring a full protocol-sized source tree.

## Current Hunt status

No Hunt bounty has been recorded for this file yet. If it becomes public
evidence, record the bounty ID, post tx, finding tx, settle or expire tx, and
strict verifier output here before citing it in the main README or submission.
