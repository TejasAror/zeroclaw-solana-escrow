use anchor_lang::prelude::*;

#[event]
pub struct EscrowInitialized {
    pub escrow: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub is_sol: bool,
    pub token_mint: Option<Pubkey>,
    pub expires_at: Option<i64>,
    pub timestamp: i64,
}

#[event]
pub struct DeliveryApproved {
    pub escrow: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct FundsReleased {
    pub escrow: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub is_sol: bool,
    pub token_mint: Option<Pubkey>,
    pub timestamp: i64,
}

#[event]
pub struct EscrowCancelled {
    pub escrow: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub is_sol: bool,
    pub token_mint: Option<Pubkey>,
    pub timestamp: i64,
}

#[event]
pub struct EscrowExpired {
    pub escrow: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub is_sol: bool,
    pub token_mint: Option<Pubkey>,
    pub timestamp: i64,
}