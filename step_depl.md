# Deployment — step by step

Numbered, copy-paste walkthrough. Every step ends with a check, so you know it
worked before moving on.

For the reference version — full env table, pre-mainnet checklist, background on
*why* each piece is needed — see [`DEPLOYMENT.md`](./DEPLOYMENT.md).

All paths are relative to the repository root.

---

## Part A — Install tools (once)

### Step 1. Install Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### Step 2. Put it on PATH

Foundry installs to `~/.foundry/bin`. If `forge` is not found:

```bash
export PATH="$HOME/.foundry/bin:$PATH"
echo 'export PATH="$HOME/.foundry/bin:$PATH"' >> ~/.zshrc
```

### Step 3. Install jq

```bash
brew install jq          # macOS
```

**Check:**

```bash
forge --version && cast --version && anvil --version && jq --version
```

All four print a version. If `forge` is missing, redo Step 2.

---

## Part B — Run it locally

### Step 4. Start the local chain and deploy

```bash
cd contracts
./script/anvil-dev.sh
```

This does four things: starts Anvil, installs Multicall3, deploys
`VaultInheritance`, and writes the ABI + address into the frontend.

**Check:** the script prints

```
Local environment ready
  RPC          http://127.0.0.1:8545
  chainId      31337
  Vault        0x5FbDB2315678afecb367f032d93F642f64180aa3
  Multicall3   0xcA11bde05977b3631167028862bE2a173976CA11
```

> Anvil keeps state **in memory**. Restarting it wipes the contract, and the next
> deploy lands at a different address. Re-run this step after any restart, or
> start Anvil with `anvil --state /tmp/anvil-state.json` to persist.

### Step 5. Create the frontend env file

```bash
cd ../app
cp .env.example .env.local
```

Open `.env.local` and set two values:

```bash
NEXT_PUBLIC_CHAIN_ID=31337
SESSION_SECRET=<paste the output of: openssl rand -hex 32>
```

Leave `NEXT_PUBLIC_CONTRACT_ADDRESS` **commented out** — the address comes from
`lib/evm/deployments.ts`, which Step 4 rewrites on every deploy. Pinning it here
points the app at a stale contract the next time you redeploy.

`PINATA_JWT_TOKEN` can stay blank for now; see Step 9.

**Check:**

```bash
grep -E '^(NEXT_PUBLIC_CHAIN_ID|SESSION_SECRET)=' .env.local
```

Both have values, and `SESSION_SECRET` is at least 32 characters.

### Step 6. Start the app

```bash
npm install        # first time only
npm run dev
```

**Check:** <http://localhost:3000> loads the landing page, and the badge under
the nav reads `ANVIL · AUDIT IN PROGRESS`. If you get a CSS parse error or a
`NEXT_PUBLIC_CHAIN_ID is not set` crash, see Troubleshooting.

### Step 7. Add the local network to your wallet

In MetaMask / Rabby → Add network manually:

| Field | Value |
|---|---|
| Network name | Anvil |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency symbol | ETH |

### Step 8. Import a funded dev account

Anvil account #0:

```
0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

> **Public, well-known test key.** Never fund it on a real network and never use
> it as a deployer key.

**Check:** the header no longer says "Switch to Anvil" — it shows your shortened
address instead. Until you switch networks, reads work but writes are blocked;
that is the wrong-network guard, not a bug.

### Step 8b. Fund your own wallet (the "airdrop" step)

Only needed if you connected **your own** address rather than importing an Anvil
key in Step 8 — the ten built-in accounts already hold 10 000 ETH each. A wallet
with 0 ETH can still read the dashboard, but every write fails: there is no gas
to pay with.

EVM has no `airdrop` RPC (that is Solana's `solana airdrop`). Anvil gives you two
equivalents:

```bash
export RPC=http://127.0.0.1:8545
export ME=0xYourWalletAddress

# (a) Set the balance outright — instant, no transaction, no sender needed.
#     The amount must be a HEX quantity; a decimal integer is rejected with
#     "invalid type: integer ... expected any value".
cast rpc anvil_setBalance $ME $(cast to-hex $(cast to-wei 100 ether)) --rpc-url $RPC

