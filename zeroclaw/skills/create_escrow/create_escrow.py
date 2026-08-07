#!/usr/bin/env python3
"""
ZeroClaw Create Escrow Skill Implementation

This module implements the create_escrow skill for ZeroClaw.
It takes a finalized agreement from negotiate_contract, requires explicit human approval,
then uses the production TypeScript Escrow SDK to call initializeEscrow() on the deployed
Devnet program. Stores escrow data in ZeroClaw memory and returns structured response.
"""

import json
import os
import sys
import hashlib
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

# Try to import hermes_tools for running inside Hermes
try:
    from hermes_tools import terminal
except ImportError:
    # Fallback for running outside Hermes
    def terminal(command: str, timeout: int = 180, workdir: Optional[str] = None):
        import subprocess
        result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=timeout, cwd=workdir)
        return {"output": result.stdout, "exit_code": result.returncode, "error": result.stderr}


class EscrowCreationError(Exception):
    """Custom exception for escrow creation errors."""
    def __init__(self, message: str, error_code: str, original_error: Optional[Exception] = None):
        self.message = message
        self.error_code = error_code
        self.original_error = original_error
        super().__init__(message)


def validate_base58_pubkey(pubkey: str) -> bool:
    """Validate a Solana public key (base58 encoded)."""
    if not isinstance(pubkey, str):
        return False
    if len(pubkey) < 32 or len(pubkey) > 44:
        return False
    # Base58 alphabet check
    base58_chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    return all(c in base58_chars for c in pubkey)


def validate_agreement_hash(agreement: Dict, agreement_hash: str) -> bool:
    """Verify that the agreement hash matches the computed hash of the agreement.
    
    Uses the same canonicalization as negotiate_contract: excludes agreement_hash
    and negotiation_log fields for deterministic serialization.
    """
    # Create a copy without the hash field and negotiation_log for canonicalization
    canonical = {k: v for k, v in agreement.items() if k not in ["agreement_hash", "negotiation_log"]}
    # Sort keys for deterministic serialization
    json_str = json.dumps(canonical, sort_keys=True, separators=(',', ':'))
    computed_hash = hashlib.sha256(json_str.encode('utf-8')).hexdigest()
    return computed_hash == agreement_hash


def validate_human_approval(human_approval: Dict) -> List[str]:
    """Validate human approval object and return list of errors."""
    errors = []
    
    if not human_approval.get("approved", False):
        errors.append("Human approval not granted (approved must be true)")
    
    if not human_approval.get("approver"):
        errors.append("Human approval missing approver field")
    
    if not human_approval.get("timestamp"):
        errors.append("Human approval missing timestamp field")
    elif not isinstance(human_approval["timestamp"], (int, float)) or human_approval["timestamp"] < 1:
        errors.append("Human approval timestamp must be a positive number")
    
    if not human_approval.get("signature"):
        errors.append("Human approval missing signature field")
    
    return errors


def validate_buyer_keypair(buyer_keypair: Dict) -> List[str]:
    """Validate buyer keypair and return list of errors."""
    errors = []
    
    if not buyer_keypair.get("publicKey"):
        errors.append("Buyer keypair missing publicKey")
    elif not validate_base58_pubkey(buyer_keypair["publicKey"]):
        errors.append("Buyer keypair publicKey is not a valid base58 public key")
    
    if not buyer_keypair.get("secretKey"):
        errors.append("Buyer keypair missing secretKey")
    elif not isinstance(buyer_keypair["secretKey"], list):
        errors.append("Buyer keypair secretKey must be an array")
    elif len(buyer_keypair["secretKey"]) not in [32, 64]:
        errors.append("Buyer keypair secretKey must be 32 or 64 bytes")
    elif not all(isinstance(b, int) and 0 <= b <= 255 for b in buyer_keypair["secretKey"]):
        errors.append("Buyer keypair secretKey must contain bytes (0-255)")
    
    return errors


