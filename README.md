# Blop — On-Chain Inheritance Vault on Robinhood Chain

A non-custodial **digital will / dead-man's switch** for ERC-20 assets, deployed on
[Robinhood Chain](https://docs.robinhood.com/chain) (an Arbitrum Orbit L2 on Ethereum).

An owner creates a will, names **custodians** (who can attest to the owner's death) and
**beneficiaries** (heirs with basis-point shares), escrows ERC-20 tokens, and attaches
client-encrypted documents stored on IPFS — only the CID goes on-chain. If the owner stops
checking in for longer than their inactivity threshold, a quorum of custodians can flip the
will to `Claimable`; after a grace period, heirs pull their shares.

This is an EVM port of the original Solana/Anchor `vault-inheritance` program.

> **Status:** deployed on testnet. A security review has **not** been completed — do not
> use with real funds. See the [pre-mainnet checklist](./DEPLOYMENT.md#5-before-mainnet).

---

## How it works

```
 Active ──(owner inactive > threshold)──► custodians confirmDeath ──► Pending
                                                                        │
                                                            quorum reached
                                                                        ▼
 Active ◄──(owner revokes within grace)─────────────────────────── Claimable
                                                                        │
                                                          + GRACE_PERIOD (7 days)
                                                                        ▼
                                                        heirs claimToken / claimInheritance
                                                                        │
                                                          + CLAIM_WINDOW (90 days)
                                                                        ▼
                                          anyone: sweepTokenVault (→ owner) / closeEstate
```

| Role | Can do |
|---|---|
| **Owner** | Create/update/delete the will, manage custodians, heirs, media and token deposits, check in, revoke a death confirmation during the grace period |
| **Custodian** | `confirmDeath` once the owner has been inactive past the threshold |
| **Beneficiary** | Register an encryption key; claim their share once claims open |
| **Anyone** | After the claim window, sweep unclaimed tokens back to the owner's address and close the estate |

Key design properties:

- **One immutable contract** — no proxy, no admin, no pause, no `Ownable`. Authorization is
  derived per will from storage; owner-only functions take no owner parameter, so there is
  nothing to impersonate.
- **Pooled custody with a per-vault ledger**, guarded by invariant tests for cross-will isolation.
- **Hardened against weird ERC-20s** — fee-on-transfer, reverting and other adversarial tokens
  are covered by mocks in the test suite.
- Claim amount = `min(totalDeposited × bps / 10_000, remaining)`.

---

## Documentation

Full documentation lives in [`docs/`](./docs/README.md):

- [Overview](./docs/overview.md) — concepts, roles, lifecycle, glossary
- [User guide](./docs/user-guide.md) — using the dashboard as an owner, custodian or heir
- [Smart contract reference](./docs/smart-contract-reference.md) — functions, events, errors
- [Frontend guide](./docs/frontend.md) — app architecture and data flow
- [Testing](./docs/testing.md) · [Security](./docs/security.md)

---

## Repository layout

```
.
├── contracts/                   Foundry project (Solidity 0.8.26)
│   ├── src/
│   │   ├── core/VaultInheritance.sol   the entire protocol
│   │   ├── libraries/WillLib.sol       timeline, quorum and share maths
│   │   ├── structs/                    storage (Types) and view (Views) structs
│   │   ├── errors/  events/            custom errors and events
│   │   └── mocks/MockERC20.sol         well-behaved + adversarial tokens (tests only)
│   ├── test/                    unit, fuzz and invariant tests
│   ├── script/                  Deploy.s.sol, anvil-dev.sh, sync-abi.sh, verify-network.sh
│   ├── config/networks.json
│   └── deployments/             per-chain deployment records
│
├── app/                         Next.js 16 + React 19 + wagmi/viem frontend
│   ├── app/dashboard/           overview, assets, custodians, beneficiaries, files,
│   │                            inheritance, intervene, settings
│   ├── app/api/                 auth (sessions) and ipfs (Pinata) routes
│   └── lib/evm/                 ABI, chains, deployments, batched will reads
│
├── DEPLOYMENT.md                reference deployment guide
├── step_depl.md                 step-by-step deployment walkthrough
├── ROBINHOOD_CHAIN.md           verified network facts
└── SOLIDITY_ARCHITECTURE.md     contract, storage and access-control design
```

---

## Deployments

| Network | Chain ID | Address |
|---|---|---|
| Robinhood Chain Testnet | 46630 | [`0x87279BFB3BD7f1d4338bB860612a96a1D9A67cF3`](https://explorer.testnet.chain.robinhood.com/address/0x87279BFB3BD7f1d4338bB860612a96a1D9A67cF3) |
| Robinhood Chain Mainnet | 4663 | not deployed |

---

## Quick start (local)

**Prerequisites:** [Foundry](https://book.getfoundry.sh/getting-started/installation),
Node.js 20+, and `jq`.

```bash
# 1. Start Anvil, install Multicall3, deploy, and sync the ABI into the app
cd contracts
./script/anvil-dev.sh

# 2. Configure and run the frontend
cd ../app
npm install
cp .env.example .env.local        # set SESSION_SECRET: openssl rand -hex 32
npm run dev                       # http://localhost:3000
```

Add Anvil to your wallet (RPC `http://127.0.0.1:8545`, chain ID `31337`) and import an Anvil
dev account. See [DEPLOYMENT.md](./DEPLOYMENT.md#1-local-development-anvil) for details.

---

## Testing

```bash
cd contracts
forge test                 # unit + fuzz + invariant (140 tests, 11 invariants)
forge test --gas-report

cd ../app
npm run verify             # typecheck + lint + dependency audit
```

Fuzzing uses a fixed seed, so CI failures reproduce locally.

---

## Deploying to Robinhood Chain

```bash
cd contracts
cast wallet import rh-testnet-deployer --interactive

forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://rpc.testnet.chain.robinhood.com \
  --account rh-testnet-deployer \
  --broadcast --verify \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.chain.robinhood.com/api/

./script/sync-abi.sh       # writes app/lib/evm/{abi,deployments}.ts
```

Then set `NEXT_PUBLIC_CHAIN_ID=46630` in `app/.env.local`. Testnet ETH comes from the
[faucet](https://faucet.testnet.chain.robinhood.com/). For mainnet, verification caveats and
the full checklist, see [DEPLOYMENT.md](./DEPLOYMENT.md) or [step_depl.md](./step_depl.md).

---

## Frontend environment

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_CHAIN_ID` | yes | `4663` mainnet · `46630` testnet · `31337` Anvil |
| `NEXT_PUBLIC_RPC_URL` | no | Defaults to the chain's public (rate-limited) endpoint |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | no | Resolved from `deployments.ts`; set only to override |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | no | Enables the WalletConnect connector |
| `SESSION_SECRET` | yes | ≥ 32 chars, server-only |
| `PINATA_JWT_TOKEN` | for IPFS | Needed for document upload and preview |
| `PINATA_GATEWAY` | no | Dedicated Pinata gateway host |

Never add the `NEXT_PUBLIC_` prefix to secrets.

---

## Network reference

| | Mainnet | Testnet |
|---|---|---|
| Chain ID | 4663 | 46630 |
| RPC | `https://rpc.mainnet.chain.robinhood.com` | `https://rpc.testnet.chain.robinhood.com` |
| Explorer | [robinhoodchain.blockscout.com](https://robinhoodchain.blockscout.com) | [explorer.testnet.chain.robinhood.com](https://explorer.testnet.chain.robinhood.com) |
| Gas token | ETH | ETH |

More details, including sequencing and finality, are in [ROBINHOOD_CHAIN.md](./ROBINHOOD_CHAIN.md).

---

## Tech stack

**Contracts:** Solidity 0.8.26 · Foundry · OpenZeppelin (`SafeERC20`, `ReentrancyGuard`)
**Frontend:** Next.js 16 · React 19 · wagmi · viem · TanStack Query · Redux Toolkit · Tailwind
**Storage:** IPFS via Pinata (client-side encrypted)
