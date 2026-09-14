// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Will} from "../structs/Types.sol";
import {VaultErrors} from "../errors/Errors.sol";

/// @title WillLib
/// @notice Pure timeline and quorum maths for a will.
/// @dev Direct successor to the `impl Will` block in
///      `programs/vault-inheritance/src/state.rs`. Kept in a library so the rules
///      have exactly one definition, shared by the mutating functions and by the
///      view functions the frontend reads.
///
///      The post-death timeline, which is what makes the dead-man's switch safe:
///
///        quorum reached ──┬── GRACE_PERIOD ──┬── CLAIM_WINDOW ──┬── teardown
///        (claimableAt)    │                  │                  │
///                         │ owner may still  │ heirs claim      │ permissionless
///                         │ REVOKE; nothing  │ assets & media   │ cranks sweep
///                         │ may be claimed   │                  │ residue to estate
library WillLib {
    /// @notice Seconds the owner has to revoke a death confirmation after quorum.
    /// @dev Claims are frozen for this entire window. This is the living owner's
    ///      last line of defence: if custodians confirm death by mistake or
    ///      malice, the owner has this long to put the will back to Active, and
    ///      no asset can move in the meantime.
    uint40 internal constant GRACE_PERIOD = 7 days;

    /// @notice Seconds heirs have to claim, starting when the grace period ends.
    /// @dev Only after this expires may the permissionless teardown run. Without
    ///      it, a stranger could clear the heirs' records the instant the will
    ///      became claimable and strand the escrowed tokens.
    uint40 internal constant CLAIM_WINDOW = 90 days;

    /// @notice Maximum total allocation across all beneficiaries, in basis points.
    uint16 internal constant MAX_ALLOCATION_BPS = 10_000;

    /// @notice End of the owner's revocation window.
    function graceEndsAt(Will storage w) internal view returns (uint64) {
        return uint64(w.claimableAt) + uint64(GRACE_PERIOD);
    }

    /// @notice End of the heirs' exclusive claim window.
    function claimWindowEndsAt(Will storage w) internal view returns (uint64) {
        return uint64(w.claimableAt) + uint64(GRACE_PERIOD) + uint64(CLAIM_WINDOW);
    }

    /// @notice Guard for every claim path.
    /// @dev The grace period must have fully elapsed, so a wrongly-confirmed
    ///      living owner always gets a chance to revoke before a single asset
    ///      moves. Mirrors `Will::require_claims_open`.
    function requireClaimsOpen(Will storage w) internal view {
        if (block.timestamp < graceEndsAt(w)) revert VaultErrors.GracePeriodNotElapsed();
    }

    /// @notice Guard for every permissionless teardown crank.
    /// @dev Mirrors `Will::require_teardown_open`. This is what stops a stranger
    ///      from clearing the heirs' records before they have had a chance to
    ///      claim.
    function requireTeardownOpen(Will storage w) internal view {
        if (block.timestamp < claimWindowEndsAt(w)) revert VaultErrors.ClaimWindowStillOpen();
    }

    /// @notice True when the will's quorum can actually be met.
    function quorumReachable(Will storage w) internal view returns (bool) {
        return w.custodianCount > 0 && w.minApprovals <= w.custodianCount;
    }

    /// @notice Guard run before any asset (media reference or token) enters a will.
    /// @dev A will whose quorum can never be met would lock the estate away from
    ///      the very heirs it names, forever. Mirrors `Will::require_quorum_reachable`.
    function requireQuorumReachable(Will storage w) internal view {
        if (!quorumReachable(w)) revert VaultErrors.QuorumUnreachable();
    }

    /// @notice True once the owner has been silent longer than their threshold.
    /// @dev Written as a comparison rather than a subtraction on purpose. The
    ///      Rust original used `now.saturating_sub(last_active_at)` so that
    ///      clock skew could not underflow into a huge positive delta; phrasing
    ///      it as an addition on the other side removes the possibility entirely
    ///      and costs nothing.
    function inactivityElapsed(Will storage w) internal view returns (bool) {
        return block.timestamp >= uint256(w.lastActiveAt) + uint256(w.inactivityThreshold);
    }

    /// @notice An heir's fixed share of a token, before the balance clamp.
    /// @dev `floor(totalDeposited * bps / 10_000)`. Computed against the
    ///      cumulative deposit rather than the live balance so that claim order
    ///      never changes anyone's entitlement. Cannot overflow: `totalDeposited`
    ///      is bounded by a real ERC-20 balance and `bps <= 10_000`, so the
    ///      product needs at most 256 bits only if a token's supply exceeds
    ///      2^242 — and Solidity 0.8 reverts rather than wrapping if it ever did.
    function shareOf(uint256 totalDeposited, uint16 bps) internal pure returns (uint256) {
        return (totalDeposited * bps) / MAX_ALLOCATION_BPS;
    }
}
