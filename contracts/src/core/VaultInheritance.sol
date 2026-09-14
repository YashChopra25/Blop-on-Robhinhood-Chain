// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {
    Will, Status, Custodian, Beneficiary, MediaReference, TokenVault, TokenClaim
} from "../structs/Types.sol";
import {
    WillView, CustodianView, BeneficiaryView, MediaView, TokenVaultView
} from "../structs/Views.sol";
import {VaultErrors as E} from "../errors/Errors.sol";
import {IVaultEvents} from "../events/IVaultEvents.sol";
import {WillLib} from "../libraries/WillLib.sol";

/// @title VaultInheritance
/// @author migrated from the `vault-inheritance` Anchor program
/// @notice A non-custodial digital-will / dead-man's-switch protocol.
///
/// @dev ## Lifecycle
/// 1. **Create** — `createWill` sets the inactivity threshold (the dead-man's
///    switch window) and how many custodian approvals constitute quorum.
/// 2. **Configure** — while `Active`, the owner adds/removes media references
///    (IPFS CIDs of client-encrypted files), custodians (who can confirm death),
///    beneficiaries (heirs, with basis-point shares) and escrowed ERC-20 tokens.
///    Heirs register their own `encryptionPubkey` so the owner can seal each
///    document's data key to them.
/// 3. **Ping** — `updateWill` refreshes the liveness timer. Each ping proves the
///    owner is alive.
/// 4. **Confirm death** — once the owner has been silent past the threshold,
///    custodians call `confirmDeath`. At quorum the will becomes `Claimable` and
///    `claimableAt` starts the clock.
/// 5. **Grace period** — for `GRACE_PERIOD` nothing may be claimed and a living
///    owner may `revokeDeathConfirmation`, returning the will to `Active` and
///    invalidating every confirmation cast so far.
/// 6. **Claim** — once grace expires, heirs call `claimInheritance` (unlocking
///    their document keys) and `claimToken` (their proportional share of each
///    escrowed token).
/// 7. **Teardown** — after `CLAIM_WINDOW` the permissionless `sweepTokenVault`
///    and `closeEstate` cranks return every residual token to the estate and
///    clear the will.
///
/// ## Timing invariants that make this safe
/// * Nothing is claimable before `claimableAt + GRACE_PERIOD` — a mistaken or
///   malicious death confirmation can never move an asset before the owner has
///   had the chance to undo it.
/// * No teardown may run before `claimableAt + GRACE_PERIOD + CLAIM_WINDOW` — a
///   stranger can never clear an heir's record out from under a pending claim.
/// * No asset may enter a will whose quorum is unreachable
///   (`minApprovals <= custodianCount`), so an estate can never be locked away
///   from the heirs it names.
/// * A will can never be closed while it still holds a token vault.
///
/// ## Trust model — deliberately minimal
/// This contract is **immutable**. It has no owner, no admin role, no pause
/// switch, no fee and no proxy. The Anchor program it replaces had no admin
/// either; adding one would introduce a trust assumption that does not exist
/// today, and a pause switch on an inheritance protocol is a censorship vector
/// against the exact people it is meant to protect. See
/// EVM_MIGRATION_DESIGN.md §5 for the full reasoning.
///
/// ## Confidentiality
/// Media bytes are encrypted in the owner's browser (AES-256-GCM) before upload;
/// the per-file data key is wrapped to the owner and to each heir's registered
/// X25519 key. The chain stores only the CID, so publishing it reveals the
/// existence of a document and nothing more. This contract is never trusted with
/// plaintext or with a decryption key.
contract VaultInheritance is IVaultEvents, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using WillLib for Will;

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    uint16 public constant MAX_ALLOCATION_BPS = WillLib.MAX_ALLOCATION_BPS;
    uint40 public constant GRACE_PERIOD = WillLib.GRACE_PERIOD;
    uint40 public constant CLAIM_WINDOW = WillLib.CLAIM_WINDOW;

    /// @dev Every collection is bounded. Unbounded arrays would make the
    ///      teardown crank a gas-DoS surface, and on Solana these were already
    ///      implicitly bounded by the counter widths (`u8` custodians, `u8`
    ///      media). The caps are generous relative to any real estate.
    uint8 public constant MAX_CUSTODIANS = 32;
    uint16 public constant MAX_BENEFICIARIES = 64;
    /// @dev Matches Solana's `u8 media_count` ceiling exactly.
    uint8 public constant MAX_ACTIVE_MEDIA = 255;
    uint16 public constant MAX_TOKEN_VAULTS = 32;

    /// @dev Preserves the on-chain `[u8; 64]` field width, which fits both a
    ///      CIDv0 (46-char base58 `Qm…`) and a CIDv1 (59-char base32 `bafy…`).
    uint256 public constant MAX_CID_BYTES = 64;

    // ---------------------------------------------------------------------
    // Storage
    //
    // Every PDA family becomes a nested mapping. Solidity derives a nested
    // mapping slot as keccak256(k2 ‖ keccak256(k1 ‖ slot)) — structurally the
    // same derivation `find_program_address` performs, so the uniqueness
    // guarantee of each PDA is preserved by construction rather than by a
    // hand-written id. See EVM_MIGRATION_DESIGN.md §2.
    //
    // `will` is keyed by owner because the Solana will PDA is seeded by the
    // owner: `(will, wallet)` and `(owner, wallet)` index the same set.
    // ---------------------------------------------------------------------

    mapping(address owner => Will) private _wills;

    /// @dev Bumped on every `createWill`. Scopes the double-claim guard to one
    ///      will instance. See `_claimKey`.
    mapping(address owner => uint32) private _incarnation;

    mapping(address owner => mapping(address custodian => Custodian)) private _custodians;
    mapping(address owner => address[]) private _custodianList;

    mapping(address owner => mapping(address heir => Beneficiary)) private _beneficiaries;
    mapping(address owner => address[]) private _beneficiaryList;

    mapping(address owner => mapping(uint16 index => MediaReference)) private _media;
    mapping(address owner => uint16[]) private _mediaList;
    /// @dev `keccak256(cid) => index + 1`, so 0 means "not present". Makes the
    ///      API layer's entitlement lookup O(1) and enforces CID uniqueness
    ///      within a will.
    mapping(address owner => mapping(bytes32 cidHash => uint16 indexPlusOne)) private _cidIndex;

    mapping(address owner => mapping(address token => TokenVault)) private _vaults;
    mapping(address owner => address[]) private _vaultList;

    /// @dev Keyed by `keccak256(abi.encode(owner, incarnation, token, heir))`.
    ///      This is the one place an explicit composite id is the right tool
    ///      rather than a nested mapping: the key has four parts, one of which
    ///      is not an entity address. `abi.encode` (never `encodePacked`) keeps
    ///      it collision-free.
    mapping(bytes32 claimKey => TokenClaim) private _claims;

    // ---- reverse indices: "every will where I am a custodian / an heir" ----
    //
    // Replaces the Solana client's `getProgramAccounts` + `memcmp(offset 40)`
    // scan. Kept on-chain rather than left to an event indexer because an heir
    // may need to discover their role decades from now, long after any indexer
    // this project ships has stopped running.
    mapping(address who => address[] owners) private _custodianRoles;
    mapping(address who => address[] owners) private _beneficiaryRoles;

    // ---------------------------------------------------------------------
    // Internal guards
    // ---------------------------------------------------------------------

    /// @dev The owner-only guard. Note that it takes no owner argument: the will
    ///      is keyed by owner, so `_wills[msg.sender]` IS the caller's will and
    ///      impersonation is not merely checked against — it is unrepresentable.
    ///      This is the direct analogue of Anchor's `has_one = owner` combined
    ///      with a will PDA seeded by the signer.
    function _ownerActiveWill() private view returns (Will storage w) {
        w = _wills[msg.sender];
        if (w.status == Status.None) revert E.WillNotFound();
        if (w.status != Status.Active) revert E.WillNotActive();
    }

    function _existingWill(address owner) private view returns (Will storage w) {
        w = _wills[owner];
        if (w.status == Status.None) revert E.WillNotFound();
    }

    function _claimableWill(address owner) private view returns (Will storage w) {
        w = _existingWill(owner);
        if (w.status != Status.Claimable) revert E.WillNotClaimable();
    }

    function _claimKey(address owner, address token, address heir)
        private
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(owner, _incarnation[owner], token, heir));
    }

    function _now40() private view returns (uint40) {
        return uint40(block.timestamp);
    }

    // ---------------------------------------------------------------------
    // Will lifecycle
    // ---------------------------------------------------------------------

    /// @notice Create the caller's will and arm the dead-man's switch.
    /// @param inactivityThreshold Seconds of owner silence before custodians may
    ///        confirm death. Must be > 0 — a non-positive value would make the
    ///        owner "inactive" immediately and defeat the switch.
    /// @param minApprovals How many custodian confirmations constitute quorum.
    ///        Must be >= 1. The upper bound (<= custodianCount) cannot be checked
    ///        here because no custodians exist yet; instead it is enforced before
    ///        any asset is allowed into the will.
    /// @dev Mirrors `initialise_will`. The `Status.None` check reproduces
    ///      Anchor's `init` (not `init_if_needed`) constraint: a second call for
    ///      the same owner must fail, which closes the door on reinitialization.
    function createWill(uint64 inactivityThreshold, uint8 minApprovals) external {
        Will storage w = _wills[msg.sender];
        if (w.status != Status.None) revert E.WillAlreadyExists();
        if (inactivityThreshold == 0) revert E.InvalidThreshold();
        if (inactivityThreshold > type(uint40).max) revert E.ValueTooLarge();
        if (minApprovals == 0) revert E.InvalidMinApprovals();

        uint40 nowTs = _now40();
        w.status = Status.Active;
        w.minApprovals = minApprovals;
        w.createdAt = nowTs;
        w.lastActiveAt = nowTs; // creation counts as a ping
        w.inactivityThreshold = uint40(inactivityThreshold);
        // Epochs start at 1 so a Custodian's default `approvedEpoch` of 0 can
        // never be mistaken for a live confirmation.
        w.approvalEpoch = 1;

        // Counters and `claimableAt` are already zero: this slot has either never
        // been written, or was cleared by `deleteWill` / `closeEstate`.

        unchecked {
            ++_incarnation[msg.sender];
        }

        emit WillCreated(msg.sender, inactivityThreshold, minApprovals, nowTs);
    }

    /// @notice Ping the dead-man's switch and/or reconfigure it.
    /// @param inactivityThreshold New threshold, or 0 to leave unchanged.
    /// @param minApprovals New quorum, or 0 to leave unchanged.
    /// @dev Mirrors `update_will(Option<i64>, Option<u8>)`. Solidity has no
    ///      `Option`, so 0 is the "unchanged" sentinel — unambiguous because 0 is
    ///      already an invalid value for both parameters.
    ///
    ///      Calling with (0, 0) is a pure liveness ping. Any owner-signed update
    ///      is itself proof of life, so `lastActiveAt` is refreshed either way.
    function updateWill(uint64 inactivityThreshold, uint8 minApprovals) external {
        Will storage w = _ownerActiveWill();

        if (inactivityThreshold != 0) {
            if (inactivityThreshold > type(uint40).max) revert E.ValueTooLarge();
            w.inactivityThreshold = uint40(inactivityThreshold);
        }

        if (minApprovals != 0) {
            // If custodians already exist, the new minimum must remain reachable.
            // While there are zero custodians (bootstrapping) any >= 1 value is
            // accepted, because asset entry is gated on reachability anyway.
            if (w.custodianCount != 0 && minApprovals > w.custodianCount) {
                revert E.MinApprovalsExceedCustodians();
            }
            w.minApprovals = minApprovals;
        }

        uint40 nowTs = _now40();
        w.lastActiveAt = nowTs;

        emit WillUpdated(msg.sender, w.inactivityThreshold, w.minApprovals, nowTs);
    }

    /// @notice Delete an Active will.
    /// @dev Mirrors `delete_will`. Refuses while any child survives — on Solana
    ///      leftover children would block re-init and carry a stale escrow total
    ///      into the new will; here the same staleness would apply to the
    ///      enumeration arrays, so the rule is preserved verbatim.
    ///
    ///      Post-death teardown is `closeEstate`, because a deceased owner can no
    ///      longer sign.
    function deleteWill() external {
        Will storage w = _ownerActiveWill();

        // Escrowed tokens must be withdrawn first. Closing the will while a vault
        // survives would leave a balance recorded against a will that no longer
        // exists — the EVM analogue of stranding tokens behind a PDA authority
        // that can never sign again.
        if (w.tokenVaultCount != 0) revert E.WillHasTokenVaults();
        if (w.mediaCount != 0 || w.custodianCount != 0 || w.beneficiaryCount != 0) {
            revert E.WillHasDependents();
        }

        delete _wills[msg.sender];
        emit WillDeleted(msg.sender);
    }

    // ---------------------------------------------------------------------
    // Media references (IPFS CIDs of client-encrypted files)
    // ---------------------------------------------------------------------

    /// @notice Record an IPFS CID reference. Owner-only, Active-only.
    /// @param mediaType MIME type, zero-padded (e.g. "application/pdf").
    /// @param cid IPFS CID, 1..=64 bytes.
    /// @return mediaIndex The monotonic index assigned to this reference.
    /// @dev Mirrors `add_media_reference`. The index is monotonic and never
    ///      reused, so a stale pointer can never resolve to a different document
    ///      — the property Solana got from seeding the PDA with `media_index`.
    function addMedia(bytes16 mediaType, string calldata cid)
        external
        returns (uint16 mediaIndex)
    {
        Will storage w = _ownerActiveWill();
        // Refuse to put anything into a will whose quorum can never be met — its
        // estate would be permanently unreachable by the heirs it names.
        w.requireQuorumReachable();

        uint256 cidLen = bytes(cid).length;
        if (cidLen == 0 || cidLen > MAX_CID_BYTES) revert E.InvalidCid();
        if (w.mediaCount >= MAX_ACTIVE_MEDIA) revert E.TooManyMedia();

        bytes32 cidHash = keccak256(bytes(cid));
        if (_cidIndex[msg.sender][cidHash] != 0) revert E.DuplicateCid();

        mediaIndex = w.mediaIndex;
        if (mediaIndex == type(uint16).max) revert E.MediaIndexExhausted();

        uint16[] storage list = _mediaList[msg.sender];
        MediaReference storage m = _media[msg.sender][mediaIndex];
        m.exists = true;
        m.index = mediaIndex;
        m.listIndex = uint32(list.length);
        m.mediaType = mediaType;
        m.cid = cid;
        list.push(mediaIndex);

        // +1 so that 0 unambiguously means "no such CID".
        _cidIndex[msg.sender][cidHash] = mediaIndex + 1;

        unchecked {
            w.mediaIndex = mediaIndex + 1; // monotonic: never decremented
            ++w.mediaCount; // live count: bounded by MAX_ACTIVE_MEDIA above
        }

        emit MediaAdded(msg.sender, mediaIndex, mediaType, cid);
    }

    /// @notice Remove a media reference. Owner-only, Active-only.
    function removeMedia(uint16 mediaIndex) external {
        Will storage w = _ownerActiveWill();
        if (!_media[msg.sender][mediaIndex].exists) revert E.MediaNotFound();

        _detachMedia(msg.sender, mediaIndex);
        unchecked {
            --w.mediaCount;
        }

        emit MediaRemoved(msg.sender, mediaIndex);
    }

    // ---------------------------------------------------------------------
    // Custodians
    // ---------------------------------------------------------------------

    /// @notice Register a custodian who may confirm death later. Owner-only, Active-only.
    /// @dev Mirrors `add_custodian`. The `exists` check reproduces Anchor's
    ///      `init` on the custodian PDA: adding the same wallet twice is
    ///      impossible, so `custodianCount` can never be inflated by duplicates.
    function addCustodian(address custodian) external {
        Will storage w = _ownerActiveWill();
        if (custodian == address(0)) revert E.ZeroAddress();

        Custodian storage c = _custodians[msg.sender][custodian];
        if (c.exists) revert E.CustodianAlreadyExists();
        if (w.custodianCount >= MAX_CUSTODIANS) revert E.TooManyCustodians();

        address[] storage list = _custodianList[msg.sender];
        address[] storage roles = _custodianRoles[custodian];

        c.exists = true;
        c.listIndex = uint32(list.length); // bounded by MAX_CUSTODIANS
        // `roles` is the reverse index and is NOT capped — an owner can name any
        // address without its consent. uint32 still cannot overflow: it would take
        // 2^32 distinct wills, each paying for its own creation.
        c.roleIndex = uint32(roles.length);
        // `hasApproved`, `approvedEpoch` and `lastApprovedAt` stay zero. An epoch
        // of 0 never matches a live `Will.approvalEpoch` (which starts at 1), so a
        // freshly added custodian is unambiguously "has not confirmed" — even if
        // this same address held a stale confirmation before being removed.

        list.push(custodian);
        roles.push(msg.sender);

        unchecked {
            ++w.custodianCount;
        }

        emit CustodianAdded(msg.sender, custodian);
    }

    /// @notice Deregister a custodian. Owner-only, Active-only.
    /// @dev Mirrors `remove_custodian`, including the quorum-preservation rule:
    ///      an owner may not remove a custodian if doing so would leave
    ///      `minApprovals > custodianCount` while custodians still remain — that
    ///      would make the will unconfirmable. They must lower `minApprovals`
    ///      first. Removing the final custodian (1 -> 0) is always allowed so the
    ///      will can be torn down and deleted.
    function removeCustodian(address custodian) external {
        Will storage w = _ownerActiveWill();
        Custodian storage c = _custodians[msg.sender][custodian];
        if (!c.exists) revert E.CustodianNotFound();

        uint8 newCount;
        unchecked {
            newCount = w.custodianCount - 1; // `exists` implies count >= 1
        }
        if (newCount != 0 && w.minApprovals > newCount) {
            revert E.MinApprovalsExceedCustodians();
        }

        // If this custodian's confirmation is live in the CURRENT epoch, undo it
        // so the running tally stays consistent. A confirmation from a revoked
        // epoch was already discounted when the epoch was bumped, so it must not
        // be subtracted a second time.
        if (c.hasApproved && c.approvedEpoch == w.approvalEpoch && w.approvalsReceived > 0) {
            unchecked {
                --w.approvalsReceived;
            }
        }

        _detachCustodian(msg.sender, custodian, c);
        w.custodianCount = newCount;

        emit CustodianRemoved(msg.sender, custodian);
    }

    /// @notice Custodian-only: confirm the owner's death.
    /// @dev Mirrors `confirm_death`, the heart of the dead-man's switch.
    ///
    ///      A custodian may only confirm once the owner has actually been silent
    ///      for at least `inactivityThreshold` seconds since their last ping.
    ///      Without this, any custodian could mark a living owner dead.
    ///
    ///      Each custodian counts once per approval epoch. When
    ///      `approvalsReceived` reaches `minApprovals` the will becomes Claimable
    ///      and `claimableAt` starts the grace period — heirs still cannot claim
    ///      until that grace period expires, which is the window in which a
    ///      living owner can revoke.
    function confirmDeath(address owner) external {
        Will storage w = _existingWill(owner);
        if (w.status != Status.Active && w.status != Status.PendingInheritance) {
            revert E.WillNotActive();
        }

        Custodian storage c = _custodians[owner][msg.sender];
        if (!c.exists) revert E.NotACustodian();

        if (!w.inactivityElapsed()) revert E.OwnerStillActive();

        // A custodian cannot confirm twice within the same epoch. After a
        // revocation the epoch has moved on, so they may confirm again if the
        // owner falls silent once more.
        if (c.hasApproved && c.approvedEpoch == w.approvalEpoch) revert E.AlreadyApproved();

        uint40 nowTs = _now40();
        c.hasApproved = true;
        c.approvedEpoch = w.approvalEpoch;
        c.lastApprovedAt = nowTs;

        uint8 received;
        unchecked {
            received = w.approvalsReceived + 1; // bounded by MAX_CUSTODIANS
        }
        w.approvalsReceived = received;

        emit DeathConfirmed(owner, msg.sender, received, w.minApprovals, w.approvalEpoch);

        // `minApprovals` is always >= 1, so once the tally reaches it the estate
        // enters its post-death timeline.
        if (received >= w.minApprovals) {
            w.status = Status.Claimable;
            // Anchor for BOTH post-death windows. Set once, on the transition
            // into Claimable, so repeated confirmations cannot push the timeline
            // out.
            w.claimableAt = nowTs;
            emit WillBecameClaimable(owner, nowTs, w.graceEndsAt(), w.claimWindowEndsAt());
        } else {
            w.status = Status.PendingInheritance;
        }
    }

    /// @notice Owner-only escape hatch: cancel an in-flight death confirmation.
    /// @dev Mirrors `revoke_death_confirmation`.
    ///
    ///      Without this, a single premature `confirmDeath` permanently locked a
    ///      LIVING owner out of their own will: every owner function is gated on
    ///      `Active`, so they could no longer ping, reconfigure, withdraw tokens
    ///      or delete the will, while the remaining custodians walked it to
    ///      `Claimable` and distributed the estate of someone still alive.
    ///
    ///      Revocable while `PendingInheritance` (quorum never reached, always
    ///      revocable) or `Claimable` but still inside the grace period. After
    ///      that heirs may already have claimed, and settled transfers cannot be
    ///      unwound.
    ///
    ///      The reset is O(1) regardless of custodian count: bumping
    ///      `approvalEpoch` invalidates every existing confirmation at once.
    function revokeDeathConfirmation() external {
        Will storage w = _wills[msg.sender];
        if (w.status == Status.None) revert E.WillNotFound();

        bool revocable = w.status == Status.PendingInheritance
            || (w.status == Status.Claimable && block.timestamp < w.graceEndsAt());
        if (!revocable) revert E.NothingToRevoke();

        w.status = Status.Active;
        w.approvalsReceived = 0;
        w.claimableAt = 0;
        uint32 newEpoch;
        unchecked {
            newEpoch = w.approvalEpoch + 1; // uint32: unreachable in practice
        }
        w.approvalEpoch = newEpoch;
        // Signing this transaction is itself proof of life, so restart the switch.
        w.lastActiveAt = _now40();

        emit DeathConfirmationRevoked(msg.sender, newEpoch);
    }

    // ---------------------------------------------------------------------
    // Beneficiaries
    // ---------------------------------------------------------------------

    /// @notice Name an heir with a share of the estate, in basis points.
    /// @dev Mirrors `add_beneficiary`. Allocations need not sum to exactly 100%:
    ///      under-allocation is allowed, and any unassigned remainder is swept
    ///      back to the estate once the heirs' claim window closes, so nothing is
    ///      stranded.
    function addBeneficiary(address heir, uint16 allocationBps) external {
        Will storage w = _ownerActiveWill();
        if (heir == address(0)) revert E.ZeroAddress();

        Beneficiary storage b = _beneficiaries[msg.sender][heir];
        if (b.exists) revert E.BeneficiaryAlreadyExists();
        if (w.beneficiaryCount >= MAX_BENEFICIARIES) revert E.TooManyBeneficiaries();

        uint16 newTotal = w.totalAllocatedBps + allocationBps; // 0.8 reverts on overflow
        if (newTotal > MAX_ALLOCATION_BPS) revert E.AllocationExceeded();

        address[] storage list = _beneficiaryList[msg.sender];
        address[] storage roles = _beneficiaryRoles[heir];

        b.exists = true;
        b.allocationBps = allocationBps;
        b.listIndex = uint32(list.length); // bounded by MAX_BENEFICIARIES
        // Uncapped reverse index; see the note in `addCustodian`.
        b.roleIndex = uint32(roles.length);
        // `hasClaimed` and `encryptionPubkey` stay zero. The heir registers their
        // own key later; all-zero means "not yet".

        list.push(heir);
        roles.push(msg.sender);

        w.totalAllocatedBps = newTotal;
        unchecked {
            ++w.beneficiaryCount;
        }

        emit BeneficiaryAdded(msg.sender, heir, allocationBps);
    }

    /// @notice Remove an heir, freeing their allocation. Owner-only, Active-only.
    function removeBeneficiary(address heir) external {
        Will storage w = _ownerActiveWill();
        Beneficiary storage b = _beneficiaries[msg.sender][heir];
        if (!b.exists) revert E.BeneficiaryNotFound();

        uint16 bps = b.allocationBps;
        _detachBeneficiary(msg.sender, heir, b);

        w.totalAllocatedBps -= bps;
        unchecked {
            --w.beneficiaryCount;
        }

        emit BeneficiaryRemoved(msg.sender, heir, bps);
    }

    /// @notice Heir-only: accept the inheritance once claims are open.
    /// @dev Mirrors `claim_inheritance`. This records acceptance; the heir's
    ///      actual access to the documents comes from unwrapping the per-file data
    ///      key the owner sealed to their `encryptionPubkey`. This marker is what
    ///      the API layer authorizes document reads against.
    function claimInheritance(address owner) external {
        Will storage w = _claimableWill(owner);
        // Nothing moves until the owner's revocation window has fully elapsed.
        w.requireClaimsOpen();

        Beneficiary storage b = _beneficiaries[owner][msg.sender];
        if (!b.exists) revert E.NotABeneficiary();
        if (b.hasClaimed) revert E.AlreadyClaimed();

        b.hasClaimed = true;
        unchecked {
            ++w.beneficiariesClaimed; // bounded by MAX_BENEFICIARIES
        }

        emit InheritanceClaimed(owner, msg.sender);
    }

    /// @notice Heir-only: publish (or rotate) the X25519 public key that the
    ///         owner wraps document data keys to.
    /// @dev Mirrors `register_recipient_key`. Called by the heir, so the key
    ///      always belongs to whoever controls the heir's wallet — nobody else
    ///      can substitute a key they control and redirect the estate's documents
    ///      to themselves.
    ///
    ///      Rotation is allowed only while the will is `Active`; the owner
    ///      re-wraps existing documents afterwards. Once death confirmation is in
    ///      flight the key is frozen, so an attacker who later compromises an
    ///      heir's wallet cannot swap in their own key and unseal the estate.
    function registerRecipientKey(address owner, bytes32 encryptionPubkey) external {
        Will storage w = _existingWill(owner);
        if (w.status != Status.Active) revert E.WillNotActive();
        // An all-zero key is the sentinel for "unregistered"; refuse to store it.
        if (encryptionPubkey == bytes32(0)) revert E.InvalidEncryptionKey();

        Beneficiary storage b = _beneficiaries[owner][msg.sender];
        if (!b.exists) revert E.NotABeneficiary();

        b.encryptionPubkey = encryptionPubkey;

        emit RecipientKeyRegistered(owner, msg.sender, encryptionPubkey);
    }

    // ---------------------------------------------------------------------
    // Token escrow
    // ---------------------------------------------------------------------

    /// @notice Escrow (or top up) an ERC-20. Owner-only, Active-only.
    /// @dev Mirrors `add_token`. Two EVM-specific hardenings with no Solana
    ///      counterpart:
    ///
    ///      1. **Measured delta.** SPL's `transfer_checked` moves exactly the
    ///         requested amount; an ERC-20 may move less (fee-on-transfer). The
    ///         vault is credited with the observed balance change, never with
    ///         `amount`, so the ledger can never claim more than the contract
    ///         actually holds.
    ///      2. **Per-vault ledger.** One contract holds every will's balance for
    ///         a given token, so `balanceOf(address(this))` is meaningless as a
    ///         per-will figure and `remaining` is tracked explicitly.
    ///
    ///      `nonReentrant` because an ERC-20 is arbitrary code; SPL Token is not.
    function depositToken(address token, uint256 amount) external nonReentrant {
        Will storage w = _ownerActiveWill();
        // A token deposit additionally requires at least one custodian — the
        // stricter of the two checks on this path, kept for error parity.
        if (w.custodianCount == 0) revert E.NoCustodians();
        // Never escrow assets into a will whose quorum can never be met: the
        // tokens would be locked away from the very heirs the will names.
        w.requireQuorumReachable();

        if (token == address(0) || token == address(this)) revert E.InvalidToken();
        if (amount == 0) revert E.InvalidAmount();

        TokenVault storage v = _vaults[msg.sender][token];
        if (!v.exists) {
            if (w.tokenVaultCount >= MAX_TOKEN_VAULTS) revert E.TooManyTokenVaults();
            address[] storage list = _vaultList[msg.sender];
            v.exists = true;
            v.listIndex = uint32(list.length);
            list.push(token);
            unchecked {
                ++w.tokenVaultCount;
            }
        }

        IERC20 erc20 = IERC20(token);
        uint256 balanceBefore = erc20.balanceOf(address(this));
        erc20.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = erc20.balanceOf(address(this)) - balanceBefore;
        // A token that delivered nothing (100% transfer fee, or a silently
        // no-op transfer) must not create an empty vault entitlement.
        if (received == 0) revert E.InvalidAmount();

        uint256 newTotal = v.totalDeposited + received;
        v.totalDeposited = newTotal;
        v.remaining += received;

        emit TokenDeposited(msg.sender, token, amount, received, newTotal);
    }

    /// @notice Withdraw the whole escrow for one token. Owner-only, Active-only.
    /// @dev Mirrors `delete_token`. Checks-effects-interactions: the vault is
    ///      cleared before the transfer, so a reentrant token cannot withdraw
    ///      twice even if `nonReentrant` were absent.
    function withdrawToken(address token) external nonReentrant {
        Will storage w = _ownerActiveWill();
        TokenVault storage v = _vaults[msg.sender][token];
        if (!v.exists) revert E.TokenVaultNotFound();

        uint256 amount = v.remaining;

        // ---- effects ----
        _detachVault(msg.sender, token, v);
        unchecked {
            --w.tokenVaultCount;
        }

        // ---- interaction ----
        if (amount > 0) IERC20(token).safeTransfer(msg.sender, amount);

        emit TokenWithdrawn(msg.sender, token, amount);
    }

    /// @notice Heir-only: claim this heir's proportional share of one escrowed token.
    /// @dev Mirrors `claim_token`.
    ///
    ///      The share is a fixed fraction of the snapshotted cumulative deposit,
    ///      then clamped to whatever is actually left — so an early claimer never
    ///      dilutes a later one, and rounding drift can never over-draw the vault.
    ///
    ///      The double-claim guard is the `claimed` flag. On Solana it was the
    ///      *existence* of a `TokenClaim` PDA, created with `init`, which fails
    ///      the second time. Storage always exists on EVM, hence the explicit
    ///      flag — scoped by the will's incarnation so that a will created after
    ///      an earlier one was closed starts with a clean ledger.
    function claimToken(address owner, address token) external nonReentrant {
        Will storage w = _claimableWill(owner);
        w.requireClaimsOpen();

        Beneficiary storage b = _beneficiaries[owner][msg.sender];
        if (!b.exists) revert E.NotABeneficiary();
        uint16 bps = b.allocationBps;
        if (bps == 0) revert E.NothingToClaim();

        TokenVault storage v = _vaults[owner][token];
        if (!v.exists) revert E.TokenVaultNotFound();

        bytes32 key = _claimKey(owner, token, msg.sender);
        if (_claims[key].claimed) revert E.AlreadyClaimed();

        uint256 remaining = v.remaining;
        uint256 amount = WillLib.shareOf(v.totalDeposited, bps);
        if (amount > remaining) amount = remaining;
        if (amount == 0) revert E.NothingToClaim();
        if (amount > type(uint248).max) revert E.ValueTooLarge();

        // ---- effects ----
        _claims[key] = TokenClaim({claimed: true, amount: uint248(amount)});
        unchecked {
            v.remaining = remaining - amount; // amount <= remaining
        }

        // ---- interaction ----
        IERC20(token).safeTransfer(msg.sender, amount);

        emit TokenClaimed(owner, token, msg.sender, amount);
    }

    /// @notice Permissionless: return every residual token to the estate and
    ///         close the vault. Only after the heirs' claim window has closed.
    /// @dev Mirrors `sweep_token_vault`. Residual = the deliberately unallocated
    ///      remainder + floor-rounding dust + the share of any heir who never
    ///      claimed.
    ///
    ///      Permissionless but not profitable: the destination is pinned to the
    ///      will's owner and can never be redirected to the caller, who pays only
    ///      the transaction fee. The timing gate means it cannot pre-empt a
    ///      single heir.
    function sweepTokenVault(address owner, address token) external nonReentrant {
        Will storage w = _claimableWill(owner);
        // Heirs get their full, exclusive claim window before any crank may touch
        // the estate.
        w.requireTeardownOpen();

        TokenVault storage v = _vaults[owner][token];
        if (!v.exists) revert E.TokenVaultNotFound();

        uint256 residual = v.remaining;

        // ---- effects ----
        _detachVault(owner, token, v);
        unchecked {
            --w.tokenVaultCount;
        }

        // ---- interaction ----
        if (residual > 0) IERC20(token).safeTransfer(owner, residual);

        emit TokenVaultSwept(owner, token, residual, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Post-inheritance teardown
    // ---------------------------------------------------------------------

    /// @notice Permissionless: clear the estate's records once the claim window
    ///         has closed. Call repeatedly until it returns true.
    /// @param maxItems Work budget for this call, so the gas cost is bounded by
    ///        the caller rather than by the size of the estate.
    /// @return completed True when the will itself has been cleared.
    ///
    /// @dev Replaces Solana's four separate cranks — `cleanup_custodian`,
    ///      `cleanup_beneficiary`, `cleanup_media` and `close_will`.
    ///
    ///      Those existed to reclaim *rent*, a refundable storage deposit with no
    ///      EVM equivalent, and Solana needed one transaction per child because
    ///      each account had to be closed individually. What survives the platform
    ///      change is the part that was never about rent:
    ///
    ///        * lifecycle parity — clearing the will returns the address to a
    ///          state where a new will can be created, exactly as `close_will` did;
    ///        * the security-relevant side effect of `cleanup_beneficiary` —
    ///          clearing an heir's record ends their ability to claim, which is
    ///          precisely why it must never run before the claim window closes.
    ///
    ///      Still permissionless, still timing-gated, and still unable to touch
    ///      value: every vault must already have been swept.
    function closeEstate(address owner, uint256 maxItems) external returns (bool completed) {
        Will storage w = _claimableWill(owner);
        w.requireTeardownOpen();
        // The vaults hold value; they must be swept to the estate first. Clearing
        // the will while one survived would orphan its balance.
        if (w.tokenVaultCount != 0) revert E.WillHasTokenVaults();
        if (maxItems == 0) revert E.InvalidAmount();

        // Split across three helpers so each keeps its own small frame; inlining
        // all three loops here overflows the EVM stack under the legacy codegen
        // pipeline, and `via_ir` is not worth enabling for one function.
        (uint256 budget, uint256 mediaCleared) = _clearMedia(owner, maxItems);
        uint256 custodiansCleared;
        uint256 heirsCleared;
        (budget, custodiansCleared) = _clearCustodians(owner, budget);
        (budget, heirsCleared) = _clearBeneficiaries(owner, budget);

        w.mediaCount = uint8(_mediaList[owner].length);
        w.custodianCount = uint8(_custodianList[owner].length);
        w.beneficiaryCount = uint16(_beneficiaryList[owner].length);
        // `totalAllocatedBps` and `approvalsReceived` are maintained incrementally
        // by the helpers below rather than resynced here: teardown is resumable,
        // so a half-cleared will is publicly readable between calls and its
        // counters must agree with its surviving children at every step.

        if (mediaCleared | custodiansCleared | heirsCleared != 0) {
            emit EstateChildrenCleared(owner, mediaCleared, custodiansCleared, heirsCleared);
        }

        completed = w.mediaCount == 0 && w.custodianCount == 0 && w.beneficiaryCount == 0;
        if (completed) {
            delete _wills[owner];
            emit EstateClosed(owner, msg.sender);
        }
    }

    /// @dev Always detaches the LAST element, which makes every swap-and-pop a
    ///      no-op move. Returns the unspent budget and how many were cleared.
    function _clearMedia(address owner, uint256 budget)
        private
        returns (uint256, uint256 cleared)
    {
        uint16[] storage list = _mediaList[owner];
        while (budget != 0 && list.length != 0) {
            _detachMedia(owner, list[list.length - 1]);
            unchecked {
                --budget;
                ++cleared;
            }
        }
        return (budget, cleared);
    }

    function _clearCustodians(address owner, uint256 budget)
        private
        returns (uint256, uint256 cleared)
    {
        address[] storage list = _custodianList[owner];
        Will storage w = _wills[owner];
        while (budget != 0 && list.length != 0) {
            address who = list[list.length - 1];
            Custodian storage c = _custodians[owner][who];
            // Same rule as `removeCustodian`: a confirmation that is live in the
            // CURRENT epoch leaves the tally with the custodian. One from a
            // revoked epoch was already discounted by the epoch bump and must not
            // be subtracted twice.
            if (c.hasApproved && c.approvedEpoch == w.approvalEpoch && w.approvalsReceived > 0) {
                unchecked {
                    --w.approvalsReceived;
                }
            }
            _detachCustodian(owner, who, c);
            unchecked {
                --budget;
                ++cleared;
            }
        }
        return (budget, cleared);
    }

    function _clearBeneficiaries(address owner, uint256 budget)
        private
        returns (uint256, uint256 cleared)
    {
        address[] storage list = _beneficiaryList[owner];
        Will storage w = _wills[owner];
        while (budget != 0 && list.length != 0) {
            address who = list[list.length - 1];
            Beneficiary storage b = _beneficiaries[owner][who];
            // Read before the detach deletes the record.
            w.totalAllocatedBps -= b.allocationBps;
            _detachBeneficiary(owner, who, b);
            unchecked {
                --budget;
                ++cleared;
            }
        }
        return (budget, cleared);
    }

    // ---------------------------------------------------------------------
    // Internal detach helpers (O(1) swap-and-pop)
    // ---------------------------------------------------------------------

    function _detachMedia(address owner, uint16 index) private {
        MediaReference storage m = _media[owner][index];
        uint16[] storage list = _mediaList[owner];

        uint256 lastIdx = list.length - 1;
        uint32 idx = m.listIndex;
        if (idx != lastIdx) {
            uint16 moved = list[lastIdx];
            list[idx] = moved;
            _media[owner][moved].listIndex = idx;
        }
        list.pop();

        delete _cidIndex[owner][keccak256(bytes(m.cid))];
        delete _media[owner][index];
    }

    function _detachCustodian(address owner, address who, Custodian storage c) private {
        address[] storage list = _custodianList[owner];
        uint256 lastIdx = list.length - 1;
        uint32 idx = c.listIndex;
        if (idx != lastIdx) {
            address moved = list[lastIdx];
            list[idx] = moved;
            _custodians[owner][moved].listIndex = idx;
        }
        list.pop();

        address[] storage roles = _custodianRoles[who];
        uint256 lastRole = roles.length - 1;
        uint32 ridx = c.roleIndex;
        if (ridx != lastRole) {
            // Entries in a role list are unique per owner, so the moved entry is
            // never this same (owner, who) pair.
            address movedOwner = roles[lastRole];
            roles[ridx] = movedOwner;
            _custodians[movedOwner][who].roleIndex = ridx;
        }
        roles.pop();

        delete _custodians[owner][who];
    }

    function _detachBeneficiary(address owner, address who, Beneficiary storage b) private {
        address[] storage list = _beneficiaryList[owner];
        uint256 lastIdx = list.length - 1;
        uint32 idx = b.listIndex;
        if (idx != lastIdx) {
            address moved = list[lastIdx];
            list[idx] = moved;
            _beneficiaries[owner][moved].listIndex = idx;
        }
        list.pop();

        address[] storage roles = _beneficiaryRoles[who];
        uint256 lastRole = roles.length - 1;
        uint32 ridx = b.roleIndex;
        if (ridx != lastRole) {
            address movedOwner = roles[lastRole];
            roles[ridx] = movedOwner;
            _beneficiaries[movedOwner][who].roleIndex = ridx;
        }
        roles.pop();

        delete _beneficiaries[owner][who];
    }

    function _detachVault(address owner, address token, TokenVault storage v) private {
        address[] storage list = _vaultList[owner];
        uint256 lastIdx = list.length - 1;
        uint32 idx = v.listIndex;
        if (idx != lastIdx) {
            address moved = list[lastIdx];
            list[idx] = moved;
            _vaults[owner][moved].listIndex = idx;
        }
        list.pop();

        delete _vaults[owner][token];
    }

    // ---------------------------------------------------------------------
    // Views — the replacement for `getProgramAccounts`
    // ---------------------------------------------------------------------

    /// @notice A will plus every derived deadline and gate, in one call.
    function getWill(address owner) external view returns (WillView memory v) {
        Will storage w = _wills[owner];
        if (w.status == Status.None) return v; // `exists` stays false
        v.exists = true;
        v.status = w.status;
        v.minApprovals = w.minApprovals;
        v.approvalsReceived = w.approvalsReceived;
        v.custodianCount = w.custodianCount;
        v.mediaCount = w.mediaCount;
        v.mediaIndex = w.mediaIndex;
        v.beneficiaryCount = w.beneficiaryCount;
        v.beneficiariesClaimed = w.beneficiariesClaimed;
        v.tokenVaultCount = w.tokenVaultCount;
        v.totalAllocatedBps = w.totalAllocatedBps;
        v.approvalEpoch = w.approvalEpoch;
        v.incarnation = _incarnation[owner];
        v.createdAt = w.createdAt;
        v.lastActiveAt = w.lastActiveAt;
        v.inactivityThreshold = w.inactivityThreshold;
        v.claimableAt = w.claimableAt;
        v.graceEndsAt = w.graceEndsAt();
        v.claimWindowEndsAt = w.claimWindowEndsAt();
        v.quorumReachable = w.quorumReachable();
        v.inactivityElapsed = w.inactivityElapsed();
        // Only meaningful in Claimable; reported as false otherwise so a caller
        // can use them directly as button-enabled flags.
        v.claimsOpen = w.status == Status.Claimable && block.timestamp >= v.graceEndsAt;
        v.teardownOpen = w.status == Status.Claimable && block.timestamp >= v.claimWindowEndsAt;
    }

    function getCustodians(address owner) external view returns (CustodianView[] memory out) {
        address[] storage list = _custodianList[owner];
        uint32 epoch = _wills[owner].approvalEpoch;
        out = new CustodianView[](list.length);
        for (uint256 i; i < list.length; ++i) {
            address who = list[i];
            Custodian storage c = _custodians[owner][who];
            out[i] = CustodianView({
                wallet: who,
                exists: c.exists,
                // Stale confirmations from a revoked round read as false.
                hasApproved: c.hasApproved && c.approvedEpoch == epoch,
                approvedEpoch: c.approvedEpoch,
                lastApprovedAt: c.lastApprovedAt
            });
        }
    }

    function getBeneficiaries(address owner) external view returns (BeneficiaryView[] memory out) {
        address[] storage list = _beneficiaryList[owner];
        out = new BeneficiaryView[](list.length);
        for (uint256 i; i < list.length; ++i) {
            address who = list[i];
            Beneficiary storage b = _beneficiaries[owner][who];
            out[i] = BeneficiaryView({
                wallet: who,
                exists: b.exists,
                hasClaimed: b.hasClaimed,
                allocationBps: b.allocationBps,
                encryptionPubkey: b.encryptionPubkey,
                hasEncryptionKey: b.encryptionPubkey != bytes32(0)
            });
        }
    }

    function getBeneficiary(address owner, address heir)
        external
        view
        returns (BeneficiaryView memory v)
    {
        Beneficiary storage b = _beneficiaries[owner][heir];
        v = BeneficiaryView({
            wallet: heir,
            exists: b.exists,
            hasClaimed: b.hasClaimed,
            allocationBps: b.allocationBps,
            encryptionPubkey: b.encryptionPubkey,
            hasEncryptionKey: b.encryptionPubkey != bytes32(0)
        });
    }

    function getCustodian(address owner, address custodian)
        external
        view
        returns (CustodianView memory v)
    {
        Custodian storage c = _custodians[owner][custodian];
        v = CustodianView({
            wallet: custodian,
            exists: c.exists,
            hasApproved: c.hasApproved && c.approvedEpoch == _wills[owner].approvalEpoch,
            approvedEpoch: c.approvedEpoch,
            lastApprovedAt: c.lastApprovedAt
        });
    }

    function getMedia(address owner) external view returns (MediaView[] memory out) {
        uint16[] storage list = _mediaList[owner];
        out = new MediaView[](list.length);
        for (uint256 i; i < list.length; ++i) {
            MediaReference storage m = _media[owner][list[i]];
            out[i] = MediaView({index: m.index, mediaType: m.mediaType, cid: m.cid});
        }
    }

    /// @notice O(1) "does this will reference this CID?".
    /// @dev Replaces the API layer's `getProgramAccounts` scan with a
    ///      `memcmp` on the zero-padded CID bytes. The caller supplies the owner,
    ///      which the client always knows, so no global CID index is needed.
    function mediaIndexOfCid(address owner, string calldata cid)
        external
        view
        returns (bool found, uint16 index)
    {
        uint16 plusOne = _cidIndex[owner][keccak256(bytes(cid))];
        if (plusOne == 0) return (false, 0);
        return (true, plusOne - 1);
    }

    function getTokenVaults(address owner) external view returns (TokenVaultView[] memory out) {
        address[] storage list = _vaultList[owner];
        out = new TokenVaultView[](list.length);
        for (uint256 i; i < list.length; ++i) {
            address token = list[i];
            TokenVault storage v = _vaults[owner][token];
            out[i] = TokenVaultView({
                token: token,
                totalDeposited: v.totalDeposited,
                remaining: v.remaining
            });
        }
    }

    function getTokenVault(address owner, address token)
        external
        view
        returns (TokenVaultView memory)
    {
        TokenVault storage v = _vaults[owner][token];
        return TokenVaultView({
            token: token,
            totalDeposited: v.totalDeposited,
            remaining: v.remaining
        });
    }

    /// @notice What an heir could claim for one token right now.
    /// @dev Lets the UI show a figure without simulating the transaction.
    function claimableAmount(address owner, address token, address heir)
        external
        view
        returns (uint256)
    {
        Will storage w = _wills[owner];
        if (w.status != Status.Claimable) return 0;
        if (block.timestamp < w.graceEndsAt()) return 0;
        Beneficiary storage b = _beneficiaries[owner][heir];
        if (!b.exists || b.allocationBps == 0) return 0;
        TokenVault storage v = _vaults[owner][token];
        if (!v.exists) return 0;
        if (_claims[_claimKey(owner, token, heir)].claimed) return 0;
        uint256 amount = WillLib.shareOf(v.totalDeposited, b.allocationBps);
        return amount > v.remaining ? v.remaining : amount;
    }

    function getClaim(address owner, address token, address heir)
        external
        view
        returns (TokenClaim memory)
    {
        return _claims[_claimKey(owner, token, heir)];
    }

    /// @notice Every will where `who` is a custodian. Paginated.
    /// @dev Paginated on purpose. An owner can name any address without its
    ///      consent, so a griefer could inflate this list; pagination keeps a
    ///      read affordable regardless. Writes are unaffected — removal is O(1).
    function custodianRolesOf(address who, uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory owners, uint256 total)
    {
        return _page(_custodianRoles[who], offset, limit);
    }

    /// @notice Every will where `who` is a beneficiary. Paginated.
    function beneficiaryRolesOf(address who, uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory owners, uint256 total)
    {
        return _page(_beneficiaryRoles[who], offset, limit);
    }

    function _page(address[] storage src, uint256 offset, uint256 limit)
        private
        view
        returns (address[] memory out, uint256 total)
    {
        total = src.length;
        if (offset >= total) return (new address[](0), total);
        uint256 end = offset + limit;
        if (end > total || limit == 0) end = total;
        out = new address[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            out[i - offset] = src[i];
        }
    }

    // ---------------------------------------------------------------------
    // No ETH
    // ---------------------------------------------------------------------
    //
    // There is deliberately no `receive()` and no `fallback()`, so a plain ETH
    // transfer to this contract reverts. The protocol escrows ERC-20 only —
    // the Anchor program it replaces moved SOL for rent alone, and rent has no
    // EVM equivalent (EVM_MIGRATION_DESIGN.md §4).
    //
    // ETH can still be force-fed via `selfdestruct` or as a block-reward
    // recipient. That is harmless here because no accounting anywhere reads
    // `address(this).balance`; the forced ETH is simply stranded, which is the
    // safe outcome.
}
