# EVM_MIGRATION_DESIGN.md — Solana concepts → EVM equivalents

> Phase 2 deliverable. Read `MIGRATION_ANALYSIS.md` first: the business rules
> (B1–B29) referenced here are defined there.
>
> The rule this document follows: **where a faithful equivalent exists, use it;
> where none exists, redesign the component the way an EVM protocol would have
> been written in the first place, and say so explicitly.**

---

## 1. The mapping table

| Solana concept | EVM equivalent chosen here | Faithful, or redesigned? |
|---|---|---|
| Program (`vault_inheritance`) | One Solidity contract, `VaultInheritance.sol` | Faithful |
| Anchor instruction | `external` function | Faithful |
| Anchor account | Solidity `struct` in a `mapping` | Faithful |
| PDA | Nested mapping key (see §2) | Faithful — the compiler performs the same hash derivation |
| Account seeds | Mapping keys | Faithful |
| `Signer` | `msg.sender` | Faithful |
| `has_one = owner` | Mapping key **is** the owner; no back-reference needed | Faithful, simpler |
| Account ownership | Per-will role checks read from storage. **No `Ownable`, no `AccessControl`** (see §5) | Deliberate — matches the original's absence of any admin |
| SOL | Native ETH | **Not used** — the protocol never escrows SOL (see §4) |
| SPL Token | ERC-20 | Faithful, with new hardening (B27/B28) |
| Associated Token Account | The protocol contract's own ERC-20 balance + a per-vault `remaining` ledger | **Redesigned** — see §3 |
| Lamports | wei | N/A, no native value flows |
| Anchor event | Solidity `event` | **Expanded** — the Solana program emits none; EVM needs them (see §6) |
| Anchor `#[error_code]` | Custom errors (`error Foo();`) | Faithful |
| CPI | External call (`IERC20` via `SafeERC20`) | Faithful |
| `system_program::transfer` | *(unused — no native transfers)* | N/A |
| Rent | **No equivalent** (see §4) | Redesigned |
| Account closure (`close = x`) | `delete` storage + no value transfer | Redesigned |
| Program upgrade authority | **None — contract is immutable** (see §5) | Deliberate |
| Anchor IDL | Solidity ABI (`contracts/out/…/VaultInheritance.json` → `app/lib/evm/abi.ts`) | Faithful |
| Solana transaction | EVM transaction | Faithful |
| Recent blockhash | Account nonce | Faithful |
| Compute budget | Gas | Faithful |
| `Clock::get()?.unix_timestamp` (i64) | `block.timestamp` (uint256 → stored as uint40) | Faithful |
| Commitment / finality | Robinhood Chain soft confirmation → L1 posting → Ethereum finality | See `ROBINHOOD_CHAIN.md` §6 |
| `getProgramAccounts` + memcmp | Bounded on-chain index arrays **and** indexed events | **Redesigned** — see §7 |

---

## 2. PDAs → nested mappings (Phase 7 in detail)

### Why nested mappings and not `bytes32` ids

The brief suggests

```solidity
bytes32 beneficiaryId = keccak256(abi.encode("beneficiary", willId, recipient));
mapping(bytes32 => Beneficiary) beneficiaries;
```

That is correct, but it is **exactly what the compiler already emits** for

```solidity
mapping(address owner => mapping(address heir => Beneficiary)) beneficiaries;
```

whose slot is `keccak256(heir ‖ keccak256(owner ‖ slot))`. The nested form gives
the identical uniqueness guarantee with:

- **type safety** — you cannot accidentally pass a custodian address where an
  heir address belongs, or reuse an id across entity types;
- **no manual domain separation** — the storage slot constant plays the role of
  the `b"beneficiary"` seed prefix, and the compiler guarantees slots are
  distinct per declared mapping;
- **no id-collision surface** — `abi.encode` is collision-free but
  `abi.encodePacked` is not, and hand-rolled ids invite that mistake.

An explicit `bytes32` id is the right tool when the key is *composite and
variable-arity*, or when the id must be handed to users/other contracts. Neither
applies here: every child is keyed by at most (owner, one address-or-index).

