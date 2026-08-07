/**
 * Standalone TypeScript script for initializing escrow
 * Called from Python create_escrow skill
 * 
 * Usage: npx ts-node --esm init-escrow-standalone.ts <params_json>
 * 
 * Params JSON structure:
 * {
 *   "buyerPublicKey": "base58 public key",
 *   "buyerSecretKey": [32 or 64 byte array],
 *   "sellerPublicKey": "base58 public key",
 *   "amount": 1000000000,
 *   "agreementHash": [32 byte array],
 *   "expiresAt": 1234567890,
 *   "isSol": true,
 *   "tokenMint": "base58 mint address or null",
 *   "cluster": "devnet",
 *   "rpcUrl": "optional custom RPC URL",
 *   "computeBudget": { "units": 200000, "price": 1000 }
 * }
 */

import { Keypair, PublicKey } from '@solana/web3.js';
import { createEscrowClient, deriveAssociatedTokenAccount } from './dist/index.js';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  // Read params from stdin or file
  const args = process.argv.slice(2);
  let params: any = {};
  
  if (args.length > 0) {
    // Read from file
    try {
      const content = fs.readFileSync(args[0], 'utf-8');
      params = JSON.parse(content);
    } catch (error) {
      console.error('ERROR:' + JSON.stringify({
        message: `Failed to read params file: ${error}`,
        code: 'PARAMS_READ_ERROR',
      }));
      process.exit(1);
    }
  } else {
    // Read from stdin
    let stdinData = '';
    for await (const chunk of process.stdin) {
      stdinData += chunk;
    }
    try {
      params = JSON.parse(stdinData);
    } catch (error) {
      console.error('ERROR:' + JSON.stringify({
        message: `Failed to parse stdin JSON: ${error}`,
        code: 'PARAMS_PARSE_ERROR',
      }));
      process.exit(1);
    }
  }
  
  try {
    // Validate required params
    const required = ['buyerPublicKey', 'buyerSecretKey', 'sellerPublicKey', 'amount', 'agreementHash', 'expiresAt', 'isSol', 'cluster'];
    for (const field of required) {
      if (!(field in params)) {
        console.error('ERROR:' + JSON.stringify({
          message: `Missing required param: ${field}`,
          code: 'MISSING_PARAM',
        }));
        process.exit(1);
      }
    }
    
    // Create buyer keypair
    const buyer = Keypair.fromSecretKey(Uint8Array.from(params.buyerSecretKey));
    
    // Verify public key matches
    if (buyer.publicKey.toBase58() !== params.buyerPublicKey) {
      console.error('ERROR:' + JSON.stringify({
        message: 'Buyer secret key does not match provided public key',
        code: 'KEYPAIR_MISMATCH',
      }));
      process.exit(1);
    }
    
    const seller = new PublicKey(params.sellerPublicKey);
    
    // Create client
    const clientConfig: any = {
      wallet: buyer,
      cluster: params.cluster,
    };
    
    if (params.rpcUrl) {
      clientConfig.rpcUrl = params.rpcUrl;
    }
    
    const client = createEscrowClient(clientConfig);
    
    // Prepare initialization params
    const agreementHash = Uint8Array.from(params.agreementHash);
    const expiresAt = params.expiresAt > 0 ? BigInt(params.expiresAt) : null;
    const isSol = params.isSol;
    
    let tokenMint: PublicKey | null = null;
    let buyerTokenAccount: PublicKey | null = null;
    
    if (!isSol) {
      if (!params.tokenMint) {
        console.error('ERROR:' + JSON.stringify({
          message: 'tokenMint is required for SPL token escrows',
          code: 'MISSING_TOKEN_MINT',
        }));
        process.exit(1);
      }
      tokenMint = new PublicKey(params.tokenMint);
      buyerTokenAccount = deriveAssociatedTokenAccount(buyer.publicKey, tokenMint);
    }
    
    // Initialize escrow
    const result = await client.initializeEscrow(
      buyer,
      seller,
      {
        amount: BigInt(params.amount),
        agreementHash,
        expiresAt,
        tokenMint,
        buyerTokenAccount,
      },
      params.computeBudget || {}
    );
    
    // Success output
    console.log('SUCCESS:' + JSON.stringify({
      signature: result.signature,
      escrowAddress: result.escrowAddress.toBase58(),
      vaultAddress: result.vaultAddress.toBase58(),
      tokenVaultAddress: result.tokenVaultAddress ? result.tokenVaultAddress.toBase58() : null,
      slot: result.slot,
      confirmations: result.confirmations,
      err: result.err,
    }));
    
  } catch (error: unknown) {
    const err = error as Error;
    console.error('ERROR:' + JSON.stringify({
      message: err.message,
      code: (err as any).code || 'UNKNOWN_ERROR',
      stack: err.stack,
    }));
    process.exit(1);
  }
}

main();