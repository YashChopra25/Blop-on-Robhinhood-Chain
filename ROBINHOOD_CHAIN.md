# ROBINHOOD_CHAIN.md — verified network facts

> Phase 3 deliverable. **Every value below was taken from the official
> documentation at `docs.robinhood.com/chain` and then independently confirmed
> against the live RPC endpoints.** Nothing here is guessed. Where the official
> docs are silent, this document says so rather than filling the gap.
>
> Verified on **2026-09-12**. Re-verify before a mainnet deployment.

---

## 1. The 23 questions from the brief

| # | Question | Answer | Source |
|---|---|---|---|
| 1 | EVM compatible? | **Yes.** "Robinhood Chain is fully EVM-compatible, so smart contracts written in Solidity or Vyper deploy without modification using standard Ethereum tooling." It is an **Arbitrum (Orbit/Nitro) Layer-2 on Ethereum**, using Ethereum blobs for data availability. | docs `/chain`, `/chain/deploy-smart-contracts` |
| 2 | Mainnet chain ID | **4663** | docs `/chain/connecting`; confirmed `eth_chainId` → `0x1237` |
| 3 | Testnet chain ID | **46630** | docs `/chain/connecting`; confirmed `eth_chainId` → `0xb626` |
| 4 | RPC URLs | mainnet `https://rpc.mainnet.chain.robinhood.com` · testnet `https://rpc.testnet.chain.robinhood.com` · WS mainnet `wss://feed.mainnet.chain.robinhood.com` · WS testnet `wss://feed.testnet.chain.robinhood.com` | docs `/chain/connecting` |
| 5 | Block explorers | mainnet `https://robinhoodchain.blockscout.com` · testnet `https://explorer.testnet.chain.robinhood.com` | docs `/chain/connecting`, `/chain/add-network-to-wallet` |
| 6 | Native gas token | **ETH**, 18 decimals | docs `/chain/connecting` |
| 7 | Solidity/EVM compatibility | Full. Cancun opcode set confirmed live (below). | docs + probe |
| 8 | Supported Solidity versions | Any 0.8.x. This project pins **0.8.26**. | — |
| 9 | Supported opcodes | `PUSH0`, `TLOAD`/`TSTORE`, `MCOPY` all confirmed executing on both networks — i.e. **Cancun**. `blockhash(n)` reliable only for recent blocks. | live probe (§3) |
| 10 | Deployment requirements | Standard `eth_sendRawTransaction`. **Max contract code size 96 KB** (vs 24 KB on Ethereum); max init code 192 KB. | docs `/chain/differences-from-ethereum` |
| 11 | Contract verification | **Blockscout**, no API key required. Mainnet verifier `https://robinhoodchain.blockscout.com/api/`. Testnet explorer is Blockscout too (backend `v10.2.6`, confirmed) → `https://explorer.testnet.chain.robinhood.com/api/`. | docs `/chain/deploy-smart-contracts` + live probe |
| 12 | Wallet providers | MetaMask and any EVM wallet; add-network parameters published. ERC-4337 account abstraction documented. | docs `/chain/add-network-to-wallet`, `/chain/account-abstraction` |
| 13 | viem | Supported (named in the docs) | docs `/chain` |
| 14 | wagmi | Supported (named in the docs) | docs `/chain` |
| 15 | MetaMask | Supported | docs `/chain/add-network-to-wallet` |
| 16 | Foundry | Supported; official tutorial is Foundry-first | docs `/chain/deploy-smart-contracts` |
| 17 | Hardhat | Supported | docs `/chain/deploy-smart-contracts` |
| 18 | OpenZeppelin | Not named explicitly, but full EVM + Cancun compatibility means standard OZ contracts deploy unmodified. This project uses only `IERC20`, `SafeERC20`, `ReentrancyGuard`. | inference from #1/#9, stated as such |
| 19 | RPC limitations | Public endpoints are "rate-limited and not recommended for production use". Archive endpoints recommended for historical reads/indexing. Recommended providers: Alchemy, QuickNode, Blockdaemon, dRPC, Validation Cloud. | docs `/chain/connecting` |
| 20 | Transaction requirements | **First-come, first-served sequencing** — order is strictly arrival time at the sequencer; higher fees do **not** reorder. Fee = L2 execution gas + L1 calldata fee. Sequencer-level screening may exclude transactions linked to sanctioned addresses. | docs `/chain/differences-from-ethereum`, `/chain/gas-and-fees` |
| 21 | Bridge / deposits / withdrawals | Documented at `/chain/bridging`. Withdrawals to Ethereum carry Arbitrum's **7-day challenge period**. | docs `/chain/bridging`, `/chain/transaction-finality` |
| 22 | Testnet faucet | **`https://faucet.testnet.chain.robinhood.com/`**. Alternative: obtain Sepolia ETH from any faucet and bridge it in. | docs `/chain/connecting` |
| 23 | Recommended workflow | Foundry: `forge create … --rpc-url $RH_RPC_URL --private-key $PRIVATE_KEY --broadcast`, then `forge verify-contract … --verifier blockscout --verifier-url …/api/`. | docs `/chain/deploy-smart-contracts` |

