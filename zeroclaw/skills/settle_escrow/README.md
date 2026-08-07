# ZeroClaw Settle Escrow Skill

This skill implements the settlement logic for ZeroClaw escrows. It inspects escrow state and executes the appropriate on-chain action (releaseFunds or cancelEscrow) using the Escrow SDK.

## Overview

The `settle_escrow` skill:
1. Loads escrow data from ZeroClaw memory
2. Inspects current on-chain status
3. Decides whether to release funds, cancel escrow, or wait
4. Executes the settlement via the Escrow SDK with retry logic
5. Records transaction signatures, final status, timestamps, and metadata in memory
6. Prevents duplicate settlement through state validation

## Installation

The skill is part of the ZeroClaw skills collection. No additional installation required beyond the existing ZeroClaw dependencies.

## Usage

### Input Schema

```json
{
  "escrow_id": "negotiation_abc123",
  "buyer_keypair_path": "/path/to/buyer-keypair.json",
  "force_action": "release"
}
```

### Output Schema

```json
{
  "success": true,
  "action": "release",
  "message": "Escrow released successfully",
  "settlement_status": "released",
  "transaction_signature": "5K...signature...",
  "settlement_timestamp": 1699123456,
  "settlement_timestamp_iso": "2023-11-05T12:34:56.789Z",
  "settlement_id": "settlement_negotiation_abc123_1699123456_a1b2c3d4",
  "slot": 123456789,
  "confirmations": 32,
  "on_chain_status_before": "Approved",
  "decision": {
    "action": "release",
    "reason": "Delivery approved, releasing funds to seller",
    "can_proceed": true,
    "current_status": "Approved",
    "is_expired": false
  }
}
```

## Decision Logic

| On-Chain Status | Expired? | Action | Description |
|----------------|----------|--------|-------------|
| Approved | No | `release` | Release funds to seller |
| Pending | Yes | `cancel` | Cancel escrow (refunds buyer, emits EscrowExpired) |
| Pending | No | `wait` | Delivery not yet approved |
| Released | - | `none` | Already settled |
| Cancelled | - | `none` | Already settled |
| Expired | - | `none` | Already settled |

## Duplicate Prevention

The skill checks local memory for `settlement_status` before executing. If already `released`, `cancelled`, or `expired`, it returns `duplicate_prevented: true` without executing on-chain.

## Retry Logic

- Max 3 retries for transient RPC/network errors
- Exponential backoff: 2s, 4s, 8s
- Retryable errors: connection resets, timeouts, rate limits, 5xx errors
- Non-retryable errors: validation errors, program errors (InvalidState, Unauthorized, etc.)

## Memory Structure

Settlements are stored in: `zeroclaw/memory/settlements/{settlement_id}.json`

Escrows are stored in: `zeroclaw/memory/escrows/{escrow_id}.json` (or negotiations directory)

## Integration Notes

### With create_escrow Skill
The `create_escrow` skill should save escrow data to `zeroclaw/memory/escrows/` with the same `escrow_id` (negotiation_id). This skill reads from that location.

### With verify_delivery Skill
The `verify_delivery` skill should call the `approveDelivery` instruction on-chain, which changes the escrow status to `Approved`. This skill then detects the `Approved` status and executes `releaseFunds`.

### With negotiate_contract Skill
The `negotiate_contract` skill creates the agreement and saves it to `zeroclaw/memory/negotiations/`. The escrow creation uses this negotiation_id as the escrow_id.

## Running the Skill

```bash
cd /mnt/c/Users/Tejas/finality/zeroclaw/skills/settle_escrow
python3 settle_escrow.py input.json
```

### Example Input

```json
{
  "escrow_id": "negotiation_abc123def456",
  "buyer_keypair_path": "/home/user/keys/buyer.json"
}
```

### Force Action (Use with Caution)

```json
{
  "escrow_id": "negotiation_abc123def456",
  "buyer_keypair_path": "/home/user/keys/buyer.json",
  "force_action": "cancel"
}
```

## Files Changed

This skill creates the following files:

1. `settle_escrow.py` - Main implementation
2. `schemas/input.json` - Input validation schema
3. `schemas/output.json` - Output validation schema
4. `prompts/system.md` - System prompt for LLM-based operation
5. `README.md` - This file

## Dependencies

- Python 3.8+
- Node.js with TypeScript (for executing SDK scripts)
- `@solana/web3.js`
- `@coral-xyz/anchor`
- ZeroClaw Escrow SDK (local at `/mnt/c/Users/Tejas/finality/solana/escrow-sdk`)

## Error Handling

All errors are returned in the output JSON with:
- `success: false`
- `error`: Human-readable error message
- `error_status`: Machine-readable error code

Common error statuses:
- `not_found`: Escrow not in memory
- `missing_keypair`: Buyer keypair not provided
- `invalid_action`: Invalid force_action value
- `execution_error`: Script execution failed
- `parse_error`: Could not parse transaction result
- `max_retries_exceeded`: All retry attempts failed