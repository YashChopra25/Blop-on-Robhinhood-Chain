// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {VaultInheritance} from "../../src/core/VaultInheritance.sol";
import {VaultErrors as E} from "../../src/errors/Errors.sol";
import {IVaultEvents} from "../../src/events/IVaultEvents.sol";
import {Status} from "../../src/structs/Types.sol";
import {WillView, BeneficiaryView, CustodianView} from "../../src/structs/Views.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";

/// @notice Shared fixture for the whole suite.
/// @dev Mirrors the helper layer in the Solana LiteSVM suite
///      (`programs/vault-inheritance/tests/test_audit.rs`): named actors, a
///      `warp` helper, and an `estateAtQuorum` builder so the post-death tests
///      start from a known state instead of re-deriving it each time.
abstract contract VaultTestBase is Test, IVaultEvents {
    VaultInheritance internal vault;
    MockERC20 internal token;

    address internal owner = makeAddr("owner");
    address internal custodianA = makeAddr("custodianA");
    address internal custodianB = makeAddr("custodianB");
    address internal custodianC = makeAddr("custodianC");
    address internal heirA = makeAddr("heirA");
    address internal heirB = makeAddr("heirB");
    address internal stranger = makeAddr("stranger");
    address internal cranker = makeAddr("cranker");

    uint64 internal constant THRESHOLD = 30 days;
    uint40 internal constant GRACE = 7 days;
    uint40 internal constant CLAIM_WINDOW = 90 days;
    string internal constant CID_A = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
    string internal constant CID_B = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    bytes16 internal constant PDF = bytes16(bytes("application/pdf"));

    function setUp() public virtual {
        // Start well past the epoch so `block.timestamp - THRESHOLD` never
        // underflows and so warps read like real dates.
        vm.warp(1_800_000_000);
        vault = new VaultInheritance();
        token = new MockERC20("Test", "TST", 18);
    }

    // ---- time ----

    function warp(uint256 secs) internal {
        vm.warp(block.timestamp + secs);
    }

    // ---- builders ----

    function _createWill(address who, uint64 threshold, uint8 minApprovals) internal {
        vm.prank(who);
        vault.createWill(threshold, minApprovals);
    }

    function _addCustodian(address who, address custodian) internal {
        vm.prank(who);
        vault.addCustodian(custodian);
    }

    function _addBeneficiary(address who, address heir, uint16 bps) internal {
        vm.prank(who);
        vault.addBeneficiary(heir, bps);
    }

    function _addMedia(address who, string memory cid) internal returns (uint16) {
        vm.prank(who);
        return vault.addMedia(PDF, cid);
    }

    function _deposit(address who, MockERC20 t, uint256 amount) internal {
        t.mint(who, amount);
        vm.startPrank(who);
        t.approve(address(vault), amount);
        vault.depositToken(address(t), amount);
        vm.stopPrank();
    }

    /// @notice A will with one custodian, two heirs and (optionally) an escrow,
    ///         warped past the inactivity threshold and confirmed to quorum.
    /// @dev Leaves `block.timestamp` exactly at `claimableAt`, so a test can warp
    ///      by GRACE to open claims or by GRACE + CLAIM_WINDOW to open teardown.
    function _estateAtQuorum(uint256 escrow, uint16 bpsA, uint16 bpsB) internal {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        if (bpsA > 0) _addBeneficiary(owner, heirA, bpsA);
        if (bpsB > 0) _addBeneficiary(owner, heirB, bpsB);
        if (escrow > 0) _deposit(owner, token, escrow);
        warp(THRESHOLD);
        vm.prank(custodianA);
        vault.confirmDeath(owner);
    }

    // ---- assertions ----

    function _status(address who) internal view returns (Status) {
        return vault.getWill(who).status;
    }

    function _assertNoWill(address who) internal view {
        WillView memory w = vault.getWill(who);
        assertFalse(w.exists, "will should not exist");
        assertTrue(w.status == Status.None, "status should be None");
    }
}
