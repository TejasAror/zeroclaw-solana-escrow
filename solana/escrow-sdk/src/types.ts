/**
 * TypeScript types for the Solana Escrow SDK
 * 
 * These types are derived from the Anchor IDL and provide full type safety
 * for all SDK operations.
 */

import { PublicKey } from '@solana/web3.js';

// ============================================================================
// Escrow Status Enum
// ============================================================================

export type EscrowStatus = 
  | { Pending: null }
  | { Approved: null }
  | { Released: null }
  | { Cancelled: null }
  | { Expired: null };

export const EscrowStatus = {
  Pending: { Pending: null } as EscrowStatus,
  Approved: { Approved: null } as EscrowStatus,
  Released: { Released: null } as EscrowStatus,
  Cancelled: { Cancelled: null } as EscrowStatus,
  Expired: { Expired: null } as EscrowStatus,
} as const;

// Helper to check status
export function isEscrowStatus(status: EscrowStatus, variant: keyof typeof EscrowStatus): boolean {
  return variant in status;
}

// ============================================================================
// Core Account Types
// ============================================================================

export interface EscrowAccount {
  buyer: PublicKey;
  seller: PublicKey;
  amount: bigint; // u64
  agreementHash: Uint8Array; // [u8; 32]
  status: EscrowStatus;
  isSol: boolean;
  tokenMint: PublicKey | null;
  expiresAt: bigint | null; // i64 option
  bump: number; // u8
  vaultBump: number; // u8
}

// ============================================================================
// Instruction Argument Types
// ============================================================================

export interface InitializeEscrowArgs {
  amount: bigint; // u64
  agreementHash: Uint8Array; // [u8; 32]
  expiresAt: bigint | null; // i64 option (unix timestamp)
  tokenMint: PublicKey | null; // null for SOL, mint address for SPL tokens
}

export interface ApproveDeliveryArgs {
  // No arguments required
}

export interface ReleaseFundsArgs {
  // No arguments required
}

export interface CancelEscrowArgs {
  // No arguments required
}

// ============================================================================
// PDA Derivation Types
// ============================================================================

export interface DerivedPDAs {
  escrow: PublicKey;
  escrowBump: number;
  vault: PublicKey;
  vaultBump: number;
  tokenVault: PublicKey;
  tokenVaultBump: number;
}

// ============================================================================
// Transaction Response Types
// ============================================================================

export interface TransactionResult {
  signature: string;
  slot: number;
  confirmations: number | null;
  err: any | null;
}

export interface InitializeEscrowResult extends TransactionResult {
  escrowAddress: PublicKey;
  vaultAddress: PublicKey;
  tokenVaultAddress: PublicKey | null;
}

export interface ApproveDeliveryResult extends TransactionResult {
  escrowAddress: PublicKey;
}

export interface ReleaseFundsResult extends TransactionResult {
  escrowAddress: PublicKey;
}

export interface CancelEscrowResult extends TransactionResult {
  escrowAddress: PublicKey;
}

export interface FetchEscrowResult {
  escrow: EscrowAccount | null;
  address: PublicKey;
}

// ============================================================================
// Event Types (from IDL)
// ============================================================================

export interface EscrowInitializedEvent {
  escrow: PublicKey;
  buyer: PublicKey;
  seller: PublicKey;
  amount: bigint;
  isSol: boolean;
  tokenMint: PublicKey | null;
  expiresAt: bigint | null;
  timestamp: bigint;
}

export interface DeliveryApprovedEvent {
  escrow: PublicKey;
  buyer: PublicKey;
  seller: PublicKey;
  amount: bigint;
  timestamp: bigint;
}

export interface FundsReleasedEvent {
  escrow: PublicKey;
  buyer: PublicKey;
  seller: PublicKey;
  amount: bigint;
  isSol: boolean;
  tokenMint: PublicKey | null;
  timestamp: bigint;
}

