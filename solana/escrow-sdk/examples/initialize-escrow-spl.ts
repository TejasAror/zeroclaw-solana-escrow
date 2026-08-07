/**
 * Example: Initialize an Escrow (SPL Token)
 * 
 * This example demonstrates how to initialize a new SPL token escrow account.
 * Run with: npx ts-node examples/initialize-escrow-spl.ts
 */

import { Keypair, PublicKey } from '@solana/web3.js';
import { 
  EscrowClient, 
  createEscrowClient, 
  generateAgreementHash,
  createExpiration,
  deriveAssociatedTokenAccount,
  formatAmount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '../src';

// ============================================================================
// Configuration
// ============================================================================

// Replace with your actual keypairs
const BUYER_SECRET_KEY = new Uint8Array(32); // Replace with actual secret key
const SELLER_PUBLIC_KEY = new PublicKey('11111111111111111111111111111111'); // Replace with actual seller public key

// SPL Token Configuration (replace with actual token mint)
const TOKEN_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTt1us'); // USDC on Devnet
const TOKEN_DECIMALS = 6;
const AMOUNT_TOKENS = 100; // 100 USDC
const EXPIRATION_DAYS = 7; // Expires in 7 days

async function main() {
  console.log('🚀 Initializing SPL Token Escrow on Devnet\n');
  console.log('='.repeat(50));

  try {
    // Create keypairs (in production, load from secure storage)
    const buyer = Keypair.fromSecretKey(BUYER_SECRET_KEY);
    const seller = SELLER_PUBLIC_KEY;

    console.log(`👤 Buyer: ${buyer.publicKey.toBase58()}`);
    console.log(`👤 Seller: ${seller.toBase58()}`);
    console.log(`🪙 Token Mint: ${TOKEN_MINT.toBase58()}`);
    console.log(`💰 Amount: ${AMOUNT_TOKENS} tokens (${AMOUNT_TOKENS * 10 ** TOKEN_DECIMALS} base units)`);
    console.log(`⏰ Expires in: ${EXPIRATION_DAYS} days\n`);

    // Create client with buyer's keypair
    const client = createEscrowClient({
      wallet: buyer,
      cluster: 'devnet',
    });

    // Derive buyer's associated token account
    const buyerTokenAccount = deriveAssociatedTokenAccount(buyer.publicKey, TOKEN_MINT);
    console.log(`💳 Buyer Token Account: ${buyerTokenAccount.toBase58()}`);

    // Generate agreement hash
    const agreementHash = generateAgreementHash();
    console.log(`🔐 Agreement Hash: ${Buffer.from(agreementHash).toString('hex')}`);

    // Create expiration timestamp
    const expiresAt = createExpiration(EXPIRATION_DAYS * 24 * 60 * 60);
    console.log(`⏰ Expires at: ${new Date(Number(expiresAt) * 1000).toISOString()}\n`);

    // Initialize escrow (SPL Token)
    console.log('📝 Initializing escrow...');
    const result = await client.initializeEscrow(
      buyer,
      seller,
      {
        amount: BigInt(AMOUNT_TOKENS * 10 ** TOKEN_DECIMALS),
        agreementHash,
        expiresAt,
        tokenMint: TOKEN_MINT,
        buyerTokenAccount: buyerTokenAccount,
      }
    );

    console.log('\n✅ Escrow initialized successfully!');
    console.log('='.repeat(50));
    console.log(`📝 Transaction Signature: ${result.signature}`);
    console.log(`🔑 Escrow Address: ${result.escrowAddress.toBase58()}`);
    console.log(`🏦 Vault Address: ${result.vaultAddress.toBase58()}`);
    console.log(`🪙 Token Vault: ${result.tokenVaultAddress?.toBase58() || 'N/A'}`);
    console.log(`💰 Amount: ${formatAmount(BigInt(AMOUNT_TOKENS * 10 ** TOKEN_DECIMALS), TOKEN_DECIMALS, 'USDC')}`);
    console.log(`⏰ Expires: ${new Date(Number(expiresAt) * 1000).toISOString()}`);
    console.log('\n🔗 View on Solana Explorer:');
    console.log(`   https://explorer.solana.com/tx/${result.signature}?cluster=devnet`);
    console.log(`   https://explorer.solana.com/address/${result.escrowAddress.toBase58()}?cluster=devnet`);

    console.log('\n📋 Next Steps:');
    console.log('   1. Buyer approves delivery: npm run example:approve');
    console.log('   2. Buyer releases funds: npm run example:release');
    console.log('   3. Or buyer cancels: npm run example:cancel');

  } catch (error) {
    console.error('\n❌ Error initializing escrow:');
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