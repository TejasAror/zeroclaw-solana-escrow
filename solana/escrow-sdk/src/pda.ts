/**
 * PDA (Program Derived Address) derivation utilities for the Solana Escrow SDK
 * 
 * This module handles all PDA derivations required by the escrow program,
 * including the escrow account, SOL vault, and SPL token vault.
 */

import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ID, PDA_SEEDS } from './constants';
import { DerivedPDAs, PDAError } from './types';

/**
 * Derives all PDAs required for an escrow account
 * 
 * @param buyer - The buyer's public key (used as seed for escrow PDA)
 * @param programId - Optional custom program ID (defaults to deployed Devnet program)
 * @returns Object containing all derived PDAs and their bumps
 */
export async function deriveEscrowPDAs(
  buyer: PublicKey,
  programId: PublicKey = PROGRAM_ID
): Promise<DerivedPDAs> {
  try {
    // Derive escrow PDA: ["escrow", buyer]
    const [escrow, escrowBump] = PublicKey.findProgramAddressSync(
      [Buffer.from(PDA_SEEDS.ESCROW), buyer.toBuffer()],
      programId
    );

    // Derive vault PDA: ["vault", escrow]
    const [vault, vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from(PDA_SEEDS.VAULT), escrow.toBuffer()],
      programId
    );

    // Derive token vault PDA: ["token_vault", escrow]
    const [tokenVault, tokenVaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from(PDA_SEEDS.TOKEN_VAULT), escrow.toBuffer()],
      programId
    );

    return {
      escrow,
      escrowBump,
      vault,
      vaultBump,
      tokenVault,
      tokenVaultBump,
    };
  } catch (error) {
    throw new PDAError(
      `Failed to derive escrow PDAs for buyer ${buyer.toBase58()}`,
      error as Error
    );
  }
}

/**
 * Derives the escrow PDA for a given buyer
 * 
 * @param buyer - The buyer's public key
 * @param programId - Optional custom program ID
 * @returns Tuple of [escrow PDA, bump]
 */
export function deriveEscrowAddress(
  buyer: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.ESCROW), buyer.toBuffer()],
    programId
  );
}

/**
 * Derives the vault PDA for a given escrow account
 * 
 * @param escrow - The escrow account public key
 * @param programId - Optional custom program ID
 * @returns Tuple of [vault PDA, bump]
 */
export function deriveVaultAddress(
  escrow: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.VAULT), escrow.toBuffer()],
    programId
  );
}

/**
 * Derives the token vault PDA for a given escrow account
 * 
 * @param escrow - The escrow account public key
 * @param programId - Optional custom program ID
 * @returns Tuple of [token vault PDA, bump]
 */
export function deriveTokenVaultAddress(
  escrow: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.TOKEN_VAULT), escrow.toBuffer()],
    programId
  );
}

/**
 * Derives the associated token account for a wallet and mint
 * 
 * @param wallet - The wallet public key
 * @param mint - The token mint public key
 * @param tokenProgramId - Optional token program ID (defaults to SPL Token program)
 * @returns The associated token account address
 */
export function deriveAssociatedTokenAccount(
  wallet: PublicKey,
  mint: PublicKey,
  tokenProgramId: PublicKey = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [
      wallet.toBuffer(),
      tokenProgramId.toBuffer(),
      mint.toBuffer(),
    ],
    new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
  );
  return address;
}

/**
 * Validates that a given address matches the expected PDA for an escrow
 * 
 * @param escrow - The escrow address to validate
 * @param buyer - The expected buyer
 * @param programId - Optional custom program ID
 * @returns True if the address is valid for the given buyer
 */
export function validateEscrowAddress(
  escrow: PublicKey,
  buyer: PublicKey,
  programId: PublicKey = PROGRAM_ID
): boolean {
  const [expectedEscrow] = deriveEscrowAddress(buyer, programId);
  return escrow.equals(expectedEscrow);
}

/**
 * Validates that a given address matches the expected vault PDA for an escrow
 * 
 * @param vault - The vault address to validate
 * @param escrow - The escrow account
 * @param programId - Optional custom program ID
 * @returns True if the address is valid for the given escrow
 */
export function validateVaultAddress(
  vault: PublicKey,
  escrow: PublicKey,
  programId: PublicKey = PROGRAM_ID
): boolean {
  const [expectedVault] = deriveVaultAddress(escrow, programId);
  return vault.equals(expectedVault);
}

/**
 * Validates that a given address matches the expected token vault PDA for an escrow
 * 
 * @param tokenVault - The token vault address to validate
 * @param escrow - The escrow account
 * @param programId - Optional custom program ID
 * @returns True if the address is valid for the given escrow
 */
export function validateTokenVaultAddress(
  tokenVault: PublicKey,
  escrow: PublicKey,
  programId: PublicKey = PROGRAM_ID
): boolean {
  const [expectedTokenVault] = deriveTokenVaultAddress(escrow, programId);
  return tokenVault.equals(expectedTokenVault);
}

/**
 * Gets all PDA seeds for debugging/logging purposes
 * 
 * @param buyer - The buyer's public key
 * @param programId - Optional custom program ID
 * @returns Object with seed information
 */
export function getPDASeedsInfo(
  buyer: PublicKey,
  programId: PublicKey = PROGRAM_ID
): {
  escrow: { seeds: (Buffer | Uint8Array)[]; address: PublicKey; bump: number };
  vault: { seeds: (Buffer | Uint8Array)[]; address: PublicKey; bump: number };
  tokenVault: { seeds: (Buffer | Uint8Array)[]; address: PublicKey; bump: number };
} {
  const [escrow, escrowBump] = deriveEscrowAddress(buyer, programId);
  const [vault, vaultBump] = deriveVaultAddress(escrow, programId);
  const [tokenVault, tokenVaultBump] = deriveTokenVaultAddress(escrow, programId);

  return {
    escrow: {
      seeds: [Buffer.from(PDA_SEEDS.ESCROW), buyer.toBuffer()],
      address: escrow,
      bump: escrowBump,
    },
    vault: {
      seeds: [Buffer.from(PDA_SEEDS.VAULT), escrow.toBuffer()],
      address: vault,
      bump: vaultBump,
    },
    tokenVault: {
      seeds: [Buffer.from(PDA_SEEDS.TOKEN_VAULT), escrow.toBuffer()],
      address: tokenVault,
      bump: tokenVaultBump,
    },
  };
}