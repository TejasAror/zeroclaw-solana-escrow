/**
 * Utility functions for the Solana Escrow SDK
 * 
 * This module contains validation, conversion, and helper functions
 * used throughout the SDK.
 */

import { PublicKey } from '@solana/web3.js';
import { 
  ValidationError, 
  PROGRAM_ERROR_CODES,
  InitializeEscrowParams,
  EscrowStatus 
} from './types';
import { LAMPORTS_PER_SOL } from './constants';

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates that a value is a valid Solana public key
 * 
 * @param value - The value to validate
 * @param fieldName - Name of the field (for error messages)
 * @returns The validated PublicKey
 * @throws ValidationError if invalid
 */
export function validatePublicKey(value: unknown, fieldName: string): PublicKey {
  if (value === null || value === undefined) {
    throw new ValidationError(`${fieldName} is required`);
  }

  if (typeof value === 'string') {
    try {
      return new PublicKey(value);
    } catch {
      throw new ValidationError(`${fieldName} must be a valid base58 public key`);
    }
  }

  if (value instanceof PublicKey) {
    return value;
  }

  throw new ValidationError(`${fieldName} must be a PublicKey or base58 string`);
}

/**
 * Validates that a value is a valid positive u64 (bigint)
 * 
 * @param value - The value to validate
 * @param fieldName - Name of the field (for error messages)
 * @param allowZero - Whether zero is allowed
 * @returns The validated bigint
 * @throws ValidationError if invalid
 */
export function validateU64(value: unknown, fieldName: string, allowZero = false): bigint {
  if (value === null || value === undefined) {
    throw new ValidationError(`${fieldName} is required`);
  }

  let bigintValue: bigint;
  
  if (typeof value === 'bigint') {
    bigintValue = value;
  } else if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) {
      throw new ValidationError(`${fieldName} must be a non-negative integer`);
    }
    bigintValue = BigInt(value);
  } else if (typeof value === 'string') {
    try {
      bigintValue = BigInt(value);
    } catch {
      throw new ValidationError(`${fieldName} must be a valid integer`);
    }
  } else {
    throw new ValidationError(`${fieldName} must be a number, bigint, or numeric string`);
  }

  if (!allowZero && bigintValue <= 0n) {
    throw new ValidationError(`${fieldName} must be greater than zero`);
  }

  if (bigintValue < 0n) {
    throw new ValidationError(`${fieldName} must be non-negative`);
  }

  // Check u64 max (2^64 - 1)
  const U64_MAX = 18446744073709551615n;
  if (bigintValue > U64_MAX) {
    throw new ValidationError(`${fieldName} exceeds u64 maximum (${U64_MAX})`);
  }

  return bigintValue;
}

/**
 * Validates an agreement hash (32 bytes)
 * 
 * @param value - The agreement hash to validate
 * @returns Validated Uint8Array of length 32
 * @throws ValidationError if invalid
 */
export function validateAgreementHash(value: unknown): Uint8Array {
  if (value === null || value === undefined) {
    throw new ValidationError('agreementHash is required');
  }

  let hash: Uint8Array;

  if (value instanceof Uint8Array) {
    hash = value;
  } else if (Array.isArray(value)) {
    hash = new Uint8Array(value);
  } else if (typeof value === 'string') {
    // Try to decode as base64 or hex
    try {
      if (value.length === 64 && /^[0-9a-fA-F]+$/.test(value)) {
        // Hex string
        hash = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
          hash[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
        }
      } else {
        // Base64 string
        const binary = atob(value);
        hash = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          hash[i] = binary.charCodeAt(i);
        }
      }
    } catch {
      throw new ValidationError('agreementHash must be a valid base64 or hex string');
    }
  } else {
    throw new ValidationError('agreementHash must be a Uint8Array, number array, or base64/hex string');
  }

  if (hash.length !== 32) {
    throw new ValidationError(`agreementHash must be exactly 32 bytes, got ${hash.length}`);
  }

  return hash;
}

/**
 * Validates an expiration timestamp (i64 option)
 * 
 * @param value - The expiration timestamp (unix seconds, or null for no expiration)
 * @returns Validated bigint or null
 * @throws ValidationError if invalid
 */
