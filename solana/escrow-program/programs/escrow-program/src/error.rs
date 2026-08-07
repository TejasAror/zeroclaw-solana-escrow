use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("Escrow already settled")]
    EscrowAlreadySettled,

    #[msg("Unauthorized")]
    Unauthorized,

    #[msg("Invalid escrow state")]
    InvalidState,

    #[msg("Invalid amount")]
    InvalidAmount,

    #[msg("Invalid expiration time")]
    InvalidExpiration,

    #[msg("Escrow has expired")]
    EscrowExpired,

    #[msg("Invalid token mint")]
    InvalidTokenMint,

    #[msg("Insufficient balance")]
    InsufficientBalance,

    #[msg("Token account not initialized")]
    TokenAccountNotInitialized,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}