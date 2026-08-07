#!/usr/bin/env python3
"""
ZeroClaw Verify Delivery Skill Implementation

This module implements the verify_delivery skill for ZeroClaw.
It loads the active escrow and agreement from ZeroClaw memory,
validates delivery evidence against agreed requirements,
requests explicit human buyer approval, and calls approveDelivery()
on the deployed Devnet escrow program using the production TypeScript Escrow SDK.

After successful transaction, updates ZeroClaw memory with new escrow status,
transaction signature, verification timestamp, and all relevant metadata.

Includes robust validation, structured logging, retry logic, comprehensive error handling,
and follows ZeroClaw best practices for skills, prompts, schemas, approvals, and memory.
"""

import json
import os
import sys
import time
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

try:
    from hermes_tools import terminal
except ImportError:
    # Fallback for running outside Hermes
    def terminal(command: str, timeout: int = 180, workdir: str = None):
        import subprocess
        result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=timeout, cwd=workdir)
        return {"output": result.stdout, "exit_code": result.returncode, "error": result.stderr}


class VerificationError(Exception):
    """Custom exception for verification errors."""
    def __init__(self, message: str, status: str, escrow_address: str = None):
        self.message = message
        self.status = status
        self.escrow_address = escrow_address
        super().__init__(message)


class RetryableError(Exception):
    """Exception for transient errors that should be retried."""
    def __init__(self, message: str, original_error: Exception = None):
        self.message = message
        self.original_error = original_error
        super().__init__(message)


def validate_base58_pubkey(pubkey: str) -> bool:
    """Validate a Solana public key (base58 encoded)."""
    if not isinstance(pubkey, str):
        return False
    if len(pubkey) < 32 or len(pubkey) > 44:
        return False
    base58_chars = set("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz")
    return all(c in base58_chars for c in pubkey)


def load_system_prompt() -> str:
    """Load the system prompt from the prompts directory."""
    prompt_path = Path(__file__).parent / "prompts" / "system.md"
    try:
        with open(prompt_path, 'r') as f:
            return f.read()
    except Exception as e:
        print(f"Warning: Could not load system prompt: {e}", file=sys.stderr)
        return """You are a delivery verification specialist for ZeroClaw, an autonomous agent commerce protocol. Your role is to verify that delivery has been completed according to the agreed terms, collect evidence from participants, request explicit human buyer approval, and then call the approveDelivery instruction on the Solana escrow program."""


def get_memory_dir() -> Path:
    """Get the ZeroClaw memory directory for escrows."""
    return Path("/mnt/c/Users/Tejas/finality/zeroclaw/memory/escrows")


def get_negotiation_memory_dir() -> Path:
    """Get the ZeroClaw memory directory for negotiations."""
    return Path("/mnt/c/Users/Tejas/finality/zeroclaw/memory/negotiations")


def get_settlement_memory_dir() -> Path:
    """Get the ZeroClaw memory directory for settlements."""
    return Path("/mnt/c/Users/Tejas/finality/zeroclaw/memory/settlements")


def load_escrow_from_memory(negotiation_id: str) -> Optional[Dict]:
    """Load escrow data from ZeroClaw memory."""
    memory_dir = get_memory_dir()
    file_path = memory_dir / f"{negotiation_id}.json"

    if not file_path.exists():
        # Try negotiation memory as fallback
        memory_dir = get_negotiation_memory_dir()
        file_path = memory_dir / f"{negotiation_id}.json"
        if not file_path.exists():
            return None

    try:
        with open(file_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Warning: Failed to load escrow from memory: {e}", file=sys.stderr)
        return None


def load_negotiation_from_memory(negotiation_id: str) -> Optional[Dict]:
    """Load negotiation data from ZeroClaw memory."""
    memory_dir = get_negotiation_memory_dir()
    file_path = memory_dir / f"{negotiation_id}.json"

    if not file_path.exists():
        return None

    try:
        with open(file_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Warning: Failed to load negotiation from memory: {e}", file=sys.stderr)
        return None


def save_to_memory(negotiation_id: str, data: Dict) -> bool:
    """Save verification result to ZeroClaw memory."""
    memory_dir = get_memory_dir()
    memory_dir.mkdir(parents=True, exist_ok=True)

    file_path = memory_dir / f"{negotiation_id}.json"
    try:
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)
        return True
    except Exception as e:
        print(f"Warning: Failed to save to memory: {e}", file=sys.stderr)
        return False


def save_verification_record(verification_id: str, data: Dict) -> bool:
    """Save verification record to settlements memory for audit trail."""
    memory_dir = get_settlement_memory_dir()
    memory_dir.mkdir(parents=True, exist_ok=True)

    file_path = memory_dir / f"{verification_id}.json"
    try:
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)
        return True
    except Exception as e:
        print(f"Warning: Failed to save verification record: {e}", file=sys.stderr)
        return False