**Decision: nested mappings for all six PDA families.** The `bytes32` form is
used nowhere.

### The derivation, side by side

| Entity | Solana seeds | Solidity declaration | Uniqueness preserved? |
|---|---|---|---|
| Will | `["will", owner]` | `mapping(address => Will) _wills` | ✅ one per owner |
| Custodian | `["custodian", will, wallet]` | `mapping(address => mapping(address => Custodian)) _custodians` | ✅ one per (will, wallet) |
| Beneficiary | `["beneficiary", will, wallet]` | `mapping(address => mapping(address => Beneficiary)) _beneficiaries` | ✅ one per (will, wallet) |
| MediaReference | `["mediareference", will, u16 LE]` | `mapping(address => mapping(uint16 => MediaReference)) _media` | ✅ one per (will, index) |
| TokenVault | `["tokenvault", will, mint]` | `mapping(address => mapping(address => TokenVault)) _vaults` | ✅ one per (will, token) |
| TokenClaim | `["tokenclaim", token_vault, wallet]` | `mapping(address => mapping(address => mapping(address => TokenClaim))) _claims` | ✅ one per (will, token, heir) |

`will` as a seed component collapses to the owner address because the will PDA is
itself derived from the owner — so `(will, wallet)` and `(owner, wallet)` index
the same set. This is a simplification, not a loss.

### Existence: the hardest single difference

On Solana, an account either exists (rent-funded, with a discriminator) or it
does not; `init` fails if it already exists, and that failure *is* a security
control in three places:

| Solana mechanism | Purpose | EVM replacement |
|---|---|---|
| `init` on the will PDA | reinitialization attack impossible (B1) | `if (w.status != Status.None) revert WillAlreadyExists();` |
| `init` on custodian / beneficiary PDA | duplicate add impossible | explicit `exists` bool, checked before write |
| `init` on the `TokenClaim` PDA | **double-claim guard** (B18) | explicit `claimed` bool, checked before transfer |

In Solidity every storage slot always "exists" and reads as zero, so each of
these becomes an explicit flag. The `Will` gets this for free by making `Status`
a 1-based enum: `None = 0` is the sentinel, so `status == None` ⇔ "no will".

### What is dropped, and why it is safe

| Dropped field | Reason |
|---|---|
| `bump` (every account) | PDA bump seeds have no EVM analogue; `mapping` slots need no canonicalisation |
| `will: Pubkey` back-reference (every child) | The mapping key already binds the child to the will. Anchor's `has_one = will` guarded against a caller *passing* the wrong account; on EVM the caller cannot pass a storage slot at all. |
| `wallet: Pubkey` (Custodian, Beneficiary) | It is the mapping key. Retained only inside the enumeration arrays. |
| `TokenVault.ata`, `TokenVault.vault` | No per-will token accounts exist on EVM (§3) |
| `TokenVault.token_mint` | It is the mapping key |
| `TokenClaim.token_vault`, `TokenClaim.beneficiary` | They are the mapping keys |
| `MediaReference.will` | Mapping key |

---

## 3. Token custody: the one genuinely different design

### The problem

On Solana, each will owns a distinct **associated token account** whose authority
is the will PDA. The tokens for will A and will B in the same mint sit in two
separate accounts, and `vault.amount` is an unambiguous per-will balance. The
program can (and does) read it directly: `amount.min(ctx.accounts.vault.amount)`.

On EVM there is no such thing. `IERC20(token).balanceOf(address(this))` is the
**sum over every will** in the protocol. Using it as any one will's balance would
let heirs of will A drain the escrow of will B.

### The replacement

Each vault carries its own ledger:

```solidity
struct TokenVault {
    bool    exists;
    uint32  listIndex;    // O(1) removal from the per-will token list
    uint256 totalDeposited; // cumulative, the share denominator  (≙ Solana total_amount)
    uint256 remaining;      // currently held for this will        (≙ Solana vault.amount)
}
```

- deposit:  `totalDeposited += received; remaining += received;`
- claim:    `amount = min(totalDeposited * bps / 10_000, remaining); remaining -= amount;`
- withdraw: `out = remaining; remaining = 0; delete vault;`
- sweep:    `out = remaining; remaining = 0; delete vault;`

