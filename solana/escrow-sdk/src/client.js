"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClientWithKeypair = exports.createReadOnlyClient = exports.createEscrowClient = exports.EscrowClient = void 0;
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor");
const nodewallet_1 = __importDefault(require("@coral-xyz/anchor/dist/cjs/nodewallet"));
const constants_1 = require("./constants");
const pda_1 = require("./pda");
const types_1 = require("./types");
const utils_1 = require("./utils");
// Import the IDL
const escrow_program_json_1 = __importDefault(require("../idl/escrow_program.json"));
const IDL = escrow_program_json_1.default;
/**
 * Main client class for interacting with the Solana Escrow program
 */
class EscrowClient {
    /**
     * Creates a new EscrowClient instance
     *
     * @param config - Client configuration options
     * @param config.programId - Custom program ID (defaults to Devnet deployment)
     * @param config.cluster - Cluster to connect to ('devnet', 'mainnet', 'testnet', 'localnet', or custom RPC URL)
     * @param config.rpcUrl - Custom RPC URL (overrides cluster)
     * @param config.commitment - Default commitment level
     * @param config.wallet - Wallet for signing transactions (Keypair, NodeWallet, or Anchor Wallet)
     */
    constructor(config = {}) {
        this.programId = config.programId || constants_1.PROGRAM_ID;
        this.cluster = config.cluster || constants_1.DEFAULT_CLUSTER;
        const clusterUrl = constants_1.CLUSTER_URLS[this.cluster];
        this.rpcUrl = config.rpcUrl || clusterUrl || 'https://api.devnet.solana.com';
        this.connection = new web3_js_1.Connection(this.rpcUrl, config.commitment || constants_1.DEFAULT_COMMITMENT);
        // Set up wallet
        if (config.wallet) {
            if (config.wallet instanceof web3_js_1.Keypair) {
                this.wallet = new nodewallet_1.default(config.wallet);
            }
            else if ('publicKey' in config.wallet && 'signTransaction' in config.wallet) {
                this.wallet = config.wallet;
            }
            else {
                this.wallet = new nodewallet_1.default(config.wallet);
            }
        }
        else {
            this.wallet = null;
        }
        // Create Anchor provider
        const wallet = this.wallet || new nodewallet_1.default(web3_js_1.Keypair.generate());
        const provider = new anchor_1.AnchorProvider(this.connection, wallet, { commitment: config.commitment || constants_1.DEFAULT_COMMITMENT });
        // Initialize program
        this.program = new anchor_1.Program(IDL, this.programId, provider);
    }
    /**
     * Creates an EscrowClient with a keypair for signing
     *
     * @param keypair - The keypair to use for signing
     * @param config - Additional configuration
     * @returns New EscrowClient instance
     */
    static withKeypair(keypair, config = {}) {
        return new EscrowClient({ ...config, wallet: keypair });
    }
    /**
     * Creates an EscrowClient for read-only operations (no wallet required)
     *
     * @param config - Configuration options
     * @returns New EscrowClient instance
     */
    static readOnly(config = {}) {
        return new EscrowClient({ ...config, wallet: null });
    }
    // ============================================================================
    // PDA Derivation Methods
    // ============================================================================
    /**
     * Derives all PDAs for a given buyer
     */
    async derivePDAs(buyer) {
        return (0, pda_1.deriveEscrowPDAs)(buyer, this.programId);
    }
    /**
     * Derives just the escrow PDA for a buyer
     */
    deriveEscrowAddress(buyer) {
        return (0, pda_1.deriveEscrowAddress)(buyer, this.programId);
    }
    /**
     * Derives the vault PDA for an escrow
     */
    deriveVaultAddress(escrow) {
        return (0, pda_1.deriveVaultAddress)(escrow, this.programId);
    }
    /**
     * Derives the token vault PDA for an escrow
     */
    deriveTokenVaultAddress(escrow) {
        return (0, pda_1.deriveTokenVaultAddress)(escrow, this.programId);
    }
    /**
     * Derives the associated token account for a wallet and mint
     */
    deriveAssociatedTokenAccount(wallet, mint) {
        return (0, pda_1.deriveAssociatedTokenAccount)(wallet, mint);
    }
    // ============================================================================
    // Core Escrow Operations
    // ============================================================================
    /**
     * Initializes a new escrow account
     *
     * @param buyer - The buyer's keypair (signer)
     * @param seller - The seller's public key
     * @param params - Escrow initialization parameters
     * @param computeBudget - Optional compute budget configuration
     * @returns Transaction result with escrow and vault addresses
     */
    async initializeEscrow(buyer, seller, params, computeBudget) {
        // Validate parameters
        const validated = (0, utils_1.validateInitializeEscrowParams)(params);
        // Derive PDAs
        const { escrow, vault, tokenVault } = await (0, pda_1.deriveEscrowPDAs)(buyer.publicKey, this.programId);
        // Determine if this is a SOL or SPL token escrow
        const isSol = validated.tokenMint === null;
        // Build the transaction
        const instructions = [];
        // Add compute budget instructions if provided
        if (computeBudget?.units) {
            instructions.push(web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: computeBudget.units }));
        }
        if (computeBudget?.price) {
            instructions.push(web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: computeBudget.price }));
        }
        // Prepare accounts for initialize instruction
        const accounts = {
            buyer: buyer.publicKey,
            seller,
            escrow,
            vault,
            tokenVault,
            systemProgram: constants_1.SYSTEM_PROGRAM_ID,
            tokenProgram: constants_1.TOKEN_PROGRAM_ID,
            associatedTokenProgram: constants_1.ASSOCIATED_TOKEN_PROGRAM_ID,
        };
        // Add token mint and buyer token account for SPL token escrows
        if (!isSol) {
            accounts['tokenMint'] = validated.tokenMint;
            accounts['buyerTokenAccount'] = validated.buyerTokenAccount;
        }
        // Add the initialize instruction
        const initializeIx = await this.program.methods
            .initialize(validated.amount, Array.from(validated.agreementHash), validated.expiresAt, validated.tokenMint)
            .accounts(accounts)
            .signers([buyer])
            .instruction();
        instructions.push(initializeIx);
        // Send and confirm transaction
        const signature = await this.sendAndConfirm(instructions, [buyer]);
        return {
            signature,
            slot: 0, // Will be filled by confirmation
            confirmations: null,
            err: null,
            escrowAddress: escrow,
            vaultAddress: vault,
            tokenVaultAddress: isSol ? null : tokenVault,
        };
    }
    /**
     * Approves delivery for an escrow (buyer only)
     *
     * @param buyer - The buyer's keypair (signer)
     * @param escrowAddress - The escrow account address
     * @param computeBudget - Optional compute budget configuration
     * @returns Transaction result
     */
    async approveDelivery(buyer, escrowAddress, computeBudget) {
        // Validate escrow address belongs to buyer
        if (!(0, pda_1.validateEscrowAddress)(escrowAddress, buyer.publicKey, this.programId)) {
            throw new types_1.ValidationError('Escrow address does not match buyer');
        }
        const instructions = [];
        if (computeBudget?.units) {
            instructions.push(web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: computeBudget.units }));
        }
        if (computeBudget?.price) {
            instructions.push(web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: computeBudget.price }));
        }
        const approveIx = await this.program.methods
            .approveDelivery()
            .accounts({
            buyer: buyer.publicKey,
            escrow: escrowAddress,
        })
            .signers([buyer])
            .instruction();
        instructions.push(approveIx);
        const signature = await this.sendAndConfirm(instructions, [buyer]);
        return {
            signature,
            slot: 0,
            confirmations: null,
            err: null,
            escrowAddress,
        };
    }
    /**
     * Releases funds to the seller (buyer only, after approval)
     *
     * @param buyer - The buyer's keypair (signer)
     * @param escrowAddress - The escrow account address
     * @param seller - The seller's public key
     * @param params - Optional SPL token parameters (sellerTokenAccount required for SPL)
     * @param computeBudget - Optional compute budget configuration
     * @returns Transaction result
     */
    async releaseFunds(buyer, escrowAddress, seller, params, computeBudget) {
        // Validate escrow address belongs to buyer
        if (!(0, pda_1.validateEscrowAddress)(escrowAddress, buyer.publicKey, this.programId)) {
            throw new types_1.ValidationError('Escrow address does not match buyer');
        }
        // Fetch escrow to determine if SPL or SOL
        const escrowData = await this.fetchEscrow(escrowAddress);
        if (!escrowData.escrow) {
            throw new types_1.ValidationError('Escrow account not found');
        }
        const isSol = escrowData.escrow.isSol;
        // const tokenMint = escrowData.escrow.tokenMint; // Unused, reserved for future use
        const instructions = [];
        if (computeBudget?.units) {
            instructions.push(web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: computeBudget.units }));
        }
        if (computeBudget?.price) {
            instructions.push(web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: computeBudget.price }));
        }
        // Derive vault addresses
        const [vault] = (0, pda_1.deriveVaultAddress)(escrowAddress, this.programId);
        const [tokenVault] = (0, pda_1.deriveTokenVaultAddress)(escrowAddress, this.programId);
        const accounts = {
            buyer: buyer.publicKey,
            seller,
            escrow: escrowAddress,
            vault,
            systemProgram: constants_1.SYSTEM_PROGRAM_ID,
            tokenProgram: constants_1.TOKEN_PROGRAM_ID,
            associatedTokenProgram: constants_1.ASSOCIATED_TOKEN_PROGRAM_ID,
        };
        if (!isSol) {
            accounts['tokenVault'] = tokenVault;
            if (!params?.sellerTokenAccount) {
                throw new types_1.ValidationError('sellerTokenAccount is required for SPL token escrows');
            }
            accounts['sellerTokenAccount'] = (0, utils_1.validateSellerTokenAccount)(params.sellerTokenAccount);
        }
        const releaseIx = await this.program.methods
            .releaseFunds()
            .accounts(accounts)
            .signers([buyer])
            .instruction();
        instructions.push(releaseIx);
        const signature = await this.sendAndConfirm(instructions, [buyer]);
        return {
            signature,
            slot: 0,
            confirmations: null,
            err: null,
            escrowAddress,
        };
    }
    /**
     * Cancels an escrow and returns funds to buyer (buyer only, before expiration)
     *
     * @param buyer - The buyer's keypair (signer)
     * @param escrowAddress - The escrow account address
     * @param seller - The seller's public key
     * @param params - Optional SPL token parameters (buyerTokenAccount required for SPL)
     * @param computeBudget - Optional compute budget configuration
     * @returns Transaction result
     */
    async cancelEscrow(buyer, escrowAddress, seller, params, computeBudget) {
        // Validate escrow address belongs to buyer
        if (!(0, pda_1.validateEscrowAddress)(escrowAddress, buyer.publicKey, this.programId)) {
            throw new types_1.ValidationError('Escrow address does not match buyer');
        }
        // Fetch escrow to check state and determine if SPL
        const escrowData = await this.fetchEscrow(escrowAddress);
        if (!escrowData.escrow) {
            throw new types_1.ValidationError('Escrow account not found');
        }
        const escrowAccount = escrowData.escrow;
        const isSol = escrowAccount.isSol;
        // const tokenMint = escrowAccount.tokenMint; // Unused, reserved for future use
        // Check if escrow can be cancelled
        if (!(0, utils_1.canCancel)(escrowAccount.status, escrowAccount.expiresAt)) {
            throw new types_1.ValidationError(`Escrow cannot be cancelled in current state: ${(0, utils_1.getEscrowStatusName)(escrowAccount.status)}`);
        }
        const instructions = [];
        if (computeBudget?.units) {
            instructions.push(web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: computeBudget.units }));
        }
        if (computeBudget?.price) {
            instructions.push(web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: computeBudget.price }));
        }
        // Derive vault addresses
        const [vault] = (0, pda_1.deriveVaultAddress)(escrowAddress, this.programId);
        const [tokenVault] = (0, pda_1.deriveTokenVaultAddress)(escrowAddress, this.programId);
        const accounts = {
            buyer: buyer.publicKey,
            seller,
            escrow: escrowAddress,
            vault,
            systemProgram: constants_1.SYSTEM_PROGRAM_ID,
            tokenProgram: constants_1.TOKEN_PROGRAM_ID,
            associatedTokenProgram: constants_1.ASSOCIATED_TOKEN_PROGRAM_ID,
        };
        if (!isSol) {
            accounts['tokenVault'] = tokenVault;
            if (!params?.buyerTokenAccount) {
                throw new types_1.ValidationError('buyerTokenAccount is required for SPL token escrows');
            }
            accounts['buyerTokenAccount'] = (0, utils_1.validateBuyerTokenAccount)(params.buyerTokenAccount);
        }
        const cancelIx = await this.program.methods
            .cancelEscrow()
            .accounts(accounts)
            .signers([buyer])
            .instruction();
        instructions.push(cancelIx);
        const signature = await this.sendAndConfirm(instructions, [buyer]);
        return {
            signature,
            slot: 0,
            confirmations: null,
            err: null,
            escrowAddress,
        };
    }
    /**
     * Fetches an escrow account by address
     *
     * @param escrowAddress - The escrow account address
     * @returns Escrow account data or null if not found
     */
    async fetchEscrow(escrowAddress) {
        // Fetch the escrow account
        let rawAccount = null;
        try {
            // @ts-ignore - TypeScript doesn't properly infer the return type of Anchor's fetch
            rawAccount = await this.program.account.escrow.fetch(escrowAddress);
        }
        catch {
            // If fetch throws (account not found), return null
            const result = { escrow: null, address: escrowAddress };
            return result;
        }
        if (!rawAccount || rawAccount === undefined) {
            const result = { escrow: null, address: escrowAddress };
            return result;
        }
        const account = rawAccount;
        const escrow = {
            buyer: account.buyer,
            seller: account.seller,
            amount: account.amount,
            agreementHash: new Uint8Array(account.agreementHash),
            status: this.convertStatus(account.status),
            isSol: account.isSol,
            tokenMint: account.tokenMint ?? null,
            expiresAt: account.expiresAt ?? null,
            bump: account.bump,
            vaultBump: account.vaultBump,
        };
        const result = { escrow, address: escrowAddress };
        return result;
    }
    /**
     * Fetches all escrows for a given buyer
     *
     * @param buyer - The buyer's public key
     * @returns Array of escrow accounts
     */
    async fetchEscrowsForBuyer(buyer) {
        const escrowAddress = (0, pda_1.deriveEscrowAddress)(buyer, this.programId)[0];
        const result = await this.fetchEscrow(escrowAddress);
        if (result.escrow) {
            return [{ ...result, escrow: result.escrow }];
        }
        return [];
    }
    /**
     * Fetches all escrows for a given seller
     *
     * @param _seller - The seller's public key (unused, reserved for future indexer support)
     * @returns Array of escrow accounts
     */
    async fetchEscrowsForSeller(_seller) {
        // This requires filtering by seller - we need to fetch all escrows and filter
        // For now, return empty array as this requires a program account filter
        // which isn't directly supported without an indexer
        return [];
    }
    // ============================================================================
    // Helper Methods
    // ============================================================================
    /**
     * Sends and confirms a transaction with retry logic
     */
    async sendAndConfirm(instructions, signers, options) {
        if (!this.wallet) {
            throw new types_1.ValidationError('Wallet required for signing transactions');
        }
        const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
        const transaction = new web3_js_1.Transaction().add(...instructions);
        transaction.feePayer = this.wallet.publicKey;
        transaction.recentBlockhash = blockhash;
        // Sign with all provided signers
        transaction.partialSign(...signers);
        // Send transaction
        const signature = await this.connection.sendRawTransaction(transaction.serialize(), options);
        // Confirm transaction
        const confirmation = await this.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
        if (confirmation.value.err) {
            const programErrorCode = (0, utils_1.extractProgramErrorCode)(confirmation.value.err);
            if (programErrorCode) {
                throw new types_1.EscrowProgramError((0, utils_1.getProgramErrorMessage)(programErrorCode), programErrorCode, new Error(JSON.stringify(confirmation.value.err)));
            }
            throw new types_1.TransactionError(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`, signature, new Error(JSON.stringify(confirmation.value.err)));
        }
        return signature;
    }
    /**
     * Converts Anchor enum status to our EscrowStatus type
     */
    convertStatus(status) {
        if (status.Pending)
            return { Pending: null };
        if (status.Approved)
            return { Approved: null };
        if (status.Released)
            return { Released: null };
        if (status.Cancelled)
            return { Cancelled: null };
        if (status.Expired)
            return { Expired: null };
        return { Pending: null }; // Default fallback
    }
    /**
     * Gets the program ID being used
     */
    getProgramId() {
        return this.programId;
    }
    /**
     * Gets the cluster URL being used
     */
    getRpcUrl() {
        return this.rpcUrl;
    }
    /**
     * Checks if the client has a wallet configured
     */
    hasWallet() {
        return this.wallet !== null;
    }
    /**
     * Gets the wallet public key if available
     */
    getWalletPublicKey() {
        return this.wallet?.publicKey || null;
    }
}
exports.EscrowClient = EscrowClient;
// Export a default instance for convenience
const createEscrowClient = (config) => new EscrowClient(config);
exports.createEscrowClient = createEscrowClient;
const createReadOnlyClient = (config) => EscrowClient.readOnly(config);
exports.createReadOnlyClient = createReadOnlyClient;
const createClientWithKeypair = (keypair, config) => EscrowClient.withKeypair(keypair, config);
exports.createClientWithKeypair = createClientWithKeypair;
