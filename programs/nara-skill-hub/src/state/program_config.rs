use anchor_lang::prelude::*;

/// Global program configuration. Single PDA, seeds = [b"config"].
/// Created once by the first caller of `init_config`; that caller becomes admin.
#[account]
pub struct ProgramConfig {
    /// Who may call update_admin / update_fee_recipient / update_register_fee.
    pub admin: Pubkey,
    /// PDA bump.
    pub bump: u8,
    /// SOL fee (in lamports) charged on every `register_skill`. 0 = free.
    pub register_fee: u64,
    /// Account that receives registration fees. Defaults to admin at init.
    pub fee_recipient: Pubkey,
}

impl ProgramConfig {
    /// discriminator (8) + admin (32) + bump (1) + register_fee (8) + fee_recipient (32)
    pub const SPACE: usize = 8 + 32 + 1 + 8 + 32;
}
