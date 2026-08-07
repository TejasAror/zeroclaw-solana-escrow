import anchor from '@coral-xyz/anchor';
import { Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { createMint, createAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import fs from 'fs';

const connection = new Connection('http://localhost:8899', 'confirmed');
const secretKey = JSON.parse(fs.readFileSync('/home/ejas/.config/solana/id.json', 'utf8'));
const wallet = anchor.web3.Keypair.fromSecretKey(new Uint8Array(secretKey));
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), { commitment: 'confirmed' });
anchor.setProvider(provider);

const program = anchor.workspace.escrowProgram;

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

const [escrowPDA, escrowBump] = getEscrowPDA(buyer.publicKey);
const [vaultPDA, vaultBump] = getVaultPDA(escrowPDA);

console.log('Buyer:', buyer.publicKey.toString());
console.log('Seller:', seller.publicKey.toString());
console.log('Escrow PDA:', escrowPDA.toString(), 'bump:', escrowBump);
console.log('Vault PDA:', vaultPDA.toString(), 'bump:', vaultBump);

// Airdrop to buyer
const airdropSig = await provider.connection.requestAirdrop(buyer.publicKey, 10 * LAMPORTS_PER_SOL);
await provider.connection.confirmTransaction(airdropSig, 'confirmed');
console.log('Airdropped to buyer');

const buyerBalBefore = await provider.connection.getBalance(buyer.publicKey);
console.log('Buyer balance before:', buyerBalBefore);

// Check if vault exists
const vaultInfo = await provider.connection.getAccountInfo(vaultPDA);
console.log('Vault account info:', vaultInfo);

// Check if escrow exists
const escrowInfo = await provider.connection.getAccountInfo(escrowPDA);
console.log('Escrow account info:', escrowInfo);

// Try to create vault manually first
console.log('\n--- Trying to create vault PDA manually ---');
const vaultCreateTx = new Transaction().add(
  SystemProgram.createAccount({
    fromPubkey: buyer.publicKey,
    newAccountPubkey: vaultPDA,
    lamports: await provider.connection.getMinimumBalanceForRentExemption(0),
    space: 0,
    programId: SystemProgram.programId,
  })
);
try {
  const vaultCreateSig = await sendAndConfirmTransaction(provider.connection, vaultCreateTx, [buyer]);
  console.log('Vault created:', vaultCreateSig);
} catch (e) {
  console.error('Vault create failed:', e.message);
}

// Now try to send SOL to vault
console.log('\n--- Trying to send SOL to vault ---');
const transferTx = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: buyer.publicKey,
    toPubkey: vaultPDA,
    lamports: amount.toNumber(),
  })
);
try {
  const transferSig = await sendAndConfirmTransaction(provider.connection, transferTx, [buyer]);
  console.log('Transfer to vault worked:', transferSig);
} catch (e) {
  console.error('Transfer to vault failed:', e.message);
}

// Check vault balance after
const vaultBalAfter = await provider.connection.getBalance(vaultPDA);
console.log('Vault balance after transfer:', vaultBalAfter);