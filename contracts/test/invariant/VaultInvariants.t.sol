// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {Handler} from "./Handler.sol";
import {VaultInheritance} from "../../src/core/VaultInheritance.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {Status} from "../../src/structs/Types.sol";
import {
    WillView, TokenVaultView, BeneficiaryView, CustodianView, MediaView
} from "../../src/structs/Views.sol";

/// @notice The protocol's stated invariants, checked after every random action
///         sequence.
/// @dev These encode the eight properties listed in the migration brief plus the
///      two that are specific to the EVM design (pooled custody and the
///      independent-tally solvency check).
contract VaultInvariantsTest is Test {
    VaultInheritance internal vault;
    MockERC20 internal token;
    Handler internal handler;

    function setUp() public {
        vm.warp(1_800_000_000);
        vault = new VaultInheritance();
        token = new MockERC20("Inv", "INV", 18);
        handler = new Handler(vault, token);
        handler.bootstrap();

        // Whitelist the fuzzed selectors so `bootstrap()` is not itself fuzzed.
        bytes4[] memory selectors = new bytes4[](18);
        selectors[0] = Handler.createWill.selector;
        selectors[1] = Handler.updateWill.selector;
        selectors[2] = Handler.addCustodian.selector;
        selectors[3] = Handler.removeCustodian.selector;
        selectors[4] = Handler.addBeneficiary.selector;
        selectors[5] = Handler.removeBeneficiary.selector;
        selectors[6] = Handler.addMedia.selector;
        selectors[7] = Handler.removeMedia.selector;
        selectors[8] = Handler.registerKey.selector;
        selectors[9] = Handler.deposit.selector;
        selectors[10] = Handler.withdraw.selector;
        selectors[11] = Handler.confirmDeath.selector;
        selectors[12] = Handler.revoke.selector;
        selectors[13] = Handler.claimInheritance.selector;
        selectors[14] = Handler.claimToken.selector;
        selectors[15] = Handler.sweep.selector;
        selectors[16] = Handler.closeEstate.selector;
        selectors[17] = Handler.warpTime.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// @notice **I1 — Solvency.** The contract always holds at least what its
    ///         ledger says it owes.
    /// @dev THE invariant of the migration. On Solana each will had its own token
    ///      account, so this was structurally guaranteed; here one contract pools
    ///      every will's balance and the per-vault ledger is the only thing
    ///      keeping them apart. `<=` rather than `==` because anyone may donate
    ///      tokens to the contract, and a fee-on-transfer token can leave more
    ///      behind than the ledger credits — surplus is safe, shortfall is not.
    function invariant_I1_contractIsSolvent() public view {
        uint256 owed;
        for (uint256 i; i < 4; ++i) {
            owed += vault.getTokenVault(handler.owners(i), address(token)).remaining;
        }
        assertLe(owed, token.balanceOf(address(vault)), "ledger exceeds real balance");
    }

    /// @notice **I2 — Conservation.** Every base unit that entered has either
    ///         left through an authorized path or is still recorded as held.
    function invariant_I2_valueIsConserved() public view {
        uint256 owed;
        for (uint256 i; i < 4; ++i) {
            owed += vault.getTokenVault(handler.owners(i), address(token)).remaining;
        }
        assertEq(
            handler.ghostDeposited(),
            handler.ghostWithdrawn() + handler.ghostClaimed() + handler.ghostSwept() + owed,
            "deposits must equal withdrawals + claims + sweeps + what is still held"
        );
    }

    /// @notice **I3 — A vault never owes more than it ever received.**
    function invariant_I3_remainingNeverExceedsTotalDeposited() public view {
        for (uint256 i; i < 4; ++i) {
            TokenVaultView memory v = vault.getTokenVault(handler.owners(i), address(token));
            assertLe(v.remaining, v.totalDeposited);
        }
    }

    /// @notice **I4 — Allocations never exceed 100%,** and the cached total always
    ///         equals the sum of the live beneficiary records.
    function invariant_I4_allocationsAreConsistent() public view {
        for (uint256 i; i < 4; ++i) {
            address o = handler.owners(i);
            WillView memory w = vault.getWill(o);
            if (!w.exists) continue;
            assertLe(w.totalAllocatedBps, vault.MAX_ALLOCATION_BPS());

            uint256 sum;
            BeneficiaryView[] memory bs = vault.getBeneficiaries(o);
            for (uint256 j; j < bs.length; ++j) {
                sum += bs[j].allocationBps;
            }
            assertEq(sum, w.totalAllocatedBps, "cached allocation total drifted");
        }
    }

    /// @notice **I5 — Counters match the enumerable lists.**
    /// @dev The counters gate `deleteWill` / `closeEstate`; if they drifted from
    ///      the real child lists those guards would be meaningless.
    function invariant_I5_countersMatchLists() public view {
        for (uint256 i; i < 4; ++i) {
            address o = handler.owners(i);
            WillView memory w = vault.getWill(o);
            if (!w.exists) continue;
            assertEq(w.custodianCount, vault.getCustodians(o).length, "custodianCount");
            assertEq(w.beneficiaryCount, vault.getBeneficiaries(o).length, "beneficiaryCount");
            assertEq(w.mediaCount, vault.getMedia(o).length, "mediaCount");
            assertEq(w.tokenVaultCount, vault.getTokenVaults(o).length, "tokenVaultCount");
        }
    }

    /// @notice **I6 — The approval tally can never exceed the custodian count,**
    ///         and a Claimable will always has a started timeline.
    function invariant_I6_quorumStateIsCoherent() public view {
        for (uint256 i; i < 4; ++i) {
            address o = handler.owners(i);
            WillView memory w = vault.getWill(o);
            if (!w.exists) continue;

            assertLe(w.approvalsReceived, w.custodianCount, "more approvals than custodians");
            assertGe(w.minApprovals, 1, "quorum floor");

            // Once the claim window has closed the will is a corpse being
            // dismantled: `closeEstate` is resumable, so between calls it may sit
            // with some custodians already cleared. The live-will properties
            // below describe a will that can still be acted on, so they are
            // scoped to one that teardown has not yet opened on. The two
            // assertions above hold unconditionally.
            if (w.teardownOpen) continue;

            if (w.status == Status.Claimable) {
                assertGt(w.claimableAt, 0, "Claimable without a started timeline");
                assertGe(w.approvalsReceived, w.minApprovals, "Claimable below quorum");
            }
            if (w.status == Status.Active) {
                assertEq(w.approvalsReceived, 0, "an Active will carries no live approvals");
                assertEq(w.claimableAt, 0);
            }
            // Only confirmations from the CURRENT epoch may be counted.
            uint256 live;
            CustodianView[] memory cs = vault.getCustodians(o);
            for (uint256 j; j < cs.length; ++j) {
                if (cs[j].hasApproved) live++;
            }
            assertEq(live, w.approvalsReceived, "tally disagrees with the custodian records");
        }
    }

    /// @notice **I7 — No heir is ever paid twice** for the same will incarnation.
    function invariant_I7_noDoubleClaims() public view {
        for (uint256 i; i < 4; ++i) {
            address o = handler.owners(i);
            uint256 totalClaimed;
            for (uint256 j; j < 4; ++j) {
                totalClaimed += vault.getClaim(o, address(token), handler.heirs(j)).amount;
            }
            TokenVaultView memory v = vault.getTokenVault(o, address(token));
            // While the vault lives, everything claimed plus what is left must fit
            // inside what was deposited.
            if (v.totalDeposited > 0) {
                assertLe(totalClaimed + v.remaining, v.totalDeposited, "over-distribution");
            }
        }
    }

    /// @notice **I8 — Cleared state stays cleared.** A will that no longer exists
    ///         exposes no surviving children.
    function invariant_I8_closedEstatesAreEmpty() public view {
        for (uint256 i; i < 4; ++i) {
            address o = handler.owners(i);
            if (vault.getWill(o).exists) continue;
            assertEq(vault.getCustodians(o).length, 0);
            assertEq(vault.getBeneficiaries(o).length, 0);
            assertEq(vault.getMedia(o).length, 0);
            assertEq(vault.getTokenVaults(o).length, 0, "a closed estate still holds a vault");
        }
    }

    /// @notice **I9 — No unauthorized fund movement.** The contract never pays out
    ///         to an address that is neither the will's owner nor one of its heirs.
    /// @dev Enforced structurally: `withdrawToken` and `sweepTokenVault` pay the
    ///      owner, `claimToken` pays `msg.sender` after proving they are an heir.
    ///      The handler's cranker address is the witness.
    function invariant_I9_crankerNeverProfits() public view {
        assertEq(token.balanceOf(address(0xC7A9)), 0, "a crank paid its caller");
    }

    /// @notice **I10 — The protocol holds no ETH.**
    function invariant_I10_noEtherHeld() public view {
        assertEq(address(vault).balance, 0);
    }

    /// @dev Prints how often each action actually succeeded, so a silently
    ///      degenerate run (e.g. never reaching `Claimable`) is visible rather
    ///      than passing vacuously.
    function invariant_callSummary() public view {
        console.log("--- handler call summary (successful calls) ---");
        string[17] memory names = [
            "createWill",
            "updateWill",
            "addCustodian",
            "removeCustodian",
            "addBeneficiary",
            "removeBeneficiary",
            "addMedia",
            "removeMedia",
            "registerKey",
            "deposit",
            "withdraw",
            "confirmDeath",
            "revoke",
            "claimInheritance",
            "claimToken",
            "sweep",
            "closeEstate"
        ];
        for (uint256 i; i < names.length; ++i) {
            console.log(names[i], handler.calls(bytes32(bytes(names[i]))));
        }
    }
}
