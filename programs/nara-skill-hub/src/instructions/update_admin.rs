use anchor_lang::prelude::*;
use crate::state::ProgramConfig;
use crate::error::SkillHubError;

#[derive(Accounts)]
pub struct UpdateAdmin<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = admin @ SkillHubError::Unauthorized,
    )]
    pub config: Account<'info, ProgramConfig>,
}

pub fn update_admin(ctx: Context<UpdateAdmin>, new_admin: Pubkey) -> Result<()> {
    ctx.accounts.config.admin = new_admin;
    Ok(())
}