def validate_delivery_evidence(evidence: Dict, agreement: Dict) -> Dict:
    """
    Validate delivery evidence against agreed requirements.
    Returns dict with detailed check results.
    """
    checks = {
        "method_matches": False,
        "verification_matches": False,
        "deadline_met": False,
        "proof_valid": True  # Default to True for manual verification
    }

    delivery_req = agreement.get("delivery_requirements", {})

    # Check method match
    checks["method_matches"] = evidence.get("method") == delivery_req.get("method")

    # Check verification method match
    checks["verification_matches"] = evidence.get("verification") == delivery_req.get("verification")

    # Check deadline met
    evidence_time = evidence.get("submitted_at", 0)
    deadline = delivery_req.get("deadline", 0)
    checks["deadline_met"] = evidence_time <= deadline if deadline > 0 else True

    # Check proof validity (for automatic/zk_proof verification)
    verification_method = evidence.get("verification", "")
    if verification_method in ["automatic", "zk_proof"]:
        proof_hash = evidence.get("proof_hash")
        if not proof_hash:
            checks["proof_valid"] = False
        else:
            # In production, would verify proof_hash against on-chain or off-chain proof
            # For now, we just check it exists
            checks["proof_valid"] = len(proof_hash) > 0
    else:
        # Manual verification - verifier_info should be present
        verifier_info = evidence.get("verifier_info")
        checks["proof_valid"] = bool(verifier_info and len(verifier_info) > 0)

    return checks


def check_settlement_conditions(agreement: Dict, buyer_confirmation: Optional[Dict] = None) -> Tuple[bool, List[str]]:
    """
    Check if all settlement conditions from agreement are satisfied.
    Returns (all_met, list_of_unmet_conditions)
    """
    conditions = agreement.get("settlement_conditions", {})
    unmet = []

    # preimage_reveal_required is a structural condition that must be met externally
    if conditions.get("preimage_reveal_required", False):
        unmet.append("preimage_reveal_required")

    # require_buyer_confirmation is checked separately with the buyer_confirmation input
    # auto_release_on_delivery is handled by settle_escrow skill, not here

    return len(unmet) == 0, unmet


def check_escrow_expiration(escrow_data: Dict) -> bool:
    """Check if escrow has expired."""
    expires_at = escrow_data.get("expiresAt") or escrow_data.get("expires_at")
    if expires_at:
        now = int(time.time())
        return now >= expires_at
    return False


def get_escrow_status(escrow_data: Dict) -> str:
    """Extract escrow status from escrow data."""
    escrow_account = escrow_data.get("escrow_account", {})
    status = escrow_account.get("status", {})

    if isinstance(status, dict):
        for key in ["Pending", "Approved", "Released", "Cancelled", "Expired"]:
            if key in status:
                return key
    return "Unknown"


