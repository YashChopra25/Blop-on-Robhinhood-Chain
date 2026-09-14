// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {VaultTestBase} from "../helpers/VaultTestBase.sol";
import {VaultErrors as E} from "../../src/errors/Errors.sol";
import {Status} from "../../src/structs/Types.sol";
import {WillView, BeneficiaryView} from "../../src/structs/Views.sol";

/// @notice Post-inheritance teardown.
/// @dev Parity targets: `c1_cleanup_cannot_front_run_a_pending_token_claim`,
///      `c1_cleanup_opens_only_after_the_claim_window_closes`,
///      `c2_close_will_blocked_while_a_token_vault_lives`,
///      `close_will_blocked_while_children_remain`,
///      `full_lifecycle_and_estate_teardown_refunds_rent` (the rent assertions
///      are dropped — EVM has no storage deposit; the lifecycle is kept).
contract TeardownTest is VaultTestBase {
    /// @dev THE reason the timing gate exists. Clearing an heir's record ends
    ///      their ability to claim, so a stranger must never be able to do it
    ///      while the claim window is still running. On Solana this was
    ///      `cleanup_beneficiary` closing the account; here it is the same
    ///      effect behind the same gate.
    function test_teardownCannotFrontRunAPendingClaim() public {
        _estateAtQuorum(1_000e18, 10_000, 0);
        warp(GRACE); // claims open, heir has not claimed yet

        vm.prank(stranger);
        vm.expectRevert(E.ClaimWindowStillOpen.selector);
        vault.closeEstate(owner, 100);

        vm.prank(stranger);
        vm.expectRevert(E.ClaimWindowStillOpen.selector);
        vault.sweepTokenVault(owner, address(token));

        // The heir's window is intact.
        vm.prank(heirA);
        vault.claimToken(owner, address(token));
        assertEq(token.balanceOf(heirA), 1_000e18);
    }

    function test_teardownOpensExactlyWhenTheClaimWindowCloses() public {
        _estateAtQuorum(0, 10_000, 0);

        warp(GRACE + CLAIM_WINDOW - 1);
        vm.prank(cranker);
        vm.expectRevert(E.ClaimWindowStillOpen.selector);
        vault.closeEstate(owner, 100);

        warp(1); // boundary is inclusive
        vm.prank(cranker);
        vault.closeEstate(owner, 100);
        _assertNoWill(owner);
    }

    /// @dev Mirrors `c2_close_will_blocked_while_a_token_vault_lives`. The vault
    ///      holds value; clearing the will first would orphan the balance.
    function test_closeEstate_blockedWhileATokenVaultLives() public {
        _estateAtQuorum(1_000e18, 10_000, 0);
        warp(GRACE + CLAIM_WINDOW);

        vm.prank(cranker);
        vm.expectRevert(E.WillHasTokenVaults.selector);
        vault.closeEstate(owner, 100);

        vm.prank(cranker);
        vault.sweepTokenVault(owner, address(token));
        vm.prank(cranker);
        assertTrue(vault.closeEstate(owner, 100));
        _assertNoWill(owner);
    }

    function test_closeEstate_clearsEveryChild() public {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        _addCustodian(owner, custodianB);
        _addBeneficiary(owner, heirA, 6000);
        _addBeneficiary(owner, heirB, 4000);
        _addMedia(owner, CID_A);
        _addMedia(owner, CID_B);

        warp(THRESHOLD);
        vm.prank(custodianA);
        vault.confirmDeath(owner);
        warp(GRACE + CLAIM_WINDOW);

        vm.expectEmit(true, false, false, true);
        emit EstateClosed(owner, cranker);
        vm.prank(cranker);
        assertTrue(vault.closeEstate(owner, 100));

        _assertNoWill(owner);
        assertEq(vault.getCustodians(owner).length, 0);
        assertEq(vault.getBeneficiaries(owner).length, 0);
        assertEq(vault.getMedia(owner).length, 0);
        (bool found,) = vault.mediaIndexOfCid(owner, CID_A);
        assertFalse(found);

        // Reverse role indices are cleared too, so a former heir stops seeing a
        // will that no longer exists.
        (, uint256 total) = vault.beneficiaryRolesOf(heirA, 0, 10);
        assertEq(total, 0);
        (, total) = vault.custodianRolesOf(custodianA, 0, 10);
        assertEq(total, 0);
    }

    /// @dev The gas-bounding mechanism. Solana needed one transaction per child
    ///      because each account had to be closed individually; here the caller
    ///      chooses a work budget, which keeps a large estate from exceeding the
    ///      block gas limit in a single call.
    function test_closeEstate_isIncrementalAndResumable() public {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        for (uint256 i; i < 5; ++i) {
            _addBeneficiary(owner, address(uint160(3000 + i)), 1000);
        }
        _addMedia(owner, CID_A);
        _addMedia(owner, CID_B);

        warp(THRESHOLD);
        vm.prank(custodianA);
        vault.confirmDeath(owner);
        warp(GRACE + CLAIM_WINDOW);

        // 8 children, 3 at a time.
        vm.prank(cranker);
        assertFalse(vault.closeEstate(owner, 3));
        WillView memory w = vault.getWill(owner);
        assertTrue(w.exists, "still mid-teardown");
        assertEq(w.mediaCount, 0, "media cleared first");
        assertEq(w.custodianCount, 0);
        assertEq(w.beneficiaryCount, 5);

        vm.prank(cranker);
        assertFalse(vault.closeEstate(owner, 3));
        assertEq(vault.getWill(owner).beneficiaryCount, 2);

        vm.prank(cranker);
        assertTrue(vault.closeEstate(owner, 3));
        _assertNoWill(owner);
    }

    function test_closeEstate_revertsOnZeroBudget() public {
        _estateAtQuorum(0, 10_000, 0);
        warp(GRACE + CLAIM_WINDOW);
        vm.prank(cranker);
        vm.expectRevert(E.InvalidAmount.selector);
        vault.closeEstate(owner, 0);
    }

    function test_closeEstate_revertsWhenNotClaimable() public {
        _createWill(owner, THRESHOLD, 1);
        vm.prank(cranker);
        vm.expectRevert(E.WillNotClaimable.selector);
        vault.closeEstate(owner, 10);
    }

    /// @dev Permissionless but not profitable: the cranker pays only gas and the
    ///      estate's value always flows to the owner.
    function test_teardownIsPermissionlessButPaysTheCrankerNothing() public {
        _estateAtQuorum(1_000e18, 5000, 0);
        warp(GRACE + CLAIM_WINDOW);

        uint256 crankerBefore = token.balanceOf(cranker);
        vm.prank(cranker);
        vault.sweepTokenVault(owner, address(token));
        vm.prank(cranker);
        vault.closeEstate(owner, 100);

        assertEq(token.balanceOf(cranker), crankerBefore, "cranker gains nothing");
        assertEq(token.balanceOf(owner), 1_000e18, "everything returns to the estate");
    }

    /// @dev The full journey, matching `full_lifecycle_and_estate_teardown_refunds_rent`
    ///      minus the rent assertions.
    function test_fullLifecycle() public {
        // 1. create + configure
        _createWill(owner, THRESHOLD, 2);
        _addCustodian(owner, custodianA);
        _addCustodian(owner, custodianB);
        _addBeneficiary(owner, heirA, 7000);
        _addBeneficiary(owner, heirB, 3000);
        vm.prank(heirA);
        vault.registerRecipientKey(owner, bytes32(uint256(1)));
        vm.prank(heirB);
        vault.registerRecipientKey(owner, bytes32(uint256(2)));
        _addMedia(owner, CID_A);
        _deposit(owner, token, 1_000e18);

        // 2. ping — still alive
        warp(THRESHOLD - 1 days);
        vm.prank(owner);
        vault.updateWill(0, 0);

        // 3. silence, then quorum
        warp(THRESHOLD);
        vm.prank(custodianA);
        vault.confirmDeath(owner);
        assertTrue(_status(owner) == Status.PendingInheritance);
        vm.prank(custodianB);
        vault.confirmDeath(owner);
        assertTrue(_status(owner) == Status.Claimable);

        // 4. grace period — nothing moves
        vm.prank(heirA);
        vm.expectRevert(E.GracePeriodNotElapsed.selector);
        vault.claimToken(owner, address(token));

        // 5. claims
        warp(GRACE);
        vm.startPrank(heirA);
        vault.claimInheritance(owner);
        vault.claimToken(owner, address(token));
        vm.stopPrank();
        assertEq(token.balanceOf(heirA), 700e18);

        // heirB never claims — their share returns to the estate.

        // 6. teardown
        warp(CLAIM_WINDOW);
        vm.startPrank(cranker);
        vault.sweepTokenVault(owner, address(token));
        assertTrue(vault.closeEstate(owner, 100));
        vm.stopPrank();

        assertEq(token.balanceOf(owner), 300e18, "heirB's unclaimed share");
        assertEq(token.balanceOf(address(vault)), 0, "the contract keeps nothing");
        _assertNoWill(owner);
    }

    /// @dev Regression for a bug the invariant suite found: because teardown is
    ///      resumable, a half-cleared will is publicly readable between calls, so
    ///      its counters must agree with its surviving children at every step.
    ///      Resyncing `totalAllocatedBps` only at the end left a partially
    ///      cleared will reporting an allocation total for heirs that no longer
    ///      existed, and the same for `approvalsReceived` against custodians.
    function test_closeEstate_keepsCountersConsistentMidTeardown() public {
        _createWill(owner, THRESHOLD, 2);
        _addCustodian(owner, custodianA);
        _addCustodian(owner, custodianB);
        _addBeneficiary(owner, heirA, 5000);
        _addBeneficiary(owner, heirB, 3000);

        warp(THRESHOLD);
        vm.prank(custodianA);
        vault.confirmDeath(owner);
        vm.prank(custodianB);
        vault.confirmDeath(owner);
        assertEq(vault.getWill(owner).approvalsReceived, 2);
        warp(GRACE + CLAIM_WINDOW);

        // Clear one child at a time and check consistency after every step.
        for (uint256 i; i < 4; ++i) {
            vm.prank(cranker);
            vault.closeEstate(owner, 1);
            WillView memory w = vault.getWill(owner);
            if (!w.exists) break;

            uint256 bpsSum;
            BeneficiaryView[] memory bs = vault.getBeneficiaries(owner);
            for (uint256 j; j < bs.length; ++j) {
                bpsSum += bs[j].allocationBps;
            }
            assertEq(bpsSum, w.totalAllocatedBps, "allocation total drifted mid-teardown");
            assertLe(
                w.approvalsReceived, w.custodianCount, "approval tally drifted mid-teardown"
            );
            assertEq(w.custodianCount, vault.getCustodians(owner).length);
            assertEq(w.beneficiaryCount, bs.length);
        }

        _assertNoWill(owner);
    }

    /// @dev After a full teardown the owner address is free again, and the new
    ///      will must start with a CLEAN claim ledger.
    ///
    ///      This is a deliberate DEVIATION from the Solana program, recorded in
    ///      SECURITY_REVIEW.md. There, `TokenClaim` PDAs are never closed and are
    ///      seeded from PDAs that are themselves derived from the owner — so a
    ///      re-created will with the same owner and mint would collide with the
    ///      old claim marker and the heir's `init` would fail, stranding their
    ///      share. Scoping claims by incarnation fixes that.
    function test_newIncarnationStartsWithACleanClaimLedger() public {
        _estateAtQuorum(1_000e18, 10_000, 0);
        warp(GRACE);
        vm.prank(heirA);
        vault.claimToken(owner, address(token));
        assertTrue(vault.getClaim(owner, address(token), heirA).claimed);

        warp(CLAIM_WINDOW);
        vm.startPrank(cranker);
        vault.sweepTokenVault(owner, address(token));
        vault.closeEstate(owner, 100);
        vm.stopPrank();

        // A brand-new will at the same address, same heir, same token.
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        _addBeneficiary(owner, heirA, 10_000);
        _deposit(owner, token, 500e18);
        assertFalse(
            vault.getClaim(owner, address(token), heirA).claimed,
            "the previous incarnation's claim must not carry over"
        );

        warp(THRESHOLD);
        vm.prank(custodianA);
        vault.confirmDeath(owner);
        warp(GRACE);
        vm.prank(heirA);
        vault.claimToken(owner, address(token));
        assertEq(token.balanceOf(heirA), 1_000e18 + 500e18);
    }
}