export interface EscrowCancelledEvent {
  escrow: PublicKey;
  buyer: PublicKey;
  seller: PublicKey;
  amount: bigint;
  isSol: boolean;
  tokenMint: PublicKey | null;
  timestamp: bigint;
}

export interface EscrowExpiredEvent {
  escrow: PublicKey;
  buyer: PublicKey;
  seller: PublicKey;
  amount: bigint;
  isSol: boolean;
  tokenMint: PublicKey | null;
  timestamp: bigint;
}

export type EscrowEvent = 
  | { type: 'initialized'; data: EscrowInitializedEvent }
  | { type: 'deliveryApproved'; data: DeliveryApprovedEvent }
  | { type: 'fundsReleased'; data: FundsReleasedEvent }
  | { type: 'cancelled'; data: EscrowCancelledEvent }
  | { type: 'expired'; data: EscrowExpiredEvent };

// ============================================================================
// Error Types
// ============================================================================

export class EscrowSDKError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'EscrowSDKError';
  }
}

export class EscrowProgramError extends EscrowSDKError {
  constructor(
    message: string,
    public readonly programErrorCode: number,
    originalError?: Error
  ) {
    super(message, 'PROGRAM_ERROR', originalError);
    this.name = 'EscrowProgramError';
  }
}

export class ValidationError extends EscrowSDKError {
  constructor(message: string, originalError?: Error) {
    super(message, 'VALIDATION_ERROR', originalError);
    this.name = 'ValidationError';
  }
}

export class PDAError extends EscrowSDKError {
  constructor(message: string, originalError?: Error) {
    super(message, 'PDA_DERIVATION_ERROR', originalError);
    this.name = 'PDAError';
  }
}

export class TransactionError extends EscrowSDKError {
  constructor(message: string, public readonly signature?: string, originalError?: Error) {
    super(message, 'TRANSACTION_ERROR', originalError);
    this.name = 'TransactionError';
  }
}

// Program error codes from IDL
export const PROGRAM_ERROR_CODES = {
  ESCROW_ALREADY_SETTLED: 6000,
  UNAUTHORIZED: 6001,
  INVALID_STATE: 6002,
  INVALID_AMOUNT: 6003,
  INVALID_EXPIRATION: 6004,
  ESCROW_EXPIRED: 6005,
  INVALID_TOKEN_MINT: 6006,
  INSUFFICIENT_BALANCE: 6007,
  TOKEN_ACCOUNT_NOT_INITIALIZED: 6008,
  ARITHMETIC_OVERFLOW: 6009,
} as const;

export type ProgramErrorCode = typeof PROGRAM_ERROR_CODES[keyof typeof PROGRAM_ERROR_CODES];

// ============================================================================
// Client Configuration Types
// ============================================================================

export interface EscrowClientConfig {
  programId?: PublicKey;
  cluster?: 'mainnet' | 'devnet' | 'testnet' | 'localnet' | string;
  rpcUrl?: string;
  commitment?: 'processed' | 'confirmed' | 'finalized';
  wallet?: any; // Anchor Wallet interface
}

export interface ComputeBudgetConfig {
  units?: number;
  price?: number; // microlamports
}

// ============================================================================
// Utility Types
// ============================================================================

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// For buyer token account (SPL token escrows)
export interface SPLEscrowParams {
  tokenMint: PublicKey;
  buyerTokenAccount: PublicKey;
}

// For SOL escrows
export interface SOLEscrowParams {
  tokenMint?: never;
  buyerTokenAccount?: never;
}

// Combined params for initialize
export type InitializeEscrowParams = InitializeEscrowArgs & (
  | SOLEscrowParams
  | SPLEscrowParams
);

// For release funds with SPL tokens
export interface ReleaseFundsSPLParams {
  sellerTokenAccount: PublicKey;
}

// For cancel escrow with SPL tokens
export interface CancelEscrowSPLParams {
  buyerTokenAccount: PublicKey;
}