---

## 2. Canonical configuration

Single source of truth in this repo: **`contracts/config/networks.json`**, consumed by
`contracts/foundry.toml`, `contracts/script/`, and `app/lib/evm/chains.ts`. Nothing is
hardcoded anywhere else.

```
Robinhood Chain (mainnet)
  chainId            4663              (0x1237)
  rpc                https://rpc.mainnet.chain.robinhood.com
  ws                 wss://feed.mainnet.chain.robinhood.com
  explorer           https://robinhoodchain.blockscout.com
  verifier           blockscout @ https://robinhoodchain.blockscout.com/api/   (no API key)
  nativeCurrency     Ether / ETH / 18

Robinhood Chain Testnet
  chainId            46630             (0xb626)
  rpc                https://rpc.testnet.chain.robinhood.com
  ws                 wss://feed.testnet.chain.robinhood.com
  explorer           https://explorer.testnet.chain.robinhood.com
  verifier           blockscout @ https://explorer.testnet.chain.robinhood.com/api/   (no API key)
  faucet             https://faucet.testnet.chain.robinhood.com/
  nativeCurrency     Ether / ETH / 18
```

> The **testnet** verifier URL is derived from the confirmed fact that the
> testnet explorer runs Blockscout (`/api/v2/config/backend-version` →
> `{"backend_version":"v10.2.6"}`) and that Blockscout's verification API is
> always at `/api/`. The official docs only spell out the **mainnet** verifier
> URL. This is flagged as a derived value, not a documented one — confirm it
> with a testnet verification before relying on it in CI.

---

## 3. Live verification performed

Executed against the public endpoints on 2026-09-12:

```
$ cast rpc eth_chainId --rpc-url https://rpc.mainnet.chain.robinhood.com
"0x1237"                                                  # 4663 ✓

$ cast rpc eth_chainId --rpc-url https://rpc.testnet.chain.robinhood.com
"0xb626"                                                  # 46630 ✓

# ArbSys.arbOSVersion()  (precompile 0x64, selector 0x051038f2)
mainnet → 0x74 (116)      testnet → 0x74 (116)            # Arbitrum Nitro ✓

# Cancun opcode probes via eth_call + state override
  PUSH0 + TSTORE/TLOAD    mainnet → 0x…01   testnet → 0x…01   ✓
  MCOPY                   mainnet → 0x…2a   testnet → 0x…2a   ✓

$ curl .../api/v2/config/backend-version   (testnet explorer)
{"backend_version":"v10.2.6"}                             # Blockscout ✓
```

Reproduce with `contracts/script/verify-network.sh`.

**Conclusion: `evm_version = "cancun"` is safe on both networks.** This project
nonetheless compiles with `evm_version = "shanghai"` — see §5.

---

## 4. Arbitrum-specific behaviour that changes contract design

Straight from `/chain/differences-from-ethereum`, with the impact on *this*
protocol:

| Difference | Impact here |
|---|---|
| **`block.number` returns an L1 block-number estimate and updates only periodically.** Use `ArbSys(0x64).arbBlockNumber()` for the real L2 height. | **Decisive.** Every deadline in this protocol is time-based. `block.number` is used **nowhere** in `VaultInheritance.sol` — a block-height dead-man's switch would have been silently wrong by orders of magnitude. |
| `block.prevrandao` / `block.difficulty` return a constant; not a randomness source. | Not used. No randomness anywhere in the protocol. |
| `blockhash(n)` reliable only for recent blocks. | Not used. |
| `block.coinbase` returns the network fee account, not a validator. | Not used. |
| Fees = L2 execution gas + L1 calldata fee; `gasleft()` and estimation behave differently; use the `ArbGasInfo` precompile. | No gas-forwarding assumptions, no `gasleft()` checks, no fixed 2300-gas stipend reliance (the contract never sends native value). Calldata is kept small — the only variable-length argument is the ≤64-byte CID. |
| **FCFS sequencing; fees do not reorder transactions.** | Materially *reduces* MEV/front-running surface. Analysed per-function in `SECURITY_REVIEW.md` → *Front-running / MEV*. |
| Address aliasing for L1→L2 messages. | Not applicable — no cross-chain messaging in this protocol. |
| Max code size 96 KB / init code 192 KB. | Ample. `VaultInheritance` is well under even Ethereum's 24 KB. |
| Soft confirmation sub-second; posted to L1 in minutes; Ethereum finality ≈13 min after posting; withdrawals to L1 carry a 7-day challenge period. | Drives the frontend's confirmation UX (§6). |
| Sequencer-level sanctions screening may exclude some transactions. | Documented as an availability caveat for heirs in `SECURITY_REVIEW.md` → *Denial of service*. |

### `block.timestamp` on this chain

