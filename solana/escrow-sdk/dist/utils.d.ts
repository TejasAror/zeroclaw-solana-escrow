/**
 * Utility functions for the Solana Escrow SDK
 *
 * This module contains validation, conversion, and helper functions
 * used throughout the SDK.
 */
import { PublicKey } from '@solana/web3.js';
import { InitializeEscrowParams, EscrowStatus } from './types';
/**
 * Validates that a value is a valid Solana public key
 *
 * @param value - The value to validate
 * @param fieldName - Name of the field (for error messages)
 * @returns The validated PublicKey
 * @throws ValidationError if invalid
 */
export declare function validatePublicKey(value: unknown, fieldName: string): PublicKey;
/**
 * Validates that a value is a valid positive u64 (bigint)
 *
 * @param value - The value to validate
 * @param fieldName - Name of the field (for error messages)
 * @param allowZero - Whether zero is allowed
 * @returns The validated bigint
 * @throws ValidationError if invalid
 */
export declare function validateU64(value: unknown, fieldName: string, allowZero?: boolean): bigint;
/**
 * Validates an agreement hash (32 bytes)
 *
 * @param value - The agreement hash to validate
 * @returns Validated Uint8Array of length 32
 * @throws ValidationError if invalid
 */
export declare function validateAgreementHash(value: unknown): Uint8Array;
/**
 * Validates an expiration timestamp (i64 option)
 *
 * @param value - The expiration timestamp (unix seconds, or null for no expiration)
 * @returns Validated bigint or null
 * @throws ValidationError if invalid
 */
export declare function validateExpiration(value: unknown): bigint | null;
/**
 * Validates all parameters for initializing an escrow
 *
 * @param params - The initialization parameters
 * @returns Validated parameters with proper types
 * @throws ValidationError if any parameter is invalid
 */
export declare function validateInitializeEscrowParams(params: InitializeEscrowParams): {
    amount: bigint;
    agreementHash: Uint8Array;
    expiresAt: bigint | null;
    tokenMint: PublicKey | null;
    buyerTokenAccount: PublicKey | null;
};
/**
 * Validates a seller token account for SPL token release
 *
 * @param sellerTokenAccount - The seller's token account
 * @returns Validated PublicKey
 * @throws ValidationError if invalid
 */
export declare function validateSellerTokenAccount(sellerTokenAccount: unknown): PublicKey;
/**
 * Validates a buyer token account for SPL token cancellation
 *
 * @param buyerTokenAccount - The buyer's token account
 * @returns Validated PublicKey
 * @throws ValidationError if invalid
 */
export declare function validateBuyerTokenAccount(buyerTokenAccount: unknown): PublicKey;
/**
 * Converts SOL to lamports
 *
 * @param sol - Amount in SOL
 * @returns Amount in lamports (bigint)
 */
export declare function solToLamports(sol: number | bigint | string): bigint;
/**
 * Converts lamports to SOL
 *
 * @param lamports - Amount in lamports
 * @returns Amount in SOL (number)
 */
export declare function lamportsToSol(lamports: bigint | number): number;
/**
 * Converts a bigint u64 to a number (for display purposes)
 *
 * @param value - The u64 value
 * @returns Number representation (may lose precision for large values)
 */
export declare function u64ToNumber(value: bigint): number;
/**
 * Formats a public key for display (shortened)
 *
 * @param pubkey - The public key
 * @param chars - Number of chars to show at start/end (default: 4)
 * @returns Formatted string like "AbCd...WxYz"
 */
export declare function formatPubkey(pubkey: PublicKey, chars?: number): string;
/**
 * Formats a bigint amount for display with SOL/token decimals
 *
 * @param amount - The amount in base units
 * @param decimals - Number of decimals (9 for SOL, varies for SPL tokens)
 * @param symbol - Optional symbol to append
 * @returns Formatted string like "1.5 SOL"
 */
