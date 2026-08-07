#!/usr/bin/env python3
"""
ZeroClaw Settle Escrow Skill Implementation

This module implements the settle_escrow skill for ZeroClaw.
It loads the escrow from ZeroClaw memory, inspects its current status,
and decides whether settlement should proceed or the escrow should be cancelled.
If delivery has been approved, uses the Escrow SDK to call releaseFunds();
if the agreement is cancelled or expires, calls cancelEscrow().
Records the transaction signature, final escrow status, settlement timestamp,
and metadata in ZeroClaw memory, handles retries and RPC failures gracefully,
prevents duplicate settlement through proper state validation, and produces
a summary of all files changed and integration notes.
"""

import json
import os
import sys
import time
import uuid
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


class SettlementError(Exception):
    """Custom exception for settlement errors."""
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


def get_memory_dir() -> Path:
    """Get the ZeroClaw memory directory for settlements."""
    return Path("/mnt/c/Users/Tejas/finality/zeroclaw/memory/settlements")


def get_escrow_memory_dir() -> Path:
    """Get the ZeroClaw memory directory for escrows."""
    return Path("/mnt/c/Users/Tejas/finality/zeroclaw/memory/escrows")


def get_negotiation_memory_dir() -> Path:
    """Get the ZeroClaw memory directory for negotiations."""
    return Path("/mnt/c/Users/Tejas/finality/zeroclaw/memory/negotiations")


def save_to_memory(settlement_id: str, data: Dict) -> bool:
    """Save settlement data to ZeroClaw memory."""
    memory_dir = get_memory_dir()
    memory_dir.mkdir(parents=True, exist_ok=True)
    
    file_path = memory_dir / f"{settlement_id}.json"
    try:
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)
        return True
    except Exception as e:
        print(f"Warning: Failed to save to memory: {e}", file=sys.stderr)
        return False


