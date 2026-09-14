# MIGRATION_ANALYSIS.md — vault-inheritance (Solana/Anchor → EVM)

> Phase 1 deliverable. Produced by reading the complete repository **before any
> code was changed**. Nothing in this document is inferred from the prompt; every
> claim is traceable to a file and line in the Solana implementation.

---

## A. Existing Architecture

`vault-inheritance` is a **non-custodial digital will / dead-man's switch**.
An owner creates a *will*, names *custodians* (who can attest to their death) and
*beneficiaries* (heirs, with basis-point shares), escrows SPL tokens, and pins
client-encrypted documents to IPFS while recording only the CID on-chain. If the
owner stops checking in for longer than a configured inactivity threshold, a
quorum of custodians can flip the will to `Claimable`; after a grace period the
heirs pull their shares.

### Repository layout (as found)

```
inheritance_protocol/
├── Anchor.toml                      # cluster=devnet, program id 6sgj9...EhtY
├── Cargo.toml                       # workspace; overflow-checks=true in release
├── rust-toolchain.toml
├── excute_idl_update.sh             # copies target/idl + target/types into app/lib/idl
├── workflows/ci_cd.yml              # GitHub Actions: anchor build/test + Next build + pm2 deploy
├── programs/vault-inheritance/
│   ├── Cargo.toml                   # anchor-lang 1.1.2, anchor-spl 1.1.2, litesvm dev-dep
│   ├── src/
│   │   ├── lib.rs                   # #[program] — 21 instructions
│   │   ├── constants.rs             # PDA seeds, MAX_ALLOCATION_BPS, GRACE/CLAIM windows
│   │   ├── error.rs                 # single #[error_code] enum, append-only
│   │   ├── state.rs                 # Will, Custodian, Beneficiary, MediaReference,
│   │   │                            #   TokenVault, TokenClaim, WillStatus
│   │   └── instructions/
│   │       ├── will.rs              # initialise_will / update_will / delete_will
│   │       ├── mediareference.rs    # add_media_reference / remove_media_reference
│   │       ├── custodian.rs         # add/remove_custodian, confirm_death, revoke_death_confirmation
│   │       ├── beneficiary.rs       # add/remove_beneficiary, claim_inheritance, register_recipient_key
│   │       ├── token.rs             # add_token, delete_token, claim_token, sweep_token_vault
│   │       └── cleanup.rs           # cleanup_{custodian,beneficiary,media}, close_will
│   └── tests/test_audit.rs          # 22 LiteSVM integration tests (1712 lines)
└── app/                             # Next.js 16 (App Router) + React 19 + Redux Toolkit
    ├── lib/
    │   ├── config.ts                # PROGRAM_ID, CLUSTER, RPC_ENDPOINT, SEEDS, window constants
    │   ├── anchor.ts                # Program factory + every PDA derivation + [u8;N] codecs
    │   ├── willFetch.ts             # getProgramAccounts sweep → WillBundle
    │   ├── rolesFetch.ts            # reverse lookup: wills where I am heir/custodian
    │   ├── inheritance.ts           # post-death timeline maths (mirrors constants.rs)
    │   ├── willReadiness.ts         # pre-flight mirror of require_quorum_reachable
    │   ├── tokens.ts                # SPL display metadata
    │   ├── crypto.ts                # client-side envelope encryption (AES-GCM + X25519)
    │   └── server/
    │       ├── session.ts           # wallet-signature sessions (ed25519 + HMAC cookie)
    │       ├── authz.ts             # on-chain entitlement check by raw byte offsets
    │       ├── guard.ts             # session / rate limit / upload quota / CID validation
    │       └── pinata.ts            # server-side Pinata SDK (JWT never reaches browser)
    ├── app/api/                     # auth/{challenge,verify,session,logout}, ipfs/{upload,retrieve,delete,update,metadata}
    ├── hooks/                       # useVault (all 21 instructions), useWill, useVaultSession, …
    ├── app/store/                   # Redux: willSlice (byOwner cache) + rolesSlice
    └── app/components/              # dashboard (beneficiary/custodian/file/inheritance/…) + landing page
```

### Runtime topology

```
 Browser (Next.js client)
   │  wallet-adapter → Phantom/Solflare (Wallet Standard)
   ├──► Solana devnet RPC ──► program 6sgj9jnnFcYem1u3N4wCfMdtTeeQRf7uT2AGWRU5EhtY
   │        reads:  getAccountInfo, getProgramAccounts(+memcmp), getMultipleAccountsInfo
   │        writes: Anchor .rpc() — sign + sendAndConfirm
   └──► Next.js route handlers (same origin, Node runtime)
            ├─ /api/auth/*   — ed25519 challenge → HttpOnly HMAC session cookie
            └─ /api/ipfs/*   — session + on-chain authz → Pinata private pinning
                                  (server holds PINATA_JWT_TOKEN; browser never does)
```

**There is no database and no indexer.** All state lives on-chain; the client
reconstructs lists with `getProgramAccounts` + memcmp filters. Redux is a
request-level cache, not a persistence layer.

