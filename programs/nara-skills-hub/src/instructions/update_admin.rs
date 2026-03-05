use anchor_lang::prelude::*;
use crate::state::ProgramConfig;
use crate::error::SkillHubError;

#[derive(Accounts)]
pub struct UpdateAdmin<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [b"config"],
        bump,
    )]
    pub config: AccountLoader<'info, ProgramConfig>,
}

pub fn update_admin(ctx: Context<UpdateAdmin>, new_admin: Pubkey) -> Result<()> {
    let mut config = ctx.accounts.config.load_mut()?;
    require_keys_eq!(config.admin, ctx.accounts.admin.key(), SkillHubError::Unauthorized);
    config.admin = new_admin;
    Ok(())
}
