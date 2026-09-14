# Deployment

Deploying `VaultInheritance` and pointing the frontend at it.

The contract takes no constructor arguments, has no initializer, no owner and no
proxy — so deployment is one transaction and there is nothing to configure
afterwards. Everything below is about wiring the frontend to the result.

---

## 0. Prerequisites

```bash
# Foundry (forge, cast, anvil)
curl -L https://foundry.paradigm.xyz | bash && foundryup

# jq — the ABI sync script uses it
brew install jq            # macOS

forge --version            # confirm it is on PATH
```

If `forge: command not found`, Foundry installs to `~/.foundry/bin`:

```bash
export PATH="$HOME/.foundry/bin:$PATH"     # add to ~/.zshrc
```

---

## 1. Local development (Anvil)

One command sets up the whole local chain:

```bash
cd robhinhood_chain_comperitable/contracts
./script/anvil-dev.sh
```

It starts Anvil, installs Multicall3, deploys `VaultInheritance`, and syncs the
ABI and address into the frontend. Then:

```bash
cd ../app
cp .env.example .env.local          # if you don't have one yet
# set SESSION_SECRET:  openssl rand -hex 32
npm run dev                         # http://localhost:3000
```

**Why Multicall3 has to be installed.** The frontend reads a will and all of its
children — custodians, heirs, media, token vaults — in one batched call
(`lib/evm/willFetch.ts`). viem refuses to batch unless the chain declares
Multicall3, failing with *"Chain 'Anvil' does not support contract
'multicall3'"*. It is already predeployed on both Robinhood Chain networks, but
**not** on a fresh Anvil, so the script copies the canonical runtime bytecode
onto the local node. Without it every dashboard read fails.

**Anvil state is in-memory.** Restarting it wipes the contract, and the next
deploy lands at a different address because the deployer's nonce changed. Re-run
`./script/anvil-dev.sh` after a restart, or persist state:

```bash
anvil --state /tmp/anvil-state.json     # loads on start, dumps on exit
```

### Connect a wallet

Add the network in MetaMask (or Rabby, etc.):

| Field | Value |
|---|---|
| Network name | Anvil |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency symbol | ETH |

Then import an Anvil dev account. Account #0:

```
0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

> This is a **public, well-known test key**. Never fund it on a network that
> holds real value, and never reuse it as a deployer key.

Until the wallet is on chain 31337 the header shows **"Switch to Anvil"** and
writes are blocked — that is the wrong-network guard, not a bug. Reads still
work, because they go through the configured RPC rather than the wallet.

---

## 2. Robinhood Chain Testnet (46630)

### Fund a deployer

Create a fresh key for this — never reuse a personal wallet:

```bash
cast wallet new
```

Fund it at <https://faucet.testnet.chain.robinhood.com/>, then confirm:

```bash
export RH_TESTNET_RPC_URL=https://rpc.testnet.chain.robinhood.com
cast balance <YOUR_DEPLOYER_ADDRESS> --rpc-url "$RH_TESTNET_RPC_URL"
```

### Store the key in Foundry's keystore

Preferred over `--private-key`, which leaves the key in your shell history:

```bash
cast wallet import rh-testnet-deployer --interactive   # paste key, set a password
cast wallet list
```

### Deploy

```bash
cd robhinhood_chain_comperitable/contracts
forge test                       # 140 tests must pass before you deploy

forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RH_TESTNET_RPC_URL" \
  --account rh-testnet-deployer \
  --broadcast --verify \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.chain.robinhood.com/api/
```

The script writes `contracts/deployments/46630.json` and prints the address plus
an explorer link.

### Sync the frontend

```bash
./script/sync-abi.sh      # writes app/lib/evm/{abi,deployments}.ts
```

Then in `app/.env.local`:

```bash
NEXT_PUBLIC_CHAIN_ID=46630
# NEXT_PUBLIC_RPC_URL=            # optional; see the note in §4
```

Leave `NEXT_PUBLIC_CONTRACT_ADDRESS` unset — it resolves from
`deployments.ts`, which `sync-abi.sh` rewrites on every deploy. Pinning it
silently overrides that and points the app at a stale contract the next time you
redeploy.

### Verify it took

```bash
ADDR=$(jq -r .address deployments/46630.json)
cast code $ADDR --rpc-url "$RH_TESTNET_RPC_URL" | head -c 20   # not "0x"
cast call $ADDR "GRACE_PERIOD()(uint40)"  --rpc-url "$RH_TESTNET_RPC_URL"  # 604800
cast call $ADDR "CLAIM_WINDOW()(uint40)"  --rpc-url "$RH_TESTNET_RPC_URL"  # 7776000
```

---

## 3. Robinhood Chain Mainnet (4663)

Identical, with mainnet values. Re-read §5 first.

```bash
export RH_MAINNET_RPC_URL=https://rpc.mainnet.chain.robinhood.com

forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RH_MAINNET_RPC_URL" \
  --account rh-mainnet-deployer \
  --broadcast --verify \
  --verifier blockscout \
  --verifier-url https://robinhoodchain.blockscout.com/api/

