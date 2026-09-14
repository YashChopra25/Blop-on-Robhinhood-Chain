# SOLIDITY_ARCHITECTURE.md

> Phase 4 deliverable — the design, written before the implementation and kept in
> step with it. Read `MIGRATION_ANALYSIS.md` (business rules B1–B29) and
> `EVM_MIGRATION_DESIGN.md` (concept mapping) first.

---

## 1. Contract architecture

**One contract. No proxy, no factory, no registry.**

```
contracts/src/
├── core/VaultInheritance.sol     19,123 bytes runtime — the entire protocol
├── interfaces/IVaultInheritance.sol
├── libraries/WillLib.sol         pure timeline + quorum + share maths
├── errors/Errors.sol             VaultErrors — every revert reason
├── events/IVaultEvents.sol       every state transition
├── structs/Types.sol             storage structs
├── structs/Views.sol             return-only structs for the frontend
└── mocks/MockERC20.sol           well-behaved + 5 adversarial ERC-20s (tests only)
```

### Why not a contract per will?

The obvious "faithful" translation of *one Will PDA per owner* is *one Will
contract per owner*, deployed with `CREATE2` from a factory — the address would
even be deterministically derivable from the owner, exactly like the PDA.

It was rejected:

| | One contract, mappings | Contract per will (CREATE2 factory) |
|---|---|---|
| Create a will | ~95 k gas | ~400 k+ gas (full deployment) |
| Token custody | one pooled balance + per-vault ledger | each will holds its own ERC-20 balance (closer to Solana) |
| Cross-will isolation | enforced by the ledger (**tested**: `test_vaultsOfDifferentWillsAreIsolated`, invariant I1) | structural |
| Reading many wills | one `eth_call` | one call per will |
| Audit surface | one contract | factory + implementation + clone semantics |
| Upgrade/compat | none needed | per-will version skew |

The only genuine advantage of the per-will design is that token custody becomes
structural rather than bookkeeping. That advantage is real — it is exactly what
Solana gave for free — but it costs 4× on the single most common operation, and
the bookkeeping it replaces is ~10 lines guarded by a dedicated invariant. A
5-slot mapping write is not worth a contract deployment.

**Solana had per-account isolation because accounts are the only unit it has.
EVM has mappings. Using them is the idiomatic translation, not a shortcut.**

### Module boundaries

`WillLib` holds every rule that is a pure function of a `Will`: the two
deadlines, the two timing gates, quorum reachability, inactivity, and the share
formula. Both the mutating functions and the view functions call it, so the UI
can never disagree with the contract about what is currently allowed. It is the
successor to the `impl Will` block in `state.rs`.

`Types.sol` / `Views.sol` are split deliberately: storage structs are packed for
gas, view structs are shaped for the client and carry derived fields that are not
stored (`graceEndsAt`, `claimsOpen`, `hasEncryptionKey`, …).

---

## 2. Storage architecture

### Packing

| Struct | Slots | Layout |
|---|---|---|
| `Will` | **2** | slot 0 (31/32 B): status, minApprovals, approvalsReceived, custodianCount, mediaCount, totalAllocatedBps, approvalEpoch, createdAt, lastActiveAt, claimableAt, inactivityThreshold — slot 1 (8/32 B): mediaIndex, beneficiaryCount, beneficiariesClaimed, tokenVaultCount |
| `Custodian` | **1** | exists, hasApproved, approvedEpoch, lastApprovedAt, listIndex, roleIndex (15 B) |
| `Beneficiary` | **2** | slot 0: exists, hasClaimed, allocationBps, listIndex, roleIndex (12 B) — slot 1: encryptionPubkey |
| `MediaReference` | 1 + string | exists, index, listIndex, mediaType (23 B) + `string cid` |
| `TokenVault` | **3** | exists + listIndex (5 B), totalDeposited, remaining |
| `TokenClaim` | **1** | claimed + amount (uint248) |

Everything `confirmDeath` reads and writes lives in `Will` slot 0 — one `SLOAD`,
one `SSTORE` for the hot path of the dead-man's switch.

Timestamps are `uint40` (seconds; overflows in year 36812). `uint32` would
overflow in 2106, which is inside the plausible lifetime of an inheritance
contract and therefore not acceptable.

