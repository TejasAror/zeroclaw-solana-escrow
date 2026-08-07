/**
 * Constants for the Solana Escrow SDK
 *
 * This file contains all the constant values used throughout the SDK,
 * including the deployed program ID, default network configuration,
 * and PDA seeds.
 */
import { PublicKey } from '@solana/web3.js';
export declare const PROGRAM_ID: PublicKey;
export declare const UPGRADE_AUTHORITY: PublicKey;
export declare const DEFAULT_CLUSTER: "devnet";
export declare const CLUSTER_URLS: {
    readonly mainnet: "https://api.mainnet-beta.solana.com";
    readonly devnet: "https://api.devnet.solana.com";
    readonly testnet: "https://api.testnet.solana.com";
    readonly localnet: "http://localhost:8899";
};
export declare const PDA_SEEDS: {
    readonly ESCROW: "escrow";
    readonly VAULT: "vault";
    readonly TOKEN_VAULT: "token_vault";
};
export declare const TOKEN_PROGRAM_ID: PublicKey;
export declare const ASSOCIATED_TOKEN_PROGRAM_ID: PublicKey;
export declare const SYSTEM_PROGRAM_ID: PublicKey;
export declare const DEFAULT_COMMITMENT: "confirmed";
export declare const CONFIRMATION_SETTINGS: {
    readonly maxRetries: 30;
    readonly retryInterval: 1000;
    readonly commitment: "confirmed";
};
export declare const LAMPORTS_PER_SOL = 1000000000;
export declare const ESCROW_ACCOUNT_SIZE = 500;
//# sourceMappingURL=constants.d.ts.map