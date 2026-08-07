pub mod constants;
pub mod error;
pub mod events;
pub mod state;

mod instructions;

pub use instructions::*;

use anchor_lang::prelude::*;

pub use constants::*;
pub use error::*;
pub use events::*;
pub use state::*;

declare_id!("8u17EnuW66yfRybQY6vGjeTnASeDyxyT6QesPetRtJxk");

#[program]
pub mod escrow_program {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        amount: u64,
        agreement_hash: [u8; 32],
        expires_at: Option<i64>,
        token_mint: Option<Pubkey>,
    ) -> Result<()> {
        initialize::handler(ctx, amount, agreement_hash, expires_at, token_mint)
    }

    pub fn approve_delivery(ctx: Context<ApproveDelivery>) -> Result<()> {
        approve_delivery::handler(ctx)
    }

    pub fn release_funds(ctx: Context<ReleaseFunds>) -> Result<()> {
        release_funds::handler(ctx)
    }

    pub fn cancel_escrow(ctx: Context<CancelEscrow>) -> Result<()> {
        cancel_escrow::handler(ctx)
    }
}