### The existence problem

On Solana an account exists or it does not, and Anchor's `init` constraint turns
that into a security control in three places. Solidity storage always exists and
reads as zero, so each becomes an explicit flag:

| Solana | Solidity | Guards |
|---|---|---|
| `init` on will PDA | `Status.None == 0` sentinel | reinitialization (B1) |
| `init` on custodian/beneficiary PDA | `exists` bool | duplicate add |
| `init` on TokenClaim PDA | `claimed` bool | **double claim** (B18) |

Making `Status` 1-based gives the will's existence flag for free — no extra byte.

### Bounded collections

| Collection | Cap | Why |
|---|---|---|
| custodians / will | 32 | Solana's `custodian_count` is `u8`; a >32-attester quorum is not a real use case |
| beneficiaries / will | 64 | bounds the teardown loop and the allocation sum |
| active media / will | 255 | exactly Solana's `u8 media_count` ceiling |
| token vaults / will | 32 | bounds the "all vaults swept" precondition |
| reverse role lists | **uncapped** | an owner can name anyone without consent, so a cap would be a griefing vector in itself (a griefer could fill a victim's list and block a legitimate naming). Removal is O(1), so writes are unaffected; reads are **paginated**. |

Every removal is O(1) swap-and-pop via a stored `listIndex` / `roleIndex`.

### Why nested mappings rather than `bytes32` ids

`mapping(address => mapping(address => Beneficiary))` compiles to
`keccak256(heir ‖ keccak256(owner ‖ slot))` — the same derivation a hand-written
`keccak256(abi.encode("beneficiary", owner, heir))` performs, with the storage
slot constant playing the role of the `b"beneficiary"` seed prefix. The nested
form additionally gives type safety (a custodian address cannot be passed where
an heir belongs) and removes the `encodePacked` collision footgun.

The one place an explicit composite id **is** the right tool is `_claims`, whose
key has four parts — `keccak256(abi.encode(owner, incarnation, token, heir))` —
including a non-address component. `abi.encode`, never `encodePacked`.

---

## 3. Access control

**No `Ownable`. No `AccessControl`. No roles enum. No admin address.**

Authorization is per-will and derived entirely from storage:

| Role | Check | Solana original |
|---|---|---|
| owner | `_wills[msg.sender]` — the key **is** the caller | `has_one = owner` + will PDA seeded by signer |
| custodian | `_custodians[owner][msg.sender].exists` | custodian PDA seeded by `custodian_signer` |
| heir | `_beneficiaries[owner][msg.sender].exists` | beneficiary PDA seeded by `beneficiary_signer` |
| cranker | none — timing-gated, proceeds pinned to `owner` | identical |

The owner case deserves emphasis: an owner-only function takes **no owner
parameter at all**. There is nothing to forge. Impersonation is not checked
against — it is unrepresentable. `test_ownerOnlyFunctionsRejectEveryNonOwner`
exercises all 11 owner-only functions against three different non-owners.

Every function's caller, in one table:

| Function | Caller | Status gate | Timing gate |
|---|---|---|---|
| `createWill` | anyone (for themself) | must not exist | — |
| `updateWill` | owner | Active | — |
| `deleteWill` | owner | Active | — |
| `addMedia` / `removeMedia` | owner | Active | — |
| `addCustodian` / `removeCustodian` | owner | Active | — |
| `addBeneficiary` / `removeBeneficiary` | owner | Active | — |
| `depositToken` / `withdrawToken` | owner | Active | — |
| `confirmDeath` | custodian | Active or Pending | `now >= lastActiveAt + threshold` |
| `revokeDeathConfirmation` | owner | Pending, or Claimable | `now < claimableAt + GRACE` |
| `registerRecipientKey` | heir | Active | — |
| `claimInheritance` | heir | Claimable | `now >= claimableAt + GRACE` |
| `claimToken` | heir | Claimable | `now >= claimableAt + GRACE` |
| `sweepTokenVault` | **anyone** | Claimable | `now >= claimableAt + GRACE + CLAIM_WINDOW` |
| `closeEstate` | **anyone** | Claimable | same |

---

## 4. Fund custody

### The model

```
depositToken   owner ──approve──► transferFrom ──► contract (pooled)
                                                   vault.totalDeposited += received
                                                   vault.remaining      += received

withdrawToken  vault.remaining ──► owner            (Active only, owner only)

claimToken     amount = min(totalDeposited * bps / 10_000, remaining)
               vault.remaining -= amount ──► msg.sender   (proven heir, after GRACE)

sweepTokenVault vault.remaining ──► will.owner            (anyone, after CLAIM_WINDOW)
```

### Three properties that do the work

1. **`totalDeposited` is a snapshot, never decremented.** An heir's entitlement
   is fixed at `floor(total × bps / 10 000)` regardless of who claims first
   (`test_claim_orderDoesNotChangeEntitlements`).
2. **`remaining` clamps every payout.** Rounding drift, edited allocations and
   partial deposits can never over-draw (`amount = min(share, remaining)`).
3. **Received, not requested.** Deposits credit the measured balance delta, so a
   fee-on-transfer token escrows what actually arrived and the ledger can never
   exceed reality (`test_deposit_creditsMeasuredDeltaForFeeOnTransferToken`).

### The solvency invariant

> For every ERC-20 `t`: `Σ_wills _vaults[w][t].remaining ≤ t.balanceOf(this)`

`≤`, not `=`: anyone can donate tokens, and surplus is never distributed.
Checked by invariant **I1**, and paired with **I2** (conservation against an
independent ghost tally) so a bug that inflated both sides equally would still
be caught.

### Push vs pull

| Path | Direction | Rationale |
|---|---|---|
| `claimToken` | **pull** — heir calls, receives to `msg.sender` | already pull-based; no push queue needed |
| `withdrawToken` | **pull** — owner calls, receives to `msg.sender` | same |
| `sweepTokenVault` | **push** to `will.owner` | the owner is dead and cannot call. Pinning the destination is what makes the crank permissionless-but-unprofitable, exactly as Anchor's `address = will.owner` constraint did. |

The one push is safe because ERC-20 `transfer` does not call the recipient, so a
contract owner cannot reject it or reenter through it. A blocklisting token can
make the sweep revert — it then fails **loudly** and leaves the vault intact and
retryable rather than clearing the ledger and losing the balance
(`test_sweep_failsSafelyWhenTheTokenBlocksTheEstate`).

### Checks-Effects-Interactions

Every value-moving function writes state before the external call:

```solidity
// claimToken
_claims[key] = TokenClaim({claimed: true, amount: uint248(amount)});  // effect
v.remaining = remaining - amount;                                     // effect
IERC20(token).safeTransfer(msg.sender, amount);                       // interaction
```

`depositToken` is the necessary exception — the delta cannot be measured before
the transfer — and is protected by `nonReentrant` plus a re-read of
`balanceOf` (`test_reentrantTokenCannotInflateDepositAccounting`).

---

## 5. Upgradeability: **immutable**

No proxy. No `initialize()`. No `delegatecall`. No admin. No pause.

| Option | Verdict |
|---|---|
| Immutable | **chosen** |
| Ownable | rejected — the Anchor program has no admin; adding one adds a trust assumption that does not exist today |
| AccessControl | rejected — same, plus more surface |
| UUPS | rejected — the upgrade key could rewrite `claimToken` and drain every vault |
| Transparent proxy | rejected — same, plus storage-collision risk |
| Factory + clones | rejected — see §1 |

The decisive argument is product-specific: this contract's entire promise is
*"your heirs can claim even though you are gone and nobody is running this
company any more."* A pause switch or an upgrade key is a person who can break
that promise. Over a decade-plus horizon, that is a larger risk than any bug an
upgrade path would let you fix.

Immutability also deletes whole vulnerability classes: initialization
front-running, uninitialised implementations, storage-layout skew, `delegatecall`
misuse, and function-selector clashes are all simply absent.

`test_contractExposesNoAdministrativeSurface` asserts the *absence* of
`owner()`, `pause()`, `upgradeTo()`, `initialize()` and friends — so if someone
later adds one, the design decision gets re-litigated deliberately rather than by
accident.

**Operational upgrade path:** deploy a new contract; owners (who are alive and
signing during `Active`) withdraw, delete, and re-create on the new address. No
protocol-level migration primitive is needed. Runbook in `MIGRATION_GUIDE.md`.

---

## 6. Reentrancy, pausing and emergency controls

**Reentrancy.** OpenZeppelin `ReentrancyGuard` on the four value-moving
functions: `depositToken`, `withdrawToken`, `claimToken`, `sweepTokenVault`.
Nothing else touches an external contract, so nothing else needs it. This has no
Solana counterpart — SPL Token is a fixed, audited program, whereas an ERC-20 is
arbitrary code the caller chooses. Four dedicated tests drive a callback-armed
token into each path.

**Pausing: none.** See §5. An inheritance protocol that can be frozen can be
frozen against the heir it exists to serve.

**Emergency controls: none, by construction.** There is no rescue function, no
sweep-to-admin, no fee switch. The emergency affordances that do exist are the
ones the protocol itself defines, and they belong to the users:

| Situation | Affordance | Who |
|---|---|---|
| death confirmed by mistake or malice | `revokeDeathConfirmation` within the 7-day grace | owner |
| custodian turns hostile | `removeCustodian` while Active | owner |
| owner changes their mind entirely | `withdrawToken` + `deleteWill` | owner |
| heirs never claim | `sweepTokenVault` returns everything to the estate | anyone |

---

## 7. Event strategy

The Anchor program emits **no events** — clients reconstruct state with
`getProgramAccounts`. EVM has no such primitive, so events here are the indexing
substrate, not a convenience. 19 events, one per state transition, `owner`
indexed on every one.

`CustodianAdded` / `BeneficiaryAdded` index **both** owner and member, which
makes "every will where I am a custodian" a single indexed `eth_getLogs` — the
direct replacement for the `memcmp(offset 40)` scan in the Solana client.

`TokenDeposited` carries both `requested` and `received` so a fee-on-transfer
discrepancy is visible off-chain without diffing balances.

`WillBecameClaimable` carries both derived deadlines so an indexer never needs to
know the protocol constants.

**Reads do not depend on events.** Array-returning view functions cover every
query the UI makes, so the app works against a plain RPC with no indexer and no
log retention. Events are for indexers and analytics — a second path, not the
only one. (§9 of `EVM_MIGRATION_DESIGN.md` explains why both.)

---

## 8. Error strategy

Custom errors throughout (`VaultErrors`), one per failure mode, no revert
strings. ~4 bytes of calldata versus ~64 for a string, and viem decodes them by
name against the ABI.

Anchor error codes are **positional** (custom codes from 6000), which is why the
Rust enum is append-only and carries a retired variant. Solidity errors are
identified by `bytes4(keccak256(signature))` — **name-derived** — so reordering
is harmless and the retired variant is not carried forward.

Naming follows the Rust original wherever the rule is the same
(`QuorumUnreachable`, `GracePeriodNotElapsed`, `ClaimWindowStillOpen`,
`NothingToRevoke`, `AlreadyApproved`, `AlreadyClaimed`, `NothingToClaim`,
`WillHasTokenVaults`, …), so a reviewer can diff the two protocols by error name.

---

## 9. Gas optimisation

Applied only after correctness and security were settled, and never at the cost
of either.

| Measure | Effect |
|---|---|
| `Will` packed into 2 slots | `confirmDeath` touches one slot |
| `Custodian` and `TokenClaim` in 1 slot each | one `SSTORE` per confirmation / claim |
| `Status` as a 1-based enum | existence flag for free |
| Custom errors | ~60 bytes less calldata per revert |
| `calldata` for `string cid` | no memory copy on the hot path |
| Storage pointers (`Will storage w`) | fields read once, not re-hashed |
| `unchecked` on provably-bounded counters | ~30 gas each, only where a cap proves the bound |
| O(1) swap-and-pop removal | no O(n) array shifting |
| Detach the **last** element during teardown | every swap becomes a no-op |
| `_page(...)` for reverse-role reads | bounded `eth_call` regardless of list length |

Measured (`forge test --gas-report`, median):

| Operation | Gas |
|---|---|
| `createWill` | ~95 k |
| `addCustodian` | ~140 k |
| `addBeneficiary` | ~145 k |
| `confirmDeath` (reaching quorum) | ~60 k |
| `depositToken` (new vault) | ~160 k |
| `depositToken` (top-up) | ~65 k |
| `claimToken` | ~80 k |
| `sweepTokenVault` | ~55 k |

Deliberately **not** done: inline-assembly `keccak256` (≈30 gas on paths called
a handful of times per will over its entire lifetime), `via_ir` (no measured
benefit, slower builds, different codegen to review), and transient storage for
the reentrancy guard (would force `evm_version = "cancun"` for ~2 k gas on four
functions — see `ROBINHOOD_CHAIN.md` §5).

---

## 10. Contract interaction diagram

```
                    ┌──────────────────────────────────────────┐
   owner ──────────►│                                          │
   (createWill,     │                                          │
    configure,      │           VaultInheritance               │
    deposit,        │            (immutable)                   │
    withdraw,       │                                          │
    revoke)         │  _wills          address => Will         │
                    │  _custodians     owner => addr => …      │
   custodian ──────►│  _beneficiaries  owner => addr => …      │
   (confirmDeath)   │  _media          owner => u16  => …      │
                    │  _vaults         owner => token => …     │
   heir ───────────►│  _claims         keccak(o,inc,t,h) => …  │
   (registerKey,    │                                          │
    claimInheritance│  + enumerable lists & reverse indices    │
    claimToken)     │                                          │
                    └───────────────┬──────────────────────────┘
   anyone ─────────►                │ SafeERC20
   (sweep, close)                   ▼
                          ┌──────────────────────┐
                          │   any ERC-20 token   │  ← the ONLY external call
                          └──────────────────────┘
```

The contract's entire external-call surface is `IERC20.balanceOf`,
`safeTransfer` and `safeTransferFrom`. No oracle, no router, no registry, no
`delegatecall`, no `CREATE2`, no native-value transfer.

---

## 11. Frontend interaction flow

```
connect wallet (wagmi injected / WalletConnect)
      ↓
detect chain  → wrong network? prompt switchChain(4663 | 46630)
      ↓
READ   useReadContract: getWill / getCustodians / getBeneficiaries /
                        getMedia / getTokenVaults / claimableAmount
                        custodianRolesOf / beneficiaryRolesOf   (paginated)
      ↓
WRITE  simulateContract  ← revert reason surfaces BEFORE the wallet prompt
      ↓
       writeContract     ← wallet signature
      ↓
       waitForTransactionReceipt({ confirmations })
      ↓
       invalidate the affected query keys → UI re-reads
```

Two things the Solana app did not have:

- **Simulation before signing.** Anchor's `.rpc()` signs first and fails after;
  `simulateContract` surfaces `QuorumUnreachable` (or any other custom error) as
  a readable message before the user is asked to sign.
- **Contract-computed gates.** `getWill` returns `quorumReachable`, `claimsOpen`,
  `teardownOpen` and `inactivityElapsed`, so buttons are enabled by the contract's
  own opinion rather than by a re-implementation of `constants.rs` in TypeScript.

Confirmation counts are chosen per action from one table (`lib/evm/tx.ts`),
reflecting Robinhood Chain's two-phase finality — see `ROBINHOOD_CHAIN.md` §6.

---

## 12. Testing architecture

| Layer | Files | Count |
|---|---|---|
| unit | `test/unit/{Will,Custodian,Beneficiary,Media,TokenEscrow,Teardown,Security}.t.sol` | 132 |
| fuzz | `test/fuzz/Fuzz.t.sol` (512 runs each) | 7 |
| invariant | `test/invariant/{Handler,VaultInvariants}.t.sol` (64 runs × 256 depth) | 10 properties |
| adversarial ERC-20s | `src/mocks/MockERC20.sol` | 6 variants |

**140 tests, 0 failures. 99.08 % lines, 100 % functions, 93.75 % branches** on
`VaultInheritance.sol`.

Every one of the 22 Solana LiteSVM tests has a named counterpart (mapping table
in `MIGRATION_GUIDE.md`), minus the two rent-specific assertions, which have no
EVM equivalent.

The invariant suite found two real bugs during development — counters drifting
during a partially completed `closeEstate` — which are now fixed and covered by
`test_closeEstate_keepsCountersConsistentMidTeardown`.
