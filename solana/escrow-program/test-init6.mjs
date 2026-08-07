import anchor from '@coral-xyz/anchor';
import { Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { createMint, createAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import fs from 'fs';

const connection = new Connection('http://localhost:8899', 'confirmed');
const secretKey = JSON.parse(fs.readFileSync('./phantom-keypair.json', 'utf8'));
const wallet = anchor.web3.Keypair.fromSecretKey(new Uint8Array(secretKey));
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), { commitment: 'confirmed' });
anchor.setProvider(provider);

const program = anchor.workspace.escrowProgram;

// Use the provider wallet as the buyer (so it's also the fee payer)
const buyer = wallet;
const seller = Keypair.generate();
const amount = new anchor.BN(1 * LAMPORTS_PER_SOL);
const agreementHash = Array.from(Buffer.from('a'.repeat(32), 'hex'));
const expiresAt = new anchor.BN(Math.floor(Date.now() / 1000) + 3600);

function getEscrowPDA(buyerPubkey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), buyerPubkey.toBuffer()],
    program.programId
  );
}

function getVaultPDA(escrowPubkey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), escrowPubkey.toBuffer()],
    program.programId
  );
}

const [escrowPDA, escrowBump] = getEscrowPDA(buyer.publicKey);
const [vaultPDA, vaultBump] = getVaultPDA(escrowPDA);

console.log('Buyer (phantom wallet):', buyer.publicKey.toString());
console.log('Seller:', seller.publicKey.toString());
console.log('Escrow PDA:', escrowPDA.toString(), 'bump:', escrowBump);
console.log('Vault PDA:', vaultPDA.toString(), 'bump:', vaultBump);

// Check balances
const buyerBalBefore = await provider.connection.getBalance(buyer.publicKey);
console.log('Buyer balance before:', buyerBalBefore);

// Check if vault exists (should not)
const vaultInfo = await provider.connection.getAccountInfo(vaultPDA);
console.log('Vault account info (should be null):', vaultInfo);

// Check if escrow exists (should not)
const escrowInfo = await provider.connection.getAccountInfo(escrowPDA);
console.log('Escrow account info (should be null):', escrowInfo);

// Now try initialize
try {
  const tx = await program.methods
    .initialize(amount, agreementHash, expiresAt, null)
    .accounts({
      buyer: buyer.publicKey,
      seller: seller.publicKey,
      escrow: escrowPDA,
      vault: vaultPDA,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      tokenMint: null,
      tokenVault: null,
      buyerTokenAccount: null,
    })
    .signers([buyer])  // buyer is also the wallet
    .rpc();
  console.log('Initialize tx:', tx);
} catch (e) {
  console.error('Error:', e);
  if (e.transactionLogs) {
    console.log('Transaction logs:', e.transactionLogs);
  }
}