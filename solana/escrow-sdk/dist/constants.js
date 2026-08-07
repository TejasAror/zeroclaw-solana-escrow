"use strict";
/**
 * Constants for the Solana Escrow SDK
 *
 * This file contains all the constant values used throughout the SDK,
 * including the deployed program ID, default network configuration,
 * and PDA seeds.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ESCROW_ACCOUNT_SIZE = exports.LAMPORTS_PER_SOL = exports.CONFIRMATION_SETTINGS = exports.DEFAULT_COMMITMENT = exports.SYSTEM_PROGRAM_ID = exports.ASSOCIATED_TOKEN_PROGRAM_ID = exports.TOKEN_PROGRAM_ID = exports.PDA_SEEDS = exports.CLUSTER_URLS = exports.DEFAULT_CLUSTER = exports.UPGRADE_AUTHORITY = exports.PROGRAM_ID = void 0;
const web3_js_1 = require("@solana/web3.js");
// Program ID of the deployed escrow program on Devnet
exports.PROGRAM_ID = new web3_js_1.PublicKey('8u17EnuW66yfRybQY6vGjeTnASeDyxyT6QesPetRtJxk');
// Upgrade authority wallet (deployment wallet)
exports.UPGRADE_AUTHORITY = new web3_js_1.PublicKey('HNDAhSqXTA6woJLRRQpaMsWX171XVsjgxBXRxz95xfSB');
// Default Solana cluster configuration
exports.DEFAULT_CLUSTER = 'devnet';
exports.CLUSTER_URLS = {
    mainnet: 'https://api.mainnet-beta.solana.com',
    devnet: 'https://api.devnet.solana.com',
    testnet: 'https://api.testnet.solana.com',
    localnet: 'http://localhost:8899',
};
// PDA Seeds (as defined in the Anchor program)
exports.PDA_SEEDS = {
    ESCROW: 'escrow',
    VAULT: 'vault',
    TOKEN_VAULT: 'token_vault',
};
// Token program IDs
exports.TOKEN_PROGRAM_ID = new web3_js_1.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
exports.ASSOCIATED_TOKEN_PROGRAM_ID = new web3_js_1.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
exports.SYSTEM_PROGRAM_ID = new web3_js_1.PublicKey('11111111111111111111111111111111');
// Default commitment level for transactions
exports.DEFAULT_COMMITMENT = 'confirmed';
// Transaction confirmation settings
exports.CONFIRMATION_SETTINGS = {
    maxRetries: 30,
    retryInterval: 1000,
    commitment: exports.DEFAULT_COMMITMENT,
};
// Lamports per SOL
exports.LAMPORTS_PER_SOL = 1000000000;
// Maximum account size for escrow (approximate)
exports.ESCROW_ACCOUNT_SIZE = 500;
//# sourceMappingURL=constants.js.map