export function validateExpiration(value: unknown): bigint | null {
  if (value === null || value === undefined) {
    return null;
  }

  let timestamp: bigint;

  if (typeof value === 'bigint') {
    timestamp = value;
  } else if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new ValidationError('expiresAt must be an integer unix timestamp');
    }
    timestamp = BigInt(value);
  } else if (typeof value === 'string') {
    try {
      timestamp = BigInt(value);
    } catch {
      throw new ValidationError('expiresAt must be a valid integer unix timestamp');
    }
  } else if (value instanceof Date) {
    timestamp = BigInt(Math.floor(value.getTime() / 1000));
  } else {
    throw new ValidationError('expiresAt must be a number, bigint, string, or Date');
  }

  // Validate it's a reasonable future timestamp (not in the past by more than a day)
  const now = BigInt(Math.floor(Date.now() / 1000));
  const oneDay = 86400n;
  
  if (timestamp < now - oneDay) {
    throw new ValidationError('expiresAt cannot be more than 1 day in the past');
  }

  // Validate it's not too far in the future (100 years)
  const hundredYears = 3153600000n;
  if (timestamp > now + hundredYears) {
    throw new ValidationError('expiresAt cannot be more than 100 years in the future');
  }

  return timestamp;
}

/**
 * Validates all parameters for initializing an escrow
 * 
 * @param params - The initialization parameters
 * @returns Validated parameters with proper types
 * @throws ValidationError if any parameter is invalid
 */
export function validateInitializeEscrowParams(params: InitializeEscrowParams): {
  amount: bigint;
  agreementHash: Uint8Array;
  expiresAt: bigint | null;
  tokenMint: PublicKey | null;
  buyerTokenAccount: PublicKey | null;
} {
  const amount = validateU64(params.amount, 'amount', false);
  const agreementHash = validateAgreementHash(params.agreementHash);
  const expiresAt = validateExpiration(params.expiresAt);
  
  let tokenMint: PublicKey | null = null;
  let buyerTokenAccount: PublicKey | null = null;

  if (params.tokenMint !== undefined && params.tokenMint !== null) {
    tokenMint = validatePublicKey(params.tokenMint, 'tokenMint');
    
    // For SPL token escrows, buyerTokenAccount is required
    if (params.buyerTokenAccount === undefined || params.buyerTokenAccount === null) {
      throw new ValidationError('buyerTokenAccount is required for SPL token escrows');
    }
    buyerTokenAccount = validatePublicKey(params.buyerTokenAccount, 'buyerTokenAccount');
  } else {
    // SOL escrow - ensure no token params provided
    if (params.buyerTokenAccount !== undefined && params.buyerTokenAccount !== null) {
      throw new ValidationError('buyerTokenAccount must not be provided for SOL escrows');
    }
  }

  return {
    amount,
    agreementHash,
    expiresAt,
    tokenMint,
    buyerTokenAccount,
  };
}

/**
 * Validates a seller token account for SPL token release
 * 
 * @param sellerTokenAccount - The seller's token account
 * @returns Validated PublicKey
 * @throws ValidationError if invalid
 */
export function validateSellerTokenAccount(sellerTokenAccount: unknown): PublicKey {
  return validatePublicKey(sellerTokenAccount, 'sellerTokenAccount');
}

/**
 * Validates a buyer token account for SPL token cancellation
 * 
 * @param buyerTokenAccount - The buyer's token account
 * @returns Validated PublicKey
 * @throws ValidationError if invalid
 */
export function validateBuyerTokenAccount(buyerTokenAccount: unknown): PublicKey {
  return validatePublicKey(buyerTokenAccount, 'buyerTokenAccount');
}

// ============================================================================
// Conversion Functions
// ============================================================================

/**
 * Converts SOL to lamports
 * 
 * @param sol - Amount in SOL
 * @returns Amount in lamports (bigint)
 */
export function solToLamports(sol: number | bigint | string): bigint {
  const solValue = typeof sol === 'bigint' ? sol : BigInt(Math.floor(Number(sol) * LAMPORTS_PER_SOL));
  return solValue;
}

/**
 * Converts lamports to SOL
 * 
 * @param lamports - Amount in lamports
 * @returns Amount in SOL (number)
 */
