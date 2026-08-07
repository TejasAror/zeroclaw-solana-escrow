/**
 * Constants for the Solana Escrow SDK
 * 
 * This file contains all the constant values used throughout the SDK,
 * including the deployed program ID, default network configuration,
 * and PDA seeds.
 */

import { PublicKey } from '@solana/web3.js';

// Program ID of the deployed escrow program on Devnet
export const PROGRAM_ID = new PublicKey('8u17EnuW66yfRybQY6vGjeTnASeDyxyT6QesPetRtJxk');

// Upgrade authority wallet (deployment wallet)
export const UPGRADE_AUTHORITY = new PublicKey('HNDAhSqXTA6woJLRRQpaMsWX171XVsjgxBXRxz95xfSB');

// Default Solana cluster configuration
export const DEFAULT_CLUSTER = 'devnet' as const;
export const CLUSTER_URLS = {
  mainnet: 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com',
  testnet: 'https://api.testnet.solana.com',
  localnet: 'http://localhost:8899',
} as const;

// PDA Seeds (as defined in the Anchor program)
export const PDA_SEEDS = {
  ESCROW: 'escrow',
  VAULT: 'vault',
  TOKEN_VAULT: 'token_vault',
} as const;

// Token program IDs
export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
export const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');

// Default commitment level for transactions
export const DEFAULT_COMMITMENT = 'confirmed' as const;

// Transaction confirmation settings
export const CONFIRMATION_SETTINGS = {
  maxRetries: 30,
  retryInterval: 1000,
  commitment: DEFAULT_COMMITMENT,
} as const;

// Lamports per SOL
export const LAMPORTS_PER_SOL = 1_000_000_000;

// Maximum account size for escrow (approximate)
export const ESCROW_ACCOUNT_SIZE = 500;