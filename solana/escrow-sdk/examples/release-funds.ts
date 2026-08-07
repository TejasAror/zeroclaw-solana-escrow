/**
 * Example: Release Funds from an Escrow
 * 
 * This example demonstrates how a buyer releases funds to the seller after approval.
 * Run with: npx ts-node examples/release-funds.ts
 */

import { Keypair, PublicKey } from '@solana/web3.js';
import { 
  EscrowClient, 
  createEscrowClient,
  deriveAssociatedTokenAccount,
  formatPubkey,
} from '../src';

// ============================================================================
// Configuration
// ============================================================================

// Replace with your actual values
const BUYER_SECRET_KEY = new Uint8Array(32); // Replace with actual secret key
const ESCROW_ADDRESS = new PublicKey('EscrowAddressHere'); // Replace with actual escrow address
const SELLER_PUBLIC_KEY = new PublicKey('SellerPublicKeyHere'); // Replace with actual seller public key

// For SPL token escrows, provide the seller's token account
// const SELLER_TOKEN_ACCOUNT = new PublicKey('SellerTokenAccountHere');

async function main() {
  console.log('💸 Releasing Funds from Escrow on Devnet\n');
  console.log('='.repeat(50));

  try {
    // Create keypair (in production, load from secure storage)
    const buyer = Keypair.fromSecretKey(BUYER_SECRET_KEY);
    const seller = SELLER_PUBLIC_KEY;

    console.log(`👤 Buyer: ${buyer.publicKey.toBase58()}`);
    console.log(`👤 Seller: ${seller.toBase58()}`);
    console.log(`🔑 Escrow: ${ESCROW_ADDRESS.toBase58()}\n`);

    // Create client with buyer's keypair
    const client = createEscrowClient({
      wallet: buyer,
      cluster: 'devnet',
    });

    // First, fetch the escrow to verify state and determine type
    console.log('📋 Fetching escrow details...');
    const escrowData = await client.fetchEscrow(ESCROW_ADDRESS);
    
    if (!escrowData.escrow) {
      throw new Error('Escrow account not found');
    }

    const escrow = escrowData.escrow;
    console.log(`   Seller: ${formatPubkey(escrow.seller)}`);
    console.log(`   Amount: ${escrow.amount.toString()} base units`);
    console.log(`   Status: ${escrow.status.Pending ? 'Pending' : escrow.status.Approved ? 'Approved' : escrow.status.Released ? 'Released' : escrow.status.Cancelled ? 'Cancelled' : 'Expired'}`);
    console.log(`   Type: ${escrow.isSol ? 'SOL' : 'SPL Token'}`);
    if (!escrow.isSol) {
      console.log(`   Token Mint: ${formatPubkey(escrow.tokenMint!)}`);
    }
    console.log(`   Expires: ${escrow.expiresAt ? new Date(Number(escrow.expiresAt) * 1000).toISOString() : 'No expiration'}\n`);

    // Check if escrow can release funds
    if (escrow.status.Pending) {
      throw new Error('Escrow must be approved before releasing funds');
    }
    if (escrow.status.Released || escrow.status.Cancelled || escrow.status.Expired) {
      throw new Error(`Escrow cannot release funds in current state: ${escrow.status}`);
    }

    // Release funds
    console.log('📝 Releasing funds...');
    
    // For SPL token escrows, you need to provide the seller's token account
    // const result = await client.releaseFunds(buyer, ESCROW_ADDRESS, seller, {
    //   sellerTokenAccount: SELLER_TOKEN_ACCOUNT,
    // });
    
    // For SOL escrows, no additional params needed
    const result = await client.releaseFunds(buyer, ESCROW_ADDRESS, seller);

    console.log('\n✅ Funds released successfully!');
    console.log('='.repeat(50));
    console.log(`📝 Transaction Signature: ${result.signature}`);
    console.log(`🔑 Escrow Address: ${result.escrowAddress.toBase58()}`);
    console.log('\n🔗 View on Solana Explorer:');
    console.log(`   https://explorer.solana.com/tx/${result.signature}?cluster=devnet`);
    console.log(`   https://explorer.solana.com/address/${result.escrowAddress.toBase58()}?cluster=devnet`);

  } catch (error) {
    console.error('\n❌ Error releasing funds:');
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