export function lamportsToSol(lamports: bigint | number): number {
  return Number(lamports) / LAMPORTS_PER_SOL;
}

/**
 * Converts a bigint u64 to a number (for display purposes)
 * 
 * @param value - The u64 value
 * @returns Number representation (may lose precision for large values)
 */
export function u64ToNumber(value: bigint): number {
  return Number(value);
}

/**
 * Formats a public key for display (shortened)
 * 
 * @param pubkey - The public key
 * @param chars - Number of chars to show at start/end (default: 4)
 * @returns Formatted string like "AbCd...WxYz"
 */
export function formatPubkey(pubkey: PublicKey, chars = 4): string {
  const str = pubkey.toBase58();
  if (str.length <= chars * 2) return str;
  return `${str.slice(0, chars)}...${str.slice(-chars)}`;
}

/**
 * Formats a bigint amount for display with SOL/token decimals
 * 
 * @param amount - The amount in base units
 * @param decimals - Number of decimals (9 for SOL, varies for SPL tokens)
 * @param symbol - Optional symbol to append
 * @returns Formatted string like "1.5 SOL"
 */
export function formatAmount(amount: bigint, decimals = 9, symbol = ''): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  
  if (fraction === 0n) {
    return `${whole.toString()}${symbol ? ' ' + symbol : ''}`;
  }
  
  const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole.toString()}.${fractionStr}${symbol ? ' ' + symbol : ''}`;
}

// ============================================================================
// Transaction Helpers
// ============================================================================

/**
 * Extracts program error code from a transaction error
 * 
 * @param error - The transaction error
 * @returns Program error code or null if not a program error
 */
export function extractProgramErrorCode(error: any): number | null {
  if (!error) return null;
  
  // Anchor error format
  if (error.error?.errorCode?.code) {
    return error.error.errorCode.code;
  }
  
  // Raw transaction error
  if (typeof error === 'object' && error.logs) {
    for (const log of error.logs) {
      const match = log.match(/Program error: (\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
  }
  
  return null;
}

/**
 * Creates a descriptive error message from a program error code
 * 
 * @param code - The program error code
 * @returns Human-readable error message
 */
export function getProgramErrorMessage(code: number): string {
  const errorMap: Record<number, string> = {
    [PROGRAM_ERROR_CODES.ESCROW_ALREADY_SETTLED]: 'Escrow has already been settled (released or cancelled)',
    [PROGRAM_ERROR_CODES.UNAUTHORIZED]: 'Unauthorized: signer does not have permission for this action',
    [PROGRAM_ERROR_CODES.INVALID_STATE]: 'Invalid escrow state for this operation',
    [PROGRAM_ERROR_CODES.INVALID_AMOUNT]: 'Invalid amount specified',
    [PROGRAM_ERROR_CODES.INVALID_EXPIRATION]: 'Invalid expiration time',
    [PROGRAM_ERROR_CODES.ESCROW_EXPIRED]: 'Escrow has expired and can no longer be used',
    [PROGRAM_ERROR_CODES.INVALID_TOKEN_MINT]: 'Invalid token mint provided',
    [PROGRAM_ERROR_CODES.INSUFFICIENT_BALANCE]: 'Insufficient balance for this operation',
    [PROGRAM_ERROR_CODES.TOKEN_ACCOUNT_NOT_INITIALIZED]: 'Token account is not initialized',
    [PROGRAM_ERROR_CODES.ARITHMETIC_OVERFLOW]: 'Arithmetic overflow occurred',
  };
  
  return errorMap[code] || `Unknown program error: ${code}`;
}

/**
 * Checks if an error is a specific program error
 * 
 * @param error - The error to check
 * @param code - The program error code to check for
 * @returns True if the error matches the code
 */
export function isProgramError(error: any, code: number): boolean {
  const extractedCode = extractProgramErrorCode(error);
  return extractedCode === code;
}

// ============================================================================
// Escrow Status Helpers
// ============================================================================

/**
 * Gets the status variant name from an EscrowStatus
 * 
 * @param status - The escrow status
 * @returns The variant name as string
 */
export function getEscrowStatusName(status: EscrowStatus): string {
  if ('Pending' in status) return 'Pending';
  if ('Approved' in status) return 'Approved';
  if ('Released' in status) return 'Released';
  if ('Cancelled' in status) return 'Cancelled';
  if ('Expired' in status) return 'Expired';
  return 'Unknown';
}

/**
 * Checks if an escrow is in a terminal state (Released, Cancelled, Expired)
 * 
 * @param status - The escrow status
 * @returns True if terminal
 */
export function isEscrowTerminal(status: EscrowStatus): boolean {
  return (
    'Released' in status ||
    'Cancelled' in status ||
    'Expired' in status
  );
}

/**
 * Checks if an escrow can be approved (must be Pending)
 * 
 * @param status - The escrow status
 * @returns True if can approve
 */
export function canApprove(status: EscrowStatus): boolean {
  return 'Pending' in status;
}

/**
 * Checks if an escrow can release funds (must be Approved)
 * 
 * @param status - The escrow status
 * @returns True if can release
 */
export function canRelease(status: EscrowStatus): boolean {
  return 'Approved' in status;
}

/**
 * Checks if an escrow can be cancelled (must be Pending and not expired)
 * 
 * @param status - The escrow status
 * @param expiresAt - Optional expiration timestamp
 * @returns True if can cancel
 */
export function canCancel(status: EscrowStatus, expiresAt: bigint | null = null): boolean {
  if (!('Pending' in status)) return false;
  
  if (expiresAt !== null) {
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (now >= expiresAt) return false; // Already expired
  }
  
  return true;
}

// ============================================================================
// Crypto Helpers
// ============================================================================

/**
 * Generates a random 32-byte agreement hash
 * 
 * @returns Uint8Array of 32 random bytes
 */
export function generateAgreementHash(): Uint8Array {
  const hash = new Uint8Array(32);
  crypto.getRandomValues(hash);
  return hash;
}

/**
 * Creates an agreement hash from a string (e.g., contract terms)
 * 
 * @param terms - The agreement terms string
 * @returns SHA-256 hash as Uint8Array
 */
export async function createAgreementHashFromTerms(terms: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(terms);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hashBuffer);
}

/**
 * Creates an agreement hash from structured data
 * 
 * @param data - Any serializable data
 * @returns SHA-256 hash as Uint8Array
 */
export async function createAgreementHashFromData(data: any): Promise<Uint8Array> {
  const json = JSON.stringify(data, Object.keys(data).sort());
  return createAgreementHashFromTerms(json);
}

// ============================================================================
// Retry Helpers
// ============================================================================

/**
 * Retries an async function with exponential backoff
 * 
 * @param fn - The async function to retry
 * @param maxRetries - Maximum number of retries
 * @param baseDelay - Base delay in ms
 * @param maxDelay - Maximum delay in ms
 * @returns The result of the function
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000,
  maxDelay = 10000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

// ============================================================================
// Time Helpers
// ============================================================================

/**
 * Gets current unix timestamp in seconds
 * 
 * @returns Current timestamp as bigint
 */
export function getCurrentTimestamp(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

/**
 * Adds seconds to a timestamp
 * 
 * @param timestamp - Base timestamp (seconds)
 * @param seconds - Seconds to add
 * @returns New timestamp
 */
export function addSeconds(timestamp: bigint, seconds: number): bigint {
  return timestamp + BigInt(seconds);
}

/**
 * Creates an expiration timestamp from now + duration
 * 
 * @param durationSeconds - Duration in seconds from now
 * @returns Expiration timestamp
 */
export function createExpiration(durationSeconds: number): bigint {
  return addSeconds(getCurrentTimestamp(), durationSeconds);
}

/**
 * Checks if a timestamp has expired
 * 
 * @param expiresAt - Expiration timestamp (or null for no expiration)
 * @returns True if expired
 */
export function isExpired(expiresAt: bigint | null): boolean {
  if (expiresAt === null) return false;
  return getCurrentTimestamp() >= expiresAt;
}

/**
 * Gets time remaining until expiration
 * 
 * @param expiresAt - Expiration timestamp (or null for no expiration)
 * @returns Seconds remaining (negative if expired), or null if no expiration
 */
export function getTimeRemaining(expiresAt: bigint | null): bigint | null {
  if (expiresAt === null) return null;
  return expiresAt - getCurrentTimestamp();
}