use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount, transfer as token_transfer, Transfer as TokenTransfer, initialize_account, InitializeAccount},
};

use crate::{
    constants::*,
    error::EscrowError,
    events::EscrowInitialized,
    state::{Escrow, EscrowStatus},
};

#[derive(Accounts)]
#[instruction(amount: u64, agreement_hash: [u8; 32], expires_at: Option<i64>, token_mint: Option<Pubkey>)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: Seller can be any wallet
    pub seller: UncheckedAccount<'info>,

    #[account(
        init,
        payer = buyer,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [
            ESCROW_SEED.as_bytes(),
            buyer.key().as_ref(),
        ],
        bump
    )]
    pub escrow: Account<'info, Escrow>,

    /// Vault PDA for SOL deposits (created when SOL is deposited)
    /// CHECK: This is a PDA vault that holds SOL, validated by seeds constraint
    #[account(
        init_if_needed,
        payer = buyer,
        space = 0,
        seeds = [
            VAULT_SEED.as_bytes(),
            escrow.key().as_ref(),
        ],
        bump
    )]
    pub vault: UncheckedAccount<'info>,

    /// Token vault for SPL tokens (created when token is deposited)
    /// Uses a PDA derived from escrow key so it works for both SOL and SPL escrows
    /// CHECK: This is a PDA system account initialized via CPI to token program
    #[account(
        init,
        payer = buyer,
        space = 165, // TokenAccount size: 165 bytes
        seeds = [
            TOKEN_VAULT_SEED.as_bytes(),
            escrow.key().as_ref(),
        ],
        bump
    )]
    pub token_vault: UncheckedAccount<'info>,

    /// SPL Token mint (None for SOL escrow)
    #[account(mint::token_program = token_program)]
    pub token_mint: Option<Account<'info, Mint>>,

    /// Buyer's token account (required for SPL token deposits)
    #[account(mut)]
    pub buyer_token_account: Option<Account<'info, TokenAccount>>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(
    ctx: Context<Initialize>,
    amount: u64,
    agreement_hash: [u8; 32],
    expires_at: Option<i64>,
    token_mint: Option<Pubkey>,
) -> Result<()> {
    require!(
        amount >= MIN_ESCROW_AMOUNT && amount <= MAX_ESCROW_AMOUNT,
        EscrowError::InvalidAmount
    );

    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;

    if let Some(expires_at) = expires_at {
        require!(
            expires_at - current_time >= MIN_ESCROW_DURATION_SECONDS
                && expires_at - current_time <= MAX_ESCROW_DURATION_SECONDS,
            EscrowError::InvalidExpiration
        );
    }

    let is_sol = token_mint.is_none();

    // Extract escrow key and bump before mutable borrow
    let escrow_key = ctx.accounts.escrow.key();
    let escrow_bump = ctx.bumps.escrow;
    let vault_bump = ctx.bumps.vault;
    let token_vault_bump = ctx.bumps.token_vault;

    // Get escrow account info for PDA signer (before mutable borrow)
    let escrow_account_info = ctx.accounts.escrow.to_account_info();

    let escrow = &mut ctx.accounts.escrow;
    escrow.buyer = ctx.accounts.buyer.key();
    escrow.seller = ctx.accounts.seller.key();
    escrow.amount = amount;
    escrow.agreement_hash = agreement_hash;
    escrow.status = EscrowStatus::Pending;
    escrow.is_sol = is_sol;
    escrow.token_mint = token_mint;
    escrow.expires_at = expires_at;
    escrow.bump = escrow_bump;
    escrow.vault_bump = vault_bump;

    // Deposit funds
    if is_sol {
        // Transfer SOL to vault PDA
        let transfer_instruction = anchor_lang::system_program::Transfer {
            from: ctx.accounts.buyer.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
        };
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                transfer_instruction,
            ),
            amount,
        )?;

        emit!(EscrowInitialized {
            escrow: escrow_key,
            buyer: escrow.buyer,
            seller: escrow.seller,
            amount: escrow.amount,
            is_sol: true,
            token_mint: None,
            expires_at: escrow.expires_at,
            timestamp: current_time,
        });
    } else {
        // Transfer SPL tokens to token vault (already initialized by Anchor)
        let buyer_token_account = ctx.accounts.buyer_token_account.as_ref().unwrap();
        let token_vault = &ctx.accounts.token_vault;

        let cpi_accounts = TokenTransfer {
            from: buyer_token_account.to_account_info(),
            to: token_vault.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token_transfer(cpi_ctx, amount)?;

        emit!(EscrowInitialized {
            escrow: escrow_key,
            buyer: escrow.buyer,
            seller: escrow.seller,
            amount: escrow.amount,
            is_sol: false,
            token_mint: token_mint,
            expires_at: escrow.expires_at,
            timestamp: current_time,
        });
    }

    msg!("Escrow initialized: {}", escrow_key);
    msg!("Buyer: {}", escrow.buyer);
    msg!("Seller: {}", escrow.seller);
    msg!("Amount: {}", escrow.amount);
    msg!("Token: {}", if is_sol { "SOL" } else { "SPL Token" });

    Ok(())
}