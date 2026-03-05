use anchor_lang::prelude::*;

/// Global program configuration. Single PDA, seeds = [b"config"].
/// Created once by the first caller of `init_config`; that caller becomes admin.
#[account(zero_copy)]
#[repr(C)]
pub struct ProgramConfig {
    /// Who may call update_admin / update_fee_recipient / update_register_fee.
    pub admin: Pubkey,
    /// SOL fee (in lamports) charged on every `register_skill`. 0 = free.
    pub register_fee: u64,
    /// Account that receives registration fees. Defaults to admin at init.
    pub fee_recipient: Pubkey,
    pub _reserved: [u8; 64],
}

impl ProgramConfig {
    pub const SPACE: usize = 8 + std::mem::size_of::<Self>();
}