export declare function formatAmount(amount: bigint, decimals?: number, symbol?: string): string;
/**
 * Extracts program error code from a transaction error
 *
 * @param error - The transaction error
 * @returns Program error code or null if not a program error
 */
export declare function extractProgramErrorCode(error: any): number | null;
/**
 * Creates a descriptive error message from a program error code
 *
 * @param code - The program error code
 * @returns Human-readable error message
 */
export declare function getProgramErrorMessage(code: number): string;
/**
 * Checks if an error is a specific program error
 *
 * @param error - The error to check
 * @param code - The program error code to check for
 * @returns True if the error matches the code
 */
export declare function isProgramError(error: any, code: number): boolean;
/**
 * Gets the status variant name from an EscrowStatus
 *
 * @param status - The escrow status
 * @returns The variant name as string
 */
export declare function getEscrowStatusName(status: EscrowStatus): string;
/**
 * Checks if an escrow is in a terminal state (Released, Cancelled, Expired)
 *
 * @param status - The escrow status
 * @returns True if terminal
 */
export declare function isEscrowTerminal(status: EscrowStatus): boolean;
/**
 * Checks if an escrow can be approved (must be Pending)
 *
 * @param status - The escrow status
 * @returns True if can approve
 */
export declare function canApprove(status: EscrowStatus): boolean;
/**
 * Checks if an escrow can release funds (must be Approved)
 *
 * @param status - The escrow status
 * @returns True if can release
 */
export declare function canRelease(status: EscrowStatus): boolean;
/**
 * Checks if an escrow can be cancelled (must be Pending and not expired)
 *
 * @param status - The escrow status
 * @param expiresAt - Optional expiration timestamp
 * @returns True if can cancel
 */
export declare function canCancel(status: EscrowStatus, expiresAt?: bigint | null): boolean;
/**
 * Generates a random 32-byte agreement hash
 *
 * @returns Uint8Array of 32 random bytes
 */
export declare function generateAgreementHash(): Uint8Array;
/**
 * Creates an agreement hash from a string (e.g., contract terms)
 *
 * @param terms - The agreement terms string
 * @returns SHA-256 hash as Uint8Array
 */
export declare function createAgreementHashFromTerms(terms: string): Promise<Uint8Array>;
/**
 * Creates an agreement hash from structured data
 *
 * @param data - Any serializable data
 * @returns SHA-256 hash as Uint8Array
 */
export declare function createAgreementHashFromData(data: any): Promise<Uint8Array>;
/**
 * Retries an async function with exponential backoff
 *
 * @param fn - The async function to retry
 * @param maxRetries - Maximum number of retries
 * @param baseDelay - Base delay in ms
 * @param maxDelay - Maximum delay in ms
 * @returns The result of the function
 */
export declare function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries?: number, baseDelay?: number, maxDelay?: number): Promise<T>;
/**
 * Gets current unix timestamp in seconds
 *
 * @returns Current timestamp as bigint
 */
export declare function getCurrentTimestamp(): bigint;
/**
 * Adds seconds to a timestamp
 *
 * @param timestamp - Base timestamp (seconds)
 * @param seconds - Seconds to add
 * @returns New timestamp
 */
export declare function addSeconds(timestamp: bigint, seconds: number): bigint;
/**
 * Creates an expiration timestamp from now + duration
 *
 * @param durationSeconds - Duration in seconds from now
 * @returns Expiration timestamp
 */
export declare function createExpiration(durationSeconds: number): bigint;
/**
 * Checks if a timestamp has expired
 *
 * @param expiresAt - Expiration timestamp (or null for no expiration)
 * @returns True if expired
 */
export declare function isExpired(expiresAt: bigint | null): boolean;
/**
 * Gets time remaining until expiration
 *
 * @param expiresAt - Expiration timestamp (or null for no expiration)
 * @returns Seconds remaining (negative if expired), or null if no expiration
 */
export declare function getTimeRemaining(expiresAt: bigint | null): bigint | null;
//# sourceMappingURL=utils.d.ts.map