/**
 * Example: Full Escrow Lifecycle (SOL)
 * 
 * This example demonstrates the complete escrow lifecycle:
 * 1. Initialize escrow (buyer deposits SOL)
 * 2. Approve delivery (buyer confirms delivery)
 * 3. Release funds (buyer releases to seller)
 * 
 * Run with: npx ts-node examples/full-cycle-sol.ts
 */

import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { 
  EscrowClient, 
  createEscrowClient,
  generateAgreementHash,
  createExpiration,
  formatAmount,
  formatPubkey,
  getEscrowStatusName,
} from '../src';

// ============================================================================
// Configuration
// ============================================================================

// Replace with your actual keypairs
const BUYER_SECRET_KEY = new Uint8Array(32); // Replace with actual secret key
const SELLER_SECRET_KEY = new Uint8Array(32); // Replace with actual secret key

// Escrow parameters
const AMOUNT_SOL = 0.1; // 0.1 SOL (small amount for testing)
const EXPIRATION_DAYS = 1; // Expires in 1 day (for testing)

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🔄 Full Escrow Lifecycle Demo (SOL) on Devnet\n');
  console.log('='.repeat(60));

  try {
    // Create keypairs (in production, load from secure storage)
    const buyer = Keypair.fromSecretKey(BUYER_SECRET_KEY);
    const seller = Keypair.fromSecretKey(SELLER_SECRET_KEY);

    console.log(`👤 Buyer: ${buyer.publicKey.toBase58()}`);
    console.log(`👤 Seller: ${seller.publicKey.toBase58()}`);
    console.log(`💰 Amount: ${AMOUNT_SOL} SOL (${AMOUNT_SOL * LAMPORTS_PER_SOL} lamports)`);
    console.log(`⏰ Expires in: ${EXPIRATION_DAYS} day(s)\n`);

    // Create client with buyer's keypair
    const client = createEscrowClient({
      wallet: buyer,
      cluster: 'devnet',
    });

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
        amount: BigInt(AMOUNT_SOL * LAMPORTS_PER_SOL),
        agreementHash,
        expiresAt,
        tokenMint: null, // SOL escrow
      }
    );

    console.log(`✅ Escrow initialized!`);
    console.log(`   Signature: ${initResult.signature}`);
    console.log(`   Escrow: ${initResult.escrowAddress.toBase58()}`);
    console.log(`   Vault: ${initResult.vaultAddress.toBase58()}`);

    const escrowAddress = initResult.escrowAddress;

    // Wait a bit for confirmation
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
    console.log(`   Amount: ${formatAmount(escrow.amount, 9, 'SOL')}`);
    console.log(`   Type: ${escrow.isSol ? 'SOL' : 'SPL Token'}`);

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
    const releaseResult = await client.releaseFunds(buyer, escrowAddress, seller.publicKey);

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
    console.log(`💰 Amount Transferred: ${formatAmount(BigInt(AMOUNT_SOL * LAMPORTS_PER_SOL), 9, 'SOL')}`);
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