**Confidentiality model.** Documents are sealed in the browser
(`lib/crypto.ts`): a random AES-256-GCM data key encrypts the file *and its own
metadata*, and that data key is sealed with `nacl.box` (X25519 +
XSalsa20-Poly1305, ephemeral sender) once per recipient — the owner plus every
heir who has published an `encryption_pubkey` on-chain. Only the container
(`VSEAL1` magic ‖ u32 header length ‖ JSON header ‖ AES-GCM body) is pinned. The
chain therefore stores a CID that proves *a document exists*, nothing more. The
owner's and heirs' X25519 identities are **derived deterministically from a
wallet signature** over `KEY_DERIVATION_MESSAGE`, hashed with SHA-512 and
truncated to 32 bytes — so no key material is ever stored anywhere.

---

## B. Smart Contract Inventory

All 21 instructions in `programs/vault-inheritance/src/lib.rs`.
"State changes" lists only mutations to program-owned accounts.

| Solana Instruction | Purpose | Accounts | Signers | State Changes | External Calls |
|---|---|---|---|---|---|
| `initialise_will(inactivity_threshold: i64, min_approval: u8)` | Create the per-owner will and arm the dead-man's switch | `owner(mut)`, `will(init, PDA[will,owner])`, `system_program` | owner | creates `Will`; sets `owner`, `status=Active`, `created_at=last_active_at=now`, `inactivity_threshold`, `claimable_at=0`, all counters 0, `min_approvals`, `approval_epoch=1`, `bump` | System (account create) |
| `update_will(Option<i64>, Option<u8>)` | Liveness ping and/or re-tune threshold & quorum | `owner(mut)`, `will(mut, has_one=owner, status==Active)` | owner | optionally `inactivity_threshold`, `min_approvals`; **always** `last_active_at=now` | — |
| `delete_will()` | Owner deletes an Active will, rent refunded | `owner(mut)`, `will(mut, close=owner, has_one=owner, status==Active)`, `system_program` | owner | closes `Will` (requires `token_vault_count==0` and media/custodian/beneficiary counts all 0) | System (lamport transfer) |
| `add_media_reference(media_type: [u8;16], ipfs_cid: [u8;64])` | Record an IPFS CID of a client-encrypted file | `owner(mut)`, `will(mut, has_one, Active)`, `media_reference(init, PDA[mediareference, will, media_index_le])`, `system_program` | owner | creates `MediaReference`; `will.media_index += 1`; `will.media_count += 1`. Pre-guard `require_quorum_reachable` | System |
| `remove_media_reference(media_index: u16)` | Drop a CID, refund rent | `owner(mut)`, `will(mut, has_one, Active, media_count>0)`, `media_reference(mut, close=owner, has_one=will)` | owner | closes `MediaReference`; `will.media_count -= 1` | System |
| `add_custodian()` | Register a death-attesting custodian | `owner(mut)`, `will(mut, has_one, Active)`, `custodian(init, PDA[custodian, will, wallet_key])`, `wallet_key(unchecked)`, `system_program` | owner | creates `Custodian{will, wallet, last_approved_time=0, has_approved=false, approved_epoch=0}`; `will.custodian_count += 1` | System |
| `remove_custodian()` | Deregister a custodian | `owner(mut)`, `will(mut, has_one, Active)`, `custodian(mut, close=owner, has_one=will)`, `wallet_key` | owner | closes `Custodian`; `custodian_count -= 1`; if the removed custodian's approval was in the current epoch, `approvals_received -= 1`. Refuses if `new_count != 0 && min_approvals > new_count` | System |
| `confirm_death()` | Custodian attests the owner is gone | `custodian_signer`, `will(mut, PDA[will, will.owner], status ∈ {Active, PendingInheritance})`, `custodian(mut, PDA[custodian, will, signer], has_one=will)` | custodian | requires `now - last_active_at >= inactivity_threshold`; sets `has_approved`, `approved_epoch=will.approval_epoch`, `last_approved_time`; `approvals_received += 1`; at quorum → `status=Claimable`, `claimable_at=now`, else `status=PendingInheritance` | — |
| `revoke_death_confirmation()` | Owner's escape hatch — cancel an in-flight confirmation | `owner(mut)`, `will(mut, has_one=owner)` *(deliberately not status-gated)* | owner | requires `Pending`, or `Claimable && now < grace_ends_at`; sets `status=Active`, `approvals_received=0`, `claimable_at=0`, `approval_epoch += 1`, `last_active_at=now` | — |
| `add_beneficiary(allocation_percentage: u16)` | Name an heir with a bps share | `owner(mut)`, `will(mut, has_one, Active)`, `beneficiary(init, PDA[beneficiary, will, wallet_key])`, `wallet_key`, `system_program` | owner | creates `Beneficiary{will, wallet, allocation_percentage, has_claimed=false, encryption_pubkey=[0;32]}`; `total_allocated_percentage += alloc` (≤10000); `beneficiary_count += 1` | System |
| `remove_beneficiary()` | Un-name an heir | `owner(mut)`, `will(mut, has_one, Active)`, `beneficiary(mut, close=owner, has_one=will)`, `wallet_key` | owner | closes `Beneficiary`; `total_allocated_percentage -= alloc`; `beneficiary_count -= 1` | System |
| `claim_inheritance()` | Heir accepts the (document) estate | `beneficiary_signer`, `will(mut, status==Claimable)`, `beneficiary(mut, PDA[…,signer], has_one=will)` | beneficiary | requires `now >= grace_ends_at`; requires `!has_claimed`; sets `has_claimed=true`; `beneficiaries_claimed += 1` | — |
| `register_recipient_key(encryption_pubkey: [u8;32])` | Heir publishes their X25519 key | `beneficiary_signer(mut)`, `will(read-only)`, `beneficiary(mut, PDA[…,signer], has_one=will)` | beneficiary | requires `will.status == Active` and key ≠ all-zero; sets `beneficiary.encryption_pubkey` | — |
| `add_token(amount: u64)` | Escrow (or top up) an SPL mint | `owner(mut)`, `will(mut, has_one, Active, custodian_count>0)`, `token_mint`, `token_vault(init_if_needed, PDA[tokenvault, will, mint])`, `ata(owner's)`, `vault(init_if_needed ATA, authority=will)`, token/ATA/system programs | owner | `require_quorum_reachable`; `token_vault.total_amount += amount` (accumulates); if newly created, `will.token_vault_count += 1` | **CPI** `transfer_checked` owner ATA → will vault ATA; ATA create |
| `delete_token()` | Living owner withdraws the whole escrow | `owner(mut)`, `will(mut, has_one, Active)`, `token_mint`, `token_vault(mut, close=owner, has_one=will, has_one=token_mint)`, `ata`, `vault`, token/system programs | owner | closes `TokenVault`; `will.token_vault_count -= 1` | **CPI** `transfer_checked` vault → owner ATA (will PDA signs), then `close_account` vault → owner |
| `claim_token()` | Heir pulls their share of one mint | `beneficiary_signer(mut)`, `will(mut, Claimable)`, `beneficiary(PDA[…,signer], has_one=will)`, `token_vault(mut, has_one=will, has_one=token_mint)`, `token_mint`, `vault`, `beneficiary_ata(init_if_needed)`, `token_claim(init, PDA[tokenclaim, token_vault, signer])`, programs | beneficiary | requires `now >= grace_ends_at`, `bps > 0`; `amount = min(total_amount*bps/10000, vault.amount)`, `amount > 0`; creates `TokenClaim{token_vault, beneficiary, amount}` — **its existence is the double-claim guard** | **CPI** `transfer_checked` vault → heir ATA (will PDA signs); ATA create |
| `sweep_token_vault()` | Permissionless: residual tokens → estate, close vault | `cranker(mut)`, `owner(unchecked, address=will.owner)`, `will(mut, Claimable)`, `token_mint`, `token_vault(mut, close=owner, has_one×2)`, `vault`, `owner_ata(init_if_needed)`, programs | cranker (any) | requires `now >= claim_window_ends_at`; closes `TokenVault`; `token_vault_count -= 1` | **CPI** `transfer_checked` residual vault → owner ATA; `close_account` vault → owner |
| `cleanup_custodian()` | Permissionless rent reclaim | `cranker(mut)`, `owner(address=will.owner)`, `will(mut, Claimable)`, `custodian(mut, close=owner, has_one=will)` | cranker | requires `now >= claim_window_ends_at`; closes `Custodian`; `custodian_count -= 1` | System |
| `cleanup_beneficiary()` | Permissionless rent reclaim | `cranker(mut)`, `owner(address=will.owner)`, `will(mut, Claimable)`, `beneficiary(mut, close=owner, has_one=will)` | cranker | same gate; closes `Beneficiary`; `beneficiary_count -= 1` | System |
| `cleanup_media()` | Permissionless rent reclaim | `cranker(mut)`, `owner(address=will.owner)`, `will(mut, Claimable)`, `media_reference(mut, close=owner, has_one=will)` | cranker | same gate; closes `MediaReference`; `media_count -= 1` | System |
| `close_will()` | Permissionless: close the estate root | `cranker(mut)`, `owner(address=will.owner)`, `will(mut, close=owner, Claimable)` | cranker | same gate; requires `token_vault_count == 0` and media/custodian/beneficiary counts all 0; closes `Will` | System |