`totalDeposited` is never decremented by a claim — exactly mirroring Solana,
where `total_amount` is a snapshot and the live `vault.amount` shrinks. The
`min(…)` clamp is preserved verbatim in meaning.

**Contract-level invariant (checked by the invariant test suite):**

> For every ERC-20 `t`: `Σ over all wills w of _vaults[w][t].remaining`
> `<= IERC20(t).balanceOf(address(this))`

`<=` rather than `==` because anyone can donate tokens to the contract, and
because a fee-on-transfer token can leave more behind than the ledger credits.
Donated surplus is unattributable and is never distributed — that is the safe
direction of the inequality.

### Fee-on-transfer and rebasing tokens (B27)

`transfer_checked` on Solana moves exactly `amount`. `IERC20.transferFrom` may
move less (transfer fee) or the balance may drift afterwards (rebasing).

**Deposit measures the delta:**

```solidity
uint256 before = token.balanceOf(address(this));
token.safeTransferFrom(msg.sender, address(this), amount);
uint256 received = token.balanceOf(address(this)) - before;
if (received == 0) revert InvalidAmount();
```

The vault is credited with `received`, never with `amount`. A fee-on-transfer
token therefore escrows slightly less than requested, which is correct and
visible in the `TokenDeposited` event.

**Rebasing tokens are documented as unsupported.** A negative rebase would make
`remaining` exceed the real balance and the last claimant would revert. The
contract cannot detect this generically. `SECURITY_REVIEW.md` records it as an
accepted, documented limitation with a user-facing warning in the UI — the same
posture every major EVM escrow takes.

---

## 4. Rent and native value: what disappears

### Rent

Solana rent is a refundable storage deposit. Ethereum has no storage deposit —
you pay gas to write and receive a (capped) refund to clear. There is therefore
**no economic reason for `cleanup_custodian`, `cleanup_beneficiary`,
`cleanup_media` or `close_will` to exist** on EVM.

They are nonetheless **preserved as a single `closeEstate()` crank**, for two
reasons that survive the platform change:

1. **Lifecycle parity (B21 / B1).** On Solana, `close_will` returns the owner
   address to a state where a new will can be created. Dropping it would make
   the EVM will permanent, which is a behavioural change.
2. **Semantics of `cleanup_beneficiary` (B13).** On Solana, closing an heir's
   account destroys their ability to `claim_token`. That is a *security-relevant*
   side effect, which is precisely why `require_teardown_open` gates it. The EVM
   version preserves the gate and the effect: `closeEstate()` may only run after
   `claimable_at + GRACE + CLAIM_WINDOW`, and it clears the heir records.

The four separate per-child cranks collapse into one because there is no
per-account rent to reclaim incrementally and no transaction-size limit forcing
the split. `closeEstate()` requires every token vault to have been swept first
(B21), exactly as `close_will` did.

### Native ETH

**The EVM contract holds no ETH and has no `receive()` or `payable` function.**

This is the faithful mapping, not an omission. §E of `MIGRATION_ANALYSIS.md`
establishes that the Solana program's only SOL movements are rent — there is no
`system_program::transfer`, no lamport arithmetic, no SOL deposit instruction and
no SOL beneficiary share. Adding native-ETH escrow would be **new business
logic**, not a migration, and RULE 4 of the brief is "preserve behaviour, not
implementation details".

Consequences, all deliberate:

- Sending ETH to the contract with a plain transfer **reverts** (no `receive`,
  no `fallback`).
- ETH can still be force-fed via `selfdestruct` or as a block-reward recipient.
  This is harmless here because **no accounting anywhere reads
  `address(this).balance`**. The forced ETH is simply stranded, which is the
  standard, safe outcome.
- The architecture is already shaped for native escrow as a future feature
  (`address(0)` as the token sentinel in the vault mappings). That is recorded
  in `README.md` → *Remaining TODOs*, not implemented.

---

## 5. Upgradeability, admin and pausing: none

**Decision: the contract is immutable. There is no owner, no admin role, no
pause switch, no fee switch, and no proxy.**

