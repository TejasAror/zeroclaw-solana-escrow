import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  ConfirmOptions,
} from '@solana/web3.js';
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';

import {
  PROGRAM_ID,
  DEFAULT_CLUSTER,
  CLUSTER_URLS,
  DEFAULT_COMMITMENT,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
} from './constants';

import {
  deriveEscrowPDAs,
  deriveEscrowAddress,
  deriveVaultAddress,
  deriveTokenVaultAddress,
  deriveAssociatedTokenAccount,
  validateEscrowAddress,
} from './pda';

import {
  EscrowAccount,
  InitializeEscrowParams,
  InitializeEscrowResult,
  ApproveDeliveryResult,
  ReleaseFundsResult,
  CancelEscrowResult,
  FetchEscrowResult,
  EscrowClientConfig,
  ComputeBudgetConfig,
  EscrowStatus,
  EscrowProgramError,
  ValidationError,
  TransactionError,
  ReleaseFundsSPLParams,
  CancelEscrowSPLParams,
} from './types';

import {
  validateInitializeEscrowParams,
  validateSellerTokenAccount,
  validateBuyerTokenAccount,
  extractProgramErrorCode,
  getProgramErrorMessage,
  getEscrowStatusName,
  canCancel,
} from './utils';

// Import the IDL
import idlJson from '../idl/escrow_program.json';
const IDL = idlJson as unknown as Idl;

/**
 * Main client class for interacting with the Solana Escrow program
 */
export class EscrowClient {
  public readonly connection: Connection;
  public readonly program: Program;
  public readonly programId: PublicKey;
  public readonly wallet: Keypair | NodeWallet | null;
  public readonly cluster: string;
  public readonly rpcUrl: string;

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
  constructor(config: EscrowClientConfig = {}) {
    this.programId = config.programId || PROGRAM_ID;
    this.cluster = config.cluster || DEFAULT_CLUSTER;
    const clusterUrl = CLUSTER_URLS[this.cluster as keyof typeof CLUSTER_URLS];
    this.rpcUrl = config.rpcUrl || clusterUrl || 'https://api.devnet.solana.com';
    this.connection = new Connection(this.rpcUrl, config.commitment || DEFAULT_COMMITMENT);

    // Set up wallet
    if (config.wallet) {
      if (config.wallet instanceof Keypair) {
        this.wallet = new NodeWallet(config.wallet);
      } else if ('publicKey' in config.wallet && 'signTransaction' in config.wallet) {
        this.wallet = config.wallet as NodeWallet;
      } else {
        this.wallet = new NodeWallet(config.wallet as Keypair);
      }
    } else {
      this.wallet = null;
    }

    // Create Anchor provider
    const wallet = this.wallet || new NodeWallet(Keypair.generate());
    const provider = new AnchorProvider(
      this.connection,
      wallet,
      { commitment: config.commitment || DEFAULT_COMMITMENT }
    );

    // Initialize program
    this.program = new Program(IDL, this.programId, provider);
  }

  /**
   * Creates an EscrowClient with a keypair for signing
   * 
   * @param keypair - The keypair to use for signing
   * @param config - Additional configuration
   * @returns New EscrowClient instance
   */
  static withKeypair(keypair: Keypair, config: Omit<EscrowClientConfig, 'wallet'> = {}): EscrowClient {
    return new EscrowClient({ ...config, wallet: keypair });
  }

  /**
   * Creates an EscrowClient for read-only operations (no wallet required)
   * 
   * @param config - Configuration options
   * @returns New EscrowClient instance
   */
  static readOnly(config: Omit<EscrowClientConfig, 'wallet'> = {}): EscrowClient {
    return new EscrowClient({ ...config, wallet: null });
  }

  // ============================================================================
  // PDA Derivation Methods
  // ============================================================================

  /**
   * Derives all PDAs for a given buyer
   */
  async derivePDAs(buyer: PublicKey): Promise<{
    escrow: PublicKey;
    escrowBump: number;
    vault: PublicKey;
    vaultBump: number;
    tokenVault: PublicKey;
    tokenVaultBump: number;
  }> {
    return deriveEscrowPDAs(buyer, this.programId);
  }

  /**
   * Derives just the escrow PDA for a buyer
   */
  deriveEscrowAddress(buyer: PublicKey): [PublicKey, number] {
    return deriveEscrowAddress(buyer, this.programId);
  }

  /**
   * Derives the vault PDA for an escrow
   */
  deriveVaultAddress(escrow: PublicKey): [PublicKey, number] {
    return deriveVaultAddress(escrow, this.programId);
  }

  /**
   * Derives the token vault PDA for an escrow
   */
  deriveTokenVaultAddress(escrow: PublicKey): [PublicKey, number] {
    return deriveTokenVaultAddress(escrow, this.programId);
  }

