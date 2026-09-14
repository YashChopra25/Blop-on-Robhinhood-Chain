// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {VaultTestBase} from "../helpers/VaultTestBase.sol";
import {VaultErrors as E} from "../../src/errors/Errors.sol";
import {Status} from "../../src/structs/Types.sol";
import {WillView} from "../../src/structs/Views.sol";

/// @notice Will lifecycle: creation, configuration, liveness, deletion.
/// @dev Parity targets from the Solana suite: `init_rejects_bad_config`,
///      `update_will_enforces_min_approval_bounds`, `ping_resets_the_dead_mans_switch`,
///      `delete_will_refunds_rent_to_owner_while_active` (rent assertion dropped —
///      no EVM equivalent; the deletion semantics are kept).
contract WillTest is VaultTestBase {
    // ---- initialization ----

    function test_createWill_setsInitialState() public {
        uint256 t0 = block.timestamp;
        vm.expectEmit(true, false, false, true);
        emit WillCreated(owner, THRESHOLD, 2, uint64(t0));
        _createWill(owner, THRESHOLD, 2);

        WillView memory w = vault.getWill(owner);
        assertTrue(w.exists);
        assertTrue(w.status == Status.Active);
        assertEq(w.minApprovals, 2);
        assertEq(w.inactivityThreshold, THRESHOLD);
        assertEq(w.createdAt, t0);
        assertEq(w.lastActiveAt, t0, "creation counts as a ping");
        assertEq(w.claimableAt, 0);
        assertEq(w.approvalEpoch, 1, "epoch starts at 1 so a default 0 never matches");
        assertEq(w.incarnation, 1);
        assertEq(w.custodianCount, 0);
        assertEq(w.beneficiaryCount, 0);
        assertEq(w.totalAllocatedBps, 0);
        assertFalse(w.quorumReachable, "no custodians yet");
    }

    /// @dev Reproduces Anchor's `init` (not `init_if_needed`) on the will PDA:
    ///      a reinitialization attack must be impossible.
    function test_createWill_revertsOnDuplicate() public {
        _createWill(owner, THRESHOLD, 1);
        vm.prank(owner);
        vm.expectRevert(E.WillAlreadyExists.selector);
        vault.createWill(THRESHOLD, 1);
    }

    function test_createWill_revertsOnZeroThreshold() public {
        vm.prank(owner);
        vm.expectRevert(E.InvalidThreshold.selector);
        vault.createWill(0, 1);
    }

    function test_createWill_revertsOnZeroMinApprovals() public {
        vm.prank(owner);
        vm.expectRevert(E.InvalidMinApprovals.selector);
        vault.createWill(THRESHOLD, 0);
    }

    function test_createWill_revertsOnOversizeThreshold() public {
        vm.prank(owner);
        vm.expectRevert(E.ValueTooLarge.selector);
        vault.createWill(uint64(type(uint40).max) + 1, 1);
    }

    /// @dev There is no privileged initializer to front-run: every address
    ///      initializes only its own will, keyed by `msg.sender`.
    function test_createWill_isPerCallerAndIndependent() public {
        _createWill(owner, THRESHOLD, 1);
        _createWill(stranger, 1 days, 3);

        assertEq(vault.getWill(owner).inactivityThreshold, THRESHOLD);
        assertEq(vault.getWill(stranger).inactivityThreshold, 1 days);
        assertEq(vault.getWill(stranger).minApprovals, 3);
    }

    // ---- update / ping ----

    function test_updateWill_pingResetsTheDeadMansSwitch() public {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);

        warp(THRESHOLD - 1);
        assertFalse(vault.getWill(owner).inactivityElapsed);

        // A pure ping: both parameters zero means "leave configuration alone".
        vm.prank(owner);
        vault.updateWill(0, 0);
        assertEq(vault.getWill(owner).lastActiveAt, block.timestamp);

        // The window restarts from the ping, so what would have been enough
        // silence no longer is.
        warp(THRESHOLD - 1);
        vm.prank(custodianA);
        vm.expectRevert(E.OwnerStillActive.selector);
        vault.confirmDeath(owner);

        warp(1);
        vm.prank(custodianA);
        vault.confirmDeath(owner);
        assertTrue(_status(owner) == Status.Claimable);
    }

    function test_updateWill_changesThresholdAndQuorum() public {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        _addCustodian(owner, custodianB);

        vm.prank(owner);
        vault.updateWill(10 days, 2);

        WillView memory w = vault.getWill(owner);
        assertEq(w.inactivityThreshold, 10 days);
        assertEq(w.minApprovals, 2);
    }

    /// @dev Mirrors `update_will_enforces_min_approval_bounds`.
    function test_updateWill_enforcesMinApprovalBounds() public {
        _createWill(owner, THRESHOLD, 1);

        // Zero is the "unchanged" sentinel, not an attempt to set zero — and the
        // floor of 1 is enforced at creation, so it can never become 0.
        vm.prank(owner);
        vault.updateWill(0, 0);
        assertEq(vault.getWill(owner).minApprovals, 1);

        // With zero custodians (bootstrapping) any value >= 1 is accepted.
        vm.prank(owner);
        vault.updateWill(0, 5);
        assertEq(vault.getWill(owner).minApprovals, 5);

        // Once custodians exist the new minimum must stay reachable.
        vm.prank(owner);
        vault.updateWill(0, 1);
        _addCustodian(owner, custodianA);
        vm.prank(owner);
        vm.expectRevert(E.MinApprovalsExceedCustodians.selector);
        vault.updateWill(0, 2);
    }

    function test_updateWill_revertsForNonOwner() public {
        _createWill(owner, THRESHOLD, 1);
        vm.prank(stranger);
        vm.expectRevert(E.WillNotFound.selector);
        vault.updateWill(1 days, 0);
    }

    function test_updateWill_revertsWhenNotActive() public {
        _estateAtQuorum(0, 0, 0);
        vm.prank(owner);
        vm.expectRevert(E.WillNotActive.selector);
        vault.updateWill(1 days, 0);
    }

    function test_updateWill_revertsOnOversizeThreshold() public {
        _createWill(owner, THRESHOLD, 1);
        vm.prank(owner);
        vm.expectRevert(E.ValueTooLarge.selector);
        vault.updateWill(uint64(type(uint40).max) + 1, 0);
    }

    // ---- delete ----

    function test_deleteWill_clearsStateAndAllowsRecreation() public {
        _createWill(owner, THRESHOLD, 1);
        vm.prank(owner);
        vault.deleteWill();
        _assertNoWill(owner);

        // The address is free again, and the new will is a new incarnation.
        _createWill(owner, 1 days, 2);
        WillView memory w = vault.getWill(owner);
        assertTrue(w.exists);
        assertEq(w.incarnation, 2);
        assertEq(w.inactivityThreshold, 1 days);
    }

    /// @dev Mirrors `close_will_blocked_while_children_remain` for the
    ///      owner-driven path.
    function test_deleteWill_revertsWithDependents() public {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);

        vm.prank(owner);
        vm.expectRevert(E.WillHasDependents.selector);
        vault.deleteWill();

        _addMedia(owner, CID_A);
        vm.prank(owner);
        vault.removeCustodian(custodianA);
        vm.prank(owner);
        vm.expectRevert(E.WillHasDependents.selector);
        vault.deleteWill();

        vm.prank(owner);
        vault.removeMedia(0);
        vm.prank(owner);
        vault.deleteWill();
        _assertNoWill(owner);
    }

    /// @dev Mirrors `c2_delete_will_blocked_while_a_token_vault_lives`.
    function test_deleteWill_revertsWhileTokenVaultLives() public {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        _deposit(owner, token, 1_000e18);

        vm.prank(owner);
        vm.expectRevert(E.WillHasTokenVaults.selector);
        vault.deleteWill();

        vm.prank(owner);
        vault.withdrawToken(address(token));
        vm.prank(owner);
        vault.removeCustodian(custodianA);
        vm.prank(owner);
        vault.deleteWill();
        _assertNoWill(owner);
    }

    function test_deleteWill_revertsWhenNotActive() public {
        _estateAtQuorum(0, 0, 0);
        vm.prank(owner);
        vm.expectRevert(E.WillNotActive.selector);
        vault.deleteWill();
    }

    function test_deleteWill_revertsWithoutWill() public {
        vm.prank(stranger);
        vm.expectRevert(E.WillNotFound.selector);
        vault.deleteWill();
    }

    // ---- views ----

    function test_getWill_reportsDerivedDeadlines() public {
        _estateAtQuorum(0, 0, 0);
        WillView memory w = vault.getWill(owner);

        assertEq(w.graceEndsAt, w.claimableAt + GRACE);
        assertEq(w.claimWindowEndsAt, w.claimableAt + GRACE + CLAIM_WINDOW);
        assertFalse(w.claimsOpen, "grace period still running");
        assertFalse(w.teardownOpen);

        warp(GRACE);
        w = vault.getWill(owner);
        assertTrue(w.claimsOpen);
        assertFalse(w.teardownOpen);

        warp(CLAIM_WINDOW);
        w = vault.getWill(owner);
        assertTrue(w.claimsOpen);
        assertTrue(w.teardownOpen);
    }

    function test_getWill_emptyForUnknownOwner() public view {
        WillView memory w = vault.getWill(stranger);
        assertFalse(w.exists);
        assertEq(w.createdAt, 0);
    }
}