This is the single most consequential architectural choice in the migration, so
the reasoning is set out in full.

### Why immutable

1. **The Solana program has no admin.** There is no global config PDA, no
   authority field, no admin instruction, no fee. Introducing an `Ownable` owner
   or an `AccessControl` role would add a trust assumption that does not exist
   today — the opposite of preserving the security model.
2. **A pause switch is an attack on the core promise.** The product's entire
   value is "your heirs can claim even though you are gone and nobody is running
   this company any more". A pausable contract means a key-holder can freeze an
   heir's claim indefinitely. For an inheritance protocol with a decade-plus time
   horizon that is a worse risk than any bug a pause would mitigate.
3. **Upgradeability moves custody to the upgrader.** A UUPS or Transparent proxy
   over a contract that custodies user ERC-20 lets the upgrade key rewrite
   `claimToken` and drain every vault. The Solana program's BPF upgrade authority
   technically has the same power today — which is a latent risk in the current
   deployment, not a feature to carry forward. (Recommended action for the Solana
   deployment, out of scope here: `solana program set-upgrade-authority --final`.)
4. **Storage-collision and initialization-attack classes vanish.** No proxy means
   no `initialize()` front-running, no uninitialised-implementation hazard, no
   `delegatecall`, no storage-layout compatibility burden across versions.

### What replaces "upgrade" operationally

Deploy a **new contract** and migrate. Because every will is independent and the
owner is alive and signing during the `Active` phase, migration is just: owner
withdraws (`withdrawToken`), deletes the old will, creates a new one on the new
address. No protocol-level migration mechanism is needed, and `MIGRATION_GUIDE.md`
documents the runbook. This is strictly safer than an in-place upgrade.

### What "access control" means without `Ownable`

Every authorization is per-will and derived from storage — the direct analogue of
Anchor's `has_one` + PDA-seeded-by-signer pattern:

| Check | Solana | Solidity |
|---|---|---|
| owner of the will | `has_one = owner` + `Signer` | `_wills[msg.sender]` — the key **is** the caller |
| custodian of a will | PDA seeded by `custodian_signer` | `_custodians[owner][msg.sender].exists` |
| heir of a will | PDA seeded by `beneficiary_signer` | `_beneficiaries[owner][msg.sender].exists` |
| crank | none (timing-gated) | none (timing-gated), destination pinned to `owner` |

Note the elegance of the owner case: because the will is keyed by owner address,
an owner-only function takes **no owner parameter at all** and reads
`_wills[msg.sender]`. Impersonation is not merely checked against — it is
unrepresentable.

OpenZeppelin is used for exactly three things, all of them non-administrative:
`IERC20`, `SafeERC20`, and `ReentrancyGuard`. `Ownable`, `AccessControl`,
`Pausable` and the proxy modules are deliberately **not** imported.

---

## 6. Events: a required addition

The Solana program emits **no Anchor events** — only `msg!` logs, which are not
structured and not queryable. Clients reconstruct everything with
`getProgramAccounts`.

EVM has no `getProgramAccounts`. Events are therefore not a nicety here, they are
the indexing substrate. Every state transition emits one, with the will owner
indexed so a client can filter `eth_getLogs` by topic rather than scanning:

```
WillCreated(address indexed owner, uint64 inactivityThreshold, uint8 minApprovals)
WillUpdated(address indexed owner, uint64 inactivityThreshold, uint8 minApprovals, uint64 lastActiveAt)
WillDeleted(address indexed owner)
MediaAdded(address indexed owner, uint16 indexed mediaIndex, bytes16 mediaType, string cid)
MediaRemoved(address indexed owner, uint16 indexed mediaIndex)
CustodianAdded(address indexed owner, address indexed custodian)
CustodianRemoved(address indexed owner, address indexed custodian)
DeathConfirmed(address indexed owner, address indexed custodian, uint8 approvalsReceived, uint8 minApprovals)
WillBecameClaimable(address indexed owner, uint64 claimableAt, uint64 graceEndsAt, uint64 claimWindowEndsAt)
DeathConfirmationRevoked(address indexed owner, uint32 newApprovalEpoch)
BeneficiaryAdded(address indexed owner, address indexed heir, uint16 allocationBps)
BeneficiaryRemoved(address indexed owner, address indexed heir)
InheritanceClaimed(address indexed owner, address indexed heir)
RecipientKeyRegistered(address indexed owner, address indexed heir, bytes32 encryptionPubkey)
TokenDeposited(address indexed owner, address indexed token, uint256 requested, uint256 received, uint256 totalDeposited)
TokenWithdrawn(address indexed owner, address indexed token, uint256 amount)
TokenClaimed(address indexed owner, address indexed token, address indexed heir, uint256 amount)
TokenVaultSwept(address indexed owner, address indexed token, uint256 residual, address cranker)
EstateClosed(address indexed owner, address cranker)
```

