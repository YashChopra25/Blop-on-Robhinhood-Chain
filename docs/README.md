# Documentation

Documentation for **Blop**, a non-custodial inheritance vault on Robinhood Chain.
New to the project? Start with the [overview](./overview.md).

## Guides

| Document | Audience | What it covers |
|---|---|---|
| [Overview](./overview.md) | Everyone | What the protocol does, roles, lifecycle, glossary |
| [User guide](./user-guide.md) | Owners, custodians, heirs | Using the dashboard step by step |
| [Frontend guide](./frontend.md) | App developers | Next.js app structure, wallet and data flow, API routes, encryption |
| [Smart contract reference](./smart-contract-reference.md) | Integrators, auditors | Every function, view, event, error and constant |
| [Testing](./testing.md) | Contributors | Unit, fuzz and invariant suites and how to run them |
| [Security](./security.md) | Auditors, operators | Trust model, threat analysis, known limitations |

## Operations

| Document | What it covers |
|---|---|
| [Deployment reference](../DEPLOYMENT.md) | Local, testnet and mainnet deployment, env vars, pre-mainnet checklist, troubleshooting |
| [Step-by-step deployment](../step_depl.md) | Copy-paste walkthrough with a check after each step |
| [Robinhood Chain facts](../ROBINHOOD_CHAIN.md) | Verified chain IDs, RPCs, explorers, opcodes, fees and finality |

## Design records

These were written during the Solana → EVM migration and explain *why* the code looks the way it does.

| Document | What it covers |
|---|---|
| [Solidity architecture](../SOLIDITY_ARCHITECTURE.md) | Contract layout, storage packing, access control, custody model |
