// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {VaultTestBase} from "../helpers/VaultTestBase.sol";
import {stdError} from "forge-std/StdError.sol";
import {VaultInheritance} from "../../src/core/VaultInheritance.sol";
import {VaultErrors as E} from "../../src/errors/Errors.sol";
import {Status} from "../../src/structs/Types.sol";
import {
    MockERC20, ReentrantERC20, IReentrancyTarget
} from "../../src/mocks/MockERC20.sol";

/// @notice Adversarial scenarios specific to the EVM execution model.
/// @dev Most of these have NO Solana counterpart, because SPL Token is a fixed,
///      audited program while an ERC-20 is arbitrary code the caller chooses.
contract SecurityTest is VaultTestBase {
    // ---- reentrancy ----

    /// @dev The hazard SPL simply does not have. A token that calls back into the
    ///      vault from inside `transfer` must not be able to claim twice.
    ///      Both defences are in play: the `claimed` flag is written BEFORE the
    ///      transfer (checks-effects-interactions), and `nonReentrant` stops the
    ///      re-entry outright.
    function test_reentrantTokenCannotDoubleClaim() public {
        ReentrantERC20 evil = new ReentrantERC20();
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        _addBeneficiary(owner, heirA, 10_000);

        evil.mint(owner, 1_000e18);
        vm.startPrank(owner);
        evil.approve(address(vault), 1_000e18);
        vault.depositToken(address(evil), 1_000e18);
        vm.stopPrank();

        warp(THRESHOLD);
        vm.prank(custodianA);
        vault.confirmDeath(owner);
        warp(GRACE);

        evil.arm(IReentrancyTarget(address(vault)), owner, 1); // re-enter claimToken

        vm.prank(heirA);
        vm.expectRevert(); // ReentrancyGuardReentrantCall
        vault.claimToken(owner, address(evil));

        // Nothing moved and nothing was recorded.
        assertEq(evil.balanceOf(heirA), 0);
        assertFalse(vault.getClaim(owner, address(evil), heirA).claimed);
        assertEq(vault.getTokenVault(owner, address(evil)).remaining, 1_000e18);
    }

    function test_reentrantTokenCannotDoubleWithdraw() public {
        ReentrantERC20 evil = new ReentrantERC20();
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);

        evil.mint(owner, 1_000e18);
        vm.startPrank(owner);
        evil.approve(address(vault), 1_000e18);
        vault.depositToken(address(evil), 1_000e18);
        vm.stopPrank();

        evil.arm(IReentrancyTarget(address(vault)), owner, 2); // re-enter withdrawToken
        vm.prank(owner);
        vm.expectRevert();
        vault.withdrawToken(address(evil));

        assertEq(vault.getTokenVault(owner, address(evil)).remaining, 1_000e18, "state intact");
    }

    function test_reentrantTokenCannotDoubleSweep() public {
        ReentrantERC20 evil = new ReentrantERC20();
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        _addBeneficiary(owner, heirA, 5000);

        evil.mint(owner, 1_000e18);
        vm.startPrank(owner);
        evil.approve(address(vault), 1_000e18);
        vault.depositToken(address(evil), 1_000e18);
        vm.stopPrank();

        warp(THRESHOLD);
        vm.prank(custodianA);
        vault.confirmDeath(owner);
        warp(GRACE + CLAIM_WINDOW);

        evil.arm(IReentrancyTarget(address(vault)), owner, 3);
        vm.prank(cranker);
        vm.expectRevert();
        vault.sweepTokenVault(owner, address(evil));
    }

    /// @dev A reentrant token during DEPOSIT must not be able to inflate the
    ///      measured delta by depositing again mid-transfer.
    function test_reentrantTokenCannotInflateDepositAccounting() public {
        ReentrantERC20 evil = new ReentrantERC20();
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);

        evil.mint(owner, 2_000e18);
        vm.startPrank(owner);
        evil.approve(address(vault), 2_000e18);
        vault.depositToken(address(evil), 1_000e18);
        vm.stopPrank();

        // Now arm the callback and deposit again.
        evil.arm(IReentrancyTarget(address(vault)), owner, 2);
        vm.prank(owner);
        vm.expectRevert();
        vault.depositToken(address(evil), 1_000e18);

        assertEq(vault.getTokenVault(owner, address(evil)).totalDeposited, 1_000e18);
        assertEq(evil.balanceOf(address(vault)), 1_000e18, "ledger still matches reality");
    }

    // ---- authorization ----

    /// @dev Exhaustive: every owner-only function, called by three different
    ///      non-owners. There is no owner parameter to forge — the will is keyed
    ///      by `msg.sender`, so a non-owner simply has no will.
    function test_ownerOnlyFunctionsRejectEveryNonOwner() public {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        _addBeneficiary(owner, heirA, 5000);

        address[3] memory intruders = [stranger, custodianA, heirA];
        for (uint256 i; i < intruders.length; ++i) {
            vm.startPrank(intruders[i]);
            vm.expectRevert(E.WillNotFound.selector);
            vault.updateWill(1 days, 0);
            vm.expectRevert(E.WillNotFound.selector);
            vault.deleteWill();
            vm.expectRevert(E.WillNotFound.selector);
            vault.addCustodian(custodianB);
            vm.expectRevert(E.WillNotFound.selector);
            vault.removeCustodian(custodianA);
            vm.expectRevert(E.WillNotFound.selector);
            vault.addBeneficiary(heirB, 1000);
            vm.expectRevert(E.WillNotFound.selector);
            vault.removeBeneficiary(heirA);
            vm.expectRevert(E.WillNotFound.selector);
            vault.addMedia(PDF, CID_A);
            vm.expectRevert(E.WillNotFound.selector);
            vault.removeMedia(0);
            vm.expectRevert(E.WillNotFound.selector);
            vault.revokeDeathConfirmation();
            vm.expectRevert(E.WillNotFound.selector);
            vault.withdrawToken(address(token));
            vm.expectRevert(E.WillNotFound.selector);
            vault.depositToken(address(token), 1e18);
            vm.stopPrank();
        }

        // The owner's will is untouched by all of that.
        assertEq(vault.getWill(owner).custodianCount, 1);
        assertEq(vault.getWill(owner).beneficiaryCount, 1);
    }

    /// @dev A custodian of will A must have no power over will B, and likewise
    ///      for heirs. On Solana this came from `has_one = will`; here it comes
    ///      from the mapping being keyed by owner.
    function test_rolesDoNotLeakAcrossWills() public {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        _addBeneficiary(owner, heirA, 10_000);
        _deposit(owner, token, 1_000e18);

        _createWill(stranger, THRESHOLD, 1);
        _addCustodian(stranger, custodianB);
        _addBeneficiary(stranger, heirB, 10_000);
        _deposit(stranger, token, 1_000e18);

        warp(THRESHOLD);
        // custodianA cannot confirm stranger's will.
        vm.prank(custodianA);
        vm.expectRevert(E.NotACustodian.selector);
        vault.confirmDeath(stranger);

        vm.prank(custodianA);
        vault.confirmDeath(owner);
        warp(GRACE);

        // heirB is not an heir of owner's will.
        vm.prank(heirB);
        vm.expectRevert(E.NotABeneficiary.selector);
        vault.claimToken(owner, address(token));
        vm.prank(heirB);
        vm.expectRevert(E.NotABeneficiary.selector);
        vault.claimInheritance(owner);
    }

    // ---- no admin, no pause, no upgrade ----

    /// @dev The trust model is "nobody is privileged". This test asserts the
    ///      ABSENCE of the usual escape hatches — if someone later adds an
    ///      `owner()`, a `pause()` or an `upgradeTo()`, this test fails and the
    ///      design decision gets re-litigated deliberately rather than by
    ///      accident.
    function test_contractExposesNoAdministrativeSurface() public view {
        string[8] memory forbidden = [
            "owner()",
            "pause()",
            "unpause()",
            "paused()",
            "upgradeTo(address)",
            "upgradeToAndCall(address,bytes)",
            "initialize()",
            "transferOwnership(address)"
        ];
        for (uint256 i; i < forbidden.length; ++i) {
            (bool ok,) = address(vault).staticcall(abi.encodeWithSignature(forbidden[i]));
            assertFalse(ok, string.concat("unexpected admin surface: ", forbidden[i]));
        }
    }

    /// @dev No `receive`/`fallback`, so ETH cannot be sent in by accident.
    function test_contractRejectsPlainEther() public {
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        (bool ok,) = address(vault).call{value: 1 ether}("");
        assertFalse(ok, "plain ETH transfer must revert");
        assertEq(address(vault).balance, 0);
    }

    /// @dev ETH can still be FORCE-fed (selfdestruct, block rewards). That must
    ///      not perturb anything, because no accounting reads
    ///      `address(this).balance`.
    function test_forcedEtherDoesNotAffectAccounting() public {
        _estateAtQuorum(1_000e18, 10_000, 0);
        vm.deal(address(vault), 5 ether); // simulate forced ETH

        warp(GRACE);
        vm.prank(heirA);
        vault.claimToken(owner, address(token));

        assertEq(token.balanceOf(heirA), 1_000e18, "token accounting unaffected");
        assertEq(address(vault).balance, 5 ether, "the ETH is simply stranded");
    }

    // ---- griefing ----

    /// @dev An owner can name any address without its consent, so a griefer can
    ///      inflate a victim's reverse-role list. It must not be able to block
    ///      any write; pagination keeps reads affordable.
    function test_roleListInflationCannotBlockAnything() public {
        for (uint256 i; i < 50; ++i) {
            address griefer = address(uint160(9000 + i));
            _createWill(griefer, THRESHOLD, 1);
            _addCustodian(griefer, heirA);
            _addBeneficiary(griefer, heirA, 1);
        }

        // The victim can still be named legitimately, and still act.
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, heirA);
        _addBeneficiary(owner, heirA, 10_000);
        _deposit(owner, token, 100e18);

        warp(THRESHOLD);
        vm.prank(heirA);
        vault.confirmDeath(owner);
        warp(GRACE);
        vm.prank(heirA);
        vault.claimToken(owner, address(token));
        assertEq(token.balanceOf(heirA), 100e18);

        // Reads stay bounded by the caller's page size.
        (address[] memory page, uint256 total) = vault.beneficiaryRolesOf(heirA, 0, 10);
        assertEq(total, 51);
        assertEq(page.length, 10);
    }

    /// @dev A contract heir with no fallback is irrelevant: ERC-20 transfers do
    ///      not call the recipient, so a "malicious contract recipient" cannot
    ///      block its own claim or anyone else's.
    function test_contractHeirWithNoFallbackCanStillClaim() public {
        RejectingContract heir = new RejectingContract();
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        _addBeneficiary(owner, address(heir), 10_000);
        _deposit(owner, token, 1_000e18);

        warp(THRESHOLD);
        vm.prank(custodianA);
        vault.confirmDeath(owner);
        warp(GRACE);

        heir.claim(vault, owner, address(token));
        assertEq(token.balanceOf(address(heir)), 1_000e18);
    }

    // ---- arithmetic ----

    /// @dev Solidity 0.8 reverts on overflow, which is the direct equivalent of
    ///      the Rust `checked_add(...).ok_or(MathOverflow)` pattern used
    ///      throughout the Anchor program.
    function test_allocationOverflowRevertsRatherThanWrapping() public {
        _createWill(owner, THRESHOLD, 1);
        _addBeneficiary(owner, heirA, 10_000);
        vm.prank(owner);
        vm.expectRevert(E.AllocationExceeded.selector);
        vault.addBeneficiary(heirB, 1);
    }

    /// @dev A token with an absurd supply must not silently wrap the share
    ///      calculation. `shareOf` multiplies before dividing, so a total above
    ///      ~2^242 makes `total * 10_000` exceed uint256 and Solidity 0.8 reverts
    ///      with an arithmetic panic — the direct equivalent of the Rust
    ///      `checked_mul(...).ok_or(MathOverflow)` in `claim_token_handler`.
    ///
    ///      Note this also proves the `ValueTooLarge` guard on the uint248 cast
    ///      is unreachable in practice: for the multiplication to survive,
    ///      `total` must be below ~2^242.7, and `amount <= total`, so the cast
    ///      can never truncate. The guard is kept as defence-in-depth against a
    ///      future change that widens the bps range. Recorded in SECURITY_REVIEW.md.
    function test_absurdSupplyRevertsRatherThanWrapping() public {
        MockERC20 huge = new MockERC20("Huge", "HGE", 18);
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        _addBeneficiary(owner, heirA, 10_000);

        uint256 absurd = type(uint256).max / 5_000; // total * 10_000 overflows
        huge.mint(owner, absurd);
        vm.startPrank(owner);
        huge.approve(address(vault), absurd);
        vault.depositToken(address(huge), absurd);
        vm.stopPrank();

        warp(THRESHOLD);
        vm.prank(custodianA);
        vault.confirmDeath(owner);
        warp(GRACE);

        vm.prank(heirA);
        vm.expectRevert(stdError.arithmeticError);
        vault.claimToken(owner, address(huge));

        // Nothing was recorded, and the escrow is intact.
        assertFalse(vault.getClaim(owner, address(huge), heirA).claimed);
        assertEq(vault.getTokenVault(owner, address(huge)).remaining, absurd);
    }

    /// @dev The largest total that does NOT overflow still pays out correctly.
    function test_largestNonOverflowingTotalStillPaysOut() public {
        MockERC20 huge = new MockERC20("Huge", "HGE", 18);
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        _addBeneficiary(owner, heirA, 10_000);

        uint256 big = type(uint256).max / 10_000;
        huge.mint(owner, big);
        vm.startPrank(owner);
        huge.approve(address(vault), big);
        vault.depositToken(address(huge), big);
        vm.stopPrank();

        warp(THRESHOLD);
        vm.prank(custodianA);
        vault.confirmDeath(owner);
        warp(GRACE);

        vm.prank(heirA);
        vault.claimToken(owner, address(huge));
        assertEq(huge.balanceOf(heirA), big);
        assertEq(vault.getClaim(owner, address(huge), heirA).amount, big);
    }
}

/// @notice A contract with no receive/fallback, used as an heir.
contract RejectingContract {
    function claim(VaultInheritance vault, address owner, address tk) external {
        vault.claimToken(owner, tk);
    }
}
