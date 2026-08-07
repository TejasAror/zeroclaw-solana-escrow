"use strict";
/**
 * Example: Initialize an Escrow (SOL)
 *
 * This example demonstrates how to initialize a new SOL escrow account.
 * Run with: npx ts-node examples/initialize-escrow-sol.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const src_1 = require("../src");
// ============================================================================
// Configuration
// ============================================================================
// Replace with your actual keypairs
const BUYER_SECRET_KEY = new Uint8Array(32); // Replace with actual secret key
const SELLER_PUBLIC_KEY = new web3_js_1.PublicKey('11111111111111111111111111111111'); // Replace with actual seller public key
// Escrow parameters
const AMOUNT_SOL = 0.5; // 0.5 SOL
const EXPIRATION_DAYS = 7; // Expires in 7 days
async function main() {
    console.log('🚀 Initializing SOL Escrow on Devnet\n');
    console.log('='.repeat(50));
    try {
        // Create keypairs (in production, load from secure storage)
        const buyer = web3_js_1.Keypair.fromSecretKey(BUYER_SECRET_KEY);
        const seller = SELLER_PUBLIC_KEY;
        console.log(`👤 Buyer: ${buyer.publicKey.toBase58()}`);
        console.log(`👤 Seller: ${seller.toBase58()}`);
        console.log(`💰 Amount: ${AMOUNT_SOL} SOL (${AMOUNT_SOL * src_1.LAMPORTS_PER_SOL} lamports)`);
        console.log(`⏰ Expires in: ${EXPIRATION_DAYS} days\n`);
        // Create client with buyer's keypair
        const client = (0, src_1.createEscrowClient)({
            wallet: buyer,
            cluster: 'devnet',
        });
        // Generate agreement hash (in production, this would be a hash of actual terms)
        const agreementHash = (0, src_1.generateAgreementHash)();
        console.log(`🔐 Agreement Hash: ${Buffer.from(agreementHash).toString('hex')}`);
        // Create expiration timestamp
        const expiresAt = (0, src_1.createExpiration)(EXPIRATION_DAYS * 24 * 60 * 60);
        console.log(`⏰ Expires at: ${new Date(Number(expiresAt) * 1000).toISOString()}\n`);
        // Initialize escrow (SOL - no token mint)
        console.log('📝 Initializing escrow...');
        const result = await client.initializeEscrow(buyer, seller, {
            amount: BigInt(AMOUNT_SOL * src_1.LAMPORTS_PER_SOL),
            agreementHash,
            expiresAt,
            tokenMint: null, // null for SOL
        });
        console.log('\n✅ Escrow initialized successfully!');
        console.log('='.repeat(50));
        console.log(`📝 Transaction Signature: ${result.signature}`);
        console.log(`🔑 Escrow Address: ${result.escrowAddress.toBase58()}`);
        console.log(`🏦 Vault Address: ${result.vaultAddress.toBase58()}`);
        console.log(`🪙 Token Vault: ${result.tokenVaultAddress ? result.tokenVaultAddress.toBase58() : 'N/A (SOL escrow)'}`);
        console.log(`💰 Amount: ${(0, src_1.formatAmount)(BigInt(AMOUNT_SOL * src_1.LAMPORTS_PER_SOL), 9, 'SOL')}`);
        console.log(`⏰ Expires: ${new Date(Number(expiresAt) * 1000).toISOString()}`);
        console.log('\n🔗 View on Solana Explorer:');
        console.log(`   https://explorer.solana.com/tx/${result.signature}?cluster=devnet`);
        console.log(`   https://explorer.solana.com/address/${result.escrowAddress.toBase58()}?cluster=devnet`);
    }
    catch (error) {
        console.error('\n❌ Error initializing escrow:');
        if (error instanceof Error) {
            console.error(`   ${error.message}`);
            if (error.stack) {
                console.error(`   ${error.stack}`);
            }
        }
        else {
            console.error(`   ${error}`);
        }
        process.exit(1);
    }
}
main();