./script/sync-abi.sh
```

Frontend: `NEXT_PUBLIC_CHAIN_ID=4663`.

> **`--verify` may fail on mainnet.** As of 2026-09-12 the mainnet Blockscout API
> (`https://robinhoodchain.blockscout.com/api/`) returns **HTTP 403** to
> unauthenticated requests, while the testnet one answers 200. The RPC itself is
> fine. If verification fails, the deploy still succeeds — drop `--verify`, then
> verify separately once you have an explorer API key:
>
> ```bash
> forge verify-contract <ADDRESS> src/core/VaultInheritance.sol:VaultInheritance \
>   --chain-id 4663 --verifier blockscout \
>   --verifier-url https://robinhoodchain.blockscout.com/api/ \
>   --etherscan-api-key "$BLOCKSCOUT_API_KEY"
> ```

For a key that controls anything real, prefer hardware over a keystore file:

```bash
forge script script/Deploy.s.sol:Deploy --rpc-url "$RH_MAINNET_RPC_URL" --ledger --broadcast
```

Dry-run first by omitting `--broadcast` — it simulates and reports gas without
sending anything.

---

## 4. Frontend environment

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_CHAIN_ID` | **yes** | `4663` / `46630` / `31337`. The app throws at import if unset — deliberately, since a wrong chain id makes every read empty and sends writes to the wrong network. |
| `NEXT_PUBLIC_RPC_URL` | no | Defaults to the chain's public endpoint. Must agree with the chain id or startup fails. |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | no | Resolved from `deployments.ts`. Set only to target a one-off deployment. |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | no | Injected wallets work without it; the WalletConnect connector is only registered when set. |
| `SESSION_SECRET` | **yes** | `/api/auth/*` refuses to issue sessions below 32 chars. `openssl rand -hex 32`, unique per environment. |
| `PINATA_JWT_TOKEN` | **yes** for IPFS | From <https://app.pinata.cloud> → API Keys. Without it the dashboard browses fine but document upload and preview fail. |
| `PINATA_GATEWAY` | no | Your dedicated Pinata gateway host. |

Anything without the `NEXT_PUBLIC_` prefix stays server-side. Never add that
prefix to `SESSION_SECRET` or `PINATA_JWT_TOKEN` — it would ship them to every
browser.

> **The public RPC endpoints are rate-limited** and, per the Robinhood Chain
> docs, not recommended for production. Use a dedicated provider URL for
> anything real.

---

## 5. Before mainnet

- [ ] `forge test` green (140 tests, 10 invariants)
- [ ] `cd app && npm run verify` green (typecheck, lint, dependency audit)
- [ ] Security review completed — **not yet done**; phases 17–19 of the
      migration plan (security review, gas optimisation, deployment hardening)
      are still outstanding
- [ ] Deployer key is hardware-backed or in a keystore, never a literal in a
      command or a file in the repo
- [ ] Deployed bytecode verified on Blockscout
- [ ] Constants confirmed on-chain: `GRACE_PERIOD` 604800, `CLAIM_WINDOW`
      7776000, `MAX_ALLOCATION_BPS` 10000
- [ ] `SESSION_SECRET` freshly generated for the production environment
- [ ] A real Pinata account, with the JWT scoped to the minimum needed
- [ ] Marketing copy reviewed — the landing page still claims audits
      ("audit in progress", "Audits: OtterSec, Neodyme") and a "mainnet Q3"
      timeline that nobody has verified

The contract is **immutable and non-upgradeable** by design: no proxy, no admin,
no pause. A redeploy is a new address with no state, and there is no migration
path for wills created against the old one. Treat the mainnet deploy as final.

---

## 6. Troubleshooting

**`Chain 'X' does not support contract 'multicall3'`**
The chain definition in `app/lib/evm/chains.ts` is missing a `contracts.multicall3`
entry, or Multicall3 genuinely is not deployed there. Both Robinhood Chain
networks have it at `0xcA11bde05977b3631167028862bE2a173976CA11`; a fresh Anvil
does not — run `./script/anvil-dev.sh`.

**`HTTP request failed … Failed to fetch` against `127.0.0.1:8545`**
Either Anvil is not running (`cast chain-id --rpc-url http://127.0.0.1:8545`), or
the CSP is blocking it. `proxy.ts` allows loopback `http:` in development only;
in production the RPC must be HTTPS.

**`NEXT_PUBLIC_CHAIN_ID is not set`**
No `.env.local`. `cp .env.example .env.local` and fill it in.

**Dashboard shows "No Active Will Found" with a wallet connected**
Expected when that wallet has no will. A will is keyed by its owner's address,
so you only see your own. Create one under Will Settings, or view someone
else's from Intervene & Claim.

**Header says "Switch to \<network\>"**
The wallet is on a different chain. Click it. Reads still work; writes are
blocked until it matches.

**Redeployed and the app shows stale/empty data**
`NEXT_PUBLIC_CONTRACT_ADDRESS` is pinned in `.env.local` to the old address, or
`./script/sync-abi.sh` was not re-run. Unset the former, run the latter.
