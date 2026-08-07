/**
 * Example: Fetch Escrow Details
 * 
 * This example demonstrates how to fetch and display escrow account details.
 * Run with: npx ts-node examples/fetch-escrow.ts
 */

import { PublicKey } from '@solana/web3.js';
import { 
  EscrowClient, 
  createReadOnlyClient,
  formatPubkey,
  formatAmount,
  getEscrowStatusName,
  isExpired,
  getTimeRemaining,
} from '../src';

// ============================================================================
// Configuration
// ============================================================================

// Replace with actual escrow address
const ESCROW_ADDRESS = new PublicKey('EscrowAddressHere'); // Replace with actual escrow address

async function main() {
  console.log('🔍 Fetching Escrow Details from Devnet\n');
  console.log('='.repeat(50));

  try {
    console.log(`🔑 Escrow: ${ESCROW_ADDRESS.toBase58()}\n`);

    // Create read-only client (no wallet needed)
    const client = createReadOnlyClient({
      cluster: 'devnet',
    });

    // Fetch escrow
    console.log('📋 Fetching escrow...');
    const result = await client.fetchEscrow(ESCROW_ADDRESS);
    
    if (!result.escrow) {
      console.log('❌ Escrow account not found');
      process.exit(1);
    }

    const escrow = result.escrow;
    
    console.log('\n✅ Escrow found!');
    console.log('='.repeat(50));
    console.log(`🔑 Address: ${result.address.toBase58()}`);
    console.log(`👤 Buyer: ${formatPubkey(escrow.buyer)} (${escrow.buyer.toBase58()})`);
    console.log(`👤 Seller: ${formatPubkey(escrow.seller)} (${escrow.seller.toBase58()})`);
    console.log(`💰 Amount: ${escrow.amount.toString()} base units`);
    if (escrow.isSol) {
      console.log(`   = ${formatAmount(escrow.amount, 9, 'SOL')}`);
    } else {
      console.log(`   Token Mint: ${formatPubkey(escrow.tokenMint!)}`);
    }
    console.log(`📊 Status: ${getEscrowStatusName(escrow.status)}`);
    console.log(`🪙 Type: ${escrow.isSol ? 'SOL' : 'SPL Token'}`);
    
    if (escrow.agreementHash) {
      console.log(`🔐 Agreement Hash: ${Buffer.from(escrow.agreementHash).toString('hex')}`);
    }
    
    if (escrow.expiresAt) {
      const expiresDate = new Date(Number(escrow.expiresAt) * 1000);
      const expired = isExpired(escrow.expiresAt);
      const timeRemaining = getTimeRemaining(escrow.expiresAt);
      
      console.log(`⏰ Expires: ${expiresDate.toISOString()}`);
      console.log(`   Expired: ${expired ? 'Yes' : 'No'}`);
      if (!expired && timeRemaining) {
        const days = Number(timeRemaining) / 86400;
        const hours = (Number(timeRemaining) % 86400) / 3600;
        console.log(`   Time Remaining: ~${days.toFixed(1)} days (${hours.toFixed(1)} hours)`);
      }
    } else {
      console.log(`⏰ Expires: Never`);
    }
    
    console.log(`🔢 Bump: ${escrow.bump}`);
    console.log(`🔢 Vault Bump: ${escrow.vaultBump}`);

    // Derive and show PDA addresses
    const { deriveEscrowAddress, deriveVaultAddress, deriveTokenVaultAddress } = await import('../src/pda');
    const [derivedEscrow, escrowBump] = deriveEscrowAddress(escrow.buyer, client.getProgramId());
    const [derivedVault, vaultBump] = deriveVaultAddress(escrowAddress, client.getProgramId());
    const [derivedTokenVault, tokenVaultBump] = deriveTokenVaultAddress(escrowAddress, client.getProgramId());
    
    console.log('\n🔐 Derived PDAs:');
    console.log(`   Escrow: ${derivedEscrow.toBase58()} (bump: ${escrowBump})`);
    console.log(`   Vault: ${derivedVault.toBase58()} (bump: ${vaultBump})`);
    console.log(`   Token Vault: ${derivedTokenVault.toBase58()} (bump: ${tokenVaultBump})`);
    
    // Verify addresses match
    console.log('\n✅ Address Verification:');
    console.log(`   Escrow matches: ${derivedEscrow.equals(escrowAddress) ? 'Yes' : 'No'}`);
    console.log(`   Vault bump matches: ${vaultBump === escrow.vaultBump ? 'Yes' : 'No'}`);

    console.log('\n🔗 View on Solana Explorer:');
    console.log(`   https://explorer.solana.com/address/${escrowAddress.toBase58()}?cluster=devnet`);

  } catch (error) {
    console.error('\n❌ Error fetching escrow:');
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