  /**
   * Derives the associated token account for a wallet and mint
   */
  deriveAssociatedTokenAccount(wallet: PublicKey, mint: PublicKey): PublicKey {
    return deriveAssociatedTokenAccount(wallet, mint);
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
  async initializeEscrow(
    buyer: Keypair,
    seller: PublicKey,
    params: InitializeEscrowParams,
    computeBudget?: ComputeBudgetConfig
  ): Promise<InitializeEscrowResult> {
    // Validate parameters
    const validated = validateInitializeEscrowParams(params);

    // Derive PDAs
    const { escrow, vault, tokenVault } = await deriveEscrowPDAs(buyer.publicKey, this.programId);

    // Determine if this is a SOL or SPL token escrow
    const isSol = validated.tokenMint === null;

    // Build the transaction
    const instructions: TransactionInstruction[] = [];

    // Add compute budget instructions if provided
    if (computeBudget?.units) {
      instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: computeBudget.units }));
    }
    if (computeBudget?.price) {
      instructions.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: computeBudget.price }));
    }

    // Prepare accounts for initialize instruction
    const accounts: Record<string, PublicKey> = {
      buyer: buyer.publicKey,
      seller,
      escrow,
      vault,
      tokenVault,
      systemProgram: SYSTEM_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    };

    // Add token mint and buyer token account for SPL token escrows
    if (!isSol) {
      accounts['tokenMint'] = validated.tokenMint!;
      accounts['buyerTokenAccount'] = validated.buyerTokenAccount!;
    }

    // Add the initialize instruction
    const initializeIx = await (this.program.methods as any)
      .initialize(
        validated.amount,
        Array.from(validated.agreementHash),
        validated.expiresAt,
        validated.tokenMint
      )
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
  async approveDelivery(
    buyer: Keypair,
    escrowAddress: PublicKey,
    computeBudget?: ComputeBudgetConfig
  ): Promise<ApproveDeliveryResult> {
    // Validate escrow address belongs to buyer
    if (!validateEscrowAddress(escrowAddress, buyer.publicKey, this.programId)) {
      throw new ValidationError('Escrow address does not match buyer');
    }

    const instructions: TransactionInstruction[] = [];

    if (computeBudget?.units) {
      instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: computeBudget.units }));
    }
    if (computeBudget?.price) {
      instructions.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: computeBudget.price }));
    }

    const approveIx = await (this.program.methods as any)
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
  async releaseFunds(
    buyer: Keypair,
    escrowAddress: PublicKey,
    seller: PublicKey,
    params?: ReleaseFundsSPLParams,
    computeBudget?: ComputeBudgetConfig
  ): Promise<ReleaseFundsResult> {
    // Validate escrow address belongs to buyer
    if (!validateEscrowAddress(escrowAddress, buyer.publicKey, this.programId)) {
      throw new ValidationError('Escrow address does not match buyer');
    }

    // Fetch escrow to determine if SPL or SOL
    const escrowData = await this.fetchEscrow(escrowAddress);
    if (!escrowData.escrow) {
      throw new ValidationError('Escrow account not found');
    }

    const isSol = escrowData.escrow.isSol;
    // const tokenMint = escrowData.escrow.tokenMint; // Unused, reserved for future use

    const instructions: TransactionInstruction[] = [];

    if (computeBudget?.units) {
      instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: computeBudget.units }));
    }
    if (computeBudget?.price) {
      instructions.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: computeBudget.price }));
    }

    // Derive vault addresses
    const [vault] = deriveVaultAddress(escrowAddress, this.programId);
    const [tokenVault] = deriveTokenVaultAddress(escrowAddress, this.programId);

    const accounts: Record<string, PublicKey> = {
      buyer: buyer.publicKey,
      seller,
      escrow: escrowAddress,
      vault,
      systemProgram: SYSTEM_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    };

    if (!isSol) {
      accounts['tokenVault'] = tokenVault;
      if (!params?.sellerTokenAccount) {
        throw new ValidationError('sellerTokenAccount is required for SPL token escrows');
      }
      accounts['sellerTokenAccount'] = validateSellerTokenAccount(params.sellerTokenAccount);
    }

    const releaseIx = await (this.program.methods as any)
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
  async cancelEscrow(
    buyer: Keypair,
    escrowAddress: PublicKey,
    seller: PublicKey,
    params?: CancelEscrowSPLParams,
    computeBudget?: ComputeBudgetConfig
  ): Promise<CancelEscrowResult> {
    // Validate escrow address belongs to buyer
    if (!validateEscrowAddress(escrowAddress, buyer.publicKey, this.programId)) {
      throw new ValidationError('Escrow address does not match buyer');
    }

    // Fetch escrow to check state and determine if SPL
    const escrowData = await this.fetchEscrow(escrowAddress);
    if (!escrowData.escrow) {
      throw new ValidationError('Escrow account not found');
    }

    const escrowAccount = escrowData.escrow;
    const isSol = escrowAccount.isSol;
    // const tokenMint = escrowAccount.tokenMint; // Unused, reserved for future use

    // Check if escrow can be cancelled
    if (!canCancel(escrowAccount.status, escrowAccount.expiresAt)) {
      throw new ValidationError(`Escrow cannot be cancelled in current state: ${getEscrowStatusName(escrowAccount.status)}`);
    }

    const instructions: TransactionInstruction[] = [];

    if (computeBudget?.units) {
      instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units: computeBudget.units }));
    }
    if (computeBudget?.price) {
      instructions.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: computeBudget.price }));
    }

    // Derive vault addresses
    const [vault] = deriveVaultAddress(escrowAddress, this.programId);
    const [tokenVault] = deriveTokenVaultAddress(escrowAddress, this.programId);

    const accounts: Record<string, PublicKey> = {
      buyer: buyer.publicKey,
      seller,
      escrow: escrowAddress,
      vault,
      systemProgram: SYSTEM_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    };

    if (!isSol) {
      accounts['tokenVault'] = tokenVault;
      if (!params?.buyerTokenAccount) {
        throw new ValidationError('buyerTokenAccount is required for SPL token escrows');
      }
      accounts['buyerTokenAccount'] = validateBuyerTokenAccount(params.buyerTokenAccount);
    }

    const cancelIx = await (this.program.methods as any)
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
  async fetchEscrow(escrowAddress: PublicKey): Promise<FetchEscrowResult> {
    // Fetch the escrow account
    let rawAccount: unknown = null;
    
    try {
      // @ts-ignore - TypeScript doesn't properly infer the return type of Anchor's fetch
      rawAccount = await this.program.account.escrow.fetch(escrowAddress) as unknown;
    } catch {
      // If fetch throws (account not found), return null
      const result: FetchEscrowResult = { escrow: null, address: escrowAddress };
      return result;
    }
    
    if (!rawAccount || rawAccount === undefined) {
      const result: FetchEscrowResult = { escrow: null, address: escrowAddress };
      return result;
    }
    
    const account = rawAccount as {
      buyer: PublicKey;
      seller: PublicKey;
      amount: bigint;
      agreementHash: number[];
      status: any;
      isSol: boolean;
      tokenMint: PublicKey | null;
      expiresAt: bigint | null;
      bump: number;
      vaultBump: number;
    };
    
    const escrow: EscrowAccount = {
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

    const result: FetchEscrowResult = { escrow, address: escrowAddress };
    return result;
  }

  /**
   * Fetches all escrows for a given buyer
   * 
   * @param buyer - The buyer's public key
   * @returns Array of escrow accounts
   */
  async fetchEscrowsForBuyer(buyer: PublicKey): Promise<Array<FetchEscrowResult & { escrow: EscrowAccount }>> {
    const escrowAddress = deriveEscrowAddress(buyer, this.programId)[0];
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
  async fetchEscrowsForSeller(_seller: PublicKey): Promise<Array<FetchEscrowResult & { escrow: EscrowAccount }>> {
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
  private async sendAndConfirm(
    instructions: TransactionInstruction[],
    signers: Keypair[],
    options?: ConfirmOptions
  ): Promise<string> {
    if (!this.wallet) {
      throw new ValidationError('Wallet required for signing transactions');
    }

    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
    
    const transaction = new Transaction().add(...instructions);
    transaction.feePayer = this.wallet.publicKey;
    transaction.recentBlockhash = blockhash;

    // Sign with all provided signers
    transaction.partialSign(...signers);

    // Send transaction
    const signature = await this.connection.sendRawTransaction(
      transaction.serialize(),
      options
    );

    // Confirm transaction
    const confirmation = await this.connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed'
    );

    if (confirmation.value.err) {
      const programErrorCode = extractProgramErrorCode(confirmation.value.err);
      if (programErrorCode) {
        throw new EscrowProgramError(
          getProgramErrorMessage(programErrorCode),
          programErrorCode,
          new Error(JSON.stringify(confirmation.value.err))
        );
      }
      throw new TransactionError(
        `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
        signature,
        new Error(JSON.stringify(confirmation.value.err))
      );
    }

    return signature;
  }

  /**
   * Converts Anchor enum status to our EscrowStatus type
   */
  private convertStatus(status: any): EscrowStatus {
    if (status.Pending) return { Pending: null };
    if (status.Approved) return { Approved: null };
    if (status.Released) return { Released: null };
    if (status.Cancelled) return { Cancelled: null };
    if (status.Expired) return { Expired: null };
    return { Pending: null }; // Default fallback
  }

  /**
   * Gets the program ID being used
   */
  getProgramId(): PublicKey {
    return this.programId;
  }

  /**
   * Gets the cluster URL being used
   */
  getRpcUrl(): string {
    return this.rpcUrl;
  }

  /**
   * Checks if the client has a wallet configured
   */
  hasWallet(): boolean {
    return this.wallet !== null;
  }

  /**
   * Gets the wallet public key if available
   */
  getWalletPublicKey(): PublicKey | null {
    return this.wallet?.publicKey || null;
  }
}

// Export a default instance for convenience
export const createEscrowClient = (config?: EscrowClientConfig) => new EscrowClient(config);
export const createReadOnlyClient = (config?: Omit<EscrowClientConfig, 'wallet'>) => EscrowClient.readOnly(config);
export const createClientWithKeypair = (keypair: Keypair, config?: Omit<EscrowClientConfig, 'wallet'>) => 
  EscrowClient.withKeypair(keypair, config);