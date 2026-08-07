/**
 * Example: Full Escrow Lifecycle (SPL Token)
 * 
 * This example demonstrates the complete escrow lifecycle for SPL tokens:
 * 1. Initialize escrow (buyer deposits SPL tokens)
 * 2. Approve delivery (buyer confirms delivery)
 * 3. Release funds (buyer releases to seller)
 * 
 * Run with: npx ts-node examples/full-cycle-spl.ts
 */

import { Keypair, PublicKey } from '@solana/web3.js';
import { 
  EscrowClient, 
  createEscrowClient,
  generateAgreementHash,
  createExpiration,
  deriveAssociatedTokenAccount,
  formatAmount,
  formatPubkey,
  getEscrowStatusName,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '../src';

// ============================================================================
// Configuration
// ============================================================================

// Replace with your actual keypairs
const BUYER_SECRET_KEY = new Uint8Array(32); // Replace with actual secret key
const SELLER_SECRET_KEY = new Uint8Array(32); // Replace with actual secret key

// SPL Token Configuration (replace with actual token mint)
const TOKEN_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTt1us'); // USDC on Devnet
const TOKEN_DECIMALS = 6;
const AMOUNT_TOKENS = 10; // 10 USDC
const EXPIRATION_DAYS = 1; // Expires in 1 day (for testing)

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🔄 Full Escrow Lifecycle Demo (SPL Token) on Devnet\n');
  console.log('='.repeat(60));

  try {
    // Create keypairs (in production, load from secure storage)
    const buyer = Keypair.fromSecretKey(BUYER_SECRET_KEY);
    const seller = Keypair.fromSecretKey(SELLER_SECRET_KEY);

    console.log(`👤 Buyer: ${buyer.publicKey.toBase58()}`);
    console.log(`👤 Seller: ${seller.publicKey.toBase58()}`);
    console.log(`🪙 Token Mint: ${TOKEN_MINT.toBase58()}`);
    console.log(`💰 Amount: ${AMOUNT_TOKENS} tokens (${AMOUNT_TOKENS * 10 ** TOKEN_DECIMALS} base units)`);
    console.log(`⏰ Expires in: ${EXPIRATION_DAYS} day(s)\n`);

    // Create client with buyer's keypair
    const client = createEscrowClient({
      wallet: buyer,
      cluster: 'devnet',
    });

    // Derive associated token accounts
    const buyerTokenAccount = deriveAssociatedTokenAccount(buyer.publicKey, TOKEN_MINT);
    const sellerTokenAccount = deriveAssociatedTokenAccount(seller.publicKey, TOKEN_MINT);
    
    console.log(`💳 Buyer Token Account: ${buyerTokenAccount.toBase58()}`);
    console.log(`💳 Seller Token Account: ${sellerTokenAccount.toBase58()}\n`);

    // ========================================================================
    // Step 1: Initialize Escrow
    // ========================================================================
    console.log('📝 Step 1: Initialize Escrow');
    console.log('-'.repeat(40));

    const agreementHash = generateAgreementHash();
    const expiresAt = createExpiration(EXPIRATION_DAYS * 24 * 60 * 60);

    console.log(`🔐 Agreement Hash: ${Buffer.from(agreementHash).toString('hex')}`);
    console.log(`⏰ Expires at: ${new Date(Number(expiresAt) * 1000).toISOString()}`);

    const initResult = await client.initializeEscrow(
      buyer,
      seller.publicKey,
      {
        amount: BigInt(AMOUNT_TOKENS * 10 ** TOKEN_DECIMALS),
        agreementHash,
        expiresAt,
        tokenMint: TOKEN_MINT,
        buyerTokenAccount: buyerTokenAccount,
      }
    );

    console.log(`✅ Escrow initialized!`);
    console.log(`   Signature: ${initResult.signature}`);
    console.log(`   Escrow: ${initResult.escrowAddress.toBase58()}`);
    console.log(`   Vault: ${initResult.vaultAddress.toBase58()}`);
    console.log(`   Token Vault: ${initResult.tokenVaultAddress?.toBase58()}`);

    const escrowAddress = initResult.escrowAddress;

    await sleep(2000);

    // ========================================================================
    // Step 2: Fetch and verify escrow state
    // ========================================================================
    console.log('\n📋 Step 2: Verify Escrow State');
    console.log('-'.repeat(40));

    const escrowData = await client.fetchEscrow(escrowAddress);
    if (!escrowData.escrow) {
      throw new Error('Escrow not found after initialization');
    }

    const escrow = escrowData.escrow;
    console.log(`   Status: ${getEscrowStatusName(escrow.status)}`);
    console.log(`   Buyer: ${formatPubkey(escrow.buyer)}`);
    console.log(`   Seller: ${formatPubkey(escrow.seller)}`);
    console.log(`   Amount: ${formatAmount(escrow.amount, TOKEN_DECIMALS, 'USDC')}`);
    console.log(`   Type: ${escrow.isSol ? 'SOL' : 'SPL Token'}`);
    console.log(`   Token Mint: ${formatPubkey(escrow.tokenMint!)}`);

    // ========================================================================
    // Step 3: Approve Delivery
    // ========================================================================
    console.log('\n✅ Step 3: Approve Delivery');
    console.log('-'.repeat(40));

    console.log('📝 Buyer approving delivery...');
    const approveResult = await client.approveDelivery(buyer, escrowAddress);

    console.log(`✅ Delivery approved!`);
    console.log(`   Signature: ${approveResult.signature}`);

    await sleep(2000);

    // Verify state after approval
    const escrowAfterApprove = await client.fetchEscrow(escrowAddress);
    console.log(`   New Status: ${getEscrowStatusName(escrowAfterApprove.escrow!.status)}`);

    // ========================================================================
    // Step 4: Release Funds
    // ========================================================================
    console.log('\n💸 Step 4: Release Funds to Seller');
    console.log('-'.repeat(40));

    console.log('📝 Buyer releasing funds...');
    const releaseResult = await client.releaseFunds(
      buyer, 
      escrowAddress, 
      seller.publicKey,
      { sellerTokenAccount }
    );

    console.log(`✅ Funds released!`);
    console.log(`   Signature: ${releaseResult.signature}`);

    await sleep(2000);

    // Verify final state
    const escrowFinal = await client.fetchEscrow(escrowAddress);
    console.log(`   Final Status: ${getEscrowStatusName(escrowFinal.escrow!.status)}`);

    // ========================================================================
    // Summary
    // ========================================================================
    console.log('\n' + '='.repeat(60));
    console.log('🎉 Full Escrow Lifecycle Completed Successfully!');
    console.log('='.repeat(60));
    console.log(`🔑 Escrow Address: ${escrowAddress.toBase58()}`);
    console.log(`💰 Amount Transferred: ${formatAmount(BigInt(AMOUNT_TOKENS * 10 ** TOKEN_DECIMALS), TOKEN_DECIMALS, 'USDC')}`);
    console.log(`👤 From: ${formatPubkey(buyer.publicKey)} (Buyer)`);
    console.log(`👤 To: ${formatPubkey(seller.publicKey)} (Seller)`);
    console.log('\n📝 Transaction History:');
    console.log(`   1. Initialize: https://explorer.solana.com/tx/${initResult.signature}?cluster=devnet`);
    console.log(`   2. Approve:    https://explorer.solana.com/tx/${approveResult.signature}?cluster=devnet`);
    console.log(`   3. Release:    https://explorer.solana.com/tx/${releaseResult.signature}?cluster=devnet`);
    console.log(`\n🔗 Escrow Account: https://explorer.solana.com/address/${escrowAddress.toBase58()}?cluster=devnet`);

  } catch (error) {
    console.error('\n❌ Error in full cycle demo:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
      if (error.stack) {
        console.error(`   ${error.stack}`);
      }
    } else {
      console.error(`   ${error}`);
    }
    process.exit(1);
  }
}

main();