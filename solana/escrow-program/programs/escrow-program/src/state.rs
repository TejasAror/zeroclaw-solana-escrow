use anchor_lang::prelude::*;

#[account]
pub struct Escrow {
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub agreement_hash: [u8; 32],
    pub status: EscrowStatus,
    pub is_sol: bool,
    pub token_mint: Option<Pubkey>,
    pub expires_at: Option<i64>,
    pub bump: u8,
    pub vault_bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum EscrowStatus {
    Pending,   // Funds deposited, waiting for delivery approval
    Approved,  // Buyer approved delivery, ready for release
    Released,  // Funds released to seller
    Cancelled, // Escrow cancelled, funds refunded to buyer
    Expired,   // Escrow expired, funds refunded to buyer
}

impl Space for Escrow {
    const INIT_SPACE: usize = 32 +  // buyer
        32 +  // seller
        8   + // amount
        32 +  // agreement hash
        1   + // enum
        1   + // is_sol
        33 +  // Option<Pubkey> (1 + 32)
        9   + // Option<i64> (1 + 8)
        1   + // bump
        1;    // vault_bump
}