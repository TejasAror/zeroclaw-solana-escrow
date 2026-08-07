"use strict";
/**
 * TypeScript types for the Solana Escrow SDK
 *
 * These types are derived from the Anchor IDL and provide full type safety
 * for all SDK operations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROGRAM_ERROR_CODES = exports.TransactionError = exports.PDAError = exports.ValidationError = exports.EscrowProgramError = exports.EscrowSDKError = exports.EscrowStatus = void 0;
exports.isEscrowStatus = isEscrowStatus;
exports.EscrowStatus = {
    Pending: { Pending: null },
    Approved: { Approved: null },
    Released: { Released: null },
    Cancelled: { Cancelled: null },
    Expired: { Expired: null },
};
// Helper to check status
function isEscrowStatus(status, variant) {
    return variant in status;
}
// ============================================================================
// Error Types
// ============================================================================
class EscrowSDKError extends Error {
    constructor(message, code, originalError) {
        super(message);
        this.code = code;
        this.originalError = originalError;
        this.name = 'EscrowSDKError';
    }
}
exports.EscrowSDKError = EscrowSDKError;
class EscrowProgramError extends EscrowSDKError {
    constructor(message, programErrorCode, originalError) {
        super(message, 'PROGRAM_ERROR', originalError);
        this.programErrorCode = programErrorCode;
        this.name = 'EscrowProgramError';
    }
}
exports.EscrowProgramError = EscrowProgramError;
class ValidationError extends EscrowSDKError {
    constructor(message, originalError) {
        super(message, 'VALIDATION_ERROR', originalError);
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
class PDAError extends EscrowSDKError {
    constructor(message, originalError) {
        super(message, 'PDA_DERIVATION_ERROR', originalError);
        this.name = 'PDAError';
    }
}
exports.PDAError = PDAError;
class TransactionError extends EscrowSDKError {
    constructor(message, signature, originalError) {
        super(message, 'TRANSACTION_ERROR', originalError);
        this.signature = signature;
        this.name = 'TransactionError';
    }
}
exports.TransactionError = TransactionError;
// Program error codes from IDL
exports.PROGRAM_ERROR_CODES = {
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
};
//# sourceMappingURL=types.js.map