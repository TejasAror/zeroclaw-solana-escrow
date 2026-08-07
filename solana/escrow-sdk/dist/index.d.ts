import { PROGRAM_ID, UPGRADE_AUTHORITY, DEFAULT_CLUSTER, CLUSTER_URLS, PDA_SEEDS, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, SYSTEM_PROGRAM_ID, DEFAULT_COMMITMENT, CONFIRMATION_SETTINGS, LAMPORTS_PER_SOL, ESCROW_ACCOUNT_SIZE } from './constants';
import { deriveEscrowPDAs, deriveEscrowAddress, deriveVaultAddress, deriveTokenVaultAddress, deriveAssociatedTokenAccount, validateEscrowAddress, validateVaultAddress, validateTokenVaultAddress, getPDASeedsInfo } from './pda';
import { EscrowSDKError, EscrowProgramError, ValidationError, PDAError, TransactionError, PROGRAM_ERROR_CODES, EscrowStatus as EscrowStatusConst, isEscrowStatus } from './types';
import { validatePublicKey, validateU64, validateAgreementHash, validateExpiration, validateInitializeEscrowParams, validateSellerTokenAccount, validateBuyerTokenAccount, solToLamports, lamportsToSol, u64ToNumber, formatPubkey, formatAmount, extractProgramErrorCode, getProgramErrorMessage, isProgramError, getEscrowStatusName, isEscrowTerminal, canApprove, canRelease, canCancel, generateAgreementHash, createAgreementHashFromTerms, createAgreementHashFromData, retryWithBackoff, getCurrentTimestamp, addSeconds, createExpiration, isExpired, getTimeRemaining } from './utils';
import { EscrowClient, createEscrowClient, createReadOnlyClient, createClientWithKeypair } from './client';
export { PROGRAM_ID, UPGRADE_AUTHORITY, DEFAULT_CLUSTER, CLUSTER_URLS, PDA_SEEDS, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, SYSTEM_PROGRAM_ID, DEFAULT_COMMITMENT, CONFIRMATION_SETTINGS, LAMPORTS_PER_SOL, ESCROW_ACCOUNT_SIZE, deriveEscrowPDAs, deriveEscrowAddress, deriveVaultAddress, deriveTokenVaultAddress, deriveAssociatedTokenAccount, validateEscrowAddress, validateVaultAddress, validateTokenVaultAddress, getPDASeedsInfo, EscrowSDKError, EscrowProgramError, ValidationError, PDAError, TransactionError, PROGRAM_ERROR_CODES, EscrowStatusConst, isEscrowStatus, validatePublicKey, validateU64, validateAgreementHash, validateExpiration, validateInitializeEscrowParams, validateSellerTokenAccount, validateBuyerTokenAccount, solToLamports, lamportsToSol, u64ToNumber, formatPubkey, formatAmount, extractProgramErrorCode, getProgramErrorMessage, isProgramError, getEscrowStatusName, isEscrowTerminal, canApprove, canRelease, canCancel, generateAgreementHash, createAgreementHashFromTerms, createAgreementHashFromData, retryWithBackoff, getCurrentTimestamp, addSeconds, createExpiration, isExpired, getTimeRemaining, EscrowClient, createEscrowClient, createReadOnlyClient, createClientWithKeypair, };
/**
 * Default export with all SDK functionality
 */
