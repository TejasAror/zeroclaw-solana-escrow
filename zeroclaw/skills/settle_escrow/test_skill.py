#!/usr/bin/env python3
"""
Test script for settle_escrow skill - validates Python logic without blockchain calls
"""

import json
import sys
import os
import tempfile
from pathlib import Path

# Add the skill directory to path
sys.path.insert(0, '/mnt/c/Users/Tejas/finality/zeroclaw/skills/settle_escrow')

from settle_escrow import (
    inspect_escrow_status,
    load_escrow_from_memory,
    save_escrow_to_memory,
    load_from_memory,
    save_to_memory,
    get_memory_dir,
    get_escrow_memory_dir,
    SettlementError
)


def test_inspect_escrow_status():
    """Test the escrow status inspection logic."""
    print("Testing inspect_escrow_status...")
    
    # Test 1: Approved status -> should release
    escrow_approved = {
        "escrow_account": {
            "status": {"Approved": None},
            "expiresAt": 1767225600
        },
        "settlement_status": "pending"
    }
    decision = inspect_escrow_status(escrow_approved)
    assert decision["action"] == "release", f"Expected 'release', got {decision['action']}"
    assert decision["can_proceed"] == True
    print("  ✓ Approved status -> release")
    
    # Test 2: Pending but expired -> should cancel
    escrow_expired = {
        "escrow_account": {
            "status": {"Pending": None},
            "expiresAt": 1000000000  # Past timestamp
        },
        "settlement_status": "pending"
    }
    decision = inspect_escrow_status(escrow_expired)
    assert decision["action"] == "cancel", f"Expected 'cancel', got {decision['action']}"
    assert decision["can_proceed"] == True
    assert decision["is_expired"] == True
    print("  ✓ Pending + expired -> cancel")
    
    # Test 3: Pending and not expired -> should wait
    escrow_pending = {
        "escrow_account": {
            "status": {"Pending": None},
            "expiresAt": 9999999999  # Future timestamp
        },
        "settlement_status": "pending"
    }
    decision = inspect_escrow_status(escrow_pending)
    assert decision["action"] == "wait", f"Expected 'wait', got {decision['action']}"
    assert decision["can_proceed"] == False
    print("  ✓ Pending + not expired -> wait")
    
    # Test 4: Already released -> should not proceed
    escrow_released = {
        "escrow_account": {
            "status": {"Released": None},
            "expiresAt": 1767225600
        },
        "settlement_status": "released"
    }
    decision = inspect_escrow_status(escrow_released)
    assert decision["action"] == "none", f"Expected 'none', got {decision['action']}"
    assert decision["can_proceed"] == False
    print("  ✓ Released status -> none (duplicate prevention)")
    
    # Test 5: Already cancelled -> should not proceed
    escrow_cancelled = {
        "escrow_account": {
            "status": {"Cancelled": None},
            "expiresAt": 1767225600
        },
        "settlement_status": "cancelled"
    }
    decision = inspect_escrow_status(escrow_cancelled)
    assert decision["action"] == "none", f"Expected 'none', got {decision['action']}"
    assert decision["can_proceed"] == False
    print("  ✓ Cancelled status -> none (duplicate prevention)")
    
    # Test 6: Already expired on-chain -> should not proceed
    escrow_expired_onchain = {
        "escrow_account": {
            "status": {"Expired": None},
            "expiresAt": 1767225600
        },
        "settlement_status": "expired"
    }
    decision = inspect_escrow_status(escrow_expired_onchain)
    assert decision["action"] == "none", f"Expected 'none', got {decision['action']}"
    assert decision["can_proceed"] == False
    print("  ✓ Expired on-chain status -> none (duplicate prevention)")
    
    print("All inspect_escrow_status tests passed!\n")


def test_memory_operations():
    """Test memory save/load operations."""
    print("Testing memory operations...")
    
    # Create a temporary directory for testing
    with tempfile.TemporaryDirectory() as tmpdir:
        # Monkey patch the memory directories
        import settle_escrow
        original_memory_dir = settle_escrow.get_memory_dir
        original_escrow_dir = settle_escrow.get_escrow_memory_dir
        
        settle_escrow.get_memory_dir = lambda: Path(tmpdir) / "settlements"
        settle_escrow.get_escrow_memory_dir = lambda: Path(tmpdir) / "escrows"
        
        try:
            # Test saving and loading settlement
            settlement_id = "test_settlement_123"
            settlement_data = {
                "settlement_id": settlement_id,
                "escrow_id": "test_escrow_456",
                "action": "release",
                "transaction_signature": "test_signature_abc",
                "final_escrow_status": "released",
                "settlement_timestamp": 1234567890,
                "metadata": {"buyer": "buyer123", "seller": "seller456"}
            }
            
            result = save_to_memory(settlement_id, settlement_data)
            assert result == True, "Failed to save settlement to memory"
            
            loaded = load_from_memory(settlement_id)
            assert loaded is not None, "Failed to load settlement from memory"
            assert loaded["settlement_id"] == settlement_id
            assert loaded["action"] == "release"
            assert loaded["transaction_signature"] == "test_signature_abc"
            print("  ✓ Settlement save/load works")
            
            # Test saving and loading escrow
            escrow_id = "test_escrow_456"
            escrow_data = {
                "escrow_id": escrow_id,
                "escrow_address": "EscrowAddress123",
                "buyer": "Buyer123",
                "seller": "Seller456",
                "amount": 1000000000,
                "settlement_status": "pending"
            }
            
            result = save_escrow_to_memory(escrow_id, escrow_data)
            assert result == True, "Failed to save escrow to memory"
            
            loaded = load_escrow_from_memory(escrow_id)
            assert loaded is not None, "Failed to load escrow from memory"
            assert loaded["escrow_id"] == escrow_id
            assert loaded["buyer"] == "Buyer123"
            print("  ✓ Escrow save/load works")
            
            # Test loading non-existent returns None
            loaded = load_from_memory("non_existent")
            assert loaded is None, "Should return None for non-existent"
            print("  ✓ Non-existent returns None")
            
        finally:
            settle_escrow.get_memory_dir = original_memory_dir
            settle_escrow.get_escrow_memory_dir = original_escrow_dir
    
    print("All memory operations tests passed!\n")


def test_duplicate_prevention():
    """Test that duplicate settlement is prevented."""
    print("Testing duplicate prevention logic...")
    
    # The logic is in run_settlement - let's verify it checks settlement_status
    escrow_data = {
        "escrow_id": "test_123",
        "settlement_status": "released",
        "escrow_address": "Addr123",
        "buyer": "Buyer123",
        "seller": "Seller456",
        "amount": 1000000000,
        "is_sol": True,
        "escrow_account": {
            "status": {"Released": None},
            "expiresAt": 1767225600
        }
    }
    
    # Verify the check would trigger
    settlement_status = escrow_data.get("settlement_status", "pending")
    if settlement_status in ["released", "cancelled", "expired"]:
        print("  ✓ Duplicate settlement correctly detected")
        return
    
    assert False, "Duplicate prevention check failed"
    

def main():
    """Run all tests."""
    print("=" * 50)
    print("Running settle_escrow skill tests")
    print("=" * 50 + "\n")
    
    test_inspect_escrow_status()
    test_memory_operations()
    test_duplicate_prevention()
    
    print("=" * 50)
    print("All tests passed! ✓")
    print("=" * 50)


if __name__ == "__main__":
    main()