# (b) Or send a real transfer from Anvil account #0 (mines a block).
cast send $ME --value 10ether --rpc-url $RPC \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

**Check:**

```bash
cast to-unit $(cast balance $ME --rpc-url $RPC) ether
```

Prints a non-zero number. Your wallet's balance updates immediately — no need to
reconnect.

Related Anvil cheat RPCs, same shape: `anvil_setNonce`, `anvil_impersonateAccount`
(send *as* any address without its key), `anvil_mine`, `anvil_setStorageAt`.

> On **testnet** there is no equivalent — use the faucet at
> <https://faucet.testnet.chain.robinhood.com/> (Step 13). On mainnet you bridge
> or buy real ETH.

### Step 9. (Optional) Enable document upload

Get a JWT from <https://app.pinata.cloud> → API Keys, then in `.env.local`:

```bash
PINATA_JWT_TOKEN=eyJ...
PINATA_GATEWAY=your-gateway.mypinata.cloud
```

Restart `npm run dev`. Without this the dashboard browses fine, but upload and
preview fail with *"PINATA_JWT_TOKEN is not configured on the server"*.

### Step 10. Create a will

Dashboard → **Will Settings** → set an inactivity threshold and required
approvals → **Create will on-chain** → approve in your wallet.

**Check:** Dashboard Overview now shows the will instead of "No Active Will
Found". Add a custodian and a beneficiary from their tabs.

---

## Part C — Deploy to Robinhood Chain Testnet (46630)

### Step 11. Run the test suite

```bash
cd contracts
forge test
```

**Check:** `140 tests passed, 0 failed`. Do not deploy on a red suite.

### Step 12. Create a deployer key

```bash
cast wallet new
```

Save the address and private key. Use a **fresh key** — never a personal wallet.

### Step 13. Fund it

Paste the address into <https://faucet.testnet.chain.robinhood.com/>.

**Check:**

```bash
export RH_TESTNET_RPC_URL=https://rpc.testnet.chain.robinhood.com
cast balance <YOUR_DEPLOYER_ADDRESS> --rpc-url "$RH_TESTNET_RPC_URL"
```

Returns a non-zero number.

### Step 14. Store the key in the keystore

Better than `--private-key`, which leaves the key in your shell history:

```bash
cast wallet import rh-testnet-deployer --interactive
```

Paste the key, set a password.

**Check:** `cast wallet list` shows `rh-testnet-deployer`.

### Step 15. Dry run

Same command as the real thing, minus `--broadcast` — it simulates and reports
gas without sending anything, and leaves `deployments/` untouched, so it is safe
to run against a chain that already has a deployment you care about.

```bash
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RH_TESTNET_RPC_URL" \
  --account rh-testnet-deployer
```

**Check:** ends with `SIMULATION COMPLETE`, no revert.

### Step 16. Deploy

```bash
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RH_TESTNET_RPC_URL" \
  --account rh-testnet-deployer \
  --broadcast --verify \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.chain.robinhood.com/api/
```

**Check:** `ONCHAIN EXECUTION COMPLETE & SUCCESSFUL`, and
`contracts/deployments/46630.json` now exists.

### Step 17. Confirm the contract is live

```bash
ADDR=$(jq -r .address deployments/46630.json)
echo "$ADDR"
cast code $ADDR --rpc-url "$RH_TESTNET_RPC_URL" | head -c 20    # not "0x"
cast call $ADDR "GRACE_PERIOD()(uint40)" --rpc-url "$RH_TESTNET_RPC_URL"   # 604800
cast call $ADDR "CLAIM_WINDOW()(uint40)" --rpc-url "$RH_TESTNET_RPC_URL"   # 7776000
```

**Check:** all three match the comments.

### Step 18. Sync the frontend

```bash
./script/sync-abi.sh
```

**Check:** `app/lib/evm/deployments.ts` now contains a `46630:` entry.

### Step 19. Point the app at testnet

In `app/.env.local`:

