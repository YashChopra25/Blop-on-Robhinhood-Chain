// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title VaultErrors
/// @notice Every revert reason the protocol can produce.
/// @dev Direct successor to the Anchor `#[error_code]` enum in
///      `programs/vault-inheritance/src/error.rs`. Two differences worth noting:
///
///      1. Anchor error codes are POSITIONAL (custom codes start at 6000), which
///         is why the Rust enum is append-only and keeps a retired
///         `DeprecatedVaultMigration` variant to avoid shifting discriminants.
///         Solidity custom errors are identified by `bytes4(keccak256(signature))`,
///         which is derived from the NAME. Reordering is therefore harmless and
///         the retired variant is not carried forward.
///      2. Custom errors cost ~4 bytes of calldata on revert versus a full
///         revert string, which is why none of these carry a message.
library VaultErrors {
    // ---- will lifecycle ----

    /// @dev Mirrors Anchor's `init` on the will PDA: a second `createWill` for
    ///      the same owner must be impossible (reinitialization attack).
    error WillAlreadyExists();
    error WillNotFound();
    /// @dev The will must be Active. Every owner-configuration path is gated on
    ///      this; once custodians have started confirming, the owner's route back
    ///      is `revokeDeathConfirmation`, not a configuration call.
    error WillNotActive();
    error WillNotClaimable();
    /// @dev Children (media / custodians / beneficiaries) survive; remove them first.
    error WillHasDependents();
    /// @dev Escrowed tokens survive. A will may never be closed while it holds a
    ///      vault — on Solana that stranded the balance behind a PDA authority
    ///      that could never sign again; here it would strand it behind a will
    ///      record that no longer exists.
    error WillHasTokenVaults();

    // ---- dead-man's switch configuration ----

    /// @dev A non-positive threshold would make the owner "inactive" immediately,
    ///      defeating the entire switch.
    error InvalidThreshold();
    /// @dev A will requiring zero approvals could never gate death confirmation.
    error InvalidMinApprovals();
    /// @dev `minApprovals > custodianCount` makes Claimable unreachable and the
    ///      estate permanently locked away from the heirs it names.
    error MinApprovalsExceedCustodians();
    /// @dev Checked before ANY asset may enter the will, for the same reason.
    error QuorumUnreachable();
    /// @dev The owner has not been silent for `inactivityThreshold` yet.
    error OwnerStillActive();

    // ---- custodians ----

    error NotACustodian();
    error CustodianAlreadyExists();
    error CustodianNotFound();
    error AlreadyApproved();
    /// @dev Token deposits additionally require at least one custodian.
    error NoCustodians();
    error TooManyCustodians();

    // ---- beneficiaries ----

    error NotABeneficiary();
    error BeneficiaryAlreadyExists();
    error BeneficiaryNotFound();
    error AlreadyClaimed();
    error AllocationExceeded();
    error TooManyBeneficiaries();
    /// @dev An all-zero key is the "unregistered" sentinel; refuse to store it.
    error InvalidEncryptionKey();

    // ---- media ----

    error MediaNotFound();
    error InvalidCid();
    /// @dev Enforced so the (owner, cidHash) index stays a bijection, which is
    ///      what makes the API's entitlement lookup O(1). Benign in practice:
    ///      every seal uses a fresh random data key, so two uploads of the same
    ///      file already produce different ciphertext and different CIDs.
    error DuplicateCid();
    error TooManyMedia();
    error MediaIndexExhausted();

    // ---- tokens ----

    error InvalidToken();
    error InvalidAmount();
    error TokenVaultNotFound();
    error TooManyTokenVaults();
    /// @dev No allocation, or nothing left in the vault. Recording a zero claim
    ///      would consume the heir's one-shot guard for nothing.
    error NothingToClaim();

    // ---- post-death timeline ----

    /// @dev Nothing may be claimed until the owner's revocation window has fully
    ///      elapsed, so a mistaken or malicious confirmation can never move an
    ///      asset before the living owner has had a chance to undo it.
    error GracePeriodNotElapsed();
    /// @dev The heirs' exclusive claim window is still running; no permissionless
    ///      teardown may pre-empt it.
    error ClaimWindowStillOpen();
    /// @dev Nothing in flight to revoke, or the grace period already expired and
    ///      heirs may be mid-claim.
    error NothingToRevoke();

    // ---- generic ----

    error ZeroAddress();
    error ValueTooLarge();
}