`CustodianAdded` / `BeneficiaryAdded` index **both** owner and member, which is
what makes the reverse "wills where I am a custodian" query a single indexed
`eth_getLogs` — the direct replacement for the `memcmp(offset 40)` filter in
`lib/rolesFetch.ts`.

---

## 7. Replacing `getProgramAccounts`

`lib/willFetch.ts` and `lib/rolesFetch.ts` rely on scanning program accounts with
byte-offset filters. EVM has no equivalent primitive. Three options were weighed:

| Option | Pros | Cons |
|---|---|---|
| A. Events + `eth_getLogs` only | zero extra gas | needs log retention; a pruned/rate-limited RPC loses history; a dapp that must work in 30 years cannot depend on an archive node |
| B. On-chain enumerable arrays only | one `eth_call` returns everything; works against any RPC, forever | extra SSTORE per add/remove; unbounded arrays are a gas-DoS surface |
| C. **Both** | reads work with no indexer *and* an indexer is possible | the cost of B |

**Chosen: C.** For an inheritance protocol the decisive argument is longevity —
the heirs may interact with this contract long after the frontend, the indexer
and the company are gone, and "you need an archive node and a log indexer to
find out that you are an heir" is an unacceptable failure mode. The extra cost is
one warm SSTORE per membership change, on operations that happen a handful of
times per will.

The DoS surface is closed by **bounding every collection**:

| Collection | Cap | Rationale |
|---|---|---|
| custodians per will | 32 | `custodian_count` is `u8` on Solana; a quorum of >32 attesters is not a real use case |
| beneficiaries per will | 64 | bounds `closeEstate()` and the allocation loop |
| active media per will | 256 | `media_count` is `u8` on Solana (255); 256 keeps the array clearable |
| token vaults per will | 32 | bounds the "all vaults swept" check |

Removal is O(1) swap-and-pop using a stored `listIndex`, so no operation is O(n)
except the explicitly bounded teardown.

**Reverse indices** (`_custodianRoles[wallet]`, `_beneficiaryRoles[wallet]`) are
not capped — an owner can name any address without consent, so a griefer could
inflate a victim's list. This cannot brick any write (removal is O(1)) but could
make a naive `getAll…` view too expensive to `eth_call`. Mitigation: the view
functions are **paginated** (`offset`, `limit`). Recorded in
`SECURITY_REVIEW.md` as an accepted, mitigated griefing vector.

---

## 8. Timestamps, block numbers and the dead-man's switch

The entire protocol is timestamp-driven (B8, B12, B13). On Robinhood Chain:

- **`block.timestamp` is the correct source** and is used exclusively.
  Thresholds are days-to-years; sequencer timestamp drift (seconds) is
  immaterial. See `SECURITY_REVIEW.md` → *Timestamp manipulation*.
- **`block.number` is NOT used.** Per the official docs it returns an *L1 block
  number estimate* that "updates only periodically" on Arbitrum-based chains.
  Any block-height-based timing would be silently wrong.
- **`block.prevrandao` / `block.difficulty` are constant** on this chain and are
  not used for anything.
- **`blockhash(n)` is only reliable for recent blocks** and is not used.