### Access-control summary

| Role | How it is proven | Instructions |
|---|---|---|
| **Owner** | `has_one = owner` + `Signer` + will PDA derived from `owner` | `update_will`, `delete_will`, `add/remove_media_reference`, `add/remove_custodian`, `revoke_death_confirmation`, `add/remove_beneficiary`, `add_token`, `delete_token` |
| **Custodian** | `Custodian` PDA seeded by `custodian_signer` + `has_one = will` | `confirm_death` |
| **Beneficiary** | `Beneficiary` PDA seeded by `beneficiary_signer` + `has_one = will` | `claim_inheritance`, `register_recipient_key`, `claim_token` |
| **Anyone (crank)** | no identity check; destination pinned via `address = will.owner` + timing gate | `sweep_token_vault`, `cleanup_*`, `close_will` |

There is **no global admin, no program-level config account, no pause switch and
no fee**. The only privileged key in the whole system is the BPF upgrade
authority, which is outside the program.

---

## C. State Inventory

Every persistent state object the program owns.

| Account | Cardinality | Fields | Lifetime |
|---|---|---|---|
| **`Will`** | 1 per owner wallet | `owner: Pubkey`, `will_status: WillStatus`, `created_at/last_active_at/inactivity_threshold/claimable_at: i64`, `media_count: u8`, `media_index: u16`, `custodian_count: u8`, `min_approvals: u8`, `approvals_received: u8`, `beneficiaries_claimed: u8`, `beneficiary_count: u32`, `token_vault_count: u16`, `approval_epoch: u16`, `total_allocated_percentage: u16`, `bump: u8` | `initialise_will` → `delete_will` (alive) or `close_will` (post-death) |
| **`Custodian`** | 1 per (will, wallet) | `will`, `wallet`, `last_approved_time: i64`, `has_approved: bool`, `approved_epoch: u16`, `bump` | `add_custodian` → `remove_custodian` / `cleanup_custodian` |
| **`Beneficiary`** | 1 per (will, wallet) | `will`, `wallet`, `allocation_percentage: u16`, `has_claimed: bool`, `encryption_pubkey: [u8;32]`, `bump` | `add_beneficiary` → `remove_beneficiary` / `cleanup_beneficiary` |
| **`MediaReference`** | 1 per (will, media_index) | `will`, `media_index: u16`, `media_type: [u8;16]`, `ipfs_cid: [u8;64]`, `bump` | `add_media_reference` → `remove_media_reference` / `cleanup_media` |
| **`TokenVault`** | 1 per (will, mint) — *metadata only* | `will`, `token_mint`, `ata`, `vault`, `total_amount: u64`, `bump` | `add_token` (init_if_needed) → `delete_token` / `sweep_token_vault` |
| **vault ATA** | 1 per (will, mint) — *holds the tokens*; SPL-owned, authority = will PDA | SPL `TokenAccount` | created by `add_token`, closed by `delete_token` / `sweep_token_vault` |
| **`TokenClaim`** | 1 per (token_vault, beneficiary) | `token_vault`, `beneficiary`, `amount: u64`, `bump` | created by `claim_token`; **never closed** (permanent double-claim guard) |

