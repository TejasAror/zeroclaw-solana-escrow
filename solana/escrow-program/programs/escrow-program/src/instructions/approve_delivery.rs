use anchor_lang::prelude::*;
use crate::{constants::*, error::EscrowError, events::DeliveryApproved, state::{Escrow, EscrowStatus}};

#[derive(Accounts)]
pub struct ApproveDelivery<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        has_one = buyer @ EscrowError::Unauthorized,
        constraint = escrow.status == EscrowStatus::Pending @ EscrowError::InvalidState,
    )]
    pub escrow: Account<'info, Escrow>,
}

pub fn handler(ctx: Context<ApproveDelivery>) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;
    let clock = Clock::get()?;

    // Check if escrow has expired
    if let Some(expires_at) = escrow.expires_at {
        require!(clock.unix_timestamp < expires_at, EscrowError::EscrowExpired);
    }

    escrow.status = EscrowStatus::Approved;

    emit!(DeliveryApproved {
        escrow: escrow.key(),
        buyer: escrow.buyer,
        seller: escrow.seller,
        amount: escrow.amount,
        timestamp: clock.unix_timestamp,
    });

    msg!("Delivery approved for escrow: {}", escrow.key());

    Ok(())
}