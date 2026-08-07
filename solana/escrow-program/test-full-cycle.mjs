import anchor from '@coral-xyz/anchor';
import { Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { createMint, createAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAccount } from '@solana/spl-token';
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

// Check if vault exists
const vaultInfo = await provider.connection.getAccountInfo(vaultPDA);
console.log('Vault account info:', vaultInfo ? 'exists' : 'null');

// Check if escrow exists
const escrowInfo = await provider.connection.getAccountInfo(escrowPDA);
console.log('Escrow account info:', escrowInfo ? 'exists' : 'null');

// Fetch escrow account
const escrowAccount = await program.account.escrow.fetch(escrowPDA);
console.log('\nEscrow account:');
console.log('  buyer:', escrowAccount.buyer.toString());
console.log('  seller:', escrowAccount.seller.toString());
console.log('  amount:', escrowAccount.amount.toString());
console.log('  is_sol:', escrowAccount.isSol);
console.log('  status:', escrowAccount.status);
console.log('  token_mint:', escrowAccount.tokenMint);
console.log('  expires_at:', escrowAccount.expiresAt);

// Check vault balance
const vaultBalance = await provider.connection.getBalance(vaultPDA);
console.log('\nVault balance:', vaultBalance);

// Check seller balance
const sellerBalance = await provider.connection.getBalance(seller.publicKey);
console.log('Seller balance:', sellerBalance);

console.log('\n✅ Initialize worked! Now test approve_delivery...');

// Test approve_delivery
try {
  const tx = await program.methods
    .approveDelivery()
    .accounts({
      buyer: buyer.publicKey,
      escrow: escrowPDA,
    })
    .signers([buyer])
    .rpc();
  console.log('Approve delivery tx:', tx);
  
  // Fetch updated escrow
  const escrowAfter = await program.account.escrow.fetch(escrowPDA);
  console.log('Escrow status after approve:', escrowAfter.status);
} catch (e) {
  console.error('Approve error:', e);
  if (e.transactionLogs) {
    console.log('Transaction logs:', e.transactionLogs);
  }
}

console.log('\n✅ Approve worked! Now test release_funds...');

// Test release_funds
try {
  const tx = await program.methods
    .releaseFunds()
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
      sellerTokenAccount: null,
    })
    .signers([buyer])
    .rpc();
  console.log('Release funds tx:', tx);
  
  // Fetch updated escrow
  const escrowAfter = await program.account.escrow.fetch(escrowPDA);
  console.log('Escrow status after release:', escrowAfter.status);
  
  // Check balances
  const sellerBalAfter = await provider.connection.getBalance(seller.publicKey);
  console.log('Seller balance after:', sellerBalAfter);
  const vaultBalAfter = await provider.connection.getBalance(vaultPDA);
  console.log('Vault balance after:', vaultBalAfter);
} catch (e) {
  console.error('Release error:', e);
  if (e.transactionLogs) {
    console.log('Transaction logs:', e.transactionLogs);
  }
}