
import { Keypair, PublicKey } from '@solana/web3.js';
import { 
    EscrowClient, 
    createClientWithKeypair,
    formatPubkey 
} from '/mnt/c/Users/Tejas/finality/solana/escrow-sdk/dist';

async function main() {
    console.log('💸 Releasing Funds from Escrow\n');
    console.log('='.repeat(50));
    
    try {
        // Load buyer keypair
        const fs = require('fs');
        const secretKey = new Uint8Array(JSON.parse(fs.readFileSync('/tmp/test_buyer_keypair.json', 'utf8')));
        const buyer = Keypair.fromSecretKey(secretKey);
        const seller = new PublicKey('SellerPublicKeyHere123456789');
        const escrowAddress = new PublicKey('EscrowAddressHere123456789');
        
        console.log(`👤 Buyer: ${buyer.publicKey.toBase58()}`);
        console.log(`👤 Seller: ${seller.toBase58()}`);
        console.log(`🔑 Escrow: ${escrowAddress.toBase58()}\n`);
        
        // Create client with buyer's keypair
        const client = createClientWithKeypair(buyer, { cluster: 'devnet' });
        
        // Fetch escrow to verify state
        console.log('📋 Fetching escrow details...');
        const escrowData = await client.fetchEscrow(escrowAddress);
        
        if (!escrowData.escrow) {
            throw new Error('Escrow account not found');
        }
        
        const escrow = escrowData.escrow;
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
        
        let result;
        if (escrow.isSol) {
            // SOL escrow - no additional params needed
            result = await client.releaseFunds(buyer, escrowAddress, seller);
        } else {
            // SPL token escrow - need seller token account
            // For now, we'll derive the associated token account
            const { deriveAssociatedTokenAccount } = require('/mnt/c/Users/Tejas/finality/solana/escrow-sdk/dist');
            const sellerTokenAccount = deriveAssociatedTokenAccount(seller, escrow.tokenMint!);
            result = await client.releaseFunds(buyer, escrowAddress, seller, {
                sellerTokenAccount
            });
        }
        
        console.log('\n✅ Funds released successfully!');
        console.log('='.repeat(50));
        console.log(`📝 Transaction Signature: ${result.signature}`);
        console.log(`🔑 Escrow Address: ${result.escrowAddress.toBase58()}`);
        console.log('\n🔗 View on Solana Explorer:');
        console.log(`   https://explorer.solana.com/tx/${result.signature}?cluster=devnet`);
        console.log(`   https://explorer.solana.com/address/${result.escrowAddress.toBase58()}?cluster=devnet`);
        
        // Output result as JSON for parsing
        console.log('\n---RESULT---');
        console.log(JSON.stringify({
            signature: result.signature,
            escrowAddress: result.escrowAddress.toBase58(),
            slot: result.slot,
            confirmations: result.confirmations,
            err: result.err
        }));
        
        return result.signature;
        
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
        console.log('---ERROR---');
        console.log(JSON.stringify({ error: error.message || String(error) }));
        process.exit(1);
    }
}

main();