def save_to_memory(negotiation_id: str, data: Dict) -> bool:
    """Save escrow data to ZeroClaw memory."""
    memory_dir = Path("/mnt/c/Users/Tejas/finality/zeroclaw/memory/escrows")
    memory_dir.mkdir(parents=True, exist_ok=True)
    
    file_path = memory_dir / f"{negotiation_id}.json"
    try:
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)
        return True
    except Exception as e:
        print(f"Warning: Failed to save to memory: {e}", file=sys.stderr)
        return False


def load_from_memory(negotiation_id: str) -> Optional[Dict]:
    """Load escrow data from ZeroClaw memory."""
    memory_dir = Path("/mnt/c/Users/Tejas/finality/zeroclaw/memory/escrows")
    file_path = memory_dir / f"{negotiation_id}.json"
    
    if not file_path.exists():
        return None
    
    try:
        with open(file_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Warning: Failed to load from memory: {e}", file=sys.stderr)
        return None


def build_typescript_params(input_data: Dict) -> Dict:
    """Build parameters for the TypeScript escrow initialization script."""
    agreement = input_data["agreement"]
    agreement_hash = input_data["agreement_hash"]
    buyer_keypair = input_data["buyer_keypair"]
    cluster = input_data.get("cluster", "devnet")
    rpc_url = input_data.get("rpc_url")
    compute_budget = input_data.get("compute_budget")
    
    # Convert agreement hash from hex to array
    agreement_hash_bytes = list(bytes.fromhex(agreement_hash))
    
    # Determine if SOL or SPL token
    is_sol = agreement["payment_token"] == "SOL"
    
    params = {
        "buyerPublicKey": buyer_keypair["publicKey"],
        "buyerSecretKey": buyer_keypair["secretKey"],
        "sellerPublicKey": agreement["seller"],
        "amount": agreement["payment_amount"],
        "agreementHash": agreement_hash_bytes,
        "expiresAt": agreement["deadlines"].get("expiration") or 0,
        "isSol": is_sol,
        "cluster": cluster,
    }
    
    if rpc_url:
        params["rpcUrl"] = rpc_url
    
    if compute_budget:
        params["computeBudget"] = compute_budget
    else:
        params["computeBudget"] = {}
    
    # For SPL token escrows
    if not is_sol:
        params["tokenMint"] = agreement["payment_token"]
        # Note: buyerTokenAccount would need to be derived or provided
        # For now, we'll derive it using the SDK
    
    return params


def run_typescript_escrow_init(params: Dict) -> Dict:
    """Run the JavaScript escrow initialization script and return the result."""
    # Path to the escrow-sdk directory
    escrow_sdk_dir = "/mnt/c/Users/Tejas/finality/solana/escrow-sdk"
    
    # Create a temporary JSON file with the parameters
    import tempfile
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(params, f)
        params_file = f.name
    
    try:
        # Run the JavaScript script
        cmd = f"cd {escrow_sdk_dir} && node init-escrow-standalone.js {params_file}"
        result = terminal(cmd, timeout=120, workdir=escrow_sdk_dir)
        
        if result["exit_code"] != 0:
            # Try to parse error from output
            error_data = None
            for line in result["output"].split('\n'):
                if line.startswith('ERROR:'):
                    try:
                        error_data = json.loads(line[6:])
                        break
                    except:
                        pass
            
            if error_data:
                raise EscrowCreationError(
                    error_data.get("message", "Unknown error"),
                    error_data.get("code", "JAVASCRIPT_ERROR"),
                    Exception(error_data.get("stack", ""))
                )
            else:
                raise EscrowCreationError(
                    f"JavaScript execution failed: {result['error']}",
                    "JAVASCRIPT_EXECUTION_ERROR"
                )
        
        # Parse success output
        success_data = None
        for line in result["output"].split('\n'):
            if line.startswith('SUCCESS:'):
                try:
                    success_data = json.loads(line[8:])
                    break
                except:
                    pass
        
        if not success_data:
            raise EscrowCreationError(
                "No success output from JavaScript script",
                "JAVASCRIPT_PARSE_ERROR"
            )
        
        return success_data
        
    finally:
        # Clean up temporary params file
        try:
            os.unlink(params_file)
        except:
            pass


def create_escrow(input_data: Dict) -> Dict:
    """Main escrow creation logic."""
    
    # Validate input structure
    required_fields = ["agreement", "agreement_hash", "human_approval", "buyer_keypair"]
    for field in required_fields:
        if field not in input_data:
            return {
                "success": False,
                "escrow_pda": None,
                "transaction_signature": None,
                "agreement_hash": None,
                "amount": None,
                "buyer": None,
                "seller": None,
                "escrow_status": None,
                "vault_address": None,
                "token_vault_address": None,
                "token_mint": None,
                "expires_at": None,
                "created_at": datetime.now().isoformat(),
                "slot": 0,
                "confirmations": None,
                "error_message": f"Missing required field: {field}",
                "error_code": "VALIDATION_ERROR",
                "memory_stored": False
            }
    
    agreement = input_data["agreement"]
    agreement_hash = input_data["agreement_hash"]
    human_approval = input_data["human_approval"]
    buyer_keypair = input_data["buyer_keypair"]
    
    # Validate human approval
    approval_errors = validate_human_approval(human_approval)
    if approval_errors:
        return {
            "success": False,
            "escrow_pda": None,
            "transaction_signature": None,
            "agreement_hash": agreement_hash,
            "amount": agreement.get("payment_amount"),
            "buyer": agreement.get("buyer"),
            "seller": agreement.get("seller"),
            "escrow_status": None,
            "vault_address": None,
            "token_vault_address": None,
            "token_mint": None,
            "expires_at": agreement.get("deadlines", {}).get("expiration"),
            "created_at": datetime.now().isoformat(),
            "slot": 0,
            "confirmations": None,
            "error_message": "; ".join(approval_errors),
            "error_code": "HUMAN_APPROVAL_REQUIRED",
            "memory_stored": False
        }
    
    # Validate buyer keypair
    keypair_errors = validate_buyer_keypair(buyer_keypair)
    if keypair_errors:
        return {
            "success": False,
            "escrow_pda": None,
            "transaction_signature": None,
            "agreement_hash": agreement_hash,
            "amount": agreement.get("payment_amount"),
            "buyer": agreement.get("buyer"),
            "seller": agreement.get("seller"),
            "escrow_status": None,
            "vault_address": None,
            "token_vault_address": None,
            "token_mint": None,
            "expires_at": agreement.get("deadlines", {}).get("expiration"),
            "created_at": datetime.now().isoformat(),
            "slot": 0,
            "confirmations": None,
            "error_message": "; ".join(keypair_errors),
            "error_code": "INVALID_KEYPAIR",
            "memory_stored": False
        }
    
    # Validate agreement hash matches
    if not validate_agreement_hash(agreement, agreement_hash):
        return {
            "success": False,
            "escrow_pda": None,
            "transaction_signature": None,
            "agreement_hash": agreement_hash,
            "amount": agreement.get("payment_amount"),
            "buyer": agreement.get("buyer"),
            "seller": agreement.get("seller"),
            "escrow_status": None,
            "vault_address": None,
            "token_vault_address": None,
            "token_mint": None,
            "expires_at": agreement.get("deadlines", {}).get("expiration"),
            "created_at": datetime.now().isoformat(),
            "slot": 0,
            "confirmations": None,
            "error_message": "Agreement hash does not match computed hash of agreement",
            "error_code": "HASH_MISMATCH",
            "memory_stored": False
        }
    
    # Verify buyer public key matches agreement
    if buyer_keypair["publicKey"] != agreement["buyer"]:
        return {
            "success": False,
            "escrow_pda": None,
            "transaction_signature": None,
            "agreement_hash": agreement_hash,
            "amount": agreement.get("payment_amount"),
            "buyer": agreement.get("buyer"),
            "seller": agreement.get("seller"),
            "escrow_status": None,
            "vault_address": None,
            "token_vault_address": None,
            "token_mint": None,
            "expires_at": agreement.get("deadlines", {}).get("expiration"),
            "created_at": datetime.now().isoformat(),
            "slot": 0,
            "confirmations": None,
            "error_message": "Buyer keypair publicKey does not match agreement buyer",
            "error_code": "BUYER_MISMATCH",
            "memory_stored": False
        }
    
    try:
        # Build TypeScript parameters
        ts_params = build_typescript_params(input_data)
        
        # Run the TypeScript escrow initialization
        ts_result = run_typescript_escrow_init(ts_params)
        
        # Build success response
        escrow_pda = ts_result["escrowAddress"]
        transaction_signature = ts_result["signature"]
        vault_address = ts_result["vaultAddress"]
        token_vault_address = ts_result.get("tokenVaultAddress")
        slot = ts_result.get("slot", 0)
        confirmations = ts_result.get("confirmations")
        
        # Determine escrow status (initially "Pending")
        escrow_status = "Pending"
        
        # Determine token mint
        is_sol = agreement["payment_token"] == "SOL"
        token_mint = None if is_sol else agreement["payment_token"]
        
        # Build response
        response = {
            "success": True,
            "escrow_pda": escrow_pda,
            "transaction_signature": transaction_signature,
            "agreement_hash": agreement_hash,
            "amount": agreement["payment_amount"],
            "buyer": agreement["buyer"],
            "seller": agreement["seller"],
            "escrow_status": escrow_status,
            "vault_address": vault_address,
            "token_vault_address": token_vault_address,
            "token_mint": token_mint,
            "expires_at": agreement["deadlines"].get("expiration"),
            "created_at": datetime.now().isoformat(),
            "slot": slot,
            "confirmations": confirmations,
            "error_message": None,
            "error_code": None,
            "memory_stored": False  # Will be updated after memory save
        }
        
        # Save to ZeroClaw memory
        memory_data = {
            **response,
            "original_agreement": agreement,
            "human_approval": human_approval,
        }
        
        memory_stored = save_to_memory(agreement["negotiation_id"], memory_data)
        response["memory_stored"] = memory_stored
        
        return response
        
    except EscrowCreationError as e:
        error_response = {
            "success": False,
            "escrow_pda": None,
            "transaction_signature": None,
            "agreement_hash": agreement_hash,
            "amount": agreement.get("payment_amount"),
            "buyer": agreement.get("buyer"),
            "seller": agreement.get("seller"),
            "escrow_status": None,
            "vault_address": None,
            "token_vault_address": None,
            "token_mint": None,
            "expires_at": agreement.get("deadlines", {}).get("expiration"),
            "created_at": datetime.now().isoformat(),
            "slot": 0,
            "confirmations": None,
            "error_message": e.message,
            "error_code": e.error_code,
            "memory_stored": False
        }
        
        # Try to save error to memory for audit trail
        try:
            memory_data = {
                **error_response,
                "original_agreement": agreement,
                "human_approval": human_approval,
                "error": {
                    "message": e.message,
                    "code": e.error_code,
                    "original_error": str(e.original_error) if e.original_error else None
                }
            }
            save_to_memory(agreement["negotiation_id"], memory_data)
            error_response["memory_stored"] = True
        except:
            pass
        
        return error_response
    
    except Exception as e:
        return {
            "success": False,
            "escrow_pda": None,
            "transaction_signature": None,
            "agreement_hash": agreement_hash,
            "amount": agreement.get("payment_amount"),
            "buyer": agreement.get("buyer"),
            "seller": agreement.get("seller"),
            "escrow_status": None,
            "vault_address": None,
            "token_vault_address": None,
            "token_mint": None,
            "expires_at": agreement.get("deadlines", {}).get("expiration"),
            "created_at": datetime.now().isoformat(),
            "slot": 0,
            "confirmations": None,
            "error_message": f"Unexpected error: {str(e)}",
            "error_code": "UNEXPECTED_ERROR",
            "memory_stored": False
        }


def main():
    """Entry point for the skill."""
    if len(sys.argv) < 2:
        print("Usage: create_escrow.py <input_json_file>", file=sys.stderr)
        sys.exit(1)
    
    input_file = sys.argv[1]
    
    try:
        with open(input_file, 'r') as f:
            input_data = json.load(f)
    except Exception as e:
        print(f"Error reading input file: {e}", file=sys.stderr)
        sys.exit(1)
    
    result = create_escrow(input_data)
    
    # Output result as JSON
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()