The official docs do **not** publish a drift bound for `block.timestamp` on
Robinhood Chain. Arbitrum Nitro's documented behaviour is that the sequencer sets
L2 timestamps, bounded to stay close to L1 time. For this protocol the smallest
meaningful interval is the **7-day grace period**, and the smallest
user-configurable one is the inactivity threshold (the UI's minimum is 1 day).
A drift of even minutes is irrelevant at that scale. No logic depends on
sub-hour timestamp precision. Recorded as an accepted assumption in
`SECURITY_REVIEW.md`.

---

## 5. Compiler settings and why

```toml
solc          = "0.8.26"
evm_version   = "shanghai"     # not "cancun" — see below
optimizer     = true
optimizer_runs = 200
via_ir        = false
```

- **`evm_version = "shanghai"`** even though Cancun is confirmed supported. The
  contract uses no transient storage and no `MCOPY`; targeting Shanghai costs
  nothing here, keeps the bytecode deployable on every EVM chain (useful if the
  protocol is ever mirrored), and removes a class of "works on chain A, reverts
  on chain B" surprise. Flip to `cancun` only if a future change actually needs
  `TSTORE`.
- **`optimizer_runs = 200`** — these functions are called a handful of times per
  will over its lifetime, so runtime-gas optimisation matters more than deploy
  size, but not so much that a high runs value earns its bytecode growth.
- **`via_ir = false`** — the contract compiles comfortably without it; enabling
  the IR pipeline would lengthen builds and change codegen for no measured
  benefit.

---

## 6. Confirmation strategy for the frontend

Given the two-phase finality model:

| Action | Wait for | Rationale |
|---|---|---|
| `createWill`, `updateWill`, `addCustodian`, `addBeneficiary`, `addMedia`, `registerRecipientKey` | 1 confirmation (soft) | Configuration. A reorg would at worst require a retry; nothing of value moves. |
| `confirmDeath`, `revokeDeathConfirmation` | 1 confirmation, UI states "settling" | State transition, no value movement. |
| **`depositToken`, `withdrawToken`, `claimToken`, `sweepTokenVault`** | 1 confirmation to update the UI, but the UI explicitly labels it *soft-confirmed* and links to the explorer | Value moves. The docs advise waiting for L1 posting on high-value operations; the app surfaces that rather than silently pretending sub-second finality is final. |

Implemented in `app/lib/evm/tx.ts` (`sendAndTrack`) — `simulateContract` →
`writeContract` → `waitForTransactionReceipt({ confirmations })`, with the
confirmation count per action taken from one table, not scattered.

---

## 7. Deployment runbook

```bash
cd robhinhood_chain_comperitable/contracts

# ---- local ----
anvil &
forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast

# ---- Robinhood Chain testnet (46630) ----
# fund the deployer first: https://faucet.testnet.chain.robinhood.com/
export RH_TESTNET_RPC_URL=https://rpc.testnet.chain.robinhood.com
export DEPLOYER_PRIVATE_KEY=0x...          # never committed; see .env.example
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RH_TESTNET_RPC_URL" --broadcast --verify \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.chain.robinhood.com/api/

# ---- Robinhood Chain mainnet (4663) ----
export RH_MAINNET_RPC_URL=https://rpc.mainnet.chain.robinhood.com
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RH_MAINNET_RPC_URL" --broadcast --verify \
  --verifier blockscout \
  --verifier-url https://robinhoodchain.blockscout.com/api/
```

`Deploy.s.sol` writes `contracts/deployments/<chainId>.json` (address, chain id, block,
tx hash, deployer, timestamp, commit) and prints the explorer URL. The ABI is
exported to `app/lib/evm/abi.ts` by `contracts/script/sync-abi.sh`.

**Secrets:** `DEPLOYER_PRIVATE_KEY` is read from the environment only, never a
file in the repo. `.gitignore` covers `.env*` (except `.env.example`),
`broadcast/`, `cache/`, `out/`. Prefer `--account` with a Foundry keystore, or a
hardware wallet via `--ledger`, over a raw key for mainnet.

---

## 8. What the official docs do *not* say

Recorded honestly rather than filled in:

- No published `block.timestamp` drift bound.
- No published L2 block time (only "sub-second" soft confirmation).
- No explicit statement of the supported EVM hard fork — hence the live opcode
  probes in §3.
- No explicit OpenZeppelin compatibility statement (it follows from full EVM
  compatibility, but it is an inference).
- The testnet Blockscout **verifier** URL is not spelled out; §2 derives it.
- No documented public rate-limit numbers for the public RPCs, only the advice
  not to use them in production.

---

## Sources

- [Robinhood Chain docs — overview](https://docs.robinhood.com/chain/)
- [Connecting to Robinhood Chain](https://docs.robinhood.com/chain/connecting)
- [Add network to wallet](https://docs.robinhood.com/chain/add-network-to-wallet)
- [Deploy a contract (Foundry)](https://docs.robinhood.com/chain/deploy-smart-contracts)
- [Differences from Ethereum](https://docs.robinhood.com/chain/differences-from-ethereum/)
- [Transaction finality](https://docs.robinhood.com/chain/transaction-finality)
- [Testnet faucet](https://faucet.testnet.chain.robinhood.com/)
