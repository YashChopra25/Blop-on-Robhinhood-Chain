// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {VaultTestBase} from "../helpers/VaultTestBase.sol";
import {VaultErrors as E} from "../../src/errors/Errors.sol";
import {MediaView} from "../../src/structs/Views.sol";

/// @notice IPFS media references.
/// @dev Parity target: `media_index_is_monotonic_after_remove`.
contract MediaTest is VaultTestBase {
    function setUp() public override {
        super.setUp();
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
    }

    function test_addMedia_storesCidAndType() public {
        vm.expectEmit(true, true, false, true);
        emit MediaAdded(owner, 0, PDF, CID_A);
        uint16 idx = _addMedia(owner, CID_A);
        assertEq(idx, 0);

        MediaView[] memory list = vault.getMedia(owner);
        assertEq(list.length, 1);
        assertEq(list[0].index, 0);
        assertEq(list[0].cid, CID_A);
        assertEq(list[0].mediaType, PDF);
        assertEq(vault.getWill(owner).mediaCount, 1);
        assertEq(vault.getWill(owner).mediaIndex, 1);
    }

    function test_addMedia_acceptsBothCidVersions() public {
        _addMedia(owner, CID_A); // CIDv0, 46 chars
        _addMedia(owner, CID_B); // CIDv1, 59 chars
        assertEq(vault.getMedia(owner).length, 2);
    }

    /// @dev Mirrors `h1_assets_rejected_while_quorum_is_unreachable` for the
    ///      media path: a document is an asset too.
    function test_addMedia_revertsWhileQuorumUnreachable() public {
        _createWill(stranger, THRESHOLD, 2);
        vm.prank(stranger);
        vm.expectRevert(E.QuorumUnreachable.selector);
        vault.addMedia(PDF, CID_A);

        _addCustodian(stranger, custodianA);
        vm.prank(stranger);
        vm.expectRevert(E.QuorumUnreachable.selector);
        vault.addMedia(PDF, CID_A);

        _addCustodian(stranger, custodianB);
        vm.prank(stranger);
        vault.addMedia(PDF, CID_A);
    }

    function test_addMedia_rejectsEmptyOrOversizeCid() public {
        vm.startPrank(owner);
        vm.expectRevert(E.InvalidCid.selector);
        vault.addMedia(PDF, "");

        // 65 bytes — one past the field width inherited from the on-chain
        // `[u8; 64]`, which the client encoder and API validator both assume.
        string memory tooLong =
            "12345678901234567890123456789012345678901234567890123456789012345";
        assertEq(bytes(tooLong).length, 65);
        vm.expectRevert(E.InvalidCid.selector);
        vault.addMedia(PDF, tooLong);

        // Exactly 64 is accepted.
        string memory exact = "1234567890123456789012345678901234567890123456789012345678901234";
        assertEq(bytes(exact).length, 64);
        vault.addMedia(PDF, exact);
        vm.stopPrank();
    }

    /// @dev A deliberate strengthening over the Solana program, which allowed
    ///      duplicate CIDs. It makes the (owner, cid) index a bijection, which is
    ///      what lets the API resolve entitlement in O(1). Benign in practice:
    ///      every seal uses a fresh random data key, so re-uploading the same
    ///      file already yields different ciphertext and a different CID.
    function test_addMedia_rejectsDuplicateCidWithinAWill() public {
        _addMedia(owner, CID_A);
        vm.prank(owner);
        vm.expectRevert(E.DuplicateCid.selector);
        vault.addMedia(PDF, CID_A);
    }

    /// @dev ...but the same CID in a DIFFERENT will is fine; the index is scoped
    ///      per owner.
    function test_addMedia_sameCidInAnotherWillIsFine() public {
        _addMedia(owner, CID_A);
        _createWill(stranger, THRESHOLD, 1);
        _addCustodian(stranger, custodianB);
        _addMedia(stranger, CID_A);

        (bool foundA, uint16 idxA) = vault.mediaIndexOfCid(owner, CID_A);
        (bool foundB, uint16 idxB) = vault.mediaIndexOfCid(stranger, CID_A);
        assertTrue(foundA && foundB);
        assertEq(idxA, 0);
        assertEq(idxB, 0);
    }

    /// @dev Mirrors `media_index_is_monotonic_after_remove`. A removed slot's
    ///      index must never be reused, so a stale pointer can never resolve to
    ///      a different document.
    function test_mediaIndexIsMonotonicAfterRemove() public {
        assertEq(_addMedia(owner, CID_A), 0);
        assertEq(_addMedia(owner, CID_B), 1);

        vm.prank(owner);
        vault.removeMedia(0);
        assertEq(vault.getWill(owner).mediaCount, 1);
        assertEq(vault.getWill(owner).mediaIndex, 2, "the counter never goes backwards");

        assertEq(_addMedia(owner, "QmNewCidAfterRemoval00000000000000000000000000"), 2);
        assertEq(vault.getWill(owner).mediaIndex, 3);

        MediaView[] memory list = vault.getMedia(owner);
        assertEq(list.length, 2);
        // Swap-and-pop moved index 1 into slot 0; both survivors stay addressable.
        assertEq(list[0].index, 1);
        assertEq(list[1].index, 2);
    }

    function test_removeMedia_clearsTheCidIndex() public {
        _addMedia(owner, CID_A);
        (bool found,) = vault.mediaIndexOfCid(owner, CID_A);
        assertTrue(found);

        vm.prank(owner);
        vault.removeMedia(0);
        (found,) = vault.mediaIndexOfCid(owner, CID_A);
        assertFalse(found, "a removed document must stop authorizing API reads");

        // ...and the CID becomes reusable in this will.
        assertEq(_addMedia(owner, CID_A), 1);
    }

    function test_removeMedia_revertsWhenAbsent() public {
        vm.prank(owner);
        vm.expectRevert(E.MediaNotFound.selector);
        vault.removeMedia(0);
    }

    function test_addMedia_revertsForNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(E.WillNotFound.selector);
        vault.addMedia(PDF, CID_A);
    }

    function test_addMedia_revertsWhenNotActive() public {
        _addBeneficiary(owner, heirA, 10_000);
        warp(THRESHOLD);
        vm.prank(custodianA);
        vault.confirmDeath(owner);

        vm.prank(owner);
        vm.expectRevert(E.WillNotActive.selector);
        vault.addMedia(PDF, CID_A);
    }

    function test_mediaIndexOfCid_reportsMissing() public view {
        (bool found, uint16 idx) = vault.mediaIndexOfCid(owner, CID_A);
        assertFalse(found);
        assertEq(idx, 0);
    }

    /// @dev The index counter is a uint16, matching Solana's `u16 media_index`.
    ///      Exhaustion must fail cleanly rather than wrap and collide with a
    ///      live document.
    function test_mediaIndexExhaustionFailsCleanly() public {
        // Cheaper than 65 535 real uploads: write the counter directly. `_wills`
        // is at slot 1 (slot 0 is ReentrancyGuard's `_status`), and slot 1 of the
        // Will struct holds `mediaIndex` in its lowest 2 bytes.
        bytes32 slot = keccak256(abi.encode(owner, uint256(1)));
        bytes32 packed = vm.load(address(vault), bytes32(uint256(slot) + 1));
        // Clear the low 16 bits and set them to uint16 max.
        bytes32 patched = (packed & ~bytes32(uint256(0xffff))) | bytes32(uint256(type(uint16).max));
        vm.store(address(vault), bytes32(uint256(slot) + 1), patched);
        assertEq(vault.getWill(owner).mediaIndex, type(uint16).max);

        vm.prank(owner);
        vm.expectRevert(E.MediaIndexExhausted.selector);
        vault.addMedia(PDF, CID_A);
    }
}
