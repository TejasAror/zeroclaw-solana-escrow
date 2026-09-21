use anchor_lang::prelude::*;


pub const ESCROW_SEED: &str = "escrow";


pub const VAULT_SEED: &str = "vault";

pub const TOKEN_VAULT_SEED: &str = "token_vault";


pub const AGREEMENT_HASH_LEN: usize = 32;


pub const MAX_VERIFICATION_DATA_LEN: usize = 256;


pub const MAX_VERIFIER_INFO_LEN: usize = 128;


pub const MAX_AGREEMENT_DATA_LEN: usize = 1024;


pub const MIN_ESCROW_AMOUNT: u64 = 1;

pub const MAX_ESCROW_AMOUNT: u64 = u64::MAX;


pub const MAX_ESCROW_DURATION_SECONDS: i64 = 365 * 24 * 60 * 60;


pub const MIN_ESCROW_DURATION_SECONDS: i64 = 60;


pub const TOKEN_PROGRAM_ID: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");


pub const ASSOCIATED_TOKEN_PROGRAM_ID: Pubkey = pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