`WillStatus` = `Active | PendingInheritance | Claimable` (unit enum, 1 byte).

No "global state", no admin state, no configuration account exists. The
`GRACE_PERIOD_SECONDS` / `CLAIM_WINDOW_SECONDS` / `MAX_ALLOCATION_BPS` values are
compile-time `#[constant]`s, not stored state.

---

## D. PDA Inventory

| PDA | Seeds | Authority (who may mutate) | Data stored | Lifecycle | Who can close | Proposed EVM representation |
|---|---|---|---|---|---|---|
| **Will** | `["will", owner]` | owner (all config); custodians (`confirm_death` mutates status/tally); heirs (`claim_inheritance` bumps tally); cranks (counters) | the `Will` struct above | born on `initialise_will`; one per owner, ever | owner while `Active` (`delete_will`); anyone after the claim window (`close_will`) | `mapping(address owner => Will)`. The seed *is* the owner address, so the mapping key is the owner and no id needs inventing. `status == None(0)` is the "account does not exist" sentinel. |
| **Custodian** | `["custodian", will, custodian_wallet]` | owner (create/close); the custodian themself (`confirm_death`) | back-ref, wallet, approval flag + epoch + time | add → remove/cleanup | owner while `Active`; any cranker after the claim window | `mapping(address owner => mapping(address custodian => Custodian))`. Solidity hashes `keccak256(custodian ‖ keccak256(owner ‖ slot))` — structurally the same derivation the PDA performs, so uniqueness per (will, wallet) is preserved by construction. |
| **Beneficiary** | `["beneficiary", will, heir_wallet]` | owner (create/close/alloc); the heir themself (`register_recipient_key`, `claim_inheritance`) | back-ref, wallet, bps, `has_claimed`, X25519 key | add → remove/cleanup | owner while `Active`; any cranker after the claim window | `mapping(address owner => mapping(address heir => Beneficiary))` |
| **MediaReference** | `["mediareference", will, media_index.to_le_bytes()]` | owner only | back-ref, index, mime, CID | add → remove/cleanup | owner while `Active`; any cranker after the claim window | `mapping(address owner => mapping(uint16 index => MediaReference))`. `media_index` stays a **monotonic** counter so a removed slot's key is never reused — exactly the property the LE-bytes seed gave. |
| **TokenVault** | `["tokenvault", will, mint]` | owner (deposit/withdraw); heirs (claim decrements the held balance); cranker (sweep) | back-ref, mint, ata, vault, `total_amount` | `init_if_needed` on first deposit → delete/sweep | owner while `Active`; any cranker after the claim window | `mapping(address owner => mapping(address token => TokenVault))`. **The `ata` and `vault` fields disappear**: on EVM there is no per-owner token account — the single protocol contract holds every will's ERC-20 balance, so the vault must carry its own `remaining` ledger (see §H-9). |
| **vault ATA** | ATA derivation `[will, token_program, mint]`, authority = will PDA | will PDA signs via seeds | SPL token balance | created/closed with the vault | `delete_token` / `sweep_token_vault` | **No equivalent.** ERC-20 balances live in one `mapping(holder => uint256)` inside the token contract; the protocol contract is a single holder. Replaced by the per-vault `remaining` accounting field. |
| **TokenClaim** | `["tokenclaim", token_vault, heir_wallet]` | created once by the heir; never mutated | vault ref, heir, amount | created on first claim; never closed | nobody | `mapping(address owner => mapping(address token => mapping(address heir => TokenClaim)))`. The PDA's *existence* was the guard; on EVM an explicit `claimed` bool replaces it, because storage always "exists" and reads as zero. |

