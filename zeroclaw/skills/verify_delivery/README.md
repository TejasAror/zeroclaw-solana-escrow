# Verify Delivery Skill

## Overview

The `verify_delivery` skill verifies that delivery has been completed according to the agreed terms in a Finality escrow agreement. It validates delivery evidence, checks settlement conditions, requests explicit buyer approval, and calls the `approveDelivery` instruction on the Solana escrow program.

## Features

- **Loads active escrow** from ZeroClaw memory using negotiation ID
- **Validates delivery evidence** against agreed delivery requirements:
  - Method match (digital/physical/api)
  - Verification method match (automatic/manual/zk_proof)
  - Deadline compliance
  - Proof validity (proof_hash for automatic/zk_proof, verifier_info for manual)
- **Checks settlement conditions** from agreement:
  - Buyer confirmation requirement
  - Preimage reveal requirement
- **Requests explicit buyer approval** (human-in-the-loop)
- **Calls approveDelivery()** on Devnet via TypeScript Escrow SDK
- **Updates ZeroClaw memory** with new escrow status, transaction signature, and metadata
- **Robust error handling** with retry logic for RPC failures
- **Audit trail** with verification records in settlements memory

## Input Schema

See `schemas/input.json` for the complete schema. Required fields:
- `negotiation_id`: Unique negotiation session ID
- `delivery_evidence`: Object with method, verification, submitted_at, details, and optional proof_hash/verifier_info
- `buyer_confirmation`: Optional explicit buyer approval (required if agreement requires it)
- `force_verification`: Optional boolean to force verification even if escrow not in Pending state
- `buyer_keypair_path`: Optional path to buyer keypair file (defaults to value in escrow memory)

## Output Schema

See `schemas/output.json` for the complete schema. Key fields:
- `status`: success/failed/validation_error/buyer_rejected/evidence_mismatch/escrow_not_found/escrow_expired/unauthorized/already_approved
- `escrow_status`: Current escrow status after verification
- `verification_result`: Detailed checks (delivery_verified, conditions_met, buyer_approved, evidence_checks)
- `transaction`: Transaction details if approveDelivery was called (signature, slot, fee, explorer_url)
- `escrow_details`: Updated escrow account details

## Usage

```bash
python3 verify_delivery.py <input_json_file>
```

## Test Inputs

- `test_input.json`: Standard verification with all checks passing
- `test_input_wrong_method.json`: Evidence mismatch test
- `test_input_no_buyer_confirmation.json`: Missing buyer confirmation test
- `test_input_already_approved.json`: Already approved escrow test
- `test_input_force.json`: Force verification test

## Memory

- **Escrows**: `/mnt/c/Users/Tejas/finality/zeroclaw/memory/escrows/{negotiation_id}.json`
- **Negotiations**: `/mnt/c/Users/Tejas/finality/zeroclaw/memory/negotiations/{negotiation_id}.json`
- **Verifications**: `/mnt/c/Users/Tejas/finality/zeroclaw/memory/settlements/verification_{negotiation_id}_{timestamp}.json`

## Integration

This skill sits between `create_escrow` and `settle_escrow` in the ZeroClaw workflow:

```
negotiate_contract → create_escrow → verify_delivery → settle_escrow
```

The skill requires:
1. An escrow created by `create_escrow` (stored in escrows memory)
2. A negotiated agreement from `negotiate_contract` (stored in negotiations memory)
3. Valid delivery evidence from the seller
4. Explicit buyer approval (if required by agreement)

After successful verification, the escrow status changes to "Approved", enabling the `settle_escrow` skill to release funds.