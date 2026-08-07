/**
 * Standalone JavaScript script for initializing escrow
 * Called from Python create_escrow skill
 * 
 * Usage: node init-escrow-standalone.js <params_json>
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

const { Keypair, PublicKey } = require('@solana/web3.js');
const { createEscrowClient, deriveAssociatedTokenAccount } = require('./dist/index.js');
const fs = require('fs');

async function main() {
  // Read params from file
  const args = process.argv.slice(2);
  let params = {};
  
  if (args.length > 0) {
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
    console.error('ERROR:' + JSON.stringify({
      message: 'No params file provided',
      code: 'MISSING_PARAMS_FILE',
    }));
    process.exit(1);
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
    const clientConfig = {
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
    
    let initParams = {
      amount: BigInt(params.amount),
      agreementHash,
      expiresAt,
    };
    
    if (!isSol) {
      if (!params.tokenMint) {
        console.error('ERROR:' + JSON.stringify({
          message: 'tokenMint is required for SPL token escrows',
          code: 'MISSING_TOKEN_MINT',
        }));
        process.exit(1);
      }
      initParams.tokenMint = new PublicKey(params.tokenMint);
      initParams.buyerTokenAccount = deriveAssociatedTokenAccount(buyer.publicKey, initParams.tokenMint);
    }
    // For SOL escrows, don't include tokenMint or buyerTokenAccount at all
    
    // Initialize escrow
    const result = await client.initializeEscrow(
      buyer,
      seller,
      initParams,
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
    
  } catch (error) {
    console.error('ERROR:' + JSON.stringify({
      message: error.message,
      code: error.code || 'UNKNOWN_ERROR',
      stack: error.stack,
    }));
    process.exit(1);
  }
}

main();