---

## E. Token / SOL Flow

### There is no SOL escrow in this protocol
Grep-verified: the program contains **no `system_program::transfer` CPI and no
manual lamport arithmetic**. Every lamport movement is Anchor's `init` (payer →
new account, i.e. rent) and `close = …` (rent → destination). That is the whole
SOL story:

```
owner wallet ──rent──► Will / Custodian / Beneficiary / MediaReference / TokenVault PDAs
                          │
       (alive)  delete_*  ├──rent──► owner wallet
       (dead)   cleanup_* ┴──rent──► will.owner   (pinned via `address = will.owner`)
heir  wallet ──rent──► TokenClaim PDA + their own ATA            (never refunded)
cranker      ──rent──► owner_ata (if it must be created in sweep) (never refunded)
```

Rent is a Solana storage deposit. **It has no EVM equivalent** (see
`EVM_MIGRATION_DESIGN.md` §Rent). Consequently the four `cleanup_*` /
`close_will` cranks exist *purely* to recover rent — their financial purpose
vanishes on EVM, though one of them (`cleanup_beneficiary`) also carries a
security-relevant side effect that must be reasoned about (§H-12).

### SPL token flow (the real fund movement)

```
DEPOSIT  (owner, will Active, quorum reachable, custodian_count > 0)
  owner ──approve/sign──► owner ATA ──transfer_checked──► vault ATA (authority = will PDA)
                                                   token_vault.total_amount += amount   [cumulative]

WITHDRAW (owner, will Active)  — delete_token
  vault ATA ──transfer_checked (will PDA signs)──► owner ATA        [entire balance]
  vault ATA ──close_account──► owner                                 [rent]
  TokenVault closed → will.token_vault_count -= 1

INHERIT  (heir, will Claimable, now >= claimable_at + GRACE)  — claim_token
  share  = token_vault.total_amount * beneficiary.allocation_percentage / 10_000
  amount = min(share, vault.amount)            require amount > 0
  vault ATA ──transfer_checked (will PDA signs)──► heir ATA
  TokenClaim PDA created (existence == claimed)

SWEEP    (anyone, now >= claimable_at + GRACE + CLAIM_WINDOW)  — sweep_token_vault
  vault ATA ──transfer_checked (will PDA signs)──► will.owner ATA    [all residual]
  vault ATA ──close_account──► will.owner
  TokenVault closed → will.token_vault_count -= 1
```

**Two accounting facts that drive the EVM design:**

1. `total_amount` is a **cumulative snapshot**, not a live balance. Each heir's
   share is computed against the total ever escrowed, so an early claimer does
   not dilute a later one. The `min(share, vault.amount)` clamp is what keeps the
   sum of shares from over-drawing when allocations are edited or rounding
   accumulates.
2. Allocations **need not sum to 100 %**. Deliberate under-allocation, integer
   floor-rounding dust, and the share of any heir who never claims all remain in
   the vault and are returned to the estate by `sweep_token_vault`. Nothing is
   stranded, and nothing is over-distributed.

**Invariant (C2):** the will PDA is the vault ATA's *only* possible authority, so
`delete_will` and `close_will` both refuse while `token_vault_count > 0`.
Closing the will first would strand the balance behind a signer that can never
exist again.

---

## F. Frontend Flow

Every blockchain interaction, grouped by direction.

### Wallet & provider
- `app/providers.tsx` — `ConnectionProvider(RPC_ENDPOINT)` → `WalletProvider(wallets=[], autoConnect)` → `WalletModalProvider`. Empty wallet array relies on Wallet-Standard auto-discovery.
- `hooks/useVault.ts` — `useConnection()` + `useAnchorWallet()` → `getProgram()`; falls back to `getReadonlyProgram()` (dummy `PublicKey.default` wallet) when disconnected so reads work signed-out.

### Reads
| Where | Call | Purpose |
|---|---|---|
| `lib/willFetch.ts` | `program.account.will.fetchNullable(willPda(owner))` | the will, or `null` |
| `lib/willFetch.ts` | `connection.getProgramAccounts(programId, {filters:[memcmp(discriminator), memcmp(offset 8 = will)]})` ×4, decoded per-account (`allTolerant`) so one stale layout cannot blank the page | media / custodians / beneficiaries / token vaults of a will |
| `lib/rolesFetch.ts` | `program.account.{beneficiary,custodian}.all([memcmp(offset 40 = wallet)])` then `will.fetchMultiple` | "wills where I am an heir / a custodian" |
| `hooks/useTokenBalances.ts` | parsed token accounts by owner | the user's SPL balances |
| `hooks/useTokenEscrow.ts` | `connection.getParsedAccountInfo(mint)` | mint validation + decimals probe |
| `lib/anchor.ts` | `connection.getAccountInfo(mint).owner` (`resolveTokenProgram`) | Token vs Token-2022 program, needed for correct ATA derivation |

### Writes — all 21 instructions are wrapped in `hooks/useVault.ts`
`createWill, updateWill, deleteWill, addMedia, removeMedia, addCustodian,
removeCustodian, confirmDeath, revokeDeathConfirmation, addBeneficiary,
removeBeneficiary, claimInheritance, registerRecipientKey, addToken,
removeToken, claimToken, sweepTokenVault, cleanupMedia, cleanupCustodian,
cleanupBeneficiary, closeWill`

