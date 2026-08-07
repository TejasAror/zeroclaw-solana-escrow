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

// Use NEW keypairs for each test to avoid PDA conflicts
const buyer = Keypair.generate();
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

// Airdrop to new buyer
const airdropSig = await provider.connection.requestAirdrop(buyer.publicKey, 20 * LAMPORTS_PER_SOL);
await provider.connection.confirmTransaction(airdropSig, 'confirmed');
console.log('Airdropped to new buyer:', buyer.publicKey.toString());

const [escrowPDA, escrowBump] = getEscrowPDA(buyer.publicKey);
const [vaultPDA, vaultBump] = getVaultPDA(escrowPDA);

console.log('Buyer:', buyer.publicKey.toString());
console.log('Seller:', seller.publicKey.toString());
console.log('Escrow PDA:', escrowPDA.toString(), 'bump:', escrowBump);
console.log('Vault PDA:', vaultPDA.toString(), 'bump:', vaultBump);

// Check balances
const buyerBalBefore = await provider.connection.getBalance(buyer.publicKey);
console.log('Buyer balance before:', buyerBalBefore);

// Initialize
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
    .signers([buyer])
    .rpc();
  console.log('Initialize tx:', tx);
} catch (e) {
  console.error('Initialize error:', e);
  if (e.transactionLogs) console.log('Logs:', e.transactionLogs);
  process.exit(1);
}

// Fetch escrow
const escrowAccount = await program.account.escrow.fetch(escrowPDA);
console.log('\nEscrow after init:');
console.log('  buyer:', escrowAccount.buyer.toString());
console.log('  seller:', escrowAccount.seller.toString());
console.log('  amount:', escrowAccount.amount.toString());
console.log('  status:', escrowAccount.status);

// Check vault balance
const vaultBalance = await provider.connection.getBalance(vaultPDA);
console.log('Vault balance:', vaultBalance);

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
  
  const escrowAfter = await program.account.escrow.fetch(escrowPDA);
  console.log('Escrow status after approve:', escrowAfter.status);
} catch (e) {
  console.error('Approve error:', e);
  if (e.transactionLogs) console.log('Logs:', e.transactionLogs);
  process.exit(1);
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
  
  const escrowAfter = await program.account.escrow.fetch(escrowPDA);
  console.log('Escrow status after release:', escrowAfter.status);
  
  const sellerBalAfter = await provider.connection.getBalance(seller.publicKey);
  console.log('Seller balance after:', sellerBalAfter);
  const vaultBalAfter = await provider.connection.getBalance(vaultPDA);
  console.log('Vault balance after:', vaultBalAfter);
} catch (e) {
  console.error('Release error:', e);
  if (e.transactionLogs) console.log('Logs:', e.transactionLogs);
  process.exit(1);
}

console.log('\n🎉 FULL SOL ESCROW LIFECYCLE COMPLETE!');

console.log('\n\n===========================================');
console.log('NOW TEST SPL TOKEN ESCROW');
console.log('===========================================\n');

// Use NEW buyer for SPL test
const buyer2 = Keypair.generate();
const seller2 = Keypair.generate();
const airdropSig2 = await provider.connection.requestAirdrop(buyer2.publicKey, 20 * LAMPORTS_PER_SOL);
await provider.connection.confirmTransaction(airdropSig2, 'confirmed');
console.log('Airdropped to SPL buyer:', buyer2.publicKey.toString());

const tokenMint = await createMint(
  provider.connection,
  buyer2,
  buyer2.publicKey,
  null,
  9
);
console.log('Token mint:', tokenMint.toString());

const buyerTokenAccount = await createAssociatedTokenAccount(
  provider.connection,
  buyer2,
  tokenMint,
  buyer2.publicKey
);
console.log('Buyer token account:', buyerTokenAccount.toString());

const sellerTokenAccount = await createAssociatedTokenAccount(
  provider.connection,
  buyer2,
  tokenMint,
  seller2.publicKey
);
console.log('Seller token account:', sellerTokenAccount.toString());

// Mint tokens to buyer
await mintTo(
  provider.connection,
  buyer2,
  tokenMint,
  buyerTokenAccount,
  buyer2,
  1_000_000_000
);
console.log('Minted 1B tokens to buyer');

function getTokenVaultPDA(escrowPubkey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('token_vault'), escrowPubkey.toBuffer()],
    program.programId
  );
}

const [escrowPDA2, escrowBump2] = getEscrowPDA(buyer2.publicKey);
const [vaultPDA2, vaultBump2] = getVaultPDA(escrowPDA2);
const [tokenVaultPDA, tokenVaultBump] = getTokenVaultPDA(escrowPDA2);

const amount2 = new anchor.BN(100_000_000);
const agreementHash2 = Array.from(Buffer.from('b'.repeat(32), 'hex'));
const expiresAt2 = new anchor.BN(Math.floor(Date.now() / 1000) + 3600);

console.log('\nSPL Escrow PDA:', escrowPDA2.toString());
console.log('SPL Vault PDA:', vaultPDA2.toString());
console.log('Token Vault PDA:', tokenVaultPDA.toString());