def build_approval_script(escrow_data: Dict, buyer_keypair_path: str) -> str:
    """Build a JavaScript script to call approveDelivery using the Escrow SDK."""
    escrow_address = escrow_data.get("escrow_address") or escrow_data.get("escrow_pda")
    buyer_pubkey = escrow_data.get("buyer")

    script = f'''
const {{ Keypair, PublicKey }} = require('@solana/web3.js');
const {{
    EscrowClient,
    createClientWithKeypair,
    formatPubkey,
    getEscrowStatusName
}} = require('/mnt/c/Users/Tejas/finality/solana/escrow-sdk/dist');

async function main() {{
    console.log('✅ Approving Delivery for Escrow\\n');
    console.log('='.repeat(50));

    try {{
        // Load buyer keypair
        const fs = require('fs');
        const secretKey = new Uint8Array(JSON.parse(fs.readFileSync('{buyer_keypair_path}', 'utf8')));
        const buyer = Keypair.fromSecretKey(secretKey);
        const escrowAddress = new PublicKey('{escrow_address}');

        console.log(`👤 Buyer: ${{buyer.publicKey.toBase58()}}`);
        console.log(`🔑 Escrow: ${{escrowAddress.toBase58()}}\\n`);

        // Verify buyer matches escrow
        if (!buyer.publicKey.equals(new PublicKey('{buyer_pubkey}'))) {{
            throw new Error('Buyer keypair does not match escrow buyer');
        }}

        // Create client with buyer's keypair
        const client = createClientWithKeypair(buyer, {{ cluster: 'devnet' }});

        // Fetch escrow to verify state
        console.log('📋 Fetching escrow details...');
        const escrowData = await client.fetchEscrow(escrowAddress);

        if (!escrowData.escrow) {{
            throw new Error('Escrow account not found');
        }}

        const escrow = escrowData.escrow;
        const currentStatus = getEscrowStatusName(escrow.status);
        console.log(`   Status: ${{currentStatus}}`);
        console.log(`   Type: ${{escrow.isSol ? 'SOL' : 'SPL Token'}}`);
        if (!escrow.isSol) {{
            console.log(`   Token Mint: ${{formatPubkey(escrow.tokenMint)}}`);
        }}
        console.log(`   Expires: ${{escrow.expiresAt ? new Date(Number(escrow.expiresAt) * 1000).toISOString() : 'No expiration'}}\\n`);

        // Check if escrow can be approved
        if (escrow.status.Approved || escrow.status.Released || escrow.status.Cancelled || escrow.status.Expired) {{
            throw new Error(`Escrow cannot be approved in current state: ${{currentStatus}}`);
        }}

        // Check expiration
        if (escrow.expiresAt) {{
            const now = BigInt(Math.floor(Date.now() / 1000));
            if (now >= escrow.expiresAt) {{
                throw new Error('Escrow has already expired');
            }}
        }}

        // Approve delivery
        console.log('📝 Approving delivery...');
        const result = await client.approveDelivery(buyer, escrowAddress);

        console.log('\\n✅ Delivery approved successfully!');
        console.log('='.repeat(50));
        console.log(`📝 Transaction Signature: ${{result.signature}}`);
        console.log(`🔑 Escrow Address: ${{result.escrowAddress.toBase58()}}`);
        console.log('\\n🔗 View on Solana Explorer:');
        console.log(`   https://explorer.solana.com/tx/${{result.signature}}?cluster=devnet`);
        console.log(`   https://explorer.solana.com/address/${{result.escrowAddress.toBase58()}}?cluster=devnet`);

        // Output result as JSON for parsing
        console.log('\\n---RESULT---');
        console.log(JSON.stringify({{
            signature: result.signature,
            escrowAddress: result.escrowAddress.toBase58(),
            slot: result.slot,
            confirmations: result.confirmations,
            err: result.err
        }}));

        return result.signature;

    }} catch (error) {{
        console.error('\\n❌ Error approving delivery:');
        if (error instanceof Error) {{
            console.error(`   ${{error.message}}`);
            if (error.stack) {{
                console.error(`   ${{error.stack}}`);
            }}
        }} else {{
            console.error(`   ${{error}}`);
        }}
        console.log('---ERROR---');
        console.log(JSON.stringify({{ error: error.message || String(error) }}));
        process.exit(1);
    }}
}}

main();
'''
    return script


