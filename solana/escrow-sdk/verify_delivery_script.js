
const { Keypair, PublicKey } = require('@solana/web3.js');
const {
    EscrowClient,
    createClientWithKeypair,
    formatPubkey,
    getEscrowStatusName
} = require('/mnt/c/Users/Tejas/finality/solana/escrow-sdk/dist');

async function main() {
    console.log('✅ Approving Delivery for Escrow\n');
    console.log('='.repeat(50));

    try {
        // Load buyer keypair
        const fs = require('fs');
        const secretKey = new Uint8Array(JSON.parse(fs.readFileSync('/tmp/test_buyer_keypair.json', 'utf8')));
        const buyer = Keypair.fromSecretKey(secretKey);
        const escrowAddress = new PublicKey('EscrowAddressHere123456789');

        console.log(`👤 Buyer: ${buyer.publicKey.toBase58()}`);
        console.log(`🔑 Escrow: ${escrowAddress.toBase58()}\n`);

        // Verify buyer matches escrow
        if (!buyer.publicKey.equals(new PublicKey('AVV2NRakjMu8p4Y6GH42m2rqs4aNxWwrdpsqg6LyjbL7'))) {
            throw new Error('Buyer keypair does not match escrow buyer');
        }

        // Create client with buyer's keypair
        const client = createClientWithKeypair(buyer, { cluster: 'devnet' });

        // Fetch escrow to verify state
        console.log('📋 Fetching escrow details...');
        const escrowData = await client.fetchEscrow(escrowAddress);

        if (!escrowData.escrow) {
            throw new Error('Escrow account not found');
        }

        const escrow = escrowData.escrow;
        const currentStatus = getEscrowStatusName(escrow.status);
        console.log(`   Status: ${currentStatus}`);
        console.log(`   Type: ${escrow.isSol ? 'SOL' : 'SPL Token'}`);
        if (!escrow.isSol) {
            console.log(`   Token Mint: ${formatPubkey(escrow.tokenMint)}`);
        }
        console.log(`   Expires: ${escrow.expiresAt ? new Date(Number(escrow.expiresAt) * 1000).toISOString() : 'No expiration'}\n`);

        // Check if escrow can be approved
        if (escrow.status.Approved || escrow.status.Released || escrow.status.Cancelled || escrow.status.Expired) {
            throw new Error(`Escrow cannot be approved in current state: ${currentStatus}`);
        }

        // Check expiration
        if (escrow.expiresAt) {
            const now = BigInt(Math.floor(Date.now() / 1000));
            if (now >= escrow.expiresAt) {
                throw new Error('Escrow has already expired');
            }
        }

        // Approve delivery
        console.log('📝 Approving delivery...');
        const result = await client.approveDelivery(buyer, escrowAddress);

        console.log('\n✅ Delivery approved successfully!');
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
        console.error('\n❌ Error approving delivery:');
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
