# Testing

The contracts are tested with [Foundry](https://book.getfoundry.sh). The suite has three layers: unit tests, fuzz tests, and a stateful invariant campaign. All of it runs against the real `VaultInheritance` contract plus a set of deliberately misbehaving ERC-20 mocks.

For the design reasoning behind the test architecture, see [SOLIDITY_ARCHITECTURE.md](../SOLIDITY_ARCHITECTURE.md) §12.

## At a glance

| Layer | Suites | Test functions | Location |
|---|---|---|---|
| Unit | 7 | 132 | `contracts/test/unit/` |
| Fuzz | 1 | 7 | `contracts/test/fuzz/Fuzz.t.sol` |
| Invariant | 1 | 11 invariant functions (10 properties plus a call summary) | `contracts/test/invariant/` |

`forge test` reports **140 tests across 9 suites**. The two figures differ because Foundry runs all `invariant_*` functions of a contract as a single campaign and counts it as one test: 132 + 7 + 1 = 140. The 11 invariant functions are listed individually in the output of that suite.

All commands below run from `contracts/`.

---

## Layout

```
contracts/
├── src/mocks/MockERC20.sol          well-behaved and adversarial ERC-20 mocks
└── test/
    ├── helpers/VaultTestBase.sol    shared fixture for unit and fuzz tests
    ├── unit/                        one suite per area of the contract
    ├── fuzz/Fuzz.t.sol              property-based tests
    └── invariant/
        ├── Handler.sol              action driver with ghost accounting
        └── VaultInvariants.t.sol    the invariants
```

The mocks live in `src/mocks/` rather than `test/`, so they compile as part of the project. `script/Deploy.s.sol` deploys only `VaultInheritance`.

### Shared fixture: `VaultTestBase`

`test/helpers/VaultTestBase.sol` is inherited by every unit suite and by `FuzzTest`. It provides:

- **Setup**: warps to timestamp `1_800_000_000`, then deploys a fresh `VaultInheritance` and a standard `MockERC20` (`token`).
- **Named actors** (`makeAddr`): `owner`, `custodianA/B/C`, `heirA/B`, `stranger`, `cranker`.
- **Constants**: `THRESHOLD = 30 days`, `GRACE = 7 days`, `CLAIM_WINDOW = 90 days`. Also a CIDv0 (`CID_A`), a CIDv1 (`CID_B`) and a `PDF` media type.
- **Builders**: `warp(secs)`, `_createWill`, `_addCustodian`, `_addBeneficiary`, `_addMedia`, and `_deposit` (which mints, approves and deposits).
- **`_estateAtQuorum(escrow, bpsA, bpsB)`**: a will with one custodian, up to two heirs and an optional escrow, warped past the threshold and confirmed to quorum. It leaves `block.timestamp == claimableAt`, so a test warps by `GRACE` to open claims or by `GRACE + CLAIM_WINDOW` to open teardown.
- **Assertions**: `_status(who)`, `_assertNoWill(who)`.

---

## Unit suites

| File | Contract | Tests | Covers |
|---|---|---|---|
| `test/unit/Will.t.sol` | `WillTest` | 19 | `createWill` initial state and validation (duplicate, zero threshold, zero quorum, oversize threshold, per-caller independence). `updateWill` as a ping and as reconfiguration, including quorum bounds. `deleteWill` success, and its blocking by dependents, token vaults, non-`Active` status or a missing will. `getWill` derived deadlines and the empty result for unknown owners |
| `test/unit/Custodian.t.sol` | `CustodianTest` | 23 | Adding and removing custodians (duplicate, zero address, non-owner, cap of 32, quorum preservation, undoing a live confirmation). `confirmDeath` threshold gating, non-custodian rejection, reaching quorum, extra confirmations not moving `claimableAt`, and double confirmation. Revocation from `PendingInheritance` and from `Claimable` during grace, expiry at the end of grace, and non-owner rejection. A re-added custodian starting clean. Reverse role index and pagination |
| `test/unit/Beneficiary.t.sol` | `BeneficiaryTest` | 22 | Allocation recording, the 100% ceiling, under-allocation and zero allocation, duplicates, zero address, naming self, the cap of 64, and freeing an allocation on removal. `claimInheritance` after grace, blocked during grace, double claim, non-beneficiary and non-`Claimable` cases. `registerRecipientKey`: only the heir, zero key rejected, rotation while `Active`, frozen once death is in flight. Reverse role index and `getBeneficiaries` |
| `test/unit/Media.t.sol` | `MediaTest` | 13 | Storing CID and type, both CID versions, the quorum gate, empty or oversize CIDs, duplicate CIDs (per will only), monotonic indexes after removal, CID-index cleanup on removal, non-owner and non-`Active` rejection, missing lookups, and clean failure when the `uint16` media index is exhausted |
| `test/unit/TokenEscrow.t.sol` | `TokenEscrowTest` | 30 | Deposit accounting and top-ups into one vault. Quorum gate, zero amount, invalid token, non-`Active`, vault cap. Fee-on-transfer credited by measured delta, a deposit that delivers nothing, no-return-data tokens, false-returning tokens. Withdrawal (full, missing vault, non-`Active`, non-owner, redeposit starts a fresh total). Proportional claims with remainder to the estate, order independence, grace gating, double claim, non-beneficiary, zero allocation, share rounding to zero, missing vault, `claimableAmount` matching the payout. Sweep timing, sweeping an empty vault, missing vault, and a blocking token failing safely. Isolation of vaults across wills |
| `test/unit/Teardown.t.sol` | `TeardownTest` | 11 | Teardown cannot front-run a pending claim and opens exactly at `claimWindowEndsAt`. `closeEstate` is blocked by a live vault, clears every child, is incremental and resumable, rejects a zero budget or a non-`Claimable` will, and pays the cranker nothing. A full lifecycle. Counters stay consistent mid-teardown (a regression found by the invariant suite). A new incarnation starts with a clean claim ledger |
| `test/unit/Security.t.sol` | `SecurityTest` | 14 | Reentrant token cannot double-claim, double-withdraw, double-sweep or inflate deposit accounting. Every owner-only function rejects three kinds of non-owner. Roles do not leak across wills. No administrative surface (`owner()`, `pause()`, `unpause()`, `paused()`, `upgradeTo`, `upgradeToAndCall`, `initialize()`, `transferOwnership` all absent). Plain ETH rejected, forced ETH does not affect accounting. Role-list inflation cannot block anything. A contract heir with no fallback can still claim. Allocation overflow reverts. Absurd token supply reverts rather than wrapping, while the largest non-overflowing total still pays out |

Many unit tests carry a `/// @dev Mirrors ...` comment naming the equivalent test in the original Solana suite.

---

## Fuzz tests

`test/fuzz/Fuzz.t.sol`, contract `FuzzTest`. Each test runs 512 times with the fixed seed from `foundry.toml`.

| Test | Property |
|---|---|
| `testFuzz_sharesNeverExceedDepositAndRemainderGoesToEstate` | For any deposit and any two allocations that together are at most 100%, heirs never receive more than was deposited. After the sweep, heirs' balances plus the owner's balance equal the deposit, and the contract holds nothing |
| `testFuzz_shareIsExactlyProportional` | A single heir receives exactly `floor(deposit * bps / 10000)` |
| `testFuzz_totalAllocationNeverExceeds100Percent` | For any sequence of 8 additions, `totalAllocatedBps` tracks the running sum, and additions that would exceed 10000 revert with `AllocationExceeded` |
| `testFuzz_deathConfirmationRespectsTheThreshold` | `confirmDeath` reverts with `OwnerStillActive` whenever `elapsed < threshold`, and succeeds otherwise |
| `testFuzz_timelineGatesAreExact` | For any offset up to 400 days after quorum, `claimsOpen` and `teardownOpen` match the expected boundaries, and `sweepTokenVault` and `claimToken` succeed or revert accordingly |
| `testFuzz_revocationAlwaysInvalidatesPriorConfirmations` | Across 1 to 20 confirm-and-revoke rounds, the tally resets to 0, stale confirmations read as not approved, and `approvalEpoch` increments by one per round |
| `testFuzz_feeOnTransferLedgerMatchesReality` | For any fee from 0 to 9999 bps, the vault's `remaining` equals the contract's actual token balance after deposit |

`Fuzz.t.sol` also declares a small `FeeToken` wrapper around `FeeOnTransferERC20`.

---

## Invariant suite

### Harness

`test/invariant/Handler.sol` (`Handler`) wraps every protocol action in a `try`/`catch`, so random sequences can include invalid calls. `fail_on_revert = false`. Ghost variables record only what actually succeeded, which lets the accounting invariants compare the contract with an independent tally.

| Aspect | Detail |
|---|---|
| Actors | 4 owners, 4 custodians and 4 heirs at fixed addresses. Each owner is minted `1_000_000e18` and approves the vault |
| Bootstrap | Called once from `setUp` and not fuzzed. For each owner: `createWill(1 days, 1)`, two custodians, two heirs at 5000 and 3000 bps, and a deposit of `10_000e18`. This starts the campaign from a funded state, so it reaches the post-death half of the protocol |
| Fuzzed actions (18 selectors) | `createWill`, `updateWill`, `addCustodian`, `removeCustodian`, `addBeneficiary`, `removeBeneficiary`, `addMedia`, `removeMedia`, `registerKey`, `deposit`, `withdraw`, `confirmDeath`, `revoke`, `claimInheritance`, `claimToken`, `sweep`, `closeEstate` (budget 1 to 64), `warpTime` (8 to 60 days) |
| Ghost variables | `ghostDeposited`, `ghostWithdrawn`, `ghostClaimed`, `ghostSwept` |
| Cranker | `sweep` and `closeEstate` are called from `address(0xC7A9)` |
| Call counters | `calls[name]` counts successful calls, printed by `invariant_callSummary` |

### Invariants

Defined in `test/invariant/VaultInvariants.t.sol` (`VaultInvariantsTest`).

| Function | Asserts |
|---|---|
| `invariant_I1_contractIsSolvent` | The sum of `remaining` across all four owners' vaults is at most `token.balanceOf(vault)` |
| `invariant_I2_valueIsConserved` | `ghostDeposited == ghostWithdrawn + ghostClaimed + ghostSwept + sum(remaining)` |
| `invariant_I3_remainingNeverExceedsTotalDeposited` | For each vault, `remaining <= totalDeposited` |
| `invariant_I4_allocationsAreConsistent` | For each existing will, `totalAllocatedBps <= MAX_ALLOCATION_BPS`, and it equals the sum of live beneficiary allocations |
| `invariant_I5_countersMatchLists` | `custodianCount`, `beneficiaryCount`, `mediaCount` and `tokenVaultCount` equal the lengths of the corresponding view arrays |
| `invariant_I6_quorumStateIsCoherent` | `approvalsReceived <= custodianCount` and `minApprovals >= 1`. Unless teardown is open: a `Claimable` will has `claimableAt > 0` and `approvalsReceived >= minApprovals`; an `Active` will has `approvalsReceived == 0` and `claimableAt == 0`; and the count of custodians with `hasApproved` equals `approvalsReceived` |
| `invariant_I7_noDoubleClaims` | For each owner, the sum of recorded claim amounts plus `remaining` is at most `totalDeposited`, while the vault exists |
| `invariant_I8_closedEstatesAreEmpty` | An address with no will has no custodians, beneficiaries, media or token vaults |
| `invariant_I9_crankerNeverProfits` | The cranker address `0xC7A9` holds a token balance of 0 |
| `invariant_I10_noEtherHeld` | `address(vault).balance == 0` |
| `invariant_callSummary` | No assertion. Logs how many times each action succeeded, so a campaign that never reached, for example, `claimToken` is visible |

Notes:

- I6 skips its live-will checks once `teardownOpen` is true, because a partially completed `closeEstate` legitimately leaves a `Claimable` will with fewer custodians than its quorum.
- I7 reads `getClaim`, which is scoped to the current incarnation.
- I9 checks only the cranker's balance. It does not trace every recipient.

---

## Adversarial token mocks

All defined in `contracts/src/mocks/MockERC20.sol`.

| Mock | Misbehaviour | Used by |
|---|---|---|
| `MockERC20` | None. Minimal standard ERC-20 with public `mint`. `type(uint256).max` allowance is treated as infinite | Default `token` in all suites |
| `FeeOnTransferERC20(feeBps)` | Burns `amount * feeBps / 10000` on every transfer, so the recipient receives less than requested | `TokenEscrowTest` (measured-delta crediting, nothing-arrives case), `FuzzTest` |
| `NoReturnERC20` | `transfer` and `transferFrom` return no data (USDT-style) | `TokenEscrowTest` (`SafeERC20` compatibility) |
| `FalseReturnERC20` | Returns `false` instead of reverting when `setFailTransfers(true)` | `TokenEscrowTest` (turned into a revert) |
| `ReentrantERC20` | Once `arm`ed, calls back into the vault from `_transfer`. Mode 1 re-enters `claimToken`, mode 2 `withdrawToken`, mode 3 `sweepTokenVault` | `SecurityTest` reentrancy tests |
| `BlockingERC20` | Reverts with `"blocked"` when the sender or recipient is on a blocklist | `TokenEscrowTest` (a failed sweep leaves the vault intact and retryable) |

Test-local helpers:

- `RejectingContract` in `Security.t.sol` is a contract heir with no `receive` or `fallback`.
- `FeeToken` in `Fuzz.t.sol` is a fee-on-transfer wrapper.

---

## Configuration

From `contracts/foundry.toml`:

| Setting | Value | Effect |
|---|---|---|
| `[fuzz] runs` | `512` | Iterations per fuzz test |
| `[fuzz] seed` | `"0x5641554c54"` (ASCII "VAULT") | Deterministic fuzzing, so a CI failure reproduces locally |
| `[invariant] runs` | `64` | Independent call sequences |
| `[invariant] depth` | `256` | Calls per sequence (64 × 256 = 16,384 calls per campaign) |
| `[invariant] fail_on_revert` | `false` | Reverting handler calls are tolerated |
| `[invariant] call_override` | `false` | No reentrancy-style call overriding |
| `[invariant] shrink_run_limit` | `2000` | Shrinking budget for counterexamples |
| `verbosity` | `1` | Default output level |
| `gas_reports` | `["VaultInheritance"]` | Gas report is limited to the production contract |

Build settings (`solc 0.8.26`, `evm_version = "shanghai"`, optimizer 200 runs) also apply to tests.

There is no CI configuration in the repository. [DEPLOYMENT.md §5](../DEPLOYMENT.md#5-before-mainnet) lists a green `forge test` as a pre-mainnet requirement.

---

## Commands

Run from `contracts/`.

### Everything

```bash
forge build
forge test                 # 140 tests, 9 suites
forge test -vvv            # show traces for failing tests
```

In a local run, the invariant campaign took about 35 seconds. The other eight suites finish in under a second.

### Filtering

```bash
# One suite
forge test --match-contract TokenEscrowTest

# One test, or a pattern
forge test --match-test test_claim_isProportionalAndRemainderReturnsToTheEstate
forge test --match-test "test_revoke_"

# By file or directory
forge test --match-path "test/unit/*"
forge test --match-path test/fuzz/Fuzz.t.sol

# Fast loop: skip the invariant campaign
forge test --no-match-contract VaultInvariantsTest

# Invariants only, with the call summary logs
forge test --match-contract VaultInvariantsTest -vv
```

### Overriding fuzz and invariant intensity

```bash
FOUNDRY_FUZZ_RUNS=5000 forge test --match-contract FuzzTest
FOUNDRY_INVARIANT_RUNS=256 FOUNDRY_INVARIANT_DEPTH=512 forge test --match-contract VaultInvariantsTest
forge test --fuzz-seed 0x1234 --match-contract FuzzTest   # try a different seed
```

### Gas report

```bash
forge test --gas-report
```

Only `VaultInheritance` is reported, per `gas_reports` in `foundry.toml`.

### Coverage

```bash
forge coverage --report summary --no-match-contract VaultInvariantsTest
forge coverage --report lcov --no-match-contract VaultInvariantsTest   # writes lcov.info
```

The invariant suite is excluded here to keep coverage runs short. `forge coverage` compiles without the optimizer, and the campaign is already the slowest part of the suite.

A run with forge 1.8.1, excluding the invariant suite (139 tests), reported:

| File | Lines | Statements | Branches | Functions |
|---|---|---|---|---|
| `src/core/VaultInheritance.sol` | 99.08% (433/437) | 97.94% (524/535) | 90.00% (72/80) | 100% (44/44) |
| `src/libraries/WillLib.sol` | 100% (16/16) | 100% (22/22) | 100% (3/3) | 100% (8/8) |

Scripts (`script/*.sol`) and the invariant `Handler` show 0% in that report, which is expected.

---

## Adding tests

- Unit and fuzz tests should inherit `VaultTestBase` and use its actors and builders.
- Follow the existing naming: `test_<function>_<behaviour>`, `testFuzz_<property>`, and `invariant_I<n>_<property>`.
- Assert the specific custom error with `vm.expectRevert(VaultErrors.X.selector)` (imported as `E` in the suites). For token or panic reverts, use the token's message or `stdError`.
- New protocol actions should also get a handler function in `Handler.sol`, added to the selector list in `VaultInvariantsTest.setUp`, and a name in `invariant_callSummary`.