Pattern for every one:
```ts
program.methods.<ix>(...args)
  .accountsPartial({ /* explicit PDAs from lib/anchor.ts */ })
  .rpc()                       // sign + send + confirm('confirmed') in one step
→ returns signature → caller calls refresh() → Redux thunk re-runs fetchWillBundle
```
There is **no simulation step** and no receipt inspection; Anchor's `.rpc()`
confirms at `confirmed` commitment and throws on failure, and
`lib/utils.ts#humanizeError` scrapes `Error Message: …` out of the thrown log.

### PDA derivation on the client
`lib/anchor.ts` re-implements every seed: `willPda`, `custodianPda`,
`beneficiaryPda`, `mediaPda` (u16 little-endian!), `tokenVaultPda`,
`tokenClaimPda`, plus `getAta` and `resolveTokenProgram`.

### Client-side encoding of contract types
- `strToFixedBytes` / `fixedBytesToStr` — `[u8; N]` ⇄ string, zero-padded, with a UTF-8-boundary-safe truncation option
- `mediaTypeToBytes` (16 bytes, truncating), `cidToBytes` / `bytesToCid` (64 bytes, strict)
- `BN` for `u64` amounts and `i64` timestamps

### Derived UI logic that mirrors the program
- `lib/inheritance.ts` — recomputes `grace_ends_at` / `claim_window_ends_at` and maps them to phases `active | pending | grace | open | closed`, plus urgency ordering.
- `lib/willReadiness.ts` — mirrors `require_quorum_reachable` **before** the user spends time encrypting and pinning a file.
- `lib/config.ts` — asserts `NEXT_PUBLIC_SOLANA_CLUSTER` agrees with `NEXT_PUBLIC_RPC_ENDPOINT`, and refuses to start without `NEXT_PUBLIC_PROGRAM_ID`.

### Wallet signatures that are *not* transactions
1. **API sign-in** (`useVaultSession`) — `signMessage` over the server's challenge; base58 signature → `/api/auth/verify` → HttpOnly cookie.
2. **Document identity** (`useVaultIdentity` → `lib/crypto.ts#deriveRecipientKeypair`) — `signMessage(KEY_DERIVATION_MESSAGE)`, SHA-512, truncate to 32 → X25519 secret key. Never leaves the browser, never sent to the server.

---

## G. Backend Flow

The "backend" is Next.js route handlers on the same origin (Node runtime). There
is no database, no queue and no indexer.

| Route | Method | Chain interaction | Notes |
|---|---|---|---|
| `/api/auth/challenge` | GET | validates the wallet is a valid `PublicKey` | issues HMAC-signed single-use nonce, 2-min TTL, rate-limited per wallet |
| `/api/auth/verify` | POST | `nacl.sign.detached.verify` (ed25519) over the exact challenge text | sets `vault_session` cookie: HttpOnly, SameSite=Strict, Secure in prod, 12 h |
| `/api/auth/session` | GET | — | echoes the cookie's wallet |
| `/api/auth/logout` | POST | — | clears the cookie |
| `/api/ipfs/upload` | POST | — | requires session + rate limit + 25 MB/file + 200 MB/wallet/hour; **rejects any body not starting with `VSEAL1`**; pins privately to Pinata; returns CID |
| `/api/ipfs/retrieve` | GET | `authorizeCid(wallet, cid, "read")` | short-lived private gateway access link; response forced to `application/octet-stream` + `attachment` + `nosniff` |
| `/api/ipfs/metadata` | GET | `authorizeCid(…, "read")` | returns only id/cid/size/created_at — the real filename lives encrypted inside the container |
| `/api/ipfs/update` | POST | `authorizeCid(…, "write")` | renames the *pin label* only |
| `/api/ipfs/delete` | POST | `authorizeCid(…, "write")` | resolves the file id server-side from the authorized CID; idempotent |

### `lib/server/authz.ts` — the on-chain entitlement check

This is the most chain-coupled backend component.

1. `getProgramAccounts(PROGRAM_ID, filters: [dataSize=123, memcmp(0, MediaReference discriminator), memcmp(58, zero-padded CID bytes)])` → every `MediaReference` carrying that CID.
2. Read each referenced `Will` with `getMultipleAccountsInfo`.
3. **Write access** (`delete`, `update`): caller must equal `will.owner`.
4. **Read access**: owner, *or* an entitled heir — `will.status == Claimable` **and** `now >= claimable_at + GRACE_PERIOD_SECONDS` **and** the `Beneficiary` PDA for (will, caller) exists with a matching back-reference.
5. A CID no will references is denied for both modes (the route is not a general IPFS proxy).
6. RPC failure → **deny** (never fail open).

Accounts are decoded by **hard-coded byte offsets** (`WILL_LEN=91`,
`MEDIA_LEN=123`, `BENEFICIARY_LEN=108`; `discriminator = sha256("account:<Name>")[0..8]`)
with an import-time assertion that the offsets still add up. This is the single
piece of code most tightly bound to Anchor's serialization, and it disappears
entirely on EVM (replaced by typed ABI calls).

