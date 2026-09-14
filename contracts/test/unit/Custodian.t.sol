// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {VaultTestBase} from "../helpers/VaultTestBase.sol";
import {VaultErrors as E} from "../../src/errors/Errors.sol";
import {Status} from "../../src/structs/Types.sol";
import {WillView, CustodianView} from "../../src/structs/Views.sol";

/// @notice Custodians, the dead-man's switch, and the owner's escape hatch.
/// @dev Parity targets: `death_blocked_while_owner_active_then_allowed_after_threshold`,
///      `remove_custodian_cannot_break_min_approvals`, `non_custodian_cannot_confirm_death`,
///      `c3_owner_can_revoke_and_reuse_the_will`, `c3_revoke_expires_with_the_grace_period`.
contract CustodianTest is VaultTestBase {
    // ---- registration ----

    function test_addCustodian_registersAndCounts() public {
        _createWill(owner, THRESHOLD, 1);

        vm.expectEmit(true, true, false, false);
        emit CustodianAdded(owner, custodianA);
        _addCustodian(owner, custodianA);

        CustodianView memory c = vault.getCustodian(owner, custodianA);
        assertTrue(c.exists);
        assertFalse(c.hasApproved);
        assertEq(c.approvedEpoch, 0, "0 can never match a live epoch (which starts at 1)");
        assertEq(vault.getWill(owner).custodianCount, 1);
        assertTrue(vault.getWill(owner).quorumReachable);
    }

    /// @dev Reproduces Anchor's `init` on the custodian PDA: the same wallet
    ///      cannot be added twice, so the count can never be inflated.
    function test_addCustodian_revertsOnDuplicate() public {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        vm.prank(owner);
        vm.expectRevert(E.CustodianAlreadyExists.selector);
        vault.addCustodian(custodianA);
    }

    /// @dev No Solana counterpart. `Pubkey::default()` is merely an address
    ///      nobody controls; `address(0)` on EVM is a genuine hazard, so it is
    ///      rejected outright.
    function test_addCustodian_revertsOnZeroAddress() public {
        _createWill(owner, THRESHOLD, 1);
        vm.prank(owner);
        vm.expectRevert(E.ZeroAddress.selector);
        vault.addCustodian(address(0));
    }

    function test_addCustodian_revertsForNonOwner() public {
        _createWill(owner, THRESHOLD, 1);
        vm.prank(stranger);
        vm.expectRevert(E.WillNotFound.selector);
        vault.addCustodian(custodianA);
    }

    function test_addCustodian_enforcesCap() public {
        _createWill(owner, THRESHOLD, 1);
        for (uint256 i; i < vault.MAX_CUSTODIANS(); ++i) {
            _addCustodian(owner, address(uint160(1000 + i)));
        }
        vm.prank(owner);
        vm.expectRevert(E.TooManyCustodians.selector);
        vault.addCustodian(stranger);
    }

    function test_removeCustodian_clearsAndDecrements() public {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        _addCustodian(owner, custodianB);

        vm.prank(owner);
        vault.removeCustodian(custodianA);

        assertFalse(vault.getCustodian(owner, custodianA).exists);
        assertEq(vault.getWill(owner).custodianCount, 1);
        CustodianView[] memory list = vault.getCustodians(owner);
        assertEq(list.length, 1);
        assertEq(list[0].wallet, custodianB, "swap-and-pop keeps the survivor addressable");
    }

    /// @dev Mirrors `remove_custodian_cannot_break_min_approvals`. Removing down
    ///      to zero is exempt so the will can always be torn down and deleted.
    function test_removeCustodian_cannotBreakQuorum() public {
        _createWill(owner, THRESHOLD, 2);
        _addCustodian(owner, custodianA);
        _addCustodian(owner, custodianB);

        vm.prank(owner);
        vm.expectRevert(E.MinApprovalsExceedCustodians.selector);
        vault.removeCustodian(custodianA);

        // Lower the quorum first, then the removal is allowed.
        vm.prank(owner);
        vault.updateWill(0, 1);
        vm.prank(owner);
        vault.removeCustodian(custodianA);
        assertEq(vault.getWill(owner).custodianCount, 1);

        // The final custodian is always removable.
        vm.prank(owner);
        vault.removeCustodian(custodianB);
        assertEq(vault.getWill(owner).custodianCount, 0);
    }

    function test_removeCustodian_revertsWhenAbsent() public {
        _createWill(owner, THRESHOLD, 1);
        vm.prank(owner);
        vm.expectRevert(E.CustodianNotFound.selector);
        vault.removeCustodian(custodianA);
    }

    /// @dev The subtle bookkeeping case from `remove_custodian`: a live
    ///      confirmation must be subtracted from the tally exactly once.
    function test_removeCustodian_undoesALiveConfirmation() public {
        _createWill(owner, THRESHOLD, 3);
        _addCustodian(owner, custodianA);
        _addCustodian(owner, custodianB);
        _addCustodian(owner, custodianC);

        warp(THRESHOLD);
        vm.prank(custodianA);
        vault.confirmDeath(owner);
        assertEq(vault.getWill(owner).approvalsReceived, 1);
        assertTrue(_status(owner) == Status.PendingInheritance);

        // Back to Active so the owner may reconfigure; the epoch bump already
        // discounted A's confirmation.
        vm.prank(owner);
        vault.revokeDeathConfirmation();
        assertEq(vault.getWill(owner).approvalsReceived, 0);

        vm.prank(owner);
        vault.updateWill(0, 1);
        vm.prank(owner);
        vault.removeCustodian(custodianA);
        // Not double-subtracted: a stale-epoch confirmation is not counted again.
        assertEq(vault.getWill(owner).approvalsReceived, 0);
    }

    // ---- confirm death ----

    /// @dev Mirrors `death_blocked_while_owner_active_then_allowed_after_threshold`.
    function test_confirmDeath_blockedWhileOwnerActive() public {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);

        vm.prank(custodianA);
        vm.expectRevert(E.OwnerStillActive.selector);
        vault.confirmDeath(owner);

        warp(THRESHOLD - 1);
        vm.prank(custodianA);
        vm.expectRevert(E.OwnerStillActive.selector);
        vault.confirmDeath(owner);

        warp(1); // exactly at the threshold — the boundary is inclusive
        vm.prank(custodianA);
        vault.confirmDeath(owner);
        assertTrue(_status(owner) == Status.Claimable);
    }

    /// @dev Mirrors `non_custodian_cannot_confirm_death`.
    function test_confirmDeath_revertsForNonCustodian() public {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        warp(THRESHOLD);

        vm.prank(stranger);
        vm.expectRevert(E.NotACustodian.selector);
        vault.confirmDeath(owner);

        // Nor may a custodian of a DIFFERENT will confirm this one.
        _createWill(stranger, THRESHOLD, 1);
        _addCustodian(stranger, custodianB);
        vm.prank(custodianB);
        vm.expectRevert(E.NotACustodian.selector);
        vault.confirmDeath(owner);
    }

    function test_confirmDeath_reachesQuorumAndSetsTimeline() public {
        _createWill(owner, THRESHOLD, 2);
        _addCustodian(owner, custodianA);
        _addCustodian(owner, custodianB);
        warp(THRESHOLD);

        vm.prank(custodianA);
        vault.confirmDeath(owner);
        assertTrue(_status(owner) == Status.PendingInheritance);
        assertEq(vault.getWill(owner).claimableAt, 0, "timeline not started below quorum");

        uint256 quorumAt = block.timestamp;
        vm.expectEmit(true, false, false, true);
        emit WillBecameClaimable(
            owner,
            uint64(quorumAt),
            uint64(quorumAt) + GRACE,
            uint64(quorumAt) + GRACE + CLAIM_WINDOW
        );
        vm.prank(custodianB);
        vault.confirmDeath(owner);

        WillView memory w = vault.getWill(owner);
        assertTrue(w.status == Status.Claimable);
        assertEq(w.claimableAt, quorumAt);
        assertEq(w.approvalsReceived, 2);
    }

    /// @dev `claimableAt` is set once, on the transition. A third confirmation
    ///      must not push the heirs' timeline out.
    function test_confirmDeath_extraConfirmationCannotPushTheTimeline() public {
        _createWill(owner, THRESHOLD, 2);
        _addCustodian(owner, custodianA);
        _addCustodian(owner, custodianB);
        _addCustodian(owner, custodianC);
        warp(THRESHOLD);

        vm.prank(custodianA);
        vault.confirmDeath(owner);
        vm.prank(custodianB);
        vault.confirmDeath(owner);
        uint64 claimableAt = vault.getWill(owner).claimableAt;

        warp(3 days);
        vm.prank(custodianC);
        vm.expectRevert(E.WillNotActive.selector);
        vault.confirmDeath(owner);

        assertEq(vault.getWill(owner).claimableAt, claimableAt, "timeline unchanged");
    }

    function test_confirmDeath_revertsOnDoubleConfirmInSameEpoch() public {
        _createWill(owner, THRESHOLD, 2);
        _addCustodian(owner, custodianA);
        _addCustodian(owner, custodianB);
        warp(THRESHOLD);

        vm.prank(custodianA);
        vault.confirmDeath(owner);
        vm.prank(custodianA);
        vm.expectRevert(E.AlreadyApproved.selector);
        vault.confirmDeath(owner);

        assertEq(vault.getWill(owner).approvalsReceived, 1, "tally not inflated");
    }

    function test_confirmDeath_revertsWithoutWill() public {
        vm.prank(custodianA);
        vm.expectRevert(E.WillNotFound.selector);
        vault.confirmDeath(owner);
    }

    // ---- revocation (the owner's escape hatch) ----

    /// @dev Mirrors `c3_owner_can_revoke_and_reuse_the_will`.
    function test_revoke_fromPendingRestoresActiveAndInvalidatesConfirmations() public {
        _createWill(owner, THRESHOLD, 2);
        _addCustodian(owner, custodianA);
        _addCustodian(owner, custodianB);
        warp(THRESHOLD);

        vm.prank(custodianA);
        vault.confirmDeath(owner);
        assertTrue(vault.getCustodian(owner, custodianA).hasApproved);

        vm.expectEmit(true, false, false, true);
        emit DeathConfirmationRevoked(owner, 2);
        vm.prank(owner);
        vault.revokeDeathConfirmation();

        WillView memory w = vault.getWill(owner);
        assertTrue(w.status == Status.Active);
        assertEq(w.approvalsReceived, 0);
        assertEq(w.claimableAt, 0);
        assertEq(w.approvalEpoch, 2);
        assertEq(w.lastActiveAt, block.timestamp, "signing is itself proof of life");

        // O(1) invalidation: the custodian record was never touched, yet the
        // stale confirmation no longer counts.
        assertFalse(
            vault.getCustodian(owner, custodianA).hasApproved,
            "confirmation from the revoked epoch must not count"
        );

        // The will is fully usable again.
        vm.prank(owner);
        vault.updateWill(1 days, 0);
        warp(1 days);
        vm.prank(custodianA);
        vault.confirmDeath(owner);
        assertEq(vault.getWill(owner).approvalsReceived, 1);
    }

    function test_revoke_fromClaimableDuringGrace() public {
        _estateAtQuorum(0, 0, 0);
        warp(GRACE - 1);

        vm.prank(owner);
        vault.revokeDeathConfirmation();
        assertTrue(_status(owner) == Status.Active);
    }

    /// @dev Mirrors `c3_revoke_expires_with_the_grace_period`. After grace, heirs
    ///      may already have settled and unwinding is impossible.
    function test_revoke_expiresWithTheGracePeriod() public {
        _estateAtQuorum(0, 0, 0);
        warp(GRACE);

        vm.prank(owner);
        vm.expectRevert(E.NothingToRevoke.selector);
        vault.revokeDeathConfirmation();
        assertTrue(_status(owner) == Status.Claimable);
    }

    function test_revoke_revertsWhenNothingInFlight() public {
        _createWill(owner, THRESHOLD, 1);
        vm.prank(owner);
        vm.expectRevert(E.NothingToRevoke.selector);
        vault.revokeDeathConfirmation();
    }

    function test_revoke_revertsForNonOwner() public {
        _estateAtQuorum(0, 0, 0);
        vm.prank(stranger);
        vm.expectRevert(E.WillNotFound.selector);
        vault.revokeDeathConfirmation();
        vm.prank(custodianA);
        vm.expectRevert(E.WillNotFound.selector);
        vault.revokeDeathConfirmation();
    }

    /// @dev A re-added custodian must start clean, even if the same address held
    ///      a live confirmation before removal. On Solana this came free from
    ///      account closure and re-`init`; here `delete` has to do the same job.
    function test_reAddedCustodianStartsWithNoConfirmation() public {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        _addCustodian(owner, custodianB);
        warp(THRESHOLD);

        vm.prank(custodianA);
        vault.confirmDeath(owner);
        vm.prank(owner);
        vault.revokeDeathConfirmation();

        vm.prank(owner);
        vault.removeCustodian(custodianA);
        _addCustodian(owner, custodianA);

        CustodianView memory c = vault.getCustodian(owner, custodianA);
        assertFalse(c.hasApproved);
        assertEq(c.approvedEpoch, 0);
        assertEq(c.lastApprovedAt, 0);
    }

    // ---- reverse role index ----

    function test_custodianRoles_trackAdditionsAndRemovals() public {
        _createWill(owner, THRESHOLD, 1);
        _createWill(stranger, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        _addCustodian(stranger, custodianA);

        (address[] memory owners, uint256 total) = vault.custodianRolesOf(custodianA, 0, 10);
        assertEq(total, 2);
        assertEq(owners.length, 2);

        vm.prank(owner);
        vault.removeCustodian(custodianA);
        (owners, total) = vault.custodianRolesOf(custodianA, 0, 10);
        assertEq(total, 1);
        assertEq(owners[0], stranger, "the surviving role stays addressable after swap-and-pop");
    }

    function test_custodianRoles_paginate() public {
        _addCustodian_forManyWills(5);
        (address[] memory page, uint256 total) = vault.custodianRolesOf(custodianA, 2, 2);
        assertEq(total, 5);
        assertEq(page.length, 2);

        (page, total) = vault.custodianRolesOf(custodianA, 4, 100);
        assertEq(page.length, 1, "limit is clamped to the tail");

        (page,) = vault.custodianRolesOf(custodianA, 99, 5);
        assertEq(page.length, 0, "offset past the end is empty, not a revert");
    }

    function _addCustodian_forManyWills(uint256 n) private {
        for (uint256 i; i < n; ++i) {
            address o = address(uint160(5000 + i));
            _createWill(o, THRESHOLD, 1);
            _addCustodian(o, custodianA);
        }
    }
}