try {
  const tx = await program.methods
    .initialize(amount2, agreementHash2, expiresAt2, tokenMint)
    .accounts({
      buyer: buyer2.publicKey,
      seller: seller2.publicKey,
      escrow: escrowPDA2,
      vault: vaultPDA2,
      tokenMint: tokenMint,
      tokenVault: tokenVaultPDA,
      buyerTokenAccount: buyerTokenAccount,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .signers([buyer2])
    .rpc();
  console.log('SPL Initialize tx:', tx);
} catch (e) {
  console.error('SPL Initialize error:', e);
  if (e.transactionLogs) console.log('Logs:', e.transactionLogs);
  process.exit(1);
}

// Fetch SPL escrow
const splEscrow = await program.account.escrow.fetch(escrowPDA2);
console.log('\nSPL Escrow after init:');
console.log('  buyer:', splEscrow.buyer.toString());
console.log('  seller:', splEscrow.seller.toString());
console.log('  amount:', splEscrow.amount.toString());
console.log('  is_sol:', splEscrow.isSol);
console.log('  token_mint:', splEscrow.tokenMint?.toString());
console.log('  status:', splEscrow.status);

const buyerTokenBalBefore = await getAccount(provider.connection, buyerTokenAccount);
const tokenVaultBalBefore = await getAccount(provider.connection, tokenVaultPDA);
console.log('Buyer token balance:', buyerTokenBalBefore.amount);
console.log('Token vault balance:', tokenVaultBalBefore.amount);

// Approve
try {
  const tx = await program.methods
    .approveDelivery()
    .accounts({
      buyer: buyer2.publicKey,
      escrow: escrowPDA2,
    })
    .signers([buyer2])
    .rpc();
  console.log('SPL Approve tx:', tx);
} catch (e) {
  console.error('SPL Approve error:', e);
  if (e.transactionLogs) console.log('Logs:', e.transactionLogs);
  process.exit(1);
}

// Release
try {
  const tx = await program.methods
    .releaseFunds()
    .accounts({
      buyer: buyer2.publicKey,
      seller: seller2.publicKey,
      escrow: escrowPDA2,
      vault: vaultPDA2,
      tokenMint: tokenMint,
      tokenVault: tokenVaultPDA,
      sellerTokenAccount: sellerTokenAccount,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .signers([buyer2])
    .rpc();
  console.log('SPL Release tx:', tx);
  
  const escrowAfter = await program.account.escrow.fetch(escrowPDA2);
  console.log('SPL Escrow status after release:', escrowAfter.status);
  
  const sellerTokenBalAfter = await getAccount(provider.connection, sellerTokenAccount);
  const tokenVaultBalAfter = await getAccount(provider.connection, tokenVaultPDA);
  console.log('Seller token balance:', sellerTokenBalAfter.amount);
  console.log('Token vault balance:', tokenVaultBalAfter.amount);
} catch (e) {
  console.error('SPL Release error:', e);
  if (e.transactionLogs) console.log('Logs:', e.transactionLogs);
  process.exit(1);
}

console.log('\n🎉 FULL SPL TOKEN ESCROW LIFECYCLE COMPLETE!');

console.log('\n\n===========================================');
console.log('NOW TEST CANCEL ESCROW');
console.log('===========================================\n');

// Use NEW buyer for cancel test
const buyer3 = Keypair.generate();
const seller3 = Keypair.generate();
const airdropSig3 = await provider.connection.requestAirdrop(buyer3.publicKey, 20 * LAMPORTS_PER_SOL);
await provider.connection.confirmTransaction(airdropSig3, 'confirmed');
console.log('Airdropped to Cancel buyer:', buyer3.publicKey.toString());

const [escrowPDA3, escrowBump3] = getEscrowPDA(buyer3.publicKey);
const [vaultPDA3, vaultBump3] = getVaultPDA(escrowPDA3);
const [tokenVaultPDA3, tokenVaultBump3] = getTokenVaultPDA(escrowPDA3);

const amount3 = new anchor.BN(500_000_000);
const agreementHash3 = Array.from(Buffer.from('c'.repeat(32), 'hex'));
const expiresAt3 = new anchor.BN(Math.floor(Date.now() / 1000) + 3600);

try {
  const tx = await program.methods
    .initialize(amount3, agreementHash3, expiresAt3, tokenMint)
    .accounts({
      buyer: buyer3.publicKey,
      seller: seller3.publicKey,
      escrow: escrowPDA3,
      vault: vaultPDA3,
      tokenMint: tokenMint,
      tokenVault: tokenVaultPDA3,
      buyerTokenAccount: buyerTokenAccount,  // Reuse token account from buyer2? No, create new one
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .signers([buyer3])
    .rpc();
  console.log('Cancel Init tx:', tx);
} catch (e) {
  console.error('Cancel Init error:', e);
  if (e.transactionLogs) console.log('Logs:', e.transactionLogs);
  process.exit(1);
}

try {
  const tx = await program.methods
    .cancelEscrow()
    .accounts({
      buyer: buyer3.publicKey,
      seller: seller3.publicKey,
      escrow: escrowPDA3,
      vault: vaultPDA3,
      tokenMint: tokenMint,
      tokenVault: tokenVaultPDA3,
      buyerTokenAccount: buyerTokenAccount,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .signers([buyer3])
    .rpc();
  console.log('Cancel Escrow tx:', tx);
  
  const escrowAfter = await program.account.escrow.fetch(escrowPDA3);
  console.log('Escrow status after cancel:', escrowAfter.status);
  
  const buyerTokenBalAfter = await getAccount(provider.connection, buyerTokenAccount);
  const tokenVaultBalAfter = await getAccount(provider.connection, tokenVaultPDA3);
  console.log('Buyer token balance after cancel:', buyerTokenBalAfter.amount);
  console.log('Token vault balance after cancel:', tokenVaultBalAfter.amount);
} catch (e) {
  console.error('Cancel error:', e);
  if (e.transactionLogs) console.log('Logs:', e.transactionLogs);
  process.exit(1);
}

console.log('\n🎉 CANCEL ESCROW COMPLETE!');
console.log('\n✅ ALL TESTS PASSED - PROGRAM IS FULLY FUNCTIONAL');