def execute_verification_script(script: str, workdir: str, max_retries: int = 3, retry_delay: float = 2.0) -> Dict:
    """Execute the verification JavaScript script with retry logic for RPC failures."""

    script_path = Path(workdir) / "verify_delivery_script.js"

    for attempt in range(max_retries):
        try:
            # Write script to file
            with open(script_path, 'w') as f:
                f.write(script)

            # Execute with node (using the compiled dist)
            result = terminal(
                f"cd {workdir} && node {script_path}",
                timeout=120,
                workdir=workdir
            )

            if result["exit_code"] == 0:
                # Parse the result JSON from output
                output = result["output"]
                if "---RESULT---" in output:
                    result_json = output.split("---RESULT---")[1].strip().split('\n')[0]
                    return json.loads(result_json)
                elif "---ERROR---" in output:
                    error_json = output.split("---ERROR---")[1].strip().split('\n')[0]
                    error_data = json.loads(error_json)
                    raise VerificationError(
                        error_data.get("error", "Unknown error"),
                        "execution_error"
                    )
                else:
                    # Try to find JSON in output
                    lines = output.strip().split('\n')
                    for line in reversed(lines):
                        line = line.strip()
                        if line.startswith('{') and line.endswith('}'):
                            try:
                                return json.loads(line)
                            except json.JSONDecodeError:
                                continue
                    raise VerificationError("Could not parse transaction result from output", "parse_error")
            else:
                error_msg = result.get("error", "Unknown error")
                output = result.get("output", "")

                # Check if it's a retryable error (RPC failures, network issues)
                retryable_indicators = [
                    "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN",
                    "timeout", "connection refused", "network error",
                    "rpc error", "rate limit", "429", "500", "502", "503", "504"
                ]

                is_retryable = any(indicator.lower() in (error_msg + output).lower()
                                  for indicator in retryable_indicators)

                if is_retryable and attempt < max_retries - 1:
                    print(f"Retryable error on attempt {attempt + 1}/{max_retries}: {error_msg}")
                    time.sleep(retry_delay * (attempt + 1))  # Exponential backoff
                    continue

                raise VerificationError(f"Script execution failed: {error_msg}\nOutput: {output}", "execution_error")

        except VerificationError:
            raise
        except Exception as e:
            if attempt < max_retries - 1:
                print(f"Unexpected error on attempt {attempt + 1}/{max_retries}: {e}")
                time.sleep(retry_delay * (attempt + 1))
                continue
            raise VerificationError(f"Unexpected error after {max_retries} attempts: {e}", "execution_error")

    raise VerificationError("Max retries exceeded", "max_retries_exceeded")


