use anchor_lang::prelude::*;

/// Seed for the escrow PDA
pub const ESCROW_SEED: &str = "escrow";

/// Seed for the vault PDA (holds locked SOL)
pub const VAULT_SEED: &str = "vault";

/// Seed for the token vault PDA (holds SPL tokens)
pub const TOKEN_VAULT_SEED: &str = "token_vault";

/// Maximum agreement hash length
pub const AGREEMENT_HASH_LEN: usize = 32;

/// Maximum verification data length
pub const MAX_VERIFICATION_DATA_LEN: usize = 256;

/// Maximum verifier info length
pub const MAX_VERIFIER_INFO_LEN: usize = 128;

/// Maximum agreement data length
pub const MAX_AGREEMENT_DATA_LEN: usize = 1024;

/// Minimum escrow amount (1 lamport for SOL, 1 token unit for SPL)
pub const MIN_ESCROW_AMOUNT: u64 = 1;

/// Maximum escrow amount (u64::MAX for safety)
pub const MAX_ESCROW_AMOUNT: u64 = u64::MAX;

/// Maximum escrow duration in seconds (1 year)
pub const MAX_ESCROW_DURATION_SECONDS: i64 = 365 * 24 * 60 * 60;

/// Minimum escrow duration in seconds (1 minute)
pub const MIN_ESCROW_DURATION_SECONDS: i64 = 60;

/// SPL Token Program ID
pub const TOKEN_PROGRAM_ID: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

/// Associated Token Program ID
pub const ASSOCIATED_TOKEN_PROGRAM_ID: Pubkey = pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");