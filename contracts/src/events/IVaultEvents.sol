// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IVaultEvents
/// @notice Every state transition the protocol emits.
/// @dev This interface has NO Solana counterpart. The Anchor program emits no
///      events at all — clients reconstruct state with `getProgramAccounts` plus
///      memcmp filters, a primitive EVM does not have. Events are therefore not
///      a convenience here, they are the indexing substrate (see
///      EVM_MIGRATION_DESIGN.md §6).
///
///      `owner` is indexed on every event so a client can filter by will.
///      `CustodianAdded` / `BeneficiaryAdded` index the member as well, which is
///      what makes "every will where I am a custodian" a single indexed
///      `eth_getLogs` — the direct replacement for the `memcmp(offset 40)` scan
///      in the Solana client's `lib/rolesFetch.ts`.
interface IVaultEvents {
    // ---- will lifecycle ----
    event WillCreated(
        address indexed owner, uint64 inactivityThreshold, uint8 minApprovals, uint64 createdAt
    );
    event WillUpdated(
        address indexed owner, uint64 inactivityThreshold, uint8 minApprovals, uint64 lastActiveAt
    );
    event WillDeleted(address indexed owner);

    // ---- media ----
    event MediaAdded(
        address indexed owner, uint16 indexed mediaIndex, bytes16 mediaType, string cid
    );
    event MediaRemoved(address indexed owner, uint16 indexed mediaIndex);

    // ---- custodians ----
    event CustodianAdded(address indexed owner, address indexed custodian);
    event CustodianRemoved(address indexed owner, address indexed custodian);
    event DeathConfirmed(
        address indexed owner,
        address indexed custodian,
        uint8 approvalsReceived,
        uint8 minApprovals,
        uint32 approvalEpoch
    );
    /// @dev Emitted once, on the transition into Claimable. Carries both derived
    ///      deadlines so an indexer never has to know the protocol constants.
    event WillBecameClaimable(
        address indexed owner, uint64 claimableAt, uint64 graceEndsAt, uint64 claimWindowEndsAt
    );
    event DeathConfirmationRevoked(address indexed owner, uint32 newApprovalEpoch);

    // ---- beneficiaries ----
    event BeneficiaryAdded(address indexed owner, address indexed heir, uint16 allocationBps);
    event BeneficiaryRemoved(address indexed owner, address indexed heir, uint16 allocationBps);
    event InheritanceClaimed(address indexed owner, address indexed heir);
    event RecipientKeyRegistered(
        address indexed owner, address indexed heir, bytes32 encryptionPubkey
    );

    // ---- token escrow ----
    /// @dev `requested` and `received` differ for fee-on-transfer tokens. The
    ///      vault is credited with `received` — the measured balance delta — and
    ///      both are logged so the discrepancy is visible off-chain.
    event TokenDeposited(
        address indexed owner,
        address indexed token,
        uint256 requested,
        uint256 received,
        uint256 totalDeposited
    );
    event TokenWithdrawn(address indexed owner, address indexed token, uint256 amount);
    event TokenClaimed(
        address indexed owner, address indexed token, address indexed heir, uint256 amount
    );
    /// @dev Residual = deliberately unallocated remainder + floor-rounding dust +
    ///      the share of any heir who never claimed. Always to the estate.
    event TokenVaultSwept(
        address indexed owner, address indexed token, uint256 residual, address cranker
    );

    // ---- teardown ----
    event EstateChildrenCleared(
        address indexed owner, uint256 mediaCleared, uint256 custodiansCleared, uint256 heirsCleared
    );
    event EstateClosed(address indexed owner, address cranker);
}
