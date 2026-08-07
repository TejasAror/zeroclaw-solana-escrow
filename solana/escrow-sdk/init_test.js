const { Keypair, PublicKey } = require('@solana/web3.js');
const {
    createEscrowClient,
    LAMPORTS_PER_SOL,
    createExpiration,
    formatAmount,
    generateAgreementHash,
} = require('./dist');

async function main() {
    console.log('🚀 Initializing SOL Escrow on Devnet\n');
    console.log('='.repeat(50));
    try {
        // Create buyer keypair from our test data
        const buyerSecretKey = Uint8Array.from([229, 229, 10, 207, 34, 165, 236, 250, 245, 51, 51, 152, 46, 16, 144, 144, 214, 116, 191, 103, 193, 17, 200, 73, 175, 197, 126, 62, 183, 7, 52, 183, 187, 101, 150, 48, 145, 97, 171, 19, 131, 52, 13, 155, 32, 187, 8, 255, 86, 135, 42, 192, 83, 251, 44, 194, 91, 255, 133, 119, 208, 16, 172, 150]);
        const buyer = Keypair.fromSecretKey(buyerSecretKey);
        const seller = new PublicKey('2ve5JujWUeuVB2NsHagMHhcS9H9HYyiDis9gUgsMwh2m');
        
        const AMOUNT_SOL = 0.1; // 0.1 SOL = 100,000,000 lamports
        const EXPIRATION_DAYS = 7;
        
        console.log(`👤 Buyer: ${buyer.publicKey.toBase58()}`);
        console.log(`👤 Seller: ${seller.toBase58()}`);
        console.log(`💰 Amount: ${AMOUNT_SOL} SOL (${AMOUNT_SOL * LAMPORTS_PER_SOL} lamports)`);
        console.log(`⏰ Expires in: ${EXPIRATION_DAYS} days\n`);
        
        // Create client with buyer's keypair
        const client = createEscrowClient({
            wallet: buyer,
            cluster: 'devnet',
        });
        
        // Generate agreement hash (in production, this would be a hash of actual terms)
        const agreementHash = generateAgreementHash();
        console.log(`🔐 Agreement Hash: ${Buffer.from(agreementHash).toString('hex')}`);
        
        // Create expiration timestamp
        const expiresAt = createExpiration(EXPIRATION_DAYS * 24 * 60 * 60);
        console.log(`⏰ Expires at: ${new Date(Number(expiresAt) * 1000).toISOString()}\n`);
        
        // Initialize escrow (SOL - no token mint)
        console.log('📝 Initializing escrow...');
        const result = await client.initializeEscrow(buyer, seller, {
            amount: BigInt(AMOUNT_SOL * LAMPORTS_PER_SOL),
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
        console.log(`💰 Amount: ${formatAmount(BigInt(AMOUNT_SOL * LAMPORTS_PER_SOL), 9, 'SOL')}`);
        console.log(`⏰ Expires: ${new Date(Number(expiresAt) * 1000).toISOString()}`);
        console.log('\n🔗 View on Solana Explorer:');
        console.log(`   https://explorer.solana.com/tx/${result.signature}?cluster=devnet`);
        console.log(`   https://explorer.solana.com/address/${result.escrowAddress.toBase58()}?cluster=devnet`);
        
        // Output for parsing
        console.log('\n---RESULT---');
        console.log(JSON.stringify({
            signature: result.signature,
            escrowAddress: result.escrowAddress.toBase58(),
            vaultAddress: result.vaultAddress.toBase58(),
            tokenVaultAddress: result.tokenVaultAddress ? result.tokenVaultAddress.toBase58() : null,
            slot: result.slot,
            confirmations: result.confirmations,
            err: result.err
        }));
        
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
