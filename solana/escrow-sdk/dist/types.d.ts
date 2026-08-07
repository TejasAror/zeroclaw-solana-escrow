/**
 * TypeScript types for the Solana Escrow SDK
 *
 * These types are derived from the Anchor IDL and provide full type safety
 * for all SDK operations.
 */
import { PublicKey } from '@solana/web3.js';
export type EscrowStatus = {
    Pending: null;
} | {
    Approved: null;
} | {
    Released: null;
} | {
    Cancelled: null;
} | {
    Expired: null;
};
export declare const EscrowStatus: {
    readonly Pending: EscrowStatus;
    readonly Approved: EscrowStatus;
    readonly Released: EscrowStatus;
    readonly Cancelled: EscrowStatus;
    readonly Expired: EscrowStatus;
};
export declare function isEscrowStatus(status: EscrowStatus, variant: keyof typeof EscrowStatus): boolean;
export interface EscrowAccount {
    buyer: PublicKey;
    seller: PublicKey;
    amount: bigint;
    agreementHash: Uint8Array;
    status: EscrowStatus;
    isSol: boolean;
    tokenMint: PublicKey | null;
    expiresAt: bigint | null;
    bump: number;
    vaultBump: number;
}
export interface InitializeEscrowArgs {
    amount: bigint;
    agreementHash: Uint8Array;
    expiresAt: bigint | null;
    tokenMint: PublicKey | null;
}
export interface ApproveDeliveryArgs {
}
export interface ReleaseFundsArgs {
}
export interface CancelEscrowArgs {
}
export interface DerivedPDAs {
    escrow: PublicKey;
    escrowBump: number;
    vault: PublicKey;
    vaultBump: number;
    tokenVault: PublicKey;
    tokenVaultBump: number;
}
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
export type EscrowEvent = {
    type: 'initialized';
    data: EscrowInitializedEvent;
} | {
    type: 'deliveryApproved';
    data: DeliveryApprovedEvent;
} | {
    type: 'fundsReleased';
    data: FundsReleasedEvent;
} | {
    type: 'cancelled';
    data: EscrowCancelledEvent;
} | {
    type: 'expired';
    data: EscrowExpiredEvent;
};
export declare class EscrowSDKError extends Error {
    readonly code: string;
    readonly originalError?: Error | undefined;
    constructor(message: string, code: string, originalError?: Error | undefined);
}
export declare class EscrowProgramError extends EscrowSDKError {
    readonly programErrorCode: number;
    constructor(message: string, programErrorCode: number, originalError?: Error);
}
export declare class ValidationError extends EscrowSDKError {
    constructor(message: string, originalError?: Error);
}
export declare class PDAError extends EscrowSDKError {
    constructor(message: string, originalError?: Error);
}
export declare class TransactionError extends EscrowSDKError {
    readonly signature?: string | undefined;
    constructor(message: string, signature?: string | undefined, originalError?: Error);
}
export declare const PROGRAM_ERROR_CODES: {
    readonly ESCROW_ALREADY_SETTLED: 6000;
    readonly UNAUTHORIZED: 6001;
    readonly INVALID_STATE: 6002;
    readonly INVALID_AMOUNT: 6003;
    readonly INVALID_EXPIRATION: 6004;
    readonly ESCROW_EXPIRED: 6005;
    readonly INVALID_TOKEN_MINT: 6006;
    readonly INSUFFICIENT_BALANCE: 6007;
    readonly TOKEN_ACCOUNT_NOT_INITIALIZED: 6008;
    readonly ARITHMETIC_OVERFLOW: 6009;
};
export type ProgramErrorCode = typeof PROGRAM_ERROR_CODES[keyof typeof PROGRAM_ERROR_CODES];
export interface EscrowClientConfig {
    programId?: PublicKey;
    cluster?: 'mainnet' | 'devnet' | 'testnet' | 'localnet' | string;
    rpcUrl?: string;
    commitment?: 'processed' | 'confirmed' | 'finalized';
    wallet?: any;
}
export interface ComputeBudgetConfig {
    units?: number;
    price?: number;
}
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export interface SPLEscrowParams {
    tokenMint: PublicKey;
    buyerTokenAccount: PublicKey;
}
export interface SOLEscrowParams {
    tokenMint?: never;
    buyerTokenAccount?: never;
}
export type InitializeEscrowParams = InitializeEscrowArgs & (SOLEscrowParams | SPLEscrowParams);
export interface ReleaseFundsSPLParams {
    sellerTokenAccount: PublicKey;
}
export interface CancelEscrowSPLParams {
    buyerTokenAccount: PublicKey;
}
//# sourceMappingURL=types.d.ts.map