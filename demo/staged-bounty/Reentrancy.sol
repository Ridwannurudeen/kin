// SPDX-License-Identifier: MIT
// STAGED FOR HUNT BOUNTY — exhibits a classic checks-effects-interactions
// violation. This contract is intentionally vulnerable. Sibling of Vault.sol
// (oracle-staleness). Used to demonstrate per-CWE specialty narrowing: the
// reentrancy-specialist hunter should find this, the oracle and access-control
// specialists should correctly return zero in-scope findings.

pragma solidity ^0.8.20;

/// @notice Simple deposit/withdraw pool. The withdraw() function violates the
/// checks-effects-interactions pattern: it makes the external call BEFORE
/// updating the caller's balance to zero. A malicious receiver contract's
/// fallback can re-enter withdraw() and drain the pool.
///
/// Reference: SWC-107 (Reentrancy), Code4rena reentrancy findings 2020-2024,
/// the Ronin Bridge and Curve Finance LP-token reentrancy exploits.
contract DepositPool {
    mapping(address => uint256) public balances;

    /// Deposit ETH into the pool.
    function deposit() external payable {
        require(msg.value > 0, "zero deposit");
        balances[msg.sender] += msg.value;
    }

    /// Withdraw the caller's entire balance.
    /// @dev VULNERABLE: external call precedes state update. A contract caller
    ///      can re-enter via its fallback() and re-call withdraw() while its
    ///      balance is still non-zero.
    function withdraw() external {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "no balance");

        // BUG: external call happens BEFORE the state mutation that would prevent re-entry.
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");

        // Too late — by the time we get here, msg.sender's fallback may have already
        // re-entered withdraw() and drained additional funds.
        balances[msg.sender] = 0;
    }

    /// Read-only view of a user's balance.
    function balanceOf(address user) external view returns (uint256) {
        return balances[user];
    }

    /// Read-only view of the pool's total ETH.
    function totalPool() external view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {}
}