def load_from_memory(settlement_id: str) -> Optional[Dict]:
    """Load settlement from ZeroClaw memory."""
    memory_dir = get_memory_dir()
    file_path = memory_dir / f"{settlement_id}.json"
    
    if not file_path.exists():
        return None
    
    try:
        with open(file_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Warning: Failed to load from memory: {e}", file=sys.stderr)
        return None


def load_escrow_from_memory(escrow_id: str) -> Optional[Dict]:
    """Load escrow data from ZeroClaw memory."""
    memory_dir = get_escrow_memory_dir()
    file_path = memory_dir / f"{escrow_id}.json"
    
    if not file_path.exists():
        # Try negotiation memory as fallback
        memory_dir = get_negotiation_memory_dir()
        file_path = memory_dir / f"{escrow_id}.json"
        if not file_path.exists():
            return None
    
    try:
        with open(file_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Warning: Failed to load escrow from memory: {e}", file=sys.stderr)
        return None


def save_escrow_to_memory(escrow_id: str, data: Dict) -> bool:
    """Save escrow data to ZeroClaw memory."""
    memory_dir = get_escrow_memory_dir()
    memory_dir.mkdir(parents=True, exist_ok=True)
    
    file_path = memory_dir / f"{escrow_id}.json"
    try:
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)
        return True
    except Exception as e:
        print(f"Warning: Failed to save escrow to memory: {e}", file=sys.stderr)
        return False


def build_settlement_script(escrow_data: Dict, action: str, buyer_keypair_path: str = None) -> str:
    """Build a JavaScript script to execute the settlement action using the Escrow SDK."""
    
    escrow_address = escrow_data.get("escrow_address")
    buyer_pubkey = escrow_data.get("buyer")
    seller_pubkey = escrow_data.get("seller")
    is_sol = escrow_data.get("is_sol", True)
    token_mint = escrow_data.get("token_mint")
    
    if action == "release":
        script = f'''
const {{ Keypair, PublicKey }} = require('@solana/web3.js');
const {{ 
    EscrowClient, 
    createClientWithKeypair,
    formatPubkey,
    deriveAssociatedTokenAccount
}} = require('/mnt/c/Users/Tejas/finality/solana/escrow-sdk/dist');

async function main() {{
    console.log('💸 Releasing Funds from Escrow\\n');
    console.log('='.repeat(50));
    
    try {{
        // Load buyer keypair
        const fs = require('fs');
        const secretKey = new Uint8Array(JSON.parse(fs.readFileSync('{buyer_keypair_path}', 'utf8')));
        const buyer = Keypair.fromSecretKey(secretKey);
        const seller = new PublicKey('{seller_pubkey}');
        const escrowAddress = new PublicKey('{escrow_address}');
        
        console.log(`👤 Buyer: ${{buyer.publicKey.toBase58()}}`);
        console.log(`👤 Seller: ${{seller.toBase58()}}`);
        console.log(`🔑 Escrow: ${{escrowAddress.toBase58()}}\\n`);
        
        // Create client with buyer's keypair
        const client = createClientWithKeypair(buyer, {{ cluster: 'devnet' }});
        
        // Fetch escrow to verify state
        console.log('📋 Fetching escrow details...');
        const escrowData = await client.fetchEscrow(escrowAddress);
        
        if (!escrowData.escrow) {{
            throw new Error('Escrow account not found');
        }}
        
        const escrow = escrowData.escrow;
        console.log(`   Status: ${{escrow.status.Pending ? 'Pending' : escrow.status.Approved ? 'Approved' : escrow.status.Released ? 'Released' : escrow.status.Cancelled ? 'Cancelled' : 'Expired'}}`);
        console.log(`   Type: ${{escrow.isSol ? 'SOL' : 'SPL Token'}}`);
        if (!escrow.isSol) {{
            console.log(`   Token Mint: ${{formatPubkey(escrow.tokenMint)}}`);
        }}
        console.log(`   Expires: ${{escrow.expiresAt ? new Date(Number(escrow.expiresAt) * 1000).toISOString() : 'No expiration'}}\\n`);
        
        // Check if escrow can release funds
        if (escrow.status.Pending) {{
            throw new Error('Escrow must be approved before releasing funds');
        }}
        if (escrow.status.Released || escrow.status.Cancelled || escrow.status.Expired) {{
            throw new Error(`Escrow cannot release funds in current state: ${{escrow.status}}`);
        }}
        
        // Release funds
        console.log('📝 Releasing funds...');
        
        let result;
        if (escrow.isSol) {{
            // SOL escrow - no additional params needed
            result = await client.releaseFunds(buyer, escrowAddress, seller);
        }} else {{
            // SPL token escrow - need seller token account
            const sellerTokenAccount = deriveAssociatedTokenAccount(seller, escrow.tokenMint);
            result = await client.releaseFunds(buyer, escrowAddress, seller, {{
                sellerTokenAccount
            }});
        }}
        
        console.log('\\n✅ Funds released successfully!');
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
        console.error('\\n❌ Error releasing funds:');
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
    elif action == "cancel":
        script = f'''
const {{ Keypair, PublicKey }} = require('@solana/web3.js');
const {{ 
    EscrowClient, 
    createClientWithKeypair,
    formatPubkey,
    deriveAssociatedTokenAccount
}} = require('/mnt/c/Users/Tejas/finality/solana/escrow-sdk/dist');

async function main() {{
    console.log('❌ Cancelling Escrow\\n');
    console.log('='.repeat(50));
    
    try {{
        // Load buyer keypair
        const fs = require('fs');
        const secretKey = new Uint8Array(JSON.parse(fs.readFileSync('{buyer_keypair_path}', 'utf8')));
        const buyer = Keypair.fromSecretKey(secretKey);
        const seller = new PublicKey('{seller_pubkey}');
        const escrowAddress = new PublicKey('{escrow_address}');
        
        console.log(`👤 Buyer: ${{buyer.publicKey.toBase58()}}`);
        console.log(`👤 Seller: ${{seller.toBase58()}}`);
        console.log(`🔑 Escrow: ${{escrowAddress.toBase58()}}\\n`);
        
        // Create client with buyer's keypair
        const client = createClientWithKeypair(buyer, {{ cluster: 'devnet' }});
        
        // Fetch escrow to verify state
        console.log('📋 Fetching escrow details...');
        const escrowData = await client.fetchEscrow(escrowAddress);
        
        if (!escrowData.escrow) {{
            throw new Error('Escrow account not found');
        }}
        
        const escrow = escrowData.escrow;
        console.log(`   Status: ${{escrow.status.Pending ? 'Pending' : escrow.status.Approved ? 'Approved' : escrow.status.Released ? 'Released' : escrow.status.Cancelled ? 'Cancelled' : 'Expired'}}`);
        console.log(`   Type: ${{escrow.isSol ? 'SOL' : 'SPL Token'}}`);
        if (!escrow.isSol) {{
            console.log(`   Token Mint: ${{formatPubkey(escrow.tokenMint)}}`);
        }}
        console.log(`   Expires: ${{escrow.expiresAt ? new Date(Number(escrow.expiresAt) * 1000).toISOString() : 'No expiration'}}\\n`);
        
        // Check if escrow can be cancelled
        if (escrow.status.Approved || escrow.status.Released || escrow.status.Cancelled || escrow.status.Expired) {{
            throw new Error(`Escrow cannot be cancelled in current state: ${{escrow.status}}`);
        }}
        
        // Check if expired
        if (escrow.expiresAt) {{
            const now = BigInt(Math.floor(Date.now() / 1000));
            if (now >= escrow.expiresAt) {{
                throw new Error('Escrow has already expired');
            }}
        }}
        
        // Cancel escrow
        console.log('📝 Cancelling escrow...');
        
        let result;
        if (escrow.isSol) {{
            // SOL escrow - no additional params needed
            result = await client.cancelEscrow(buyer, escrowAddress, seller);
        }} else {{
            // SPL token escrow - need buyer token account
            const buyerTokenAccount = deriveAssociatedTokenAccount(buyer.publicKey, escrow.tokenMint);
            result = await client.cancelEscrow(buyer, escrowAddress, seller, {{
                buyerTokenAccount
            }});
        }}
        
        console.log('\\n✅ Escrow cancelled successfully!');
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
        console.error('\\n❌ Error cancelling escrow:');
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
    else:
        raise ValueError(f"Unknown action: {action}")
    
    return script


def execute_settlement_script(script: str, workdir: str, max_retries: int = 3, retry_delay: float = 2.0) -> Dict:
    """Execute the settlement JavaScript script with retry logic for RPC failures."""
    
    script_path = Path(workdir) / "settlement_script.js"
    
    for attempt in range(max_retries):
        try:
            # Write script to file
            with open(script_path, 'w') as f:
                f.write(script)
            
            # Execute with npx ts-node
            result = terminal(
                f"cd {workdir} && npx ts-node {script_path}",
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
                    raise SettlementError(
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
                    raise SettlementError("Could not parse transaction result from output", "parse_error")
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
                
                raise SettlementError(f"Script execution failed: {error_msg}\nOutput: {output}", "execution_error")
                
        except SettlementError:
            raise
        except Exception as e:
            if attempt < max_retries - 1:
                print(f"Unexpected error on attempt {attempt + 1}/{max_retries}: {e}")
                time.sleep(retry_delay * (attempt + 1))
                continue
            raise SettlementError(f"Unexpected error after {max_retries} attempts: {e}", "execution_error")
    
    raise SettlementError("Max retries exceeded", "max_retries_exceeded")


def inspect_escrow_status(escrow_data: Dict) -> Dict:
    """Inspect the escrow status and determine the appropriate action."""
    
    escrow_account = escrow_data.get("escrow_account", {})
    status = escrow_account.get("status", {})
    expires_at = escrow_account.get("expiresAt")
    settlement_status = escrow_data.get("settlement_status", "pending")
    
    # Check if already settled
    if settlement_status in ["released", "cancelled", "expired"]:
        return {
            "action": "none",
            "reason": f"Escrow already settled with status: {settlement_status}",
            "can_proceed": False,
            "current_status": settlement_status
        }
    
    # Determine on-chain status
    on_chain_status = None
    if 'Pending' in status:
        on_chain_status = "Pending"
    elif 'Approved' in status:
        on_chain_status = "Approved"
    elif 'Released' in status:
        on_chain_status = "Released"
    elif 'Cancelled' in status:
        on_chain_status = "Cancelled"
    elif 'Expired' in status:
        on_chain_status = "Expired"
    
    # Check expiration
    is_expired = False
    if expires_at:
        now = int(time.time())
        if now >= expires_at:
            is_expired = True
    
    # Decision logic
    if on_chain_status == "Approved":
        return {
            "action": "release",
            "reason": "Delivery approved, releasing funds to seller",
            "can_proceed": True,
            "current_status": on_chain_status,
            "is_expired": is_expired
        }
    elif on_chain_status == "Pending" and is_expired:
        return {
            "action": "cancel",
            "reason": "Escrow expired, cancelling and refunding buyer",
            "can_proceed": True,
            "current_status": on_chain_status,
            "is_expired": True
        }
    elif on_chain_status in ["Cancelled", "Expired"]:
        return {
            "action": "none",
            "reason": f"Escrow already {on_chain_status.lower()} on-chain",
            "can_proceed": False,
            "current_status": on_chain_status
        }
    elif on_chain_status == "Released":
        return {
            "action": "none",
            "reason": "Funds already released on-chain",
            "can_proceed": False,
            "current_status": on_chain_status
        }
    elif on_chain_status == "Pending" and not is_expired:
        return {
            "action": "wait",
            "reason": "Escrow still pending, delivery not yet approved and not expired",
            "can_proceed": False,
            "current_status": on_chain_status,
            "is_expired": False
        }
    else:
        return {
            "action": "none",
            "reason": f"Unknown or unhandled status: {on_chain_status}",
            "can_proceed": False,
            "current_status": on_chain_status
        }


def run_settlement(escrow_id: str, buyer_keypair_path: str = None, force_action: str = None) -> Dict:
    """Main settlement logic."""
    
    # Load escrow from memory
    escrow_data = load_escrow_from_memory(escrow_id)
    if not escrow_data:
        raise SettlementError(f"Escrow not found in memory: {escrow_id}", "not_found", escrow_id)
    
    # Check if already settled in our memory
    settlement_status = escrow_data.get("settlement_status", "pending")
    if settlement_status in ["released", "cancelled", "expired"] and not force_action:
        return {
            "success": False,
            "action": "none",
            "message": f"Escrow already settled with status: {settlement_status}",
            "settlement_status": settlement_status,
            "transaction_signature": escrow_data.get("transaction_signature"),
            "settlement_timestamp": escrow_data.get("settlement_timestamp"),
            "duplicate_prevented": True
        }
    
    # Inspect escrow status and decide action
    decision = inspect_escrow_status(escrow_data)
    
    if not decision["can_proceed"] and not force_action:
        return {
            "success": False,
            "action": "none",
            "message": decision["reason"],
            "settlement_status": settlement_status,
            "on_chain_status": decision["current_status"],
            "decision": decision
        }
    
    # Override with force_action if provided
    action = force_action if force_action else decision["action"]
    
    if action == "wait":
        return {
            "success": False,
            "action": "wait",
            "message": decision["reason"],
            "settlement_status": "pending",
            "on_chain_status": decision["current_status"],
            "decision": decision
        }
    
    if action not in ["release", "cancel"]:
        raise SettlementError(f"Invalid action: {action}", "invalid_action")
    
    # Get buyer keypair path
    if not buyer_keypair_path:
        # Try to find it in escrow data or use default
        buyer_keypair_path = escrow_data.get("buyer_keypair_path")
        if not buyer_keypair_path:
            raise SettlementError("Buyer keypair path not provided", "missing_keypair")
    
    # Build and execute settlement script
    script = build_settlement_script(escrow_data, action, buyer_keypair_path)
    workdir = "/mnt/c/Users/Tejas/finality/solana/escrow-sdk"
    
    try:
        result = execute_settlement_script(script, workdir)
        
        # Determine final status
        final_status = "released" if action == "release" else "cancelled"
        if decision.get("is_expired") and action == "cancel":
            final_status = "expired"
        
        settlement_timestamp = int(time.time())
        settlement_id = f"settlement_{escrow_id}_{settlement_timestamp}_{uuid.uuid4().hex[:8]}"
        
        # Record settlement in memory
        settlement_record = {
            "settlement_id": settlement_id,
            "escrow_id": escrow_id,
            "escrow_address": escrow_data.get("escrow_address"),
            "action": action,
            "transaction_signature": result.get("signature"),
            "final_escrow_status": final_status,
            "on_chain_status_before": decision["current_status"],
            "settlement_timestamp": settlement_timestamp,
            "settlement_timestamp_iso": datetime.fromtimestamp(settlement_timestamp).isoformat(),
            "slot": result.get("slot"),
            "confirmations": result.get("confirmations"),
            "error": result.get("err"),
            "metadata": {
                "buyer": escrow_data.get("buyer"),
                "seller": escrow_data.get("seller"),
                "amount": escrow_data.get("amount"),
                "is_sol": escrow_data.get("is_sol", True),
                "token_mint": escrow_data.get("token_mint"),
                "agreement_hash": escrow_data.get("agreement_hash"),
                "expires_at": escrow_data.get("expiresAt"),
                "decision_reason": decision["reason"],
                "forced": force_action is not None
            }
        }
        
        save_to_memory(settlement_id, settlement_record)
        
        # Update escrow memory with settlement info
        escrow_data["settlement_status"] = final_status
        escrow_data["transaction_signature"] = result.get("signature")
        escrow_data["settlement_timestamp"] = settlement_timestamp
        escrow_data["settlement_id"] = settlement_id
        save_escrow_to_memory(escrow_id, escrow_data)
        
        return {
            "success": True,
            "action": action,
            "message": f"Escrow {action}d successfully",
            "settlement_status": final_status,
            "transaction_signature": result.get("signature"),
            "settlement_timestamp": settlement_timestamp,
            "settlement_id": settlement_id,
            "slot": result.get("slot"),
            "confirmations": result.get("confirmations"),
            "on_chain_status_before": decision["current_status"],
            "decision": decision
        }
        
    except SettlementError as e:
        # Record failed settlement attempt
        settlement_timestamp = int(time.time())
        settlement_id = f"settlement_{escrow_id}_{settlement_timestamp}_failed_{uuid.uuid4().hex[:8]}"
        
        settlement_record = {
            "settlement_id": settlement_id,
            "escrow_id": escrow_id,
            "escrow_address": escrow_data.get("escrow_address"),
            "action": action,
            "transaction_signature": None,
            "final_escrow_status": "failed",
            "on_chain_status_before": decision["current_status"],
            "settlement_timestamp": settlement_timestamp,
            "settlement_timestamp_iso": datetime.fromtimestamp(settlement_timestamp).isoformat(),
            "error": str(e),
            "metadata": {
                "buyer": escrow_data.get("buyer"),
                "seller": escrow_data.get("seller"),
                "amount": escrow_data.get("amount"),
                "is_sol": escrow_data.get("is_sol", True),
                "token_mint": escrow_data.get("token_mint"),
                "agreement_hash": escrow_data.get("agreement_hash"),
                "expires_at": escrow_data.get("expiresAt"),
                "decision_reason": decision["reason"],
                "forced": force_action is not None,
                "error_status": e.status
            }
        }
        
        save_to_memory(settlement_id, settlement_record)
        
        return {
            "success": False,
            "action": action,
            "message": str(e),
            "settlement_status": "failed",
            "error": str(e),
            "settlement_id": settlement_id,
            "error_status": e.status,
            "on_chain_status_before": decision["current_status"],
            "decision": decision
        }


def main():
    """Entry point for the skill."""
    if len(sys.argv) < 2:
        print("Usage: settle_escrow.py <input_json_file>", file=sys.stderr)
        sys.exit(1)
    
    input_file = sys.argv[1]
    
    try:
        with open(input_file, 'r') as f:
            input_data = json.load(f)
    except Exception as e:
        print(f"Error reading input file: {e}", file=sys.stderr)
        sys.exit(1)
    
    escrow_id = input_data.get("escrow_id")
    buyer_keypair_path = input_data.get("buyer_keypair_path")
    force_action = input_data.get("force_action")  # Optional: "release" or "cancel"
    
    if not escrow_id:
        print("Error: Missing escrow_id in input", file=sys.stderr)
        sys.exit(1)
    
    result = run_settlement(escrow_id, buyer_keypair_path, force_action)
    
    # Output result as JSON
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()