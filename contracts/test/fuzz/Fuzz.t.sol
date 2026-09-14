// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {VaultTestBase} from "../helpers/VaultTestBase.sol";
import {VaultErrors as E} from "../../src/errors/Errors.sol";
import {Status} from "../../src/structs/Types.sol";
import {WillLib} from "../../src/libraries/WillLib.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";

/// @notice Property-based tests over the arithmetic and the timeline.
/// @dev The Solana suite had no fuzzing; these cover the numeric edges that
///      hand-written cases miss.
contract FuzzTest is VaultTestBase {
    /// @dev The distribution property that matters most: however the shares are
    ///      split, the heirs together can never draw more than was deposited,
    ///      and whatever they leave behind goes to the estate — nothing is
    ///      created and nothing is stranded.
    function testFuzz_sharesNeverExceedDepositAndRemainderGoesToEstate(
        uint96 deposit,
        uint16 bpsA,
        uint16 bpsB
    ) public {
        deposit = uint96(bound(deposit, 1, type(uint96).max));
        bpsA = uint16(bound(bpsA, 0, 10_000));
        bpsB = uint16(bound(bpsB, 0, 10_000 - bpsA));

        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        if (bpsA > 0) _addBeneficiary(owner, heirA, bpsA);
        if (bpsB > 0) _addBeneficiary(owner, heirB, bpsB);
        _deposit(owner, token, deposit);

        warp(THRESHOLD);
        vm.prank(custodianA);
        vault.confirmDeath(owner);
        warp(GRACE);

        if (bpsA > 0 && WillLib.shareOf(deposit, bpsA) > 0) {
            vm.prank(heirA);
            vault.claimToken(owner, address(token));
        }
        if (bpsB > 0 && WillLib.shareOf(deposit, bpsB) > 0) {
            vm.prank(heirB);
            vault.claimToken(owner, address(token));
        }

        uint256 paidOut = token.balanceOf(heirA) + token.balanceOf(heirB);
        assertLe(paidOut, deposit, "heirs can never draw more than was deposited");

        warp(CLAIM_WINDOW);
        vm.prank(cranker);
        vault.sweepTokenVault(owner, address(token));

        assertEq(
            paidOut + token.balanceOf(owner), deposit, "every base unit is accounted for"
        );
        assertEq(token.balanceOf(address(vault)), 0, "the contract keeps nothing");
    }

    /// @dev Each heir gets exactly floor(total * bps / 10000) whenever the vault
    ///      can cover it — i.e. the clamp never bites while allocations are sane.
    function testFuzz_shareIsExactlyProportional(uint96 deposit, uint16 bps) public {
        deposit = uint96(bound(deposit, 10_000, type(uint96).max));
        bps = uint16(bound(bps, 1, 10_000));

        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        _addBeneficiary(owner, heirA, bps);
        _deposit(owner, token, deposit);

        warp(THRESHOLD);
        vm.prank(custodianA);
        vault.confirmDeath(owner);
        warp(GRACE);

        uint256 expected = (uint256(deposit) * bps) / 10_000;
        vm.assume(expected > 0);

        vm.prank(heirA);
        vault.claimToken(owner, address(token));
        assertEq(token.balanceOf(heirA), expected);
    }

    /// @dev The allocation ceiling holds for every sequence of additions.
    function testFuzz_totalAllocationNeverExceeds100Percent(uint16[8] memory bpsList) public {
        _createWill(owner, THRESHOLD, 1);
        uint256 running;

        for (uint256 i; i < bpsList.length; ++i) {
            uint16 bps = uint16(bound(bpsList[i], 0, 10_000));
            address heir = address(uint160(4000 + i));
            vm.prank(owner);
            if (running + bps > 10_000) {
                vm.expectRevert(E.AllocationExceeded.selector);
                vault.addBeneficiary(heir, bps);
            } else {
                vault.addBeneficiary(heir, bps);
                running += bps;
            }
            assertEq(vault.getWill(owner).totalAllocatedBps, running);
            assertLe(running, 10_000);
        }
    }

    /// @dev Death can never be confirmed one second early, and is always
    ///      confirmable once the threshold has passed.
    function testFuzz_deathConfirmationRespectsTheThreshold(uint40 threshold, uint40 elapsed)
        public
    {
        threshold = uint40(bound(threshold, 1, 3650 days));
        elapsed = uint40(bound(elapsed, 0, 7300 days));

        _createWill(owner, threshold, 1);
        _addCustodian(owner, custodianA);
        warp(elapsed);

        vm.prank(custodianA);
        if (elapsed < threshold) {
            vm.expectRevert(E.OwnerStillActive.selector);
            vault.confirmDeath(owner);
            assertTrue(_status(owner) == Status.Active);
        } else {
            vault.confirmDeath(owner);
            assertTrue(_status(owner) == Status.Claimable);
        }
    }

    /// @dev Claims are frozen for exactly GRACE seconds and teardown is frozen
    ///      for exactly GRACE + CLAIM_WINDOW — no off-by-one at any offset.
    function testFuzz_timelineGatesAreExact(uint40 offset) public {
        offset = uint40(bound(offset, 0, 400 days));
        _estateAtQuorum(1_000e18, 10_000, 0);
        uint256 claimableAt = block.timestamp;
        warp(offset);

        bool claimsShouldBeOpen = block.timestamp >= claimableAt + GRACE;
        bool teardownShouldBeOpen = block.timestamp >= claimableAt + GRACE + CLAIM_WINDOW;
        assertEq(vault.getWill(owner).claimsOpen, claimsShouldBeOpen);
        assertEq(vault.getWill(owner).teardownOpen, teardownShouldBeOpen);

        vm.prank(cranker);
        if (teardownShouldBeOpen) {
            vault.sweepTokenVault(owner, address(token));
        } else {
            vm.expectRevert(E.ClaimWindowStillOpen.selector);
            vault.sweepTokenVault(owner, address(token));
        }

        if (!teardownShouldBeOpen) {
            vm.prank(heirA);
            if (claimsShouldBeOpen) {
                vault.claimToken(owner, address(token));
            } else {
                vm.expectRevert(E.GracePeriodNotElapsed.selector);
                vault.claimToken(owner, address(token));
            }
        }
    }

    /// @dev However many revocations happen, a stale confirmation never counts
    ///      and the tally always reflects only the current epoch.
    function testFuzz_revocationAlwaysInvalidatesPriorConfirmations(uint8 rounds) public {
        rounds = uint8(bound(rounds, 1, 20));
        _createWill(owner, THRESHOLD, 2);
        _addCustodian(owner, custodianA);
        _addCustodian(owner, custodianB);

        for (uint256 i; i < rounds; ++i) {
            warp(THRESHOLD);
            vm.prank(custodianA);
            vault.confirmDeath(owner);
            assertEq(vault.getWill(owner).approvalsReceived, 1);

            vm.prank(owner);
            vault.revokeDeathConfirmation();
            assertEq(vault.getWill(owner).approvalsReceived, 0);
            assertFalse(vault.getCustodian(owner, custodianA).hasApproved);
            assertEq(vault.getWill(owner).approvalEpoch, uint32(i + 2));
        }
    }

    /// @dev Fee-on-transfer: the ledger must match the real balance for any fee.
    function testFuzz_feeOnTransferLedgerMatchesReality(uint96 amount, uint16 feeBps) public {
        amount = uint96(bound(amount, 10_000, type(uint96).max));
        feeBps = uint16(bound(feeBps, 0, 9_999)); // 100% would deliver nothing

        MockERC20 fee = MockERC20(address(new FeeToken(feeBps)));
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);

        fee.mint(owner, amount);
        vm.startPrank(owner);
        fee.approve(address(vault), amount);
        vault.depositToken(address(fee), amount);
        vm.stopPrank();

        assertEq(
            vault.getTokenVault(owner, address(fee)).remaining,
            fee.balanceOf(address(vault)),
            "ledger must never exceed the real balance"
        );
    }
}

import {FeeOnTransferERC20} from "../../src/mocks/MockERC20.sol";

contract FeeToken is FeeOnTransferERC20 {
    constructor(uint256 bps) FeeOnTransferERC20(bps) {}
}
