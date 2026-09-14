/**
 * Minimal ERC-20 ABI.
 *
 * Successor to the Solana client's SPL handling — `TOKEN_PROGRAM_ID`,
 * `TOKEN_2022_PROGRAM_ID`, `ASSOCIATED_TOKEN_PROGRAM_ID`, `getAta` and
 * `resolveTokenProgram`, which existed because a mint could belong to either of
 * two token programs and passing the wrong one derived the wrong associated
 * token account.
 *
 * None of that has an equivalent here. ERC-20 is one interface, a balance is a
 * mapping entry inside the token contract, and there is no account to derive —
 * so the whole `resolveTokenProgram` round trip and the M7 bug class it guarded
 * against simply do not exist.
 *
 * `name`, `symbol` and `decimals` are optional in the standard, so every read of
 * them is treated as best-effort (see `lib/tokens.ts`).
 */
export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;
