/**
 * Example: Approve Delivery for an Escrow
 * 
 * This example demonstrates how a buyer approves delivery for an escrow.
 * Run with: npx ts-node examples/approve-delivery.ts
 */

import { Keypair, PublicKey } from '@solana/web3.js';
import { 
  EscrowClient, 
  createEscrowClient,
  formatPubkey,
} from '../src';

// ============================================================================
// Configuration
// ============================================================================

// Replace with your actual values
const BUYER_SECRET_KEY = new Uint8Array(32); // Replace with actual secret key
const ESCROW_ADDRESS = new PublicKey('EscrowAddressHere'); // Replace with actual escrow address

async function main() {
  console.log('✅ Approving Delivery for Escrow on Devnet\n');
  console.log('='.repeat(50));

  try {
    // Create keypair (in production, load from secure storage)
    const buyer = Keypair.fromSecretKey(BUYER_SECRET_KEY);

    console.log(`👤 Buyer: ${buyer.publicKey.toBase58()}`);
    console.log(`🔑 Escrow: ${ESCROW_ADDRESS.toBase58()}\n`);

    // Create client with buyer's keypair
    const client = createEscrowClient({
      wallet: buyer,
      cluster: 'devnet',
    });

    // First, fetch the escrow to verify state
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
    console.log(`   Expires: ${escrow.expiresAt ? new Date(Number(escrow.expiresAt) * 1000).toISOString() : 'No expiration'}\n`);

    // Check if escrow can be approved
    if (escrow.status.Approved || escrow.status.Released || escrow.status.Cancelled || escrow.status.Expired) {
      throw new Error(`Escrow cannot be approved in current state: ${escrow.status}`);
    }

    // Approve delivery
    console.log('📝 Approving delivery...');
    const result = await client.approveDelivery(buyer, ESCROW_ADDRESS);

    console.log('\n✅ Delivery approved successfully!');
    console.log('='.repeat(50));
    console.log(`📝 Transaction Signature: ${result.signature}`);
    console.log(`🔑 Escrow Address: ${result.escrowAddress.toBase58()}`);
    console.log('\n🔗 View on Solana Explorer:');
    console.log(`   https://explorer.solana.com/tx/${result.signature}?cluster=devnet`);
    console.log(`   https://explorer.solana.com/address/${result.escrowAddress.toBase58()}?cluster=devnet`);

    console.log('\n📋 Next Steps:');
    console.log('   - Release funds: npm run example:release');
    console.log('   - Or cancel escrow: npm run example:cancel');

  } catch (error) {
    console.error('\n❌ Error approving delivery:');
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