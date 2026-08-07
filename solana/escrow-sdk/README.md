# Solana Escrow SDK

A production-ready TypeScript SDK for interacting with the Solana Escrow program deployed on Devnet.

## Features

- **TypeScript-first**: Full type safety with generated types from Anchor IDL
- **Devnet Ready**: Pre-configured for the deployed program (`8u17EnuW66yfRybQY6vGjeTnASeDyxyT6QesPetRtJxk`)
- **Automatic PDA Derivation**: All PDAs (escrow, vault, token vault) derived automatically
- **SOL & SPL Token Support**: Handles both native SOL and SPL token escrows
- **Input Validation**: Comprehensive validation with clear error messages
- **Transaction Confirmation**: Built-in confirmation with retry logic
- **Error Handling**: Typed errors with program error code mapping
- **Modular Architecture**: Organized into reusable modules

## Installation

```bash
cd solana/escrow-sdk
npm install
npm run build
```

## Quick Start

```typescript
import { 
  createEscrowClient, 
  generateAgreementHash, 
  createExpiration,
  LAMPORTS_PER_SOL 
} from '@finality/escrow-sdk';
import { Keypair, PublicKey } from '@solana/web3.js';

// Create client with buyer's keypair
const buyer = Keypair.fromSecretKey(Uint8Array.from([...])); // Your secret key
const seller = new PublicKey('SellerPublicKeyHere');

const client = createEscrowClient({
  wallet: buyer,
  cluster: 'devnet',
});

// Initialize SOL escrow
const result = await client.initializeEscrow(
  buyer,
  seller,
  {
    amount: BigInt(0.5 * LAMPORTS_PER_SOL), // 0.5 SOL
    agreementHash: generateAgreementHash(),
    expiresAt: createExpiration(7 * 24 * 60 * 60), // 7 days
    tokenMint: null, // null for SOL
  }
);

console.log('Escrow created:', result.escrowAddress.toBase58());
```

## SDK Structure

```
src/
├── index.ts           # Main entry point - exports everything
├── client.ts          # EscrowClient class - main interface
├── constants.ts       # Program ID, seeds, cluster URLs, etc.
├── pda.ts             # PDA derivation utilities
├── types.ts           # TypeScript types and error classes
└── utils.ts           # Validation, formatting, helpers
```

## Core Methods

### `initializeEscrow(buyer, seller, params)`
Creates a new escrow account with funds deposited.

```typescript
// SOL escrow
await client.initializeEscrow(buyer, seller, {
  amount: BigInt(1_000_000_000), // 1 SOL in lamports
  agreementHash: generateAgreementHash(),
  expiresAt: createExpiration(7 * 24 * 60 * 60),
  tokenMint: null,
});

// SPL Token escrow
await client.initializeEscrow(buyer, seller, {
  amount: BigInt(100 * 10**6), // 100 USDC (6 decimals)
  agreementHash: generateAgreementHash(),
  expiresAt: createExpiration(7 * 24 * 60 * 60),
  tokenMint: USDC_MINT,
  buyerTokenAccount: buyerUSDCAccount,
});
```

### `approveDelivery(buyer, escrowAddress)`
Buyer approves delivery, moving escrow to `Approved` state.

```typescript
await client.approveDelivery(buyer, escrowAddress);
```

### `releaseFunds(buyer, escrowAddress, seller, params?)`
Buyer releases funds to seller (requires `Approved` state).

```typescript
// SOL escrow
await client.releaseFunds(buyer, escrowAddress, seller);

// SPL Token escrow
await client.releaseFunds(buyer, escrowAddress, seller, {
  sellerTokenAccount: sellerUSDCAccount,
});
```

### `cancelEscrow(buyer, escrowAddress, seller, params?)`
Buyer cancels escrow and retrieves funds (only in `Pending` state, before expiration).

```typescript
// SOL escrow
await client.cancelEscrow(buyer, escrowAddress, seller);

// SPL Token escrow
await client.cancelEscrow(buyer, escrowAddress, seller, {
  buyerTokenAccount: buyerUSDCAccount,
});
```

### `fetchEscrow(escrowAddress)`
Fetches escrow account data.

```typescript
const { escrow, address } = await client.fetchEscrow(escrowAddress);
if (escrow) {
  console.log('Status:', escrow.status);
  console.log('Amount:', escrow.amount);
  console.log('Is SOL:', escrow.isSol);
}
```

## Examples

Run the examples with ts-node:

```bash
# SOL escrow examples
npm run example:init      # Initialize SOL escrow
npm run example:approve   # Approve delivery
npm run example:release   # Release funds
npm run example:cancel    # Cancel escrow
npm run example:fetch     # Fetch escrow details
npm run example:full      # Full SOL lifecycle

# SPL Token escrow examples
npx ts-node examples/initialize-escrow-spl.ts
npx ts-node examples/full-cycle-spl.ts
```

## Configuration

```typescript
const client = createEscrowClient({
  programId: new PublicKey('...'),     // Custom program ID (optional)
  cluster: 'devnet',                   // 'mainnet' | 'devnet' | 'testnet' | 'localnet'
  rpcUrl: 'https://custom.rpc.url',    // Custom RPC URL (optional)
  commitment: 'confirmed',             // 'processed' | 'confirmed' | 'finalized'
  wallet: keypair,                     // Keypair for signing (optional for read-only)
});
```

## Error Handling

```typescript
import { 
  EscrowProgramError, 
  ValidationError, 
  TransactionError,
  PROGRAM_ERROR_CODES 
} from '@finality/escrow-sdk';

try {
  await client.initializeEscrow(...);
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Invalid input:', error.message);
  } else if (error instanceof EscrowProgramError) {
    console.error('Program error:', error.message, 'Code:', error.programErrorCode);
    // Check specific error codes
    if (error.programErrorCode === PROGRAM_ERROR_CODES.INSUFFICIENT_BALANCE) {
      // Handle insufficient balance
    }
  } else if (error instanceof TransactionError) {
    console.error('Transaction failed:', error.signature);
  }
}
```

## PDA Derivation

```typescript
import { deriveEscrowPDAs, deriveEscrowAddress, deriveVaultAddress } from '@finality/escrow-sdk';

const { escrow, vault, tokenVault, escrowBump, vaultBump, tokenVaultBump } = 
  await deriveEscrowPDAs(buyerPublicKey);

// Or derive individually
const [escrow, escrowBump] = deriveEscrowAddress(buyerPublicKey);
const [vault, vaultBump] = deriveVaultAddress(escrow);
const [tokenVault, tokenVaultBump] = deriveTokenVaultAddress(escrow);
```

## Utility Functions

```typescript
import { 
  solToLamports, 
  lamportsToSol, 
  formatAmount, 
  formatPubkey,
  generateAgreementHash,
  createAgreementHashFromTerms,
  createExpiration,
  isExpired,
  getTimeRemaining,
  getEscrowStatusName,
  canApprove,
  canRelease,
  canCancel,
} from '@finality/escrow-sdk';
```

## Program Details

- **Program ID**: `8u17EnuW66yfRybQY6vGjeTnASeDyxyT6QesPetRtJxk`
- **Upgrade Authority**: `HNDAhSqXTA6woJLRRQpaMsWX171XVsjgxBXRxz95xfSB`
- **Cluster**: Devnet
- **Anchor Version**: 0.29.0

## License

MIT