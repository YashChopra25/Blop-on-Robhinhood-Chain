import type { Address } from "viem";

/**
 * One escrowed ERC-20 as it reads to the owner.
 *
 * Three Solana fields are gone, and their absence is the whole token-custody
 * story of this migration: `publicKey` (the TokenVault PDA), `vault` (the will's
 * associated token account) and `ata` (the owner's). On EVM there are no
 * per-owner token accounts — one contract holds every will's balance and keeps a
 * per-will ledger — so the escrow is identified by the token address alone.
 */
export interface TokenVaultDisplay {
  token: Address;
  symbol: string;
  name: string;
  decimals: number;
  /** Cumulative amount ever escrowed (UI amount) — the share denominator. */
  totalEscrowed: string;
  /** Still held for this will (UI amount). */
  vaultBalance: string;
  /** The connected wallet's own balance of this token (UI amount). */
  userBalance: string;
}

export interface NewTokenEscrowInput {
  token: string;
  amount: string;
}