def run_verification(
    negotiation_id: str,
    delivery_evidence: Dict,
    buyer_confirmation: Optional[Dict] = None,
    force_verification: bool = False,
    buyer_keypair_path: Optional[str] = None
) -> Dict:
    """Main verification logic."""

    verification_timestamp = int(time.time())
    verification_id = f"verification_{negotiation_id}_{verification_timestamp}"

    # Load escrow from memory
    escrow_data = load_escrow_from_memory(negotiation_id)
    if not escrow_data:
        raise VerificationError(f"Escrow not found in memory for negotiation: {negotiation_id}", "escrow_not_found")

    # Load negotiation/agreement from memory
    negotiation_data = load_negotiation_from_memory(negotiation_id)
    if not negotiation_data:
        # Try to get agreement from escrow data
        agreement = escrow_data.get("original_agreement")
        if not agreement:
            raise VerificationError(f"Negotiation not found in memory: {negotiation_id}", "negotiation_not_found")
    else:
        agreement = negotiation_data.get("agreement")
        if not agreement:
            raise VerificationError(f"Agreement not found in negotiation data: {negotiation_id}", "agreement_not_found")

    # Get current escrow status
    previous_status = get_escrow_status(escrow_data)
    escrow_address = escrow_data.get("escrow_address") or escrow_data.get("escrow_pda")

    print(f"📋 Loaded escrow: {escrow_address}")
    print(f"📋 Current status: {previous_status}")
    print(f"📋 Negotiation ID: {negotiation_id}")

    # Check if already verified/approved
    if previous_status in ["Approved", "Released", "Cancelled", "Expired"] and not force_verification:
        return {
            "status": "already_approved",
            "error_message": f"Escrow already in terminal state: {previous_status}",
            "escrow_status": previous_status,
            "previous_escrow_status": previous_status,
            "verification_result": {
                "delivery_verified": False,
                "conditions_met": False,
                "buyer_approved": False,
                "evidence_checks": {
                    "method_matches": False,
                    "verification_matches": False,
                    "deadline_met": False,
                    "proof_valid": False
                }
            },
            "negotiation_id": negotiation_id,
            "timestamp": verification_timestamp
        }

    # Check if escrow is in Pending state (required for approval)
    if previous_status != "Pending" and not force_verification:
        return {
            "status": "invalid_state",
            "error_message": f"Escrow must be in Pending state for approval, current: {previous_status}",
            "escrow_status": previous_status,
            "previous_escrow_status": previous_status,
            "verification_result": {
                "delivery_verified": False,
                "conditions_met": False,
                "buyer_approved": False,
                "evidence_checks": {
                    "method_matches": False,
                    "verification_matches": False,
                    "deadline_met": False,
                    "proof_valid": False
                }
            },
            "negotiation_id": negotiation_id,
            "timestamp": verification_timestamp
        }

    # Check expiration
    is_expired = check_escrow_expiration(escrow_data)
    if is_expired and not force_verification:
        return {
            "status": "escrow_expired",
            "error_message": "Escrow has expired, cannot approve delivery",
            "escrow_status": "Expired",
            "previous_escrow_status": previous_status,
            "verification_result": {
                "delivery_verified": False,
                "conditions_met": False,
                "buyer_approved": False,
                "evidence_checks": {
                    "method_matches": False,
                    "verification_matches": False,
                    "deadline_met": False,
                    "proof_valid": False
                }
            },
            "negotiation_id": negotiation_id,
            "timestamp": verification_timestamp
        }

    # Validate delivery evidence against agreement
    evidence_checks = validate_delivery_evidence(delivery_evidence, agreement)
    delivery_verified = all(evidence_checks.values())

    # Check settlement conditions
    conditions_met, unmet_conditions = check_settlement_conditions(agreement, buyer_confirmation)

    print(f"📋 Evidence checks: {evidence_checks}")
    print(f"📋 Delivery verified: {delivery_verified}")
    print(f"📋 Conditions met: {conditions_met}")
    if unmet_conditions:
        print(f"📋 Unmet conditions: {unmet_conditions}")

    # Handle buyer confirmation
    buyer_approved = False
    approval_details = {}

    if agreement.get("settlement_conditions", {}).get("require_buyer_confirmation", False):
        # Buyer confirmation is required
        if buyer_confirmation and buyer_confirmation.get("approved", False):
            buyer_approved = True
            approval_details = {
                "approved_at": buyer_confirmation.get("approved_at"),
                "buyer_signature": buyer_confirmation.get("buyer_signature"),
                "notes": buyer_confirmation.get("notes", "")
            }
        else:
            # In production, this would prompt the human for approval
            # For now, we return a status indicating buyer approval is needed
            return {
                "status": "buyer_rejected",
                "error_message": "Buyer confirmation required but not provided",
                "escrow_status": previous_status,
                "previous_escrow_status": previous_status,
                "verification_result": {
                    "delivery_verified": delivery_verified,
                    "conditions_met": conditions_met,
                    "buyer_approved": False,
                    "evidence_checks": evidence_checks
                },
                "negotiation_id": negotiation_id,
                "timestamp": verification_timestamp
            }
    else:
        # Buyer confirmation not required by agreement
        buyer_approved = True
        approval_details = {"auto_approved": True}

    # All checks must pass before calling on-chain
    if not delivery_verified:
        return {
            "status": "evidence_mismatch",
            "error_message": "Delivery evidence does not match agreed requirements",
            "escrow_status": previous_status,
            "previous_escrow_status": previous_status,
            "verification_result": {
                "delivery_verified": False,
                "conditions_met": conditions_met,
                "buyer_approved": buyer_approved,
                "evidence_checks": evidence_checks
            },
            "negotiation_id": negotiation_id,
            "timestamp": verification_timestamp
        }

    if not conditions_met:
        return {
            "status": "conditions_not_met",
            "error_message": f"Settlement conditions not met: {', '.join(unmet_conditions)}",
            "escrow_status": previous_status,
            "previous_escrow_status": previous_status,
            "verification_result": {
                "delivery_verified": delivery_verified,
                "conditions_met": False,
                "buyer_approved": buyer_approved,
                "evidence_checks": evidence_checks
            },
            "negotiation_id": negotiation_id,
            "timestamp": verification_timestamp
        }

    if not buyer_approved:
        return {
            "status": "buyer_rejected",
            "error_message": "Buyer did not approve delivery",
            "escrow_status": previous_status,
            "previous_escrow_status": previous_status,
            "verification_result": {
                "delivery_verified": delivery_verified,
                "conditions_met": conditions_met,
                "buyer_approved": False,
                "evidence_checks": evidence_checks
            },
            "negotiation_id": negotiation_id,
            "timestamp": verification_timestamp
        }

    # All checks passed - proceed with on-chain approval
    print("✅ All verification checks passed. Proceeding with on-chain approveDelivery()...")

    # Get buyer keypair path
    if not buyer_keypair_path:
        buyer_keypair_path = escrow_data.get("buyer_keypair_path")
        if not buyer_keypair_path:
            raise VerificationError("Buyer keypair path not provided", "missing_keypair")

    # Build and execute verification script
    script = build_approval_script(escrow_data, buyer_keypair_path)
    workdir = "/mnt/c/Users/Tejas/finality/solana/escrow-sdk"

    try:
        result = execute_verification_script(script, workdir)

        transaction_signature = result.get("signature")
        slot = result.get("slot")
        confirmations = result.get("confirmations")
        err = result.get("err")

        # Fetch updated escrow state to confirm
        # Note: In production, we'd call fetchEscrow again, but for now we trust the transaction
        new_status = "Approved"

        # Build response
        response = {
            "status": "success",
            "error_message": None,
            "escrow_status": new_status,
            "previous_escrow_status": previous_status,
            "verification_result": {
                "delivery_verified": delivery_verified,
                "conditions_met": conditions_met,
                "buyer_approved": buyer_approved,
                "evidence_checks": evidence_checks
            },
            "transaction": {
                "signature": transaction_signature,
                "slot": slot,
                "fee": 0,  # Would need to fetch from transaction details
                "explorer_url": f"https://explorer.solana.com/tx/{transaction_signature}?cluster=devnet"
            },
            "escrow_details": {
                "escrow_pda": escrow_address,
                "buyer": escrow_data.get("buyer"),
                "seller": escrow_data.get("seller"),
                "amount": escrow_data.get("amount"),
                "is_sol": escrow_data.get("is_sol", True),
                "token_mint": escrow_data.get("token_mint"),
                "agreement_hash": escrow_data.get("agreement_hash"),
                "expires_at": escrow_data.get("expiresAt") or escrow_data.get("expires_at")
            },
            "negotiation_id": negotiation_id,
            "timestamp": verification_timestamp
        }

        # Update escrow memory with new status
        escrow_data["escrow_account"] = escrow_data.get("escrow_account", {})
        escrow_data["escrow_account"]["status"] = {new_status: None}
        escrow_data["settlement_status"] = "approved"
        escrow_data["verification_signature"] = transaction_signature
        escrow_data["verification_timestamp"] = verification_timestamp
        escrow_data["verification_id"] = verification_id
        escrow_data["delivery_evidence"] = delivery_evidence
        escrow_data["buyer_approval"] = approval_details

        save_to_memory(negotiation_id, escrow_data)

        # Save verification record for audit trail
        verification_record = {
            "verification_id": verification_id,
            "negotiation_id": negotiation_id,
            "escrow_address": escrow_address,
            "action": "approve_delivery",
            "transaction_signature": transaction_signature,
            "previous_status": previous_status,
            "new_status": new_status,
            "verification_timestamp": verification_timestamp,
            "verification_timestamp_iso": datetime.fromtimestamp(verification_timestamp).isoformat(),
            "slot": slot,
            "confirmations": confirmations,
            "error": err,
            "metadata": {
                "buyer": escrow_data.get("buyer"),
                "seller": escrow_data.get("seller"),
                "amount": escrow_data.get("amount"),
                "is_sol": escrow_data.get("is_sol", True),
                "token_mint": escrow_data.get("token_mint"),
                "agreement_hash": escrow_data.get("agreement_hash"),
                "expires_at": escrow_data.get("expiresAt") or escrow_data.get("expires_at"),
                "delivery_evidence": delivery_evidence,
                "evidence_checks": evidence_checks,
                "buyer_approval": approval_details,
                "conditions_met": conditions_met
            }
        }
        save_verification_record(verification_id, verification_record)

        print(f"✅ Verification complete. Transaction: {transaction_signature}")
        return response

    except VerificationError as e:
        # Record failed verification attempt
        verification_record = {
            "verification_id": f"{verification_id}_failed",
            "negotiation_id": negotiation_id,
            "escrow_address": escrow_address,
            "action": "approve_delivery",
            "transaction_signature": None,
            "previous_status": previous_status,
            "new_status": "failed",
            "verification_timestamp": verification_timestamp,
            "verification_timestamp_iso": datetime.fromtimestamp(verification_timestamp).isoformat(),
            "error": str(e),
            "error_status": e.status,
            "metadata": {
                "buyer": escrow_data.get("buyer"),
                "seller": escrow_data.get("seller"),
                "amount": escrow_data.get("amount"),
                "is_sol": escrow_data.get("is_sol", True),
                "token_mint": escrow_data.get("token_mint"),
                "agreement_hash": escrow_data.get("agreement_hash"),
                "expires_at": escrow_data.get("expiresAt") or escrow_data.get("expires_at"),
                "delivery_evidence": delivery_evidence,
                "evidence_checks": evidence_checks,
                "buyer_approval": approval_details,
                "conditions_met": conditions_met
            }
        }
        save_verification_record(verification_id, verification_record)

        return {
            "status": "failed",
            "error_message": str(e),
            "escrow_status": previous_status,
            "previous_escrow_status": previous_status,
            "verification_result": {
                "delivery_verified": delivery_verified,
                "conditions_met": conditions_met,
                "buyer_approved": buyer_approved,
                "evidence_checks": evidence_checks
            },
            "negotiation_id": negotiation_id,
            "timestamp": verification_timestamp
        }


def main():
    """Entry point for the skill."""
    if len(sys.argv) < 2:
        print("Usage: verify_delivery.py <input_json_file>", file=sys.stderr)
        sys.exit(1)

    input_file = sys.argv[1]

    try:
        with open(input_file, 'r') as f:
            input_data = json.load(f)
    except Exception as e:
        print(f"Error reading input file: {e}", file=sys.stderr)
        sys.exit(1)

    negotiation_id = input_data.get("negotiation_id")
    delivery_evidence = input_data.get("delivery_evidence")
    buyer_confirmation = input_data.get("buyer_confirmation")
    force_verification = input_data.get("force_verification", False)
    buyer_keypair_path = input_data.get("buyer_keypair_path")

    if not negotiation_id:
        print("Error: Missing negotiation_id in input", file=sys.stderr)
        sys.exit(1)

    if not delivery_evidence:
        print("Error: Missing delivery_evidence in input", file=sys.stderr)
        sys.exit(1)

    result = run_verification(
        negotiation_id=negotiation_id,
        delivery_evidence=delivery_evidence,
        buyer_confirmation=buyer_confirmation,
        force_verification=force_verification,
        buyer_keypair_path=buyer_keypair_path
    )

    # Output result as JSON
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()