// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {VaultTestBase} from "../helpers/VaultTestBase.sol";
import {VaultErrors as E} from "../../src/errors/Errors.sol";
import {Status} from "../../src/structs/Types.sol";
import {BeneficiaryView, WillView} from "../../src/structs/Views.sol";

/// @notice Heirs: allocation, acceptance and the document encryption key.
/// @dev Parity targets: `allocation_cannot_exceed_100_percent`,
///      `c3_nothing_can_be_claimed_during_the_grace_period`,
///      `c5_only_the_heir_can_register_their_encryption_key`.
contract BeneficiaryTest is VaultTestBase {
    bytes32 constant KEY_A = bytes32(uint256(0xA11CE));
    bytes32 constant KEY_B = bytes32(uint256(0xB0B));

    // ---- registration ----

    function test_addBeneficiary_recordsAllocation() public {
        _createWill(owner, THRESHOLD, 1);

        vm.expectEmit(true, true, false, true);
        emit BeneficiaryAdded(owner, heirA, 6000);
        _addBeneficiary(owner, heirA, 6000);

        BeneficiaryView memory b = vault.getBeneficiary(owner, heirA);
        assertTrue(b.exists);
        assertEq(b.allocationBps, 6000);
        assertFalse(b.hasClaimed);
        assertFalse(b.hasEncryptionKey, "the heir registers their own key later");
        assertEq(vault.getWill(owner).totalAllocatedBps, 6000);
        assertEq(vault.getWill(owner).beneficiaryCount, 1);
    }

    /// @dev Mirrors `allocation_cannot_exceed_100_percent`.
    function test_addBeneficiary_cannotExceed100Percent() public {
        _createWill(owner, THRESHOLD, 1);
        _addBeneficiary(owner, heirA, 6000);

        vm.prank(owner);
        vm.expectRevert(E.AllocationExceeded.selector);
        vault.addBeneficiary(heirB, 4001);

        // Exactly 100% is fine.
        _addBeneficiary(owner, heirB, 4000);
        assertEq(vault.getWill(owner).totalAllocatedBps, 10_000);
    }

    /// @dev Under-allocation is explicitly allowed: the remainder returns to the
    ///      estate on sweep rather than being forced onto an heir.
    function test_addBeneficiary_allowsUnderAllocation() public {
        _createWill(owner, THRESHOLD, 1);
        _addBeneficiary(owner, heirA, 2500);
        assertEq(vault.getWill(owner).totalAllocatedBps, 2500);
    }

    function test_addBeneficiary_allowsZeroAllocation() public {
        // Preserved from the Solana program: a zero-share heir is legal (they
        // inherit documents but no tokens). `claimToken` rejects them separately.
        _createWill(owner, THRESHOLD, 1);
        _addBeneficiary(owner, heirA, 0);
        assertTrue(vault.getBeneficiary(owner, heirA).exists);
    }

    function test_addBeneficiary_revertsOnDuplicate() public {
        _createWill(owner, THRESHOLD, 1);
        _addBeneficiary(owner, heirA, 1000);
        vm.prank(owner);
        vm.expectRevert(E.BeneficiaryAlreadyExists.selector);
        vault.addBeneficiary(heirA, 1000);
    }

    function test_addBeneficiary_revertsOnZeroAddress() public {
        _createWill(owner, THRESHOLD, 1);
        vm.prank(owner);
        vm.expectRevert(E.ZeroAddress.selector);
        vault.addBeneficiary(address(0), 1000);
    }

    /// @dev Naming yourself is permitted, exactly as on Solana. It is harmless:
    ///      the owner is dead by the time anything can be claimed, and the share
    ///      would otherwise have returned to the estate anyway.
    function test_addBeneficiary_allowsSelf() public {
        _createWill(owner, THRESHOLD, 1);
        _addBeneficiary(owner, owner, 10_000);
        assertTrue(vault.getBeneficiary(owner, owner).exists);
    }

    function test_addBeneficiary_enforcesCap() public {
        _createWill(owner, THRESHOLD, 1);
        for (uint256 i; i < vault.MAX_BENEFICIARIES(); ++i) {
            _addBeneficiary(owner, address(uint160(2000 + i)), 0);
        }
        vm.prank(owner);
        vm.expectRevert(E.TooManyBeneficiaries.selector);
        vault.addBeneficiary(stranger, 0);
    }

    function test_removeBeneficiary_freesAllocation() public {
        _createWill(owner, THRESHOLD, 1);
        _addBeneficiary(owner, heirA, 6000);
        _addBeneficiary(owner, heirB, 4000);

        vm.prank(owner);
        vault.removeBeneficiary(heirA);

        assertFalse(vault.getBeneficiary(owner, heirA).exists);
        assertEq(vault.getWill(owner).totalAllocatedBps, 4000);
        assertEq(vault.getWill(owner).beneficiaryCount, 1);

        // The freed allocation is reusable.
        _addBeneficiary(owner, heirA, 6000);
        assertEq(vault.getWill(owner).totalAllocatedBps, 10_000);
    }

    function test_removeBeneficiary_revertsWhenAbsent() public {
        _createWill(owner, THRESHOLD, 1);
        vm.prank(owner);
        vm.expectRevert(E.BeneficiaryNotFound.selector);
        vault.removeBeneficiary(heirA);
    }

    function test_addBeneficiary_revertsWhenNotActive() public {
        _estateAtQuorum(0, 0, 0);
        vm.prank(owner);
        vm.expectRevert(E.WillNotActive.selector);
        vault.addBeneficiary(heirA, 1000);
    }

    // ---- claim inheritance ----

    function test_claimInheritance_afterGrace() public {
        _estateAtQuorum(0, 10_000, 0);
        warp(GRACE);

        vm.expectEmit(true, true, false, false);
        emit InheritanceClaimed(owner, heirA);
        vm.prank(heirA);
        vault.claimInheritance(owner);

        assertTrue(vault.getBeneficiary(owner, heirA).hasClaimed);
        assertEq(vault.getWill(owner).beneficiariesClaimed, 1);
    }

    /// @dev Mirrors `c3_nothing_can_be_claimed_during_the_grace_period`. This is
    ///      the rule that makes a mistaken death confirmation recoverable.
    function test_claimInheritance_blockedDuringGrace() public {
        _estateAtQuorum(0, 10_000, 0);

        vm.prank(heirA);
        vm.expectRevert(E.GracePeriodNotElapsed.selector);
        vault.claimInheritance(owner);

        warp(GRACE - 1);
        vm.prank(heirA);
        vm.expectRevert(E.GracePeriodNotElapsed.selector);
        vault.claimInheritance(owner);

        warp(1); // exactly at the boundary — inclusive
        vm.prank(heirA);
        vault.claimInheritance(owner);
    }

    function test_claimInheritance_revertsOnDoubleClaim() public {
        _estateAtQuorum(0, 10_000, 0);
        warp(GRACE);
        vm.prank(heirA);
        vault.claimInheritance(owner);
        vm.prank(heirA);
        vm.expectRevert(E.AlreadyClaimed.selector);
        vault.claimInheritance(owner);
        assertEq(vault.getWill(owner).beneficiariesClaimed, 1, "tally not inflated");
    }

    function test_claimInheritance_revertsForNonBeneficiary() public {
        _estateAtQuorum(0, 10_000, 0);
        warp(GRACE);
        vm.prank(stranger);
        vm.expectRevert(E.NotABeneficiary.selector);
        vault.claimInheritance(owner);
    }

    function test_claimInheritance_revertsWhenNotClaimable() public {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        _addBeneficiary(owner, heirA, 10_000);

        vm.prank(heirA);
        vm.expectRevert(E.WillNotClaimable.selector);
        vault.claimInheritance(owner);
    }

    // ---- encryption key ----

    /// @dev Mirrors `c5_only_the_heir_can_register_their_encryption_key`. Signed
    ///      by the heir, so nobody else can substitute a key they control and
    ///      redirect the estate's documents to themselves.
    function test_registerRecipientKey_onlyTheHeirThemself() public {
        _createWill(owner, THRESHOLD, 1);
        _addBeneficiary(owner, heirA, 10_000);

        // Not the owner...
        vm.prank(owner);
        vm.expectRevert(E.NotABeneficiary.selector);
        vault.registerRecipientKey(owner, KEY_B);

        // ...nor a stranger...
        vm.prank(stranger);
        vm.expectRevert(E.NotABeneficiary.selector);
        vault.registerRecipientKey(owner, KEY_B);

        // ...only the heir.
        vm.expectEmit(true, true, false, true);
        emit RecipientKeyRegistered(owner, heirA, KEY_A);
        vm.prank(heirA);
        vault.registerRecipientKey(owner, KEY_A);

        BeneficiaryView memory b = vault.getBeneficiary(owner, heirA);
        assertEq(b.encryptionPubkey, KEY_A);
        assertTrue(b.hasEncryptionKey);
    }

    function test_registerRecipientKey_rejectsZeroKey() public {
        _createWill(owner, THRESHOLD, 1);
        _addBeneficiary(owner, heirA, 10_000);
        vm.prank(heirA);
        vm.expectRevert(E.InvalidEncryptionKey.selector);
        vault.registerRecipientKey(owner, bytes32(0));
    }

    function test_registerRecipientKey_allowsRotationWhileActive() public {
        _createWill(owner, THRESHOLD, 1);
        _addBeneficiary(owner, heirA, 10_000);
        vm.prank(heirA);
        vault.registerRecipientKey(owner, KEY_A);
        vm.prank(heirA);
        vault.registerRecipientKey(owner, KEY_B);
        assertEq(vault.getBeneficiary(owner, heirA).encryptionPubkey, KEY_B);
    }

    /// @dev The key freezes once death confirmation is in flight, so an attacker
    ///      who later compromises an heir's wallet cannot swap in their own key
    ///      and unseal the estate.
    function test_registerRecipientKey_frozenOnceDeathIsInFlight() public {
        _createWill(owner, THRESHOLD, 2);
        _addCustodian(owner, custodianA);
        _addCustodian(owner, custodianB);
        _addBeneficiary(owner, heirA, 10_000);
        vm.prank(heirA);
        vault.registerRecipientKey(owner, KEY_A);

        warp(THRESHOLD);
        vm.prank(custodianA);
        vault.confirmDeath(owner); // -> PendingInheritance

        vm.prank(heirA);
        vm.expectRevert(E.WillNotActive.selector);
        vault.registerRecipientKey(owner, KEY_B);

        vm.prank(custodianB);
        vault.confirmDeath(owner); // -> Claimable
        vm.prank(heirA);
        vm.expectRevert(E.WillNotActive.selector);
        vault.registerRecipientKey(owner, KEY_B);

        assertEq(vault.getBeneficiary(owner, heirA).encryptionPubkey, KEY_A, "key unchanged");
    }

    // ---- reverse role index ----

    function test_beneficiaryRoles_trackAdditionsAndRemovals() public {
        _createWill(owner, THRESHOLD, 1);
        _createWill(stranger, THRESHOLD, 1);
        _addBeneficiary(owner, heirA, 5000);
        _addBeneficiary(stranger, heirA, 5000);

        (address[] memory owners, uint256 total) = vault.beneficiaryRolesOf(heirA, 0, 10);
        assertEq(total, 2);

        vm.prank(owner);
        vault.removeBeneficiary(heirA);
        (owners, total) = vault.beneficiaryRolesOf(heirA, 0, 10);
        assertEq(total, 1);
        assertEq(owners[0], stranger);
        // The surviving role's record must still be readable after swap-and-pop.
        assertEq(vault.getBeneficiary(stranger, heirA).allocationBps, 5000);
    }

    function test_getBeneficiaries_listsAll() public {
        _createWill(owner, THRESHOLD, 1);
        _addBeneficiary(owner, heirA, 6000);
        _addBeneficiary(owner, heirB, 4000);

        BeneficiaryView[] memory list = vault.getBeneficiaries(owner);
        assertEq(list.length, 2);
        assertEq(list[0].wallet, heirA);
        assertEq(list[1].wallet, heirB);
        assertEq(list[0].allocationBps + list[1].allocationBps, 10_000);
    }
}