### Other backend-ish pieces
- `lib/server/guard.ts` — per-process token-bucket rate limits (`READ_LIMIT` 60/min burst 20, `WRITE_LIMIT` 12/min burst 5), per-wallet hourly upload quota, CIDv0/CIDv1 regex validation, and error shaping that keeps upstream Pinata messages in the server log.
- `proxy.ts` — per-request nonce CSP with `strict-dynamic` (a static CSP breaks Next's inline bootstrap).
- `next.config.ts` — `X-Frame-Options: DENY`, HSTS, `nosniff`, COOP, Permissions-Policy. *(Note: the file currently ends with `export default {}` rather than `export default nextConfig` — the headers block is dead code. Flagged, not in scope for this migration.)*

### Database
**None.** Confirmed: no ORM, no migrations, no connection string, no schema file
anywhere in the repo. `NEXT_PUBLIC_*`, `PINATA_*`, `SESSION_SECRET` and
`SOLANA_KEYPAIR` are the only environment variables (`SOLANA_KEYPAIR` is used
only by `scripts/devnet-smoke.mjs`). Phase 14 of the migration brief is therefore
**not applicable** — see `MIGRATION_GUIDE.md`.

---

## H. Business Logic (chain-agnostic)

**This is the contract of the migration.** Every rule below is stated without
reference to Solana, and must hold identically in the EVM implementation.

### Entities
- **Will** — exactly one per owner address. Has a status (`Active` →
  `PendingInheritance` → `Claimable`), an inactivity threshold, a required
  approval count, timestamps, and counters.
- **Custodian** — an address the owner nominates that may attest to the owner's
  death. Unique per (will, address).
- **Beneficiary** — an address the owner nominates as an heir, with a share in
  basis points and an optional published encryption public key. Unique per
  (will, address).
- **Media reference** — an immutable pointer (content id + media type) to an
  off-chain, client-encrypted document, addressed by a monotonic index.
- **Token vault** — per (will, token) escrow holding a cumulative deposited
  total and the balance still held.
- **Token claim** — a permanent record that a given heir has taken their share
  of a given token from a given will.

### Rules

**B1 — Singleton will.** An address may hold at most one will at a time.
Creating a second while one exists must fail. After deletion/closure a new will
may be created.

**B2 — Threshold validity.** `inactivity_threshold > 0` at creation and on every
update. A non-positive threshold would make the owner instantly "inactive".

**B3 — Quorum floor.** `min_approvals >= 1` at creation and on every update.

**B4 — Quorum reachability (H1).** No asset — neither a media reference nor a
token deposit — may enter a will unless `custodian_count > 0` **and**
`min_approvals <= custodian_count`. An unreachable quorum would lock the estate
away from the very heirs it names, permanently.

**B5 — Quorum preservation on removal.** Removing a custodian must not leave
`min_approvals > custodian_count` **unless** the removal takes the count to zero
(full teardown, which is always allowed so the will can be deleted). To shrink
below the quorum the owner must lower `min_approvals` first.

**B6 — Owner-only configuration, and only while Active.** All of: update, delete,
add/remove media, add/remove custodian, add/remove beneficiary, deposit token,
withdraw token — owner-signed **and** `status == Active`.

**B7 — Liveness ping.** Any owner-signed `update` refreshes `last_active_at`, as
does a revocation. Signing is itself the proof of life.

**B8 — Dead-man's switch (C1).** A custodian may attest only when
`now - last_active_at >= inactivity_threshold`. A negative delta (clock skew)
saturates to zero rather than wrapping.

**B9 — One attestation per custodian per epoch.** A custodian counts as having
attested only while `has_approved && approved_epoch == will.approval_epoch`.
Attesting twice in one epoch must fail.

**B10 — Quorum transition.** When `approvals_received >= min_approvals`, the
will becomes `Claimable` and `claimable_at = now`, set **once** on the
transition, so further attestations cannot push the timeline out. Below quorum
the status is `PendingInheritance`.

**B11 — Revocation (C3).** The owner may cancel an in-flight confirmation while
`PendingInheritance` (always) or `Claimable` **and** `now < claimable_at + GRACE`.
Revoking sets status `Active`, `approvals_received = 0`, `claimable_at = 0`,
increments `approval_epoch` (invalidating every prior attestation in O(1)), and
refreshes `last_active_at`. After the grace period expires, revocation must fail
— heirs may already have settled.

**B12 — Grace period (C3).** Nothing may be claimed before
`claimable_at + GRACE_PERIOD` (7 days). This is the living owner's last defence
against a mistaken or malicious attestation.

**B13 — Claim window (C1).** No permissionless teardown may run before
`claimable_at + GRACE_PERIOD + CLAIM_WINDOW` (7 + 90 days). Heirs get a bounded,
exclusive window in which no stranger can revoke their ability to claim.

**B14 — Allocation ceiling.** The sum of all beneficiaries' shares must never
exceed 10 000 bps. It **may** be less; the remainder returns to the estate.

**B15 — Single acceptance.** A beneficiary may accept the estate
(`claim_inheritance`) at most once, and only once claims are open.

**B16 — Heir-controlled encryption key.** Only the heir may publish or rotate
their own encryption public key; only while the will is `Active`; an all-zero key
is rejected (it is the "unregistered" sentinel). Freezing it once death
confirmation is in flight stops a later wallet compromise from redirecting the
estate's documents.

**B17 — Proportional, snapshot-based shares.** An heir's claimable amount for a
token is `floor(total_deposited * allocation_bps / 10 000)`, clamped to the
balance still held. Computing against the cumulative deposit rather than the live
balance keeps every heir's entitlement fixed regardless of claim order.

**B18 — No double claim.** An heir may claim each (will, token) pair at most
once, permanently — the record outlives every teardown.

**B19 — Zero is not a claim.** A claim of zero (no allocation, or nothing left)
must fail rather than silently record a claim.

**B20 — Residual to the estate.** After the claim window, all residual token
balance — unallocated remainder, rounding dust, and unclaimed shares — returns
to the owner's address. It may never be redirected to the caller of the crank.

**B21 — No orphaned escrow.** A will may not be deleted or closed while it still
holds any token vault, nor while any child record survives.

**B22 — Deposits require a custodian.** A token deposit additionally requires
`custodian_count > 0` (a stricter check than B4 alone, present on the deposit
path).

**B23 — Cranks are permissionless but not profitable.** Anyone may run teardown
and sweep; the value always flows to the estate, never to the caller. The caller
pays only the transaction fee.

**B24 — Monotonic media index.** Media indices never repeat within a will, even
after removal, so a stale pointer can never resolve to a different document.

**B25 — Deposit is additive.** Depositing the same token twice accumulates into
one vault's cumulative total; it does not create a second vault.

**B26 — Positive amounts only.** A deposit of zero must fail.

### Rules the EVM implementation must *add* (no Solana counterpart)

- **B27 — Received-amount accounting.** Solana's `transfer_checked` moves exactly
  the requested amount. An ERC-20 may not. The cumulative total must be credited
  with the **measured balance delta**, never the requested amount.
- **B28 — Per-will balance ledger.** Solana gave each will its own token account.
  One EVM contract holds every will's balance for a given ERC-20, so each vault
  must track its own `remaining` and the contract must never treat
  `balanceOf(address(this))` as any one will's balance.
- **B29 — Zero-address rejection.** `address(0)` is a real, unspendable address on
  EVM in a way `Pubkey::default()` is not. Reject it as custodian and as heir.

---

## I. Tests that exist today (parity targets)

`programs/vault-inheritance/tests/test_audit.rs`, 22 LiteSVM integration tests:

| Test | Rule covered |
|---|---|
| `death_blocked_while_owner_active_then_allowed_after_threshold` | B8 |
| `ping_resets_the_dead_mans_switch` | B7, B8 |
| `init_rejects_bad_config` | B2, B3 |
| `update_will_enforces_min_approval_bounds` | B3, B5 |
| `remove_custodian_cannot_break_min_approvals` | B5 |
| `full_lifecycle_and_estate_teardown_refunds_rent` | end-to-end |
| `close_will_blocked_while_children_remain` | B21 |
| `non_custodian_cannot_confirm_death` | access control |
| `allocation_cannot_exceed_100_percent` | B14 |
| `delete_will_refunds_rent_to_owner_while_active` | rent (N/A on EVM) |
| `media_index_is_monotonic_after_remove` | B24 |
| `test_token_escrow_lifecycle` | B17, B25 |
| `c1_cleanup_cannot_front_run_a_pending_token_claim` | B13 |
| `c1_cleanup_opens_only_after_the_claim_window_closes` | B13 |
| `c2_delete_will_blocked_while_a_token_vault_lives` | B21 |
| `c2_close_will_blocked_while_a_token_vault_lives` | B21 |
| `c2_token_vault_count_tracks_add_topup_and_delete` | B25 |
| `c3_owner_can_revoke_and_reuse_the_will` | B11 |
| `c3_revoke_expires_with_the_grace_period` | B11 |
| `c3_nothing_can_be_claimed_during_the_grace_period` | B12 |
| `h1_assets_rejected_while_quorum_is_unreachable` | B4 |
| `m2_shares_are_proportional_and_the_remainder_returns_to_the_estate` | B17, B20 |
| `c5_only_the_heir_can_register_their_encryption_key` | B16 |

Every one of these (minus the two rent-specific assertions) has a Foundry
counterpart in `contracts/test/` — see `MIGRATION_GUIDE.md` for the mapping table.

---

## J. Findings noted during analysis (not part of the migration)

Recorded because they were observed while reading, and because two of them
affect what "preserving behaviour" means.

1. **`app/next.config.ts` exports `{}`, not `nextConfig`.** The security-headers
   block and the Turbopack root pin are dead code today. The EVM app fixes this
   (the headers are genuinely wanted).
2. **`Will::beneficiaries_claimed` is `u8` while `beneficiary_count` is `u32`.**
   With more than 255 heirs accepting, `checked_add` would abort
   `claim_inheritance`. The EVM version caps the heir list explicitly instead
   (see `SOLIDITY_ARCHITECTURE.md` §Bounded collections).
3. **`register_recipient_key` declares `beneficiary_signer` as `mut`** but never
   moves lamports from it. Harmless.
4. **`ErrorCode::DeprecatedVaultMigration` is retired but retained** to keep
   discriminants stable. The EVM error set does not carry it forward — ABI error
   selectors are name-derived, not positional, so there is nothing to preserve.
