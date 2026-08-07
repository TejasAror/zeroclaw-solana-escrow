"use strict";
/**
 * PDA (Program Derived Address) derivation utilities for the Solana Escrow SDK
 *
 * This module handles all PDA derivations required by the escrow program,
 * including the escrow account, SOL vault, and SPL token vault.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveEscrowPDAs = deriveEscrowPDAs;
exports.deriveEscrowAddress = deriveEscrowAddress;
exports.deriveVaultAddress = deriveVaultAddress;
exports.deriveTokenVaultAddress = deriveTokenVaultAddress;
exports.deriveAssociatedTokenAccount = deriveAssociatedTokenAccount;
exports.validateEscrowAddress = validateEscrowAddress;
exports.validateVaultAddress = validateVaultAddress;
exports.validateTokenVaultAddress = validateTokenVaultAddress;
exports.getPDASeedsInfo = getPDASeedsInfo;
const web3_js_1 = require("@solana/web3.js");
const constants_1 = require("./constants");
const types_1 = require("./types");
/**
 * Derives all PDAs required for an escrow account
 *
 * @param buyer - The buyer's public key (used as seed for escrow PDA)
 * @param programId - Optional custom program ID (defaults to deployed Devnet program)
 * @returns Object containing all derived PDAs and their bumps
 */
async function deriveEscrowPDAs(buyer, programId = constants_1.PROGRAM_ID) {
    try {
        // Derive escrow PDA: ["escrow", buyer]
        const [escrow, escrowBump] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from(constants_1.PDA_SEEDS.ESCROW), buyer.toBuffer()], programId);
        // Derive vault PDA: ["vault", escrow]
        const [vault, vaultBump] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from(constants_1.PDA_SEEDS.VAULT), escrow.toBuffer()], programId);
        // Derive token vault PDA: ["token_vault", escrow]
        const [tokenVault, tokenVaultBump] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from(constants_1.PDA_SEEDS.TOKEN_VAULT), escrow.toBuffer()], programId);
        return {
            escrow,
            escrowBump,
            vault,
            vaultBump,
            tokenVault,
            tokenVaultBump,
        };
    }
    catch (error) {
        throw new types_1.PDAError(`Failed to derive escrow PDAs for buyer ${buyer.toBase58()}`, error);
    }
}
/**
 * Derives the escrow PDA for a given buyer
 *
 * @param buyer - The buyer's public key
 * @param programId - Optional custom program ID
 * @returns Tuple of [escrow PDA, bump]
 */
function deriveEscrowAddress(buyer, programId = constants_1.PROGRAM_ID) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from(constants_1.PDA_SEEDS.ESCROW), buyer.toBuffer()], programId);
}
/**
 * Derives the vault PDA for a given escrow account
 *
 * @param escrow - The escrow account public key
 * @param programId - Optional custom program ID
 * @returns Tuple of [vault PDA, bump]
 */
function deriveVaultAddress(escrow, programId = constants_1.PROGRAM_ID) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from(constants_1.PDA_SEEDS.VAULT), escrow.toBuffer()], programId);
}
/**
 * Derives the token vault PDA for a given escrow account
 *
 * @param escrow - The escrow account public key
 * @param programId - Optional custom program ID
 * @returns Tuple of [token vault PDA, bump]
 */
function deriveTokenVaultAddress(escrow, programId = constants_1.PROGRAM_ID) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from(constants_1.PDA_SEEDS.TOKEN_VAULT), escrow.toBuffer()], programId);
}
/**
 * Derives the associated token account for a wallet and mint
 *
 * @param wallet - The wallet public key
 * @param mint - The token mint public key
 * @param tokenProgramId - Optional token program ID (defaults to SPL Token program)
 * @returns The associated token account address
 */
function deriveAssociatedTokenAccount(wallet, mint, tokenProgramId = new web3_js_1.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')) {
    const [address] = web3_js_1.PublicKey.findProgramAddressSync([
        wallet.toBuffer(),
        tokenProgramId.toBuffer(),
        mint.toBuffer(),
    ], new web3_js_1.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'));
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
function validateEscrowAddress(escrow, buyer, programId = constants_1.PROGRAM_ID) {
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
function validateVaultAddress(vault, escrow, programId = constants_1.PROGRAM_ID) {
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
function validateTokenVaultAddress(tokenVault, escrow, programId = constants_1.PROGRAM_ID) {
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
function getPDASeedsInfo(buyer, programId = constants_1.PROGRAM_ID) {
    const [escrow, escrowBump] = deriveEscrowAddress(buyer, programId);
    const [vault, vaultBump] = deriveVaultAddress(escrow, programId);
    const [tokenVault, tokenVaultBump] = deriveTokenVaultAddress(escrow, programId);
    return {
        escrow: {
            seeds: [Buffer.from(constants_1.PDA_SEEDS.ESCROW), buyer.toBuffer()],
            address: escrow,
            bump: escrowBump,
        },
        vault: {
            seeds: [Buffer.from(constants_1.PDA_SEEDS.VAULT), escrow.toBuffer()],
            address: vault,
            bump: vaultBump,
        },
        tokenVault: {
            seeds: [Buffer.from(constants_1.PDA_SEEDS.TOKEN_VAULT), escrow.toBuffer()],
            address: tokenVault,
            bump: tokenVaultBump,
        },
    };
}
//# sourceMappingURL=pda.js.map