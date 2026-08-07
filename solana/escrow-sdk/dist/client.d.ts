import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import { EscrowAccount, InitializeEscrowParams, InitializeEscrowResult, ApproveDeliveryResult, ReleaseFundsResult, CancelEscrowResult, FetchEscrowResult, EscrowClientConfig, ComputeBudgetConfig, ReleaseFundsSPLParams, CancelEscrowSPLParams } from './types';
/**
 * Main client class for interacting with the Solana Escrow program
 */
export declare class EscrowClient {
    readonly connection: Connection;
    readonly program: Program;
    readonly programId: PublicKey;
    readonly wallet: Keypair | NodeWallet | null;
    readonly cluster: string;
    readonly rpcUrl: string;
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
    constructor(config?: EscrowClientConfig);
    /**
     * Creates an EscrowClient with a keypair for signing
     *
     * @param keypair - The keypair to use for signing
     * @param config - Additional configuration
     * @returns New EscrowClient instance
     */
    static withKeypair(keypair: Keypair, config?: Omit<EscrowClientConfig, 'wallet'>): EscrowClient;
    /**
     * Creates an EscrowClient for read-only operations (no wallet required)
     *
     * @param config - Configuration options
     * @returns New EscrowClient instance
     */
    static readOnly(config?: Omit<EscrowClientConfig, 'wallet'>): EscrowClient;
    /**
     * Derives all PDAs for a given buyer
     */
    derivePDAs(buyer: PublicKey): Promise<{
        escrow: PublicKey;
        escrowBump: number;
        vault: PublicKey;
        vaultBump: number;
        tokenVault: PublicKey;
        tokenVaultBump: number;
    }>;
    /**
     * Derives just the escrow PDA for a buyer
     */
    deriveEscrowAddress(buyer: PublicKey): [PublicKey, number];
    /**
     * Derives the vault PDA for an escrow
     */
    deriveVaultAddress(escrow: PublicKey): [PublicKey, number];
    /**
     * Derives the token vault PDA for an escrow
     */
    deriveTokenVaultAddress(escrow: PublicKey): [PublicKey, number];
    /**
     * Derives the associated token account for a wallet and mint
     */
    deriveAssociatedTokenAccount(wallet: PublicKey, mint: PublicKey): PublicKey;
    /**
     * Initializes a new escrow account
     *
     * @param buyer - The buyer's keypair (signer)
     * @param seller - The seller's public key
     * @param params - Escrow initialization parameters
     * @param computeBudget - Optional compute budget configuration
     * @returns Transaction result with escrow and vault addresses
     */
    initializeEscrow(buyer: Keypair, seller: PublicKey, params: InitializeEscrowParams, computeBudget?: ComputeBudgetConfig): Promise<InitializeEscrowResult>;
    /**
     * Approves delivery for an escrow (buyer only)
     *
     * @param buyer - The buyer's keypair (signer)
     * @param escrowAddress - The escrow account address
     * @param computeBudget - Optional compute budget configuration
     * @returns Transaction result
     */
    approveDelivery(buyer: Keypair, escrowAddress: PublicKey, computeBudget?: ComputeBudgetConfig): Promise<ApproveDeliveryResult>;
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
    releaseFunds(buyer: Keypair, escrowAddress: PublicKey, seller: PublicKey, params?: ReleaseFundsSPLParams, computeBudget?: ComputeBudgetConfig): Promise<ReleaseFundsResult>;
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
    cancelEscrow(buyer: Keypair, escrowAddress: PublicKey, seller: PublicKey, params?: CancelEscrowSPLParams, computeBudget?: ComputeBudgetConfig): Promise<CancelEscrowResult>;
    /**
     * Fetches an escrow account by address
     *
     * @param escrowAddress - The escrow account address
     * @returns Escrow account data or null if not found
     */
    fetchEscrow(escrowAddress: PublicKey): Promise<FetchEscrowResult>;
    /**
     * Fetches all escrows for a given buyer
     *
     * @param buyer - The buyer's public key
     * @returns Array of escrow accounts
     */
    fetchEscrowsForBuyer(buyer: PublicKey): Promise<Array<FetchEscrowResult & {
        escrow: EscrowAccount;
    }>>;
    /**
     * Fetches all escrows for a given seller
     *
     * @param _seller - The seller's public key (unused, reserved for future indexer support)
     * @returns Array of escrow accounts
     */
    fetchEscrowsForSeller(_seller: PublicKey): Promise<Array<FetchEscrowResult & {
        escrow: EscrowAccount;
    }>>;
    /**
     * Sends and confirms a transaction with retry logic
     */
    private sendAndConfirm;
    /**
     * Converts Anchor enum status to our EscrowStatus type
     */
    private convertStatus;
    /**
     * Gets the program ID being used
     */
    getProgramId(): PublicKey;
    /**
     * Gets the cluster URL being used
     */
    getRpcUrl(): string;
    /**
     * Checks if the client has a wallet configured
     */
    hasWallet(): boolean;
    /**
     * Gets the wallet public key if available
     */
    getWalletPublicKey(): PublicKey | null;
}
export declare const createEscrowClient: (config?: EscrowClientConfig) => EscrowClient;
export declare const createReadOnlyClient: (config?: Omit<EscrowClientConfig, "wallet">) => EscrowClient;
export declare const createClientWithKeypair: (keypair: Keypair, config?: Omit<EscrowClientConfig, "wallet">) => EscrowClient;
//# sourceMappingURL=client.d.ts.map