Timestamps are stored as `uint40` (overflows in year 36812) to pack the `Will`
struct into two slots. Arithmetic is `unchecked`-free — Solidity 0.8 reverts on
overflow, matching the Rust `checked_add` / `MathOverflow` behaviour. The one
place Solana used `saturating_sub` (clock skew in `confirm_death`) becomes an
explicit comparison that cannot underflow:

```solidity
// Rust:      let elapsed = now.saturating_sub(will.last_active_at);
//            require!(elapsed >= will.inactivity_threshold, OwnerStillActive);
// Solidity:  compare without subtracting at all
if (block.timestamp < uint256(w.lastActiveAt) + w.inactivityThreshold) revert OwnerStillActive();
```

---

## 9. Type mapping

| Solana / Anchor | Solidity | Note |
|---|---|---|
| `Pubkey` | `address` | 32 bytes → 20 bytes. Not convertible; addresses are re-collected from users, not translated (see `MIGRATION_GUIDE.md` → data migration) |
| `i64` timestamp | `uint40` stored, `uint256` in memory | never negative in practice; `uint40` → year 36812 |
| `u64` amount | `uint256` | ERC-20 amounts are `uint256`; widening is lossless |
| `u16` bps | `uint16` | identical |
| `u8` counters | `uint8` | identical, with explicit caps |
| `u16 approval_epoch` | `uint32` | widened: cheap, removes a (theoretical) wrap after 65 535 revocations |
| `[u8; 32]` encryption pubkey | `bytes32` | exact fit; all-zero is still the "unregistered" sentinel |
| `[u8; 16]` media type | `bytes16` | exact fit, same zero-padded encoding |
| `[u8; 64]` IPFS CID | `string` (length 1..=64 enforced) | idiomatic; the 64-byte ceiling is kept so client encoding and the authz layer are unchanged |
| `Option<T>` instruction arg | sentinel `0` + explicit setter semantics | `updateWill(uint64 threshold, uint8 minApprovals)` where `0` means "leave unchanged" — `0` is already an invalid value for both (B2, B3), so the sentinel is unambiguous |
| `WillStatus` enum | `enum Status { None, Active, PendingInheritance, Claimable }` | `None` added as the existence sentinel |
| `Result<()>` / `require!` | revert with custom error | Faithful |

---

## 10. Instruction → function map

| Anchor instruction | Solidity function | Caller |
|---|---|---|
| `initialise_will` | `createWill(uint64 inactivityThreshold, uint8 minApprovals)` | owner |
| `update_will` | `updateWill(uint64 inactivityThreshold, uint8 minApprovals)` (`0` = unchanged) | owner |
| `delete_will` | `deleteWill()` | owner |
| `add_media_reference` | `addMedia(bytes16 mediaType, string calldata cid)` | owner |
| `remove_media_reference` | `removeMedia(uint16 mediaIndex)` | owner |
| `add_custodian` | `addCustodian(address custodian)` | owner |
| `remove_custodian` | `removeCustodian(address custodian)` | owner |
| `confirm_death` | `confirmDeath(address owner)` | custodian |
| `revoke_death_confirmation` | `revokeDeathConfirmation()` | owner |
| `add_beneficiary` | `addBeneficiary(address heir, uint16 allocationBps)` | owner |
| `remove_beneficiary` | `removeBeneficiary(address heir)` | owner |
| `claim_inheritance` | `claimInheritance(address owner)` | heir |
| `register_recipient_key` | `registerRecipientKey(address owner, bytes32 encryptionPubkey)` | heir |
| `add_token` | `depositToken(address token, uint256 amount)` | owner |
| `delete_token` | `withdrawToken(address token)` | owner |
| `claim_token` | `claimToken(address owner, address token)` | heir |
| `sweep_token_vault` | `sweepTokenVault(address owner, address token)` | anyone |
| `cleanup_custodian` | *(merged)* | — |
| `cleanup_beneficiary` | *(merged)* | — |
| `cleanup_media` | *(merged)* | — |
| `close_will` | `closeEstate(address owner)` | anyone |

21 instructions → 18 functions; the only consolidation is the four rent cranks
into one `closeEstate` (§4). Every business rule keeps a home.