declare const _default: {
    readonly PROGRAM_ID: import("@solana/web3.js").PublicKey;
    readonly UPGRADE_AUTHORITY: import("@solana/web3.js").PublicKey;
    readonly DEFAULT_CLUSTER: "devnet";
    readonly CLUSTER_URLS: {
        readonly mainnet: "https://api.mainnet-beta.solana.com";
        readonly devnet: "https://api.devnet.solana.com";
        readonly testnet: "https://api.testnet.solana.com";
        readonly localnet: "http://localhost:8899";
    };
    readonly PDA_SEEDS: {
        readonly ESCROW: "escrow";
        readonly VAULT: "vault";
        readonly TOKEN_VAULT: "token_vault";
    };
    readonly TOKEN_PROGRAM_ID: import("@solana/web3.js").PublicKey;
    readonly ASSOCIATED_TOKEN_PROGRAM_ID: import("@solana/web3.js").PublicKey;
    readonly SYSTEM_PROGRAM_ID: import("@solana/web3.js").PublicKey;
    readonly DEFAULT_COMMITMENT: "confirmed";
    readonly CONFIRMATION_SETTINGS: {
        readonly maxRetries: 30;
        readonly retryInterval: 1000;
        readonly commitment: "confirmed";
    };
    readonly LAMPORTS_PER_SOL: 1000000000;
    readonly ESCROW_ACCOUNT_SIZE: 500;
    readonly deriveEscrowPDAs: typeof deriveEscrowPDAs;
    readonly deriveEscrowAddress: typeof deriveEscrowAddress;
    readonly deriveVaultAddress: typeof deriveVaultAddress;
    readonly deriveTokenVaultAddress: typeof deriveTokenVaultAddress;
    readonly deriveAssociatedTokenAccount: typeof deriveAssociatedTokenAccount;
    readonly validateEscrowAddress: typeof validateEscrowAddress;
    readonly validateVaultAddress: typeof validateVaultAddress;
    readonly validateTokenVaultAddress: typeof validateTokenVaultAddress;
    readonly getPDASeedsInfo: typeof getPDASeedsInfo;
    readonly EscrowSDKError: typeof EscrowSDKError;
    readonly EscrowProgramError: typeof EscrowProgramError;
    readonly ValidationError: typeof ValidationError;
    readonly PDAError: typeof PDAError;
    readonly TransactionError: typeof TransactionError;
    readonly PROGRAM_ERROR_CODES: {
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
    readonly EscrowStatusConst: {
        readonly Pending: EscrowStatusConst;
        readonly Approved: EscrowStatusConst;
        readonly Released: EscrowStatusConst;
        readonly Cancelled: EscrowStatusConst;
        readonly Expired: EscrowStatusConst;
    };
    readonly isEscrowStatus: typeof isEscrowStatus;
    readonly validatePublicKey: typeof validatePublicKey;
    readonly validateU64: typeof validateU64;
    readonly validateAgreementHash: typeof validateAgreementHash;
    readonly validateExpiration: typeof validateExpiration;
    readonly validateInitializeEscrowParams: typeof validateInitializeEscrowParams;
    readonly validateSellerTokenAccount: typeof validateSellerTokenAccount;
    readonly validateBuyerTokenAccount: typeof validateBuyerTokenAccount;
    readonly solToLamports: typeof solToLamports;
    readonly lamportsToSol: typeof lamportsToSol;
    readonly u64ToNumber: typeof u64ToNumber;
    readonly formatPubkey: typeof formatPubkey;
    readonly formatAmount: typeof formatAmount;
    readonly extractProgramErrorCode: typeof extractProgramErrorCode;
    readonly getProgramErrorMessage: typeof getProgramErrorMessage;
    readonly isProgramError: typeof isProgramError;
    readonly getEscrowStatusName: typeof getEscrowStatusName;
    readonly isEscrowTerminal: typeof isEscrowTerminal;
    readonly canApprove: typeof canApprove;
    readonly canRelease: typeof canRelease;
    readonly canCancel: typeof canCancel;
    readonly generateAgreementHash: typeof generateAgreementHash;
    readonly createAgreementHashFromTerms: typeof createAgreementHashFromTerms;
    readonly createAgreementHashFromData: typeof createAgreementHashFromData;
    readonly retryWithBackoff: typeof retryWithBackoff;
    readonly getCurrentTimestamp: typeof getCurrentTimestamp;
    readonly addSeconds: typeof addSeconds;
    readonly createExpiration: typeof createExpiration;
    readonly isExpired: typeof isExpired;
    readonly getTimeRemaining: typeof getTimeRemaining;
    readonly EscrowClient: typeof EscrowClient;
    readonly createEscrowClient: (config?: import("./types").EscrowClientConfig) => EscrowClient;
    readonly createReadOnlyClient: (config?: Omit<import("./types").EscrowClientConfig, "wallet">) => EscrowClient;
    readonly createClientWithKeypair: (keypair: import("@solana/web3.js").Keypair, config?: Omit<import("./types").EscrowClientConfig, "wallet">) => EscrowClient;
};
export default _default;
//# sourceMappingURL=index.d.ts.map