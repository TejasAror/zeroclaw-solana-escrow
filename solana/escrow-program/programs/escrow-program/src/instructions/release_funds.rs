use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Token, TokenAccount, transfer as token_transfer, Transfer as TokenTransfer},
};

use crate::{
    constants::*,
    error::EscrowError,
    events::FundsReleased,
    state::{Escrow, EscrowStatus},
};

#[derive(Accounts)]
pub struct ReleaseFunds<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: Seller receives funds
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,

    #[account(
        mut,
        has_one = buyer @ EscrowError::Unauthorized,
        has_one = seller @ EscrowError::Unauthorized,
        constraint = escrow.status == EscrowStatus::Approved @ EscrowError::InvalidState,
    )]
    pub escrow: Account<'info, Escrow>,

    /// Vault PDA holding SOL (for SOL escrows)
    /// CHECK: This is a PDA vault that holds SOL, validated by seeds constraint
    #[account(
        mut,
        seeds = [
            VAULT_SEED.as_bytes(),
            escrow.key().as_ref(),
        ],
        bump = escrow.vault_bump,
    )]
    pub vault: UncheckedAccount<'info>,

    /// Token vault for SPL tokens
    #[account(
        mut,
        seeds = [
            TOKEN_VAULT_SEED.as_bytes(),
            escrow.key().as_ref(),
        ],
        bump
    )]
    pub token_vault: Option<Account<'info, TokenAccount>>,

    /// Seller's token account (for SPL token escrows)
    #[account(
        mut,
    )]
    pub seller_token_account: Option<Account<'info, TokenAccount>>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(ctx: Context<ReleaseFunds>) -> Result<()> {
    let clock = Clock::get()?;

    // Extract all needed data from escrow before any mutable borrows
    let escrow_key = ctx.accounts.escrow.key();
    let amount = ctx.accounts.escrow.amount;
    let vault_bump = ctx.accounts.escrow.vault_bump;
    let is_sol = ctx.accounts.escrow.is_sol;
    let token_mint = ctx.accounts.escrow.token_mint;
    let buyer = ctx.accounts.escrow.buyer;
    let seller = ctx.accounts.escrow.seller;
    let expires_at = ctx.accounts.escrow.expires_at;

    // Check if escrow has expired
    if let Some(expires_at) = expires_at {
        require!(
            clock.unix_timestamp < expires_at,
            EscrowError::EscrowExpired
        );
    }

    // Get escrow account info for PDA signer
    let escrow_account_info = ctx.accounts.escrow.to_account_info();

    // Now get mutable reference to escrow
    let escrow = &mut ctx.accounts.escrow;

    if is_sol {
        // Transfer SOL from vault to seller
        **ctx.accounts.vault.try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.seller.try_borrow_mut_lamports()? += amount;

        emit!(FundsReleased {
            escrow: escrow_key,
            buyer,
            seller,
            amount,
            is_sol: true,
            token_mint: None,
            timestamp: clock.unix_timestamp,
        });
    } else {
        // Transfer SPL tokens from token vault to seller
        let token_vault = ctx.accounts.token_vault.as_ref().unwrap();
        let seller_token_account = ctx.accounts.seller_token_account.as_ref().unwrap();

        let seeds = &[VAULT_SEED.as_bytes(), escrow_key.as_ref(), &[vault_bump]];
        let signer = &[&seeds[..]];

        let cpi_accounts = TokenTransfer {
            from: token_vault.to_account_info(),
            to: seller_token_account.to_account_info(),
            authority: escrow_account_info,
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token_transfer(cpi_ctx, amount)?;

        emit!(FundsReleased {
            escrow: escrow_key,
            buyer,
            seller,
            amount,
            is_sol: false,
            token_mint,
            timestamp: clock.unix_timestamp,
        });
    }

    escrow.status = EscrowStatus::Released;

    msg!("Funds released for escrow: {}", escrow_key);
    msg!("Amount: {}", amount);
    msg!("Recipient: {}", seller);

    Ok(())
}