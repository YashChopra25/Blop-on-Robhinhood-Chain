// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {VaultTestBase} from "../helpers/VaultTestBase.sol";
import {VaultErrors as E} from "../../src/errors/Errors.sol";
import {Status, TokenClaim} from "../../src/structs/Types.sol";
import {TokenVaultView} from "../../src/structs/Views.sol";
import {
    MockERC20,
    FeeOnTransferERC20,
    NoReturnERC20,
    FalseReturnERC20,
    BlockingERC20
} from "../../src/mocks/MockERC20.sol";

/// @notice Deposit, withdrawal, proportional claiming and the estate sweep.
/// @dev Parity targets: `test_token_escrow_lifecycle`,
///      `c2_token_vault_count_tracks_add_topup_and_delete`,
///      `h1_assets_rejected_while_quorum_is_unreachable`,
///      `m2_shares_are_proportional_and_the_remainder_returns_to_the_estate`.
contract TokenEscrowTest is VaultTestBase {
    // ---- deposit ----

    function test_deposit_escrowsAndAccounts() public {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);

        token.mint(owner, 1_000e18);
        vm.startPrank(owner);
        token.approve(address(vault), 1_000e18);
        vm.expectEmit(true, true, false, true);
        emit TokenDeposited(owner, address(token), 1_000e18, 1_000e18, 1_000e18);
        vault.depositToken(address(token), 1_000e18);
        vm.stopPrank();

        TokenVaultView memory v = vault.getTokenVault(owner, address(token));
        assertEq(v.totalDeposited, 1_000e18);
        assertEq(v.remaining, 1_000e18);
        assertEq(token.balanceOf(address(vault)), 1_000e18);
        assertEq(token.balanceOf(owner), 0);
        assertEq(vault.getWill(owner).tokenVaultCount, 1);
    }

    /// @dev Mirrors `c2_token_vault_count_tracks_add_topup_and_delete`: a top-up
    ///      accumulates into ONE vault rather than creating a second.
    function test_deposit_topUpAccumulatesIntoOneVault() public {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        _deposit(owner, token, 400e18);
        _deposit(owner, token, 600e18);

        TokenVaultView memory v = vault.getTokenVault(owner, address(token));
        assertEq(v.totalDeposited, 1_000e18);
        assertEq(v.remaining, 1_000e18);
        assertEq(vault.getWill(owner).tokenVaultCount, 1);
        assertEq(vault.getTokenVaults(owner).length, 1);
    }

    /// @dev Mirrors `h1_assets_rejected_while_quorum_is_unreachable`. Escrowing
    ///      into a will that can never reach quorum would lock the tokens away
    ///      from the very heirs it names.
    function test_deposit_revertsWhileQuorumUnreachable() public {
        _createWill(owner, THRESHOLD, 2);
        token.mint(owner, 1_000e18);
        vm.startPrank(owner);
        token.approve(address(vault), 1_000e18);

        // No custodians at all.
        vm.expectRevert(E.NoCustodians.selector);
        vault.depositToken(address(token), 100e18);
        vm.stopPrank();

        // One custodian, but the quorum needs two.
        _addCustodian(owner, custodianA);
        vm.prank(owner);
        vm.expectRevert(E.QuorumUnreachable.selector);
        vault.depositToken(address(token), 100e18);

        // Reachable now.
        _addCustodian(owner, custodianB);
        vm.prank(owner);
        vault.depositToken(address(token), 100e18);
        assertEq(vault.getTokenVault(owner, address(token)).remaining, 100e18);
    }

    function test_deposit_revertsOnZeroAmount() public {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        vm.prank(owner);
        vm.expectRevert(E.InvalidAmount.selector);
        vault.depositToken(address(token), 0);
    }

    function test_deposit_revertsOnInvalidToken() public {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        vm.startPrank(owner);
        vm.expectRevert(E.InvalidToken.selector);
        vault.depositToken(address(0), 1e18);
        vm.expectRevert(E.InvalidToken.selector);
        vault.depositToken(address(vault), 1e18);
        vm.stopPrank();
    }

    function test_deposit_revertsWhenNotActive() public {
        _estateAtQuorum(0, 0, 0);
        token.mint(owner, 1e18);
        vm.startPrank(owner);
        token.approve(address(vault), 1e18);
        vm.expectRevert(E.WillNotActive.selector);
        vault.depositToken(address(token), 1e18);
        vm.stopPrank();
    }

    function test_deposit_enforcesVaultCap() public {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        for (uint256 i; i < vault.MAX_TOKEN_VAULTS(); ++i) {
            MockERC20 t = new MockERC20("T", "T", 18);
            _deposit(owner, t, 1e18);
        }
        MockERC20 extra = new MockERC20("X", "X", 18);
        extra.mint(owner, 1e18);
        vm.startPrank(owner);
        extra.approve(address(vault), 1e18);
        vm.expectRevert(E.TooManyTokenVaults.selector);
        vault.depositToken(address(extra), 1e18);
        vm.stopPrank();
    }

    // ---- fee-on-transfer: the single most important EVM-specific case ----

    /// @dev SPL's `transfer_checked` always moves exactly the requested amount,
    ///      so the Solana program could credit `amount`. An ERC-20 cannot be
    ///      trusted that way. The ledger must record what ARRIVED, never what was
    ///      asked for — otherwise heirs would be entitled to more than the
    ///      contract holds.
    function test_deposit_creditsMeasuredDeltaForFeeOnTransferToken() public {
        FeeOnTransferERC20 fee = new FeeOnTransferERC20(500); // 5%
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);

        fee.mint(owner, 1_000e18);
        vm.startPrank(owner);
        fee.approve(address(vault), 1_000e18);
        vm.expectEmit(true, true, false, true);
        emit TokenDeposited(owner, address(fee), 1_000e18, 950e18, 950e18);
        vault.depositToken(address(fee), 1_000e18);
        vm.stopPrank();

        TokenVaultView memory v = vault.getTokenVault(owner, address(fee));
        assertEq(v.totalDeposited, 950e18, "credited the delta, not the request");
        assertEq(v.remaining, 950e18);
        assertEq(fee.balanceOf(address(vault)), 950e18, "ledger matches reality exactly");
    }

    function test_deposit_revertsWhenNothingArrives() public {
        FeeOnTransferERC20 fee = new FeeOnTransferERC20(10_000); // 100% fee
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        fee.mint(owner, 100e18);
        vm.startPrank(owner);
        fee.approve(address(vault), 100e18);
        vm.expectRevert(E.InvalidAmount.selector);
        vault.depositToken(address(fee), 100e18);
        vm.stopPrank();
    }

    // ---- non-standard ERC-20 handling ----

    /// @dev USDT-style: returns no data. A bare `IERC20.transfer` would revert on
    ///      the ABI decode; `SafeERC20` must tolerate it.
    function test_deposit_handlesNoReturnDataToken() public {
        NoReturnERC20 usdtLike = new NoReturnERC20();
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);

        usdtLike.mint(owner, 500e6);
        vm.startPrank(owner);
        usdtLike.approve(address(vault), 500e6);
        vault.depositToken(address(usdtLike), 500e6);
        vm.stopPrank();

        assertEq(vault.getTokenVault(owner, address(usdtLike)).remaining, 500e6);

        vm.prank(owner);
        vault.withdrawToken(address(usdtLike));
        assertEq(usdtLike.balanceOf(owner), 500e6);
    }

    /// @dev A token that returns `false` instead of reverting must be turned
    ///      into a revert; a silently-failing claim would burn the heir's
    ///      one-shot guard while moving nothing.
    function test_deposit_revertsOnFalseReturningToken() public {
        FalseReturnERC20 liar = new FalseReturnERC20();
        liar.setFailTransfers(true);
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);

        liar.mint(owner, 100e18);
        vm.startPrank(owner);
        liar.approve(address(vault), 100e18);
        vm.expectRevert(); // SafeERC20FailedOperation
        vault.depositToken(address(liar), 100e18);
        vm.stopPrank();
    }

    // ---- withdrawal while alive ----

    function test_withdraw_returnsEverythingAndClosesTheVault() public {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        _deposit(owner, token, 1_000e18);

        vm.expectEmit(true, true, false, true);
        emit TokenWithdrawn(owner, address(token), 1_000e18);
        vm.prank(owner);
        vault.withdrawToken(address(token));

        assertEq(token.balanceOf(owner), 1_000e18);
        assertEq(token.balanceOf(address(vault)), 0);
        assertEq(vault.getWill(owner).tokenVaultCount, 0);
        assertEq(vault.getTokenVaults(owner).length, 0);
        assertEq(vault.getTokenVault(owner, address(token)).totalDeposited, 0, "vault cleared");
    }

    function test_withdraw_revertsWhenNoVault() public {
        _createWill(owner, THRESHOLD, 1);
        vm.prank(owner);
        vm.expectRevert(E.TokenVaultNotFound.selector);
        vault.withdrawToken(address(token));
    }

    function test_withdraw_revertsWhenNotActive() public {
        _estateAtQuorum(1_000e18, 10_000, 0);
        vm.prank(owner);
        vm.expectRevert(E.WillNotActive.selector);
        vault.withdrawToken(address(token));
    }

    function test_withdraw_revertsForNonOwner() public {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        _deposit(owner, token, 1_000e18);
        vm.prank(stranger);
        vm.expectRevert(E.WillNotFound.selector);
        vault.withdrawToken(address(token));
    }

    /// @dev A fresh vault after a full withdraw-and-redeposit must not inherit
    ///      the old cumulative total, or every heir's share would be inflated.
    function test_withdraw_thenRedeposit_startsAFreshTotal() public {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        _deposit(owner, token, 1_000e18);
        vm.prank(owner);
        vault.withdrawToken(address(token));
        _deposit(owner, token, 250e18);

        TokenVaultView memory v = vault.getTokenVault(owner, address(token));
        assertEq(v.totalDeposited, 250e18);
        assertEq(v.remaining, 250e18);
    }

    // ---- heir claims ----

    /// @dev Mirrors `m2_shares_are_proportional_and_the_remainder_returns_to_the_estate`.
    function test_claim_isProportionalAndRemainderReturnsToTheEstate() public {
        // 60% / 30% — 10% deliberately unallocated.
        _estateAtQuorum(1_000e18, 6000, 3000);
        warp(GRACE);

        vm.prank(heirA);
        vault.claimToken(owner, address(token));
        vm.prank(heirB);
        vault.claimToken(owner, address(token));

        assertEq(token.balanceOf(heirA), 600e18);
        assertEq(token.balanceOf(heirB), 300e18);
        assertEq(vault.getTokenVault(owner, address(token)).remaining, 100e18);
        assertEq(
            vault.getTokenVault(owner, address(token)).totalDeposited,
            1_000e18,
            "the share denominator is a snapshot and never shrinks"
        );

        // The unallocated remainder goes back to the estate, not to a cranker.
        warp(CLAIM_WINDOW);
        vm.prank(cranker);
        vault.sweepTokenVault(owner, address(token));
        assertEq(token.balanceOf(owner), 100e18);
        assertEq(token.balanceOf(cranker), 0, "cranks are permissionless but not profitable");
    }

    /// @dev Claim order must not change anyone's entitlement — the whole reason
    ///      the denominator is a snapshot rather than the live balance.
    function test_claim_orderDoesNotChangeEntitlements() public {
        _estateAtQuorum(1_000e18, 6000, 4000);
        warp(GRACE);

        vm.prank(heirB);
        vault.claimToken(owner, address(token));
        vm.prank(heirA);
        vault.claimToken(owner, address(token));

        assertEq(token.balanceOf(heirA), 600e18);
        assertEq(token.balanceOf(heirB), 400e18);
        assertEq(vault.getTokenVault(owner, address(token)).remaining, 0);
    }

    function test_claim_blockedDuringGrace() public {
        _estateAtQuorum(1_000e18, 10_000, 0);
        vm.prank(heirA);
        vm.expectRevert(E.GracePeriodNotElapsed.selector);
        vault.claimToken(owner, address(token));
    }

    /// @dev On Solana the double-claim guard was the *existence* of a TokenClaim
    ///      PDA created with `init`. Storage always exists on EVM, so the flag is
    ///      explicit — this test is what proves the replacement is equivalent.
    function test_claim_revertsOnDoubleClaim() public {
        _estateAtQuorum(1_000e18, 10_000, 0);
        warp(GRACE);

        vm.prank(heirA);
        vault.claimToken(owner, address(token));
        vm.prank(heirA);
        vm.expectRevert(E.AlreadyClaimed.selector);
        vault.claimToken(owner, address(token));

        assertEq(token.balanceOf(heirA), 1_000e18, "exactly one payout");
        TokenClaim memory c = vault.getClaim(owner, address(token), heirA);
        assertTrue(c.claimed);
        assertEq(c.amount, 1_000e18);
    }

    function test_claim_revertsForNonBeneficiary() public {
        _estateAtQuorum(1_000e18, 10_000, 0);
        warp(GRACE);
        vm.prank(stranger);
        vm.expectRevert(E.NotABeneficiary.selector);
        vault.claimToken(owner, address(token));
    }

    function test_claim_revertsForZeroAllocationHeir() public {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        _addBeneficiary(owner, heirA, 0);
        _deposit(owner, token, 1_000e18);
        warp(THRESHOLD);
        vm.prank(custodianA);
        vault.confirmDeath(owner);
        warp(GRACE);

        vm.prank(heirA);
        vm.expectRevert(E.NothingToClaim.selector);
        vault.claimToken(owner, address(token));
    }

    /// @dev Floor-rounding can leave a share of zero. Recording a zero claim
    ///      would consume the heir's one-shot guard for nothing.
    function test_claim_revertsWhenShareRoundsToZero() public {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        _addBeneficiary(owner, heirA, 1); // 0.01%
        _deposit(owner, token, 100); // 100 * 1 / 10000 = 0
        warp(THRESHOLD);
        vm.prank(custodianA);
        vault.confirmDeath(owner);
        warp(GRACE);

        vm.prank(heirA);
        vm.expectRevert(E.NothingToClaim.selector);
        vault.claimToken(owner, address(token));
    }

    function test_claim_revertsWhenNoVault() public {
        _estateAtQuorum(0, 10_000, 0);
        warp(GRACE);
        vm.prank(heirA);
        vm.expectRevert(E.TokenVaultNotFound.selector);
        vault.claimToken(owner, address(token));
    }

    function test_claimableAmount_matchesWhatClaimActuallyPays() public {
        _estateAtQuorum(1_000e18, 6000, 3000);
        assertEq(vault.claimableAmount(owner, address(token), heirA), 0, "closed during grace");

        warp(GRACE);
        uint256 quoted = vault.claimableAmount(owner, address(token), heirA);
        assertEq(quoted, 600e18);

        vm.prank(heirA);
        vault.claimToken(owner, address(token));
        assertEq(token.balanceOf(heirA), quoted);
        assertEq(vault.claimableAmount(owner, address(token), heirA), 0, "already claimed");
    }

    // ---- sweep ----

    function test_sweep_blockedUntilClaimWindowCloses() public {
        _estateAtQuorum(1_000e18, 6000, 0);
        warp(GRACE);

        vm.prank(cranker);
        vm.expectRevert(E.ClaimWindowStillOpen.selector);
        vault.sweepTokenVault(owner, address(token));

        warp(CLAIM_WINDOW - 1);
        vm.prank(cranker);
        vm.expectRevert(E.ClaimWindowStillOpen.selector);
        vault.sweepTokenVault(owner, address(token));

        warp(1);
        vm.prank(cranker);
        vault.sweepTokenVault(owner, address(token));
        assertEq(token.balanceOf(owner), 1_000e18, "including the never-claimed share");
    }

    /// @dev The sweep also closes an empty vault, which is what lets
    ///      `closeEstate` ever satisfy its "no vaults" precondition.
    function test_sweep_closesAnEmptyVault() public {
        _estateAtQuorum(1_000e18, 10_000, 0);
        warp(GRACE);
        vm.prank(heirA);
        vault.claimToken(owner, address(token));
        assertEq(vault.getTokenVault(owner, address(token)).remaining, 0);

        warp(CLAIM_WINDOW);
        vm.prank(cranker);
        vault.sweepTokenVault(owner, address(token));
        assertEq(vault.getWill(owner).tokenVaultCount, 0);
    }

    function test_sweep_revertsWhenNoVault() public {
        _estateAtQuorum(0, 10_000, 0);
        warp(GRACE + CLAIM_WINDOW);
        vm.prank(cranker);
        vm.expectRevert(E.TokenVaultNotFound.selector);
        vault.sweepTokenVault(owner, address(token));
    }

    /// @dev A blocklisting token can make the sweep revert. The important
    ///      property is that it fails LOUDLY and leaves the vault intact and
    ///      retryable, rather than clearing the ledger and losing the balance.
    function test_sweep_failsSafelyWhenTheTokenBlocksTheEstate() public {
        BlockingERC20 blk = new BlockingERC20();
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        _addBeneficiary(owner, heirA, 5000);
        blk.mint(owner, 1_000e18);
        vm.startPrank(owner);
        blk.approve(address(vault), 1_000e18);
        vault.depositToken(address(blk), 1_000e18);
        vm.stopPrank();

        warp(THRESHOLD);
        vm.prank(custodianA);
        vault.confirmDeath(owner);
        warp(GRACE + CLAIM_WINDOW);

        blk.setBlocked(owner, true);
        vm.prank(cranker);
        vm.expectRevert("blocked");
        vault.sweepTokenVault(owner, address(blk));

        // State untouched: retryable once the block is lifted.
        assertEq(vault.getTokenVault(owner, address(blk)).remaining, 1_000e18);
        assertEq(vault.getWill(owner).tokenVaultCount, 1);

        blk.setBlocked(owner, false);
        vm.prank(cranker);
        vault.sweepTokenVault(owner, address(blk));
        assertEq(blk.balanceOf(owner), 1_000e18);
    }

    // ---- cross-will isolation: the property SPL got for free ----

    /// @dev On Solana each will owned its own token account, so cross-will
    ///      contamination was structurally impossible. Here one contract holds
    ///      every will's balance for a token, and the per-vault ledger is the
    ///      only thing keeping them apart. This is the test that proves it.
    function test_vaultsOfDifferentWillsAreIsolated() public {
        _createWill(owner, THRESHOLD, 1);
        _addCustodian(owner, custodianA);
        _addBeneficiary(owner, heirA, 10_000);
        _deposit(owner, token, 1_000e18);

        _createWill(stranger, THRESHOLD, 1);
        _addCustodian(stranger, custodianB);
        _addBeneficiary(stranger, heirB, 10_000);
        _deposit(stranger, token, 5_000e18);

        assertEq(token.balanceOf(address(vault)), 6_000e18, "one pooled balance");

        warp(THRESHOLD);
        vm.prank(custodianA);
        vault.confirmDeath(owner);
        warp(GRACE);

        // heirA is entitled to 100% of OWNER's vault, not of the pool.
        vm.prank(heirA);
        vault.claimToken(owner, address(token));
        assertEq(token.balanceOf(heirA), 1_000e18);
        assertEq(
            vault.getTokenVault(stranger, address(token)).remaining,
            5_000e18,
            "the other will is untouched"
        );

        // ...and heirA is nobody on the other will.
        vm.prank(heirA);
        vm.expectRevert(E.WillNotClaimable.selector);
        vault.claimToken(stranger, address(token));
    }
}
