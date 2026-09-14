// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Status} from "./Types.sol";

/// @notice Everything the UI needs about a will, in one `eth_call`.
/// @dev Replaces the Solana client's `program.account.will.fetchNullable()` plus
///      the timeline maths it had to re-derive locally in `lib/inheritance.ts`.
///      Deadlines and the three boolean gates are computed on-chain so the UI can
///      never disagree with the contract about what is allowed right now.
struct WillView {
    bool exists;
    Status status;
    uint8 minApprovals;
    uint8 approvalsReceived;
    uint8 custodianCount;
    uint8 mediaCount;
    uint16 mediaIndex;
    uint16 beneficiaryCount;
    uint16 beneficiariesClaimed;
    uint16 tokenVaultCount;
    uint16 totalAllocatedBps;
    uint32 approvalEpoch;
    /// @dev Bumped on every `createWill` for this address. Scopes the
    ///      double-claim guard to one will instance, so a will created after an
    ///      earlier one was closed starts with a clean claim ledger.
    uint32 incarnation;
    uint64 createdAt;
    uint64 lastActiveAt;
    uint64 inactivityThreshold;
    uint64 claimableAt;
    // ---- derived ----
    uint64 graceEndsAt;
    uint64 claimWindowEndsAt;
    bool quorumReachable;
    bool claimsOpen;
    bool teardownOpen;
    /// @dev True once the owner has been silent past their threshold, i.e. a
    ///      custodian may now confirm. Lets the UI show the switch state without
    ///      duplicating the rule.
    bool inactivityElapsed;
}

struct CustodianView {
    address wallet;
    bool exists;
    /// @dev Already discounted for the approval epoch: a confirmation cast in a
    ///      round the owner revoked reads as `false`, without any per-custodian
    ///      record having to be rewritten.
    bool hasApproved;
    uint32 approvedEpoch;
    uint64 lastApprovedAt;
}

struct BeneficiaryView {
    address wallet;
    bool exists;
    bool hasClaimed;
    uint16 allocationBps;
    bytes32 encryptionPubkey;
    bool hasEncryptionKey;
}

struct MediaView {
    uint16 index;
    bytes16 mediaType;
    string cid;
}

struct TokenVaultView {
    address token;
    uint256 totalDeposited;
    uint256 remaining;
}
