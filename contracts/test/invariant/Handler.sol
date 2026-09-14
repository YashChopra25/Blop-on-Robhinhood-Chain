// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {VaultInheritance} from "../../src/core/VaultInheritance.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {Status} from "../../src/structs/Types.sol";
import {WillView, TokenVaultView} from "../../src/structs/Views.sol";

/// @notice Drives the protocol through random but well-formed action sequences.
/// @dev Reverts are tolerated (`fail_on_revert = false`) because most randomly
///      chosen actions are legitimately invalid for the current state — that is
///      itself part of what is being tested. The ghost variables below record
///      only what actually succeeded, so the accounting invariants compare the
///      contract against an independent tally rather than against itself.
contract Handler is CommonBase, StdCheats, StdUtils {
    VaultInheritance public immutable vault;
    MockERC20 public immutable token;

    address[4] public owners;
    address[4] public custodians;
    address[4] public heirs;

    // ---- ghost accounting (independent of contract storage) ----
    uint256 public ghostDeposited;
    uint256 public ghostWithdrawn;
    uint256 public ghostClaimed;
    uint256 public ghostSwept;

    // ---- coverage counters, printed by the invariant suite ----
    mapping(bytes32 => uint256) public calls;

    constructor(VaultInheritance _vault, MockERC20 _token) {
        vault = _vault;
        token = _token;
        for (uint256 i; i < 4; ++i) {
            owners[i] = address(uint160(0x0A0000 + i));
            custodians[i] = address(uint160(0x0C0000 + i));
            heirs[i] = address(uint160(0x0E0000 + i));
            token.mint(owners[i], 1_000_000e18);
            vm.prank(owners[i]);
            token.approve(address(vault), type(uint256).max);
        }
    }

    /// @notice Bring every owner to a configured, funded, Active will.
    /// @dev Called once from the invariant suite's `setUp`, NOT fuzzed.
    ///
    ///      Without it, a 128-call random sequence almost never reaches the
    ///      post-death half of the protocol: it has to stumble onto createWill →
    ///      addCustodian → addBeneficiary → deposit → warp past the threshold →
    ///      confirmDeath → warp past grace, in that order, before a single claim
    ///      can happen. Starting from a rich state means the fuzzer spends its
    ///      budget on the transitions that actually carry value.
    function bootstrap() external {
        for (uint256 i; i < 4; ++i) {
            address o = owners[i];
            vm.prank(o);
            vault.createWill(1 days, 1);
            vm.startPrank(o);
            vault.addCustodian(custodians[i]);
            vault.addCustodian(custodians[(i + 1) % 4]);
            vault.addBeneficiary(heirs[i], 5_000);
            vault.addBeneficiary(heirs[(i + 1) % 4], 3_000);
            vault.depositToken(address(token), 10_000e18);
            vm.stopPrank();
            ghostDeposited += 10_000e18;
        }
    }

    function _owner(uint256 s) internal view returns (address) {
        return owners[bound(s, 0, 3)];
    }

    function _custodian(uint256 s) internal view returns (address) {
        return custodians[bound(s, 0, 3)];
    }

    function _heir(uint256 s) internal view returns (address) {
        return heirs[bound(s, 0, 3)];
    }

    function _bump(bytes32 k) internal {
        calls[k]++;
    }

    // ---- actions ----

    function createWill(uint256 ownerSeed, uint64 threshold, uint8 minApprovals) external {
        address o = _owner(ownerSeed);
        threshold = uint64(bound(threshold, 1 hours, 365 days));
        minApprovals = uint8(bound(minApprovals, 1, 4));
        vm.prank(o);
        try vault.createWill(threshold, minApprovals) {
            _bump("createWill");
        } catch {}
    }

    function addCustodian(uint256 ownerSeed, uint256 custodianSeed) external {
        vm.prank(_owner(ownerSeed));
        try vault.addCustodian(_custodian(custodianSeed)) {
            _bump("addCustodian");
        } catch {}
    }

    function removeCustodian(uint256 ownerSeed, uint256 custodianSeed) external {
        vm.prank(_owner(ownerSeed));
        try vault.removeCustodian(_custodian(custodianSeed)) {
            _bump("removeCustodian");
        } catch {}
    }

    function addBeneficiary(uint256 ownerSeed, uint256 heirSeed, uint16 bps) external {
        bps = uint16(bound(bps, 0, 10_000));
        vm.prank(_owner(ownerSeed));
        try vault.addBeneficiary(_heir(heirSeed), bps) {
            _bump("addBeneficiary");
        } catch {}
    }

    function removeBeneficiary(uint256 ownerSeed, uint256 heirSeed) external {
        vm.prank(_owner(ownerSeed));
        try vault.removeBeneficiary(_heir(heirSeed)) {
            _bump("removeBeneficiary");
        } catch {}
    }

    function addMedia(uint256 ownerSeed, uint256 salt) external {
        address o = _owner(ownerSeed);
        // Short, deterministic, and comfortably inside the 64-byte CID ceiling.
        // (`vm.toString(bytes20)` widens to bytes32 and produces 66 characters,
        // which the contract correctly rejects — hence the numeric form.)
        string memory cid = string.concat("Qm", vm.toString(salt % 1e12));
        vm.prank(o);
        try vault.addMedia(bytes16("application/pdf"), cid) {
            _bump("addMedia");
        } catch {}
    }

    function removeMedia(uint256 ownerSeed, uint16 index) external {
        vm.prank(_owner(ownerSeed));
        try vault.removeMedia(index) {
            _bump("removeMedia");
        } catch {}
    }

    function updateWill(uint256 ownerSeed, uint64 threshold, uint8 minApprovals) external {
        threshold = uint64(bound(threshold, 0, 365 days));
        minApprovals = uint8(bound(minApprovals, 0, 4));
        vm.prank(_owner(ownerSeed));
        try vault.updateWill(threshold, minApprovals) {
            _bump("updateWill");
        } catch {}
    }

    function deposit(uint256 ownerSeed, uint96 amount) external {
        address o = _owner(ownerSeed);
        amount = uint96(bound(amount, 1, 10_000e18));
        if (token.balanceOf(o) < amount) return;
        vm.prank(o);
        try vault.depositToken(address(token), amount) {
            ghostDeposited += amount;
            _bump("deposit");
        } catch {}
    }

    function withdraw(uint256 ownerSeed) external {
        address o = _owner(ownerSeed);
        uint256 held = vault.getTokenVault(o, address(token)).remaining;
        vm.prank(o);
        try vault.withdrawToken(address(token)) {
            ghostWithdrawn += held;
            _bump("withdraw");
        } catch {}
    }

    function confirmDeath(uint256 ownerSeed, uint256 custodianSeed) external {
        vm.prank(_custodian(custodianSeed));
        try vault.confirmDeath(_owner(ownerSeed)) {
            _bump("confirmDeath");
        } catch {}
    }

    function revoke(uint256 ownerSeed) external {
        vm.prank(_owner(ownerSeed));
        try vault.revokeDeathConfirmation() {
            _bump("revoke");
        } catch {}
    }

    function claimInheritance(uint256 ownerSeed, uint256 heirSeed) external {
        vm.prank(_heir(heirSeed));
        try vault.claimInheritance(_owner(ownerSeed)) {
            _bump("claimInheritance");
        } catch {}
    }

    function claimToken(uint256 ownerSeed, uint256 heirSeed) external {
        address o = _owner(ownerSeed);
        address h = _heir(heirSeed);
        uint256 expected = vault.claimableAmount(o, address(token), h);
        vm.prank(h);
        try vault.claimToken(o, address(token)) {
            ghostClaimed += expected;
            _bump("claimToken");
        } catch {}
    }

    function sweep(uint256 ownerSeed) external {
        address o = _owner(ownerSeed);
        uint256 residual = vault.getTokenVault(o, address(token)).remaining;
        vm.prank(address(0xC7A9));
        try vault.sweepTokenVault(o, address(token)) {
            ghostSwept += residual;
            _bump("sweep");
        } catch {}
    }

    function closeEstate(uint256 ownerSeed, uint256 budget) external {
        budget = bound(budget, 1, 64);
        vm.prank(address(0xC7A9));
        try vault.closeEstate(_owner(ownerSeed), budget) {
            _bump("closeEstate");
        } catch {}
    }

    function registerKey(uint256 ownerSeed, uint256 heirSeed, uint256 key) external {
        vm.prank(_heir(heirSeed));
        try vault.registerRecipientKey(_owner(ownerSeed), bytes32(key | 1)) {
            _bump("registerKey");
        } catch {}
    }

    /// @dev Without this the state machine could never leave `Active`, and the
    ///      whole post-death half of the protocol would go unexercised.
    function warpTime(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 8 days, 60 days));
        _bump("warpTime");
    }
}