```bash
NEXT_PUBLIC_CHAIN_ID=46630
```

Restart `npm run dev`.

**Check:** the header chip reads `Robinhood Chain Testnet`. Switch your wallet to
that network and the "Switch to…" button clears.

---

## Part D — Deploy to Robinhood Chain Mainnet (4663)

> Work through **§5 "Before mainnet"** in [`DEPLOYMENT.md`](./DEPLOYMENT.md)
> first. The security review (phases 17–19 of the migration plan) has **not**
> been done yet.
>
> The contract is **immutable**: no proxy, no admin, no pause. A redeploy is a
> new address with no state and no migration path for wills created against the
> old one. This deploy is final.

### Step 20. Deploy with a hardware wallet

```bash
export RH_MAINNET_RPC_URL=https://rpc.mainnet.chain.robinhood.com

forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RH_MAINNET_RPC_URL" \
  --ledger --broadcast
```

Dry-run first by omitting `--broadcast`.

### Step 21. Verify the source separately

`--verify` is left off above on purpose: as of 2026-09-12 the mainnet Blockscout
API returns **HTTP 403** to unauthenticated requests (the testnet one answers
200). The RPC itself is fine. Once you have an explorer API key:

```bash
forge verify-contract <ADDRESS> src/core/VaultInheritance.sol:VaultInheritance \
  --chain-id 4663 --verifier blockscout \
  --verifier-url https://robinhoodchain.blockscout.com/api/ \
  --etherscan-api-key "$BLOCKSCOUT_API_KEY"
```

### Step 22. Sync and point the app at mainnet

```bash
./script/sync-abi.sh
```

In `app/.env.local`:

```bash
NEXT_PUBLIC_CHAIN_ID=4663
NEXT_PUBLIC_RPC_URL=<your dedicated provider URL>
```

The public endpoints are rate-limited and, per the Robinhood Chain docs, not
recommended for production.

### Step 23. Production build

```bash
cd ../app
npm run verify        # typecheck, lint, dependency audit
npm run build
npm start             # serves on port 3001
```

**Check:** all three succeed. Generate a **fresh** `SESSION_SECRET` for the
production environment — do not reuse the development one.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `forge: command not found` | Step 2 — Foundry is at `~/.foundry/bin`. |
| `Chain 'Anvil' does not support contract 'multicall3'` | Anvil has no Multicall3. Re-run Step 4. |
| `HTTP request failed … Failed to fetch` on `127.0.0.1:8545` | Anvil is not running (`cast chain-id --rpc-url http://127.0.0.1:8545`). Re-run Step 4. |
| `NEXT_PUBLIC_CHAIN_ID is not set` | No `.env.local`. Step 5. |
| `Parsing CSS source code failed` | Stale `.next`. `rm -rf app/.next` and restart. |
| Header says "Switch to \<network\>" | Wallet is on a different chain. Click it. Reads work; writes are blocked until it matches. |
| "No Active Will Found" with a wallet connected | Expected — a will is keyed by its owner's address, so you only see your own. Step 10. |
| Redeployed, app shows stale or empty data | `NEXT_PUBLIC_CONTRACT_ADDRESS` is pinned in `.env.local`, or `sync-abi.sh` was not re-run. Unset the former, run the latter. |
| Upload fails: `PINATA_JWT_TOKEN is not configured` | Step 9. |
| Transaction hangs on "Submitting…", but the change appears after a page reload | MetaMask caches the account nonce per network. Restarting Anvil resets the chain, so the cached nonce is ahead and the tx never mines. **MetaMask → Settings → Advanced → Clear activity tab data**, then retry. Do this after every Anvil restart. |
| "view tx" link reloads the page instead of opening an explorer | Local Anvil has no block explorer. Fixed — the link is now a click-to-copy hash on chains without one. |
| Wallet connected, reads fine, but every transaction fails | The account has 0 ETH for gas. Step 8b. |
| `anvil_setBalance` → `invalid type: integer … expected any value` | The amount must be hex: `$(cast to-hex $(cast to-wei 100 ether))`. |
