import anchor from '@coral-xyz/anchor';
import { Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, PublicKey } from '@solana/web3.js';
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

const [escrowPDA] = getEscrowPDA(buyer.publicKey);
const [vaultPDA] = getVaultPDA(escrowPDA);

console.log('Buyer:', buyer.publicKey.toString());
console.log('Escrow PDA:', escrowPDA.toString());
console.log('Vault PDA:', vaultPDA.toString());

// Airdrop to buyer
const airdropSig = await provider.connection.requestAirdrop(buyer.publicKey, 10 * LAMPORTS_PER_SOL);
await provider.connection.confirmTransaction(airdropSig, 'confirmed');
console.log('Airdropped to buyer');

const buyerBalBefore = await provider.connection.getBalance(buyer.publicKey);
console.log('Buyer balance before:', buyerBalBefore);

// Try initialize
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
  console.error('Error:', e);
}