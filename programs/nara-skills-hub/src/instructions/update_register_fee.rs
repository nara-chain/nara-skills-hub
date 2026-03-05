use anchor_lang::prelude::*;
use crate::state::ProgramConfig;
use crate::error::SkillHubError;

#[derive(Accounts)]
pub struct UpdateRegisterFee<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [b"config"],
        bump,
    )]
    pub config: AccountLoader<'info, ProgramConfig>,
}

pub fn update_register_fee(ctx: Context<UpdateRegisterFee>, new_fee: u64) -> Result<()> {
    let mut config = ctx.accounts.config.load_mut()?;
    require_keys_eq!(config.admin, ctx.accounts.admin.key(), SkillHubError::Unauthorized);
    config.register_fee = new_fee;
    Ok(())
}