Plus read-only views with no Solana counterpart (they replace
`getProgramAccounts`): `getWill`, `getCustodian(s)`, `getBeneficiary/ies`,
`getMedia`, `getTokenVault(s)`, `getClaim`, `willTimeline`,
`custodianRoles`/`beneficiaryRoles` (paginated), `quorumReachable`.

---

## 11. Frontend concept map

| Solana | EVM |
|---|---|
| `Connection` | viem `PublicClient` (wagmi `usePublicClient`) |
| `AnchorProvider` | wagmi config + connectors |
| `Program<Idl>` | `{ address, abi }` pair |
| `AnchorWallet` | wagmi `useAccount()` / `WalletClient` |
| `PublicKey` | `0x${string}` (`Address`) |
| `BN` | native `bigint` |
| `Transaction` + `sendAndConfirmTransaction` | `simulateContract` → `writeContract` → `waitForTransactionReceipt` |
| `program.methods.x().accounts({…}).rpc()` | `useWriteContract` + explicit simulation |
| `program.account.x.fetch()` | `useReadContract` |
| `getProgramAccounts` + memcmp | array-returning view functions (and `getLogs` for the indexer) |
| `willPda(owner)` etc. | *(nothing — the owner address is the key)* |
| Wallet-adapter `signMessage` (ed25519, base58) | `signMessage` (EIP-191 `personal_sign`, hex) |
| `explorer.solana.com/tx/…?cluster=` | Blockscout `…/tx/0x…` |

The transaction flow gains a step the Solana app never had — **simulation before
signing** — which surfaces a revert reason in the UI *before* the wallet prompt
instead of after a failed send.

---

## 12. Backend concept map

| Solana mechanism | EVM replacement |
|---|---|
| `getAccountInfo(willPda)` | `publicClient.readContract({ functionName: 'getWill' })` |
| `getProgramAccounts` + `dataSize` + `memcmp(discriminator)` + `memcmp(cid bytes)` in `authz.ts` | `getMediaByCid(cid)` view, or an indexed `MediaAdded` log query |
| `getMultipleAccountsInfo` | `multicall` |
| hand-rolled byte-offset decoding + `sha256("account:<Name>")` discriminators | typed ABI decoding — **the entire 280-line `authz.ts` decoding layer disappears** |
| ed25519 signature verification (`tweetnacl` + `bs58`) | `verifyMessage` (EIP-191 / ECDSA, with EIP-1271 support for smart accounts) |
| `getSignaturesForAddress` / `getTransaction` | `eth_getLogs` / `eth_getTransactionReceipt` |
| Anchor IDL event parsing | `parseEventLogs` against the ABI |

---

## 13. What is intentionally *not* carried over

| Dropped | Why |
|---|---|
| `bump` fields | no PDA canonicalisation on EVM |
| `has_one` back-references | the mapping key is the binding |
| `TokenVault.ata` / `.vault` | no per-will token accounts (§3) |
| rent accounting and the three per-child cranks | no storage deposit (§4) |
| `ErrorCode::DeprecatedVaultMigration` | ABI error selectors are name-derived, not positional — nothing to keep stable |
| `ErrorCode::CustomError` | never raised |
| Token-2022 / `TokenInterface` dual-program handling | ERC-20 has one interface; the `resolveTokenProgram` round-trip is gone |
| Associated-token-program account creation | the heir's "account" is a balance entry the ERC-20 creates implicitly |

## 14. What is intentionally *added*

| Added | Why |
|---|---|
| Events (§6) | EVM has no `getProgramAccounts`; events are the indexing substrate |
| Enumerable arrays + paginated views (§7) | ditto, without requiring an indexer |
| Collection caps | bound teardown gas; close a DoS surface arrays would otherwise open |
| Measured-delta deposits (B27) | ERC-20 may transfer less than requested; SPL never does |
| Per-vault `remaining` ledger (B28) | one contract holds many wills' balances (§3) |
| `address(0)` rejection (B29) | `address(0)` is a real hazard on EVM |
| `ReentrancyGuard` on token paths | ERC-20 is arbitrary code; SPL Token is not |
| Simulation before send (frontend) | surfaces revert reasons pre-signature |
