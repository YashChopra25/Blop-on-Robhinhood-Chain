// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Lifecycle of a will.
/// @dev `None` has no Solana counterpart: on Solana an account either exists or
///      it does not, and Anchor's `init` constraint is what makes a second
///      `initialise_will` for the same owner impossible. Solidity storage always
///      "exists" and reads as zero, so `None == 0` is the explicit existence
///      sentinel that reproduces that guarantee.
///
///      Happy path: Active -> PendingInheritance -> Claimable.
///      While Active only the owner mutates the will. Once quorum is reached the
///      owner can no longer configure it, but until the grace period expires
///      they may still revoke and return it to Active.
enum Status {
    None,
    Active,
    PendingInheritance,
    Claimable
}

/// @notice The root record of a single owner's digital will.
/// @dev Packed into exactly two storage slots. `owner` is deliberately absent:
///      the mapping key IS the owner, mirroring the Solana PDA seed
///      `["will", owner]`. Timestamps are uint40 (overflows in year 36812), which
///      is what lets slot 0 hold the entire hot path read by `confirmDeath`.
struct Will {
    // ---- slot 0 (31 of 32 bytes used) ----
    Status status; //                1  — also the existence flag
    uint8 minApprovals; //           1  — custodian confirmations needed for quorum
    uint8 approvalsReceived; //      1  — tally in the CURRENT approval epoch
    uint8 custodianCount; //         1
    uint8 mediaCount; //             1  — live media references (u8, as on Solana)
    uint16 totalAllocatedBps; //     2  — never allowed to exceed 10_000
    uint32 approvalEpoch; //         4  — bumped by revoke; invalidates all prior confirmations
    uint40 createdAt; //             5
    uint40 lastActiveAt; //          5  — last proof of life; the switch measures silence from here
    uint40 claimableAt; //           5  — instant quorum was reached; 0 while never reached
    uint40 inactivityThreshold; //   5  — seconds of silence before death may be confirmed
    // ---- slot 1 (8 of 32 bytes used) ----
    uint16 mediaIndex; //            2  — MONOTONIC; never decremented, so an index is never reused
    uint16 beneficiaryCount; //      2
    uint16 beneficiariesClaimed; //  2
    uint16 tokenVaultCount; //       2  — a will may never be closed while this is non-zero
}

/// @notice A trusted party who may attest to the owner's death.
/// @dev One slot. `will` and `wallet` back-references from the Solana account are
///      dropped: they are the mapping keys.
struct Custodian {
    bool exists;
    bool hasApproved;
    uint32 approvedEpoch; // the Will.approvalEpoch this confirmation was cast in
    uint40 lastApprovedAt;
    uint32 listIndex; // position in the will's custodian array (O(1) removal)
    uint32 roleIndex; // position in this wallet's reverse-role array (O(1) removal)
}

/// @notice An heir with a basis-point share of the estate.
struct Beneficiary {
    // ---- slot 0 ----
    bool exists;
    bool hasClaimed;
    uint16 allocationBps; // 0..=10_000
    uint32 listIndex;
    uint32 roleIndex;
    // ---- slot 1 ----
    /// @dev X25519 public key this heir published for key agreement, or zero if
    ///      unregistered. The owner wraps each document's data key to it, so the
    ///      ciphertext on IPFS can only be opened by the matching secret — which
    ///      never leaves the heir's browser. Exactly 32 bytes, so `bytes32` is an
    ///      exact fit for Solana's `[u8; 32]`.
    bytes32 encryptionPubkey;
}

/// @notice A pointer to an off-chain, client-encrypted document.
/// @dev The bytes on IPFS are AES-256-GCM ciphertext produced in the owner's
///      browser; publishing the CID reveals that a document exists and nothing
///      more. The chain is never trusted with plaintext or with a key.
struct MediaReference {
    bool exists;
    uint16 index; // the monotonic index this record is keyed by
    uint32 listIndex;
    bytes16 mediaType; // MIME type, zero-padded — exact fit for Solana's [u8; 16]
    string cid; // IPFS CID, 1..=64 bytes (fits CIDv0 `Qm…` and CIDv1 `bafy…`)
}

/// @notice Per-(will, token) escrow accounting.
/// @dev This is the one structure that could NOT be translated. On Solana each
///      will owns a distinct associated token account, so `vault.amount` is an
///      unambiguous per-will balance. On EVM a single contract holds every
///      will's balance for a given ERC-20, so `balanceOf(address(this))` is the
///      sum over all wills and is useless as a per-will figure. Each vault
///      therefore carries its own ledger.
struct TokenVault {
    bool exists;
    uint32 listIndex;
    /// @dev Cumulative amount ever *received* for this token (measured balance
    ///      delta, not the requested amount — see B27). Each heir's share is
    ///      `totalDeposited * bps / 10_000`. Snapshotting the total rather than
    ///      reading a live balance keeps every heir's share fixed even as
    ///      earlier heirs draw the vault down. Mirrors Solana's `total_amount`.
    uint256 totalDeposited;
    /// @dev Amount still held for this will. Mirrors Solana's live `vault.amount`.
    uint256 remaining;
}

/// @notice Permanent record that an heir took their share of one token.
/// @dev On Solana the *existence* of the TokenClaim PDA was the double-claim
///      guard (`init` fails the second time). Storage always exists on EVM, so
///      the flag is explicit. `uint248` for the amount keeps this to one slot;
///      the cast is checked, so an absurd amount reverts rather than truncating.
struct TokenClaim {
    bool claimed;
    uint248 amount;
}
