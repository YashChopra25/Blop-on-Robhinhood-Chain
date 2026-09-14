# Security

This page describes the security properties and limits of the `VaultInheritance` contract as implemented in `contracts/src/`, plus the parts of the app that affect privacy. Design rationale is in [SOLIDITY_ARCHITECTURE.md](../SOLIDITY_ARCHITECTURE.md) §3 to §6. Exact function gates are in the [smart contract reference](./smart-contract-reference.md).

## Review status

**No independent security review has been completed.** [DEPLOYMENT.md §5](../DEPLOYMENT.md#5-before-mainnet) lists "Security review completed" as an open pre-mainnet item. It states that the security review, gas optimisation and deployment hardening phases of the migration plan are still outstanding.

- `contracts/foundry.toml`, several source comments and [ROBINHOOD_CHAIN.md](../ROBINHOOD_CHAIN.md) refer to a `SECURITY_REVIEW.md`. That file is not in the repository.
- DEPLOYMENT.md §5 also notes that the landing page's audit claims ("audit in progress", "Audits: OtterSec, Neodyme") have not been verified.
- The repository defines no security contact or disclosure policy.

Treat the contract as unaudited.

---

## Trust model

The contract is **immutable**. It has no constructor arguments, owner, admin role, proxy, `delegatecall`, pause switch, fee or rescue function. `test_contractExposesNoAdministrativeSurface` asserts that `owner()`, `pause()`, `unpause()`, `paused()`, `upgradeTo(address)`, `upgradeToAndCall(address,bytes)`, `initialize()` and `transferOwnership(address)` do not exist.

Consequences:

- Nobody, including the deployer, can move escrowed tokens outside the rules below.
- Bugs cannot be patched in place. A redeploy is a new address with no state, and there is no migration path (DEPLOYMENT.md §5). Living owners can withdraw and re-create their wills on a new deployment. Estates whose owners have already died cannot be moved.

What the system still trusts:

| Dependency | Assumption |
|---|---|
| Solidity 0.8.26 and OpenZeppelin `SafeERC20` / `ReentrancyGuard` | Correct |
| Robinhood Chain (Arbitrum) sequencer | Includes transactions in a timely way and sets `block.timestamp` close to real time |
| Each ERC-20 an owner deposits | Behaves as described in [Token custody](#token-custody). The contract cannot defend against a token that changes balances arbitrarily |
| Participants | Custodians and heirs are chosen by the owner. The contract limits what each role can do, but cannot judge intent |

---

## Roles and powers

| Role | How assigned | Can | Cannot |
|---|---|---|---|
| **Owner** | `msg.sender` of `createWill` | While `Active`: configure everything, ping, deposit and withdraw tokens, delete an empty will. Revoke a death confirmation while `PendingInheritance`, or while `Claimable` before the grace period ends | Act on anyone else's will (owner functions take no owner argument). Configure, ping or withdraw while `PendingInheritance` or `Claimable`, except by revoking first. Revoke after `graceEndsAt`. Reverse a claim that has already happened |
| **Custodian** | Named by the owner (`addCustodian`), no consent needed | `confirmDeath` once `now >= lastActiveAt + inactivityThreshold`, once per approval epoch | Confirm before the threshold. Confirm twice in one epoch. Confirm for a will they are not a custodian of. Receive any funds as a custodian. Change heirs, allocations or payout destinations |
| **Beneficiary (heir)** | Named by the owner (`addBeneficiary`), no consent needed | While `Active`: register or rotate their own encryption key. Once claims are open: `claimInheritance`, and `claimToken` once per token per will incarnation | Claim before `graceEndsAt`. Claim more than `min(floor(totalDeposited * bps / 10000), remaining)`. Claim twice. Set anyone else's key. Register a key once the will has left `Active` |
| **Anyone** | Any address | After `claimWindowEndsAt`: `sweepTokenVault` and `closeEstate` | Redirect swept funds (always sent to the owner's address). Run teardown before the claim window ends. Close an estate that still holds a vault |

---

## Threat analysis

### Malicious or mistaken custodians

- **Premature confirmation is time-gated.** `confirmDeath` reverts with `OwnerStillActive` until the owner has been silent for `inactivityThreshold`. Only `createWill`, `updateWill` and `revokeDeathConfirmation` refresh `lastActiveAt`.
- **Colluding custodians reaching quorum.** A quorum of custodians can make a silent-but-alive owner's will `Claimable`. Nothing can be claimed for `GRACE_PERIOD` (7 days), during which the owner can call `revokeDeathConfirmation`. Revoking resets the tally, increments `approvalEpoch` (invalidating every earlier confirmation) and restarts the inactivity timer. **If the owner does not revoke within 7 days, the estate is distributed to the named heirs and cannot be reversed.**
- **Custodians cannot steal.** Token payouts go only to heirs (`claimToken` pays `msg.sender` after proving beneficiary status) or to the owner's address (`withdrawToken`, `sweepTokenVault`). A custodian gains funds only if the owner has also named them as a beneficiary. Nothing prevents that, or naming one address as sole custodian and sole heir.
- **A single custodian below quorum can freeze configuration.** One confirmation after the threshold moves the will to `PendingInheritance`. In that state every owner configuration function reverts with `WillNotActive`, including pings, withdrawals and custodian removal, and heirs cannot register encryption keys. The owner's only route back is `revokeDeathConfirmation`. This is always available while `PendingInheritance`.
- **Repeated griefing.** After a revocation, custodians must wait a full new `inactivityThreshold` before confirming again. Once back in `Active`, the owner can remove a hostile custodian with `removeCustodian`, subject to the quorum-preservation rule.
- **Unresponsive custodians.** If fewer than `minApprovals` custodians are willing or able to confirm, the will never becomes `Claimable` and heirs receive nothing. The contract has no fallback path.

### Owner

- A will is revocable while the owner is alive. Heirs have no on-chain guarantee before death: the owner can remove them, change allocations or withdraw all tokens while `Active`.
- The owner can name any address as a custodian or heir without consent. Each naming adds an entry to that address's reverse role list (`custodianRolesOf` / `beneficiaryRolesOf`). These lists are uncapped, so a stranger's will can appear in "wills where I am an heir". Reads are paginated, and `test_roleListInflationCannotBlockAnything` shows inflation does not block writes. Front-ends should not treat an appearance in these lists as a trusted signal.
- The owner chooses `inactivityThreshold`. The contract accepts any value from 1 second up to `type(uint40).max`. A very short threshold makes premature confirmation easy.

### Heirs

- Double claims are prevented per `(owner, incarnation, token, heir)`. The incarnation scoping means a will re-created at the same address starts with a clean ledger (`test_newIncarnationStartsWithACleanClaimLedger`).
- Shares are fixed fractions of `totalDeposited`, which claims never decrement, so claim order cannot change anyone's entitlement (`test_claim_orderDoesNotChangeEntitlements`).
- Only the heir can set their encryption key, and only while `Active`. An attacker who compromises an heir's wallet **while the will is `Active`** can replace the key. Documents sealed after that point would be sealed to the attacker's key. Once death confirmation is in flight, the key is frozen.

### Permissionless crankers and front-running

- `sweepTokenVault` and `closeEstate` require `now >= claimWindowEndsAt`, so they cannot run during the grace period or the claim window. The swept residual always goes to the will owner. `invariant_I9_crankerNeverProfits` and `test_teardownIsPermissionlessButPaysTheCrankerNothing` cover this.
- `CLAIM_WINDOW` does not close claims. An heir who has not claimed by `claimWindowEndsAt` can still call `claimToken` until someone sweeps that vault. After that, their share has gone to the owner's address. This race is inherent to a permissionless sweep.
- `createWill` is keyed by `msg.sender`, so there is no initializer to front-run. Robinhood Chain uses first-come, first-served sequencing, where fees do not reorder transactions ([ROBINHOOD_CHAIN.md](../ROBINHOOD_CHAIN.md) §4). No function pays the caller anything a front-runner could take.

---

## Token custody

### Model

- **Pooled custody.** The contract holds every will's balance of a given token at one address.
- **Per-will ledger.** Each will keeps a separate `TokenVault { totalDeposited, remaining }` for each token. `balanceOf(address(this))` is read only inside `depositToken`.
- **Measured deposits.** A deposit credits `balanceAfter - balanceBefore`, not the requested amount. It reverts if nothing arrived.
- **Clamped payouts.** Every claim pays `min(share, remaining)`. `totalDeposited` is never decremented by claims.
- **Checked by invariants.** I1 (solvency: the sum of `remaining` is at most the real balance) and I2 (conservation against independent ghost accounting) run in the invariant suite. See [testing.md](./testing.md#invariants).

### Non-standard ERC-20 behaviour

| Token behaviour | Handling | Evidence |
|---|---|---|
| Fee on transfer (inbound) | Ledger credits the measured delta. `TokenDeposited` logs both `requested` and `received` | `test_deposit_creditsMeasuredDeltaForFeeOnTransferToken`, `testFuzz_feeOnTransferLedgerMatchesReality` |
| Fee on transfer (outbound) | The ledger decrements the full amount sent. The recipient receives less. The ledger stays consistent with the contract's balance | Follows from `claimToken` / `withdrawToken` / `sweepTokenVault` |
| 100% fee, or a no-op transfer | Deposit reverts with `InvalidAmount` | `test_deposit_revertsWhenNothingArrives` |
| No return data (USDT-style) | Accepted by `SafeERC20` | `test_deposit_handlesNoReturnDataToken` |
| Returns `false` | `SafeERC20` reverts with `SafeERC20FailedOperation` | `test_deposit_revertsOnFalseReturningToken` |
| Callbacks or hooks during transfer | `nonReentrant` on all four token functions, plus checks-effects-interactions | See [Reentrancy](#reentrancy) |
| Blocklist or paused transfers | The whole call reverts and the vault is untouched and retryable. If the **owner's address** stays blocked, that vault can never be swept, so `closeEstate` stays blocked by `WillHasTokenVaults`. A blocked heir cannot claim, and their share is swept to the owner after the window | `test_sweep_failsSafelyWhenTheTokenBlocksTheEstate` |
| Rebasing or balance-changing tokens | **Not supported.** The ledger is fixed at deposit time and balances are never re-read. A negative rebase can leave the pooled balance below the sum of ledgers, making the last withdrawals or claims **of that token, across all wills**, revert. A positive rebase leaves surplus stranded in the contract | Derived from the code. No test covers it |
| Malicious token (for example, a lying `balanceOf`) | Only ledgers for that token address are affected. Vaults of other tokens and other wills' vaults of other tokens are separate storage. Heirs should assess every token listed in a will | `test_vaultsOfDifferentWillsAreIsolated` covers isolation between wills for one honest token |
| Supply above roughly 2^242 | `shareOf` overflows and `claimToken` reverts with a panic rather than wrapping | `test_absurdSupplyRevertsRatherThanWrapping` |
| `address(0)` or the vault itself as token | `InvalidToken` | `test_deposit_revertsOnInvalidToken` |

### Assets the contract does not account for

- **Native ETH.** There is no `receive` or `fallback`, so plain transfers revert. ETH force-sent (for example via `selfdestruct`) is stranded, and no accounting reads `address(this).balance` (`test_forcedEtherDoesNotAffectAccounting`).
- **Direct ERC-20 transfers** that bypass `depositToken` are not credited to any vault. With no rescue function, they are permanently stranded.
- **NFTs** and other token standards are not supported.

---

## Reentrancy

- OpenZeppelin `ReentrancyGuard` protects `depositToken`, `withdrawToken`, `claimToken` and `sweepTokenVault`. The lock is shared, so a token callback cannot enter any of these four from another.
- `withdrawToken`, `claimToken` and `sweepTokenVault` write all state (vault deletion, claim record, `remaining` decrement) before the external transfer.
- `depositToken` must read the balance after the transfer to measure the delta. It relies on `nonReentrant`.
- No other function makes an external call.
- Tests: `test_reentrantTokenCannotDoubleClaim`, `test_reentrantTokenCannotDoubleWithdraw`, `test_reentrantTokenCannotDoubleSweep`, `test_reentrantTokenCannotInflateDepositAccounting`.
- **Read-only reentrancy.** During a first deposit's `transferFrom`, a token callback reading views would see the new vault entry with pre-deposit totals. Integrators should not trust view results obtained from inside a token callback.

---

## Timing on Arbitrum

- **Timestamps only.** Every deadline uses `block.timestamp`, and `block.number` is not used anywhere. On Arbitrum, `block.number` returns an L1 estimate ([ROBINHOOD_CHAIN.md](../ROBINHOOD_CHAIN.md) §4). The `block-timestamp` lint is excluded in `foundry.toml` for this reason.
- **Drift is unbounded in the docs.** Timestamps are set by the sequencer. The official documentation publishes no drift bound (ROBINHOOD_CHAIN.md §8). The smallest fixed protocol interval is the 7-day grace period, so drift of seconds or minutes has no practical effect. The user-chosen `inactivityThreshold` has no on-chain minimum. The UI's minimum is 1 day, per ROBINHOOD_CHAIN.md.
- **Exact boundaries.**

  | Check | Condition |
  |---|---|
  | `confirmDeath` | `now >= lastActiveAt + inactivityThreshold` |
  | Revocation from `Claimable` | `now < graceEndsAt` |
  | Claims | `now >= graceEndsAt` |
  | Teardown | `now >= claimWindowEndsAt` |

  Revocation and claims never overlap. `testFuzz_timelineGatesAreExact` checks for off-by-one errors.
- **Liveness assumption.** An owner whose will becomes `Claimable` must get a `revokeDeathConfirmation` transaction included within 7 days. Sequencer downtime, or sequencer-level screening that excludes transactions (ROBINHOOD_CHAIN.md §1, item 20), could prevent that. After the grace period, revocation is impossible. This repository does not document an L1 forced-inclusion path, so treat sequencer availability as an assumption.
- **Finality.** Transactions are soft-confirmed by the sequencer in under a second and finalised on Ethereum later. The app waits for one confirmation and labels value-moving actions as soft-confirmed (`app/lib/evm/tx.ts`, ROBINHOOD_CHAIN.md §6).
- **Timestamp width.** Timestamps are stored as `uint40`, which does not overflow until the year 36812. Thresholds above `type(uint40).max` revert with `ValueTooLarge`.

---

## Bounded collections and caps

| Collection | Cap | Enforced by |
|---|---|---|
| Custodians per will | 32 | `TooManyCustodians` |
| Beneficiaries per will | 64 | `TooManyBeneficiaries` |
| Live media per will | 255 | `TooManyMedia` |
| Media indexes per will instance | 65,535 (indexes 0 to 65,534, never reused) | `MediaIndexExhausted` |
| Token vaults per will | 32 | `TooManyTokenVaults` |
| CID length | 1 to 64 bytes | `InvalidCid` |
| Total allocation | 10,000 bps | `AllocationExceeded` |
| Reverse role lists per address | **Uncapped** (anyone can name anyone) | Read via paginated `custodianRolesOf` / `beneficiaryRolesOf` |

All removals are O(1) swap-and-pop. Array-returning views (`getCustodians`, `getBeneficiaries`, `getMedia`, `getTokenVaults`) are unpaginated, but bounded by the caps above. `closeEstate` takes a caller-chosen `maxItems` budget, so teardown of the largest estate (255 media + 32 custodians + 64 heirs) can be split across transactions. Each vault is swept in its own call.

### Arithmetic and casts

- Solidity 0.8 checked arithmetic applies everywhere except in `unchecked` blocks. Each of those is bounded by a preceding check or a cap.
- The `unsafe-typecast` lint is excluded. The `foundry.toml` comment states that all 13 cast sites were reviewed: `uint40(timestamp)`, threshold casts guarded by `> type(uint40).max`, `uint248(amount)` guarded the same way, and length casts bounded by the caps.

### Lint exclusions

Excluded in `contracts/foundry.toml`, with the reason given in its comments:

| Lint | Stated reason |
|---|---|
| `block-timestamp` | The protocol is timestamp-driven by design. `block.number` is unusable on Arbitrum |
| `unsafe-typecast` | All 13 sites audited (see above) |
| `uninitialized-local` | `for (uint256 i; ...)` is the idiomatic zero-init form |
| `asm-keccak256` | Readability preferred over about 30 gas on rarely called paths |
| `boolean-cst` | Returning literal `(false, 0)` / `(true, n)` tuples |
| `missing-events-access-control` | False positive: `_cidIndex` is a lookup index, not an authorization record |

The comment says the reasoning is recorded in `SECURITY_REVIEW.md`, which is not present in the repository.

---

## Privacy

### Everything on-chain is public

The contract provides no confidentiality. Anyone can read, through views, events or transaction calldata:

- Owner, custodian and beneficiary addresses, and, via the reverse role lists, every will a given address is named in.
- Allocations, token addresses, deposited and remaining amounts, and claims.
- `lastActiveAt` and `inactivityThreshold`. Together these reveal the owner's activity pattern and the earliest time death can be confirmed.
- Custodian confirmations and their timestamps.
- Media CIDs and **MIME types** (`mediaType` is stored as plaintext `bytes16`).
- Heirs' X25519 public keys.

Removing a record (`removeMedia`, `removeBeneficiary` and so on) deletes current state but not history. Earlier events and calldata remain permanently readable.

### Documents

The contract stores only a CID. Confidentiality of document contents is handled by the app (`app/lib/crypto.ts`):

- Each file gets a random 256-bit data key. The file and its metadata are encrypted with AES-256-GCM.
- The data key is sealed to each recipient with X25519 and XSalsa20-Poly1305 (`nacl.box`). Recipients are the owner and every heir with a registered `encryptionPubkey`. Only sealed keys and ciphertext leave the browser. The contract never holds a key or plaintext.
- Recipients are fixed at seal time. An heir added, or who registers a key, after a document was sealed cannot read it unless it is re-uploaded. Because `registerRecipientKey` works only while `Active`, **an heir who has not registered before death confirmation starts will never be sealed to**.
- Each wallet's X25519 key pair is derived from its signature over a fixed message (`KEY_DERIVATION_MESSAGE`). This relies on wallets producing deterministic RFC 6979 ECDSA signatures. **Anyone who obtains that signature can derive the key**, so it must be treated as a secret.
- Ciphertext pinned to IPFS is public and permanent. Its confidentiality rests entirely on the keys above.

### API authorization

`app/lib/server/authz.ts` checks the chain before serving or modifying a pinned document:

- **Writes**: the owner only.
- **Reads**: the owner, or any existing beneficiary once the will is `Claimable` and `claimsOpen`.

The code comment calls this defence in depth, since documents are already encrypted. A failed RPC call is denied (fail closed).

---

## Known limitations

1. **Not independently reviewed.** See [Review status](#review-status).
2. **Immutable.** No bug fixes, and no migration for existing estates.
3. **Irreversible after the grace period.** A living owner who misses the 7-day revocation window loses the escrow to the named heirs.
4. **Assets can be stranded by removing all custodians.** `removeCustodian` always permits going from 1 custodian to 0, even while media or token vaults exist. The quorum-reachability check applies only when assets *enter* a will. If the owner dies with zero custodians, the will can never become `Claimable`, and its tokens can never be claimed or swept.
5. **Quorum depends on custodians.** If custodians are lost or unwilling, heirs receive nothing.
6. **Residuals go to the owner's address.** Unallocated shares, rounding dust and unclaimed shares are sent there after the claim window. After death, whoever controls that key (if anyone) receives them.
7. **Claims are not closed by the claim window.** They end only when a vault is swept (for tokens) or the beneficiary record is cleared by `closeEstate`.
8. **Heirs must act per token.** Each heir must call `claimToken` separately for each of up to 32 tokens, and must find them via `getTokenVaults`.
9. **`PendingInheritance` freezes the will.** A single post-threshold confirmation blocks owner configuration and heir key registration until the owner revokes.
10. **Token assumptions.** Rebasing tokens are unsupported. Blocklisting tokens can block a sweep, and therefore `closeEstate`, indefinitely. ERC-20 only.
11. **No recovery of stray assets.** Tokens sent directly, and force-sent ETH, are permanently stranded.
12. **Public metadata.** Participants, amounts, activity timing and document types are visible to everyone.
13. **Sequencer liveness.** Revocation within the grace period and claims before a sweep both depend on transaction inclusion.

Before a mainnet deployment, work through the checklist in [DEPLOYMENT.md §5](../DEPLOYMENT.md#5-before-mainnet).
