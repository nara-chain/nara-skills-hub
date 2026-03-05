use anchor_lang::prelude::*;
use crate::state::{SkillRecord, SkillBuffer};
use crate::error::SkillHubError;

#[derive(Accounts)]
#[instruction(name: String)]
pub struct CloseBuffer<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"skill", name.as_bytes()],
        bump,
    )]
    pub skill: AccountLoader<'info, SkillRecord>,
    #[account(
        mut,
        close = authority,
    )]
    pub buffer: AccountLoader<'info, SkillBuffer>,
    pub system_program: Program<'info, System>,
}

pub fn close_buffer(ctx: Context<CloseBuffer>, _name: String) -> Result<()> {
    {
        let skill = ctx.accounts.skill.load()?;
        require_keys_eq!(skill.authority, ctx.accounts.authority.key(), SkillHubError::Unauthorized);
        require_keys_eq!(ctx.accounts.buffer.key(), skill.pending_buffer, SkillHubError::BufferMismatch);
    }
    require_keys_eq!(
        ctx.accounts.buffer.load()?.authority,
        ctx.accounts.authority.key(),
        SkillHubError::Unauthorized
    );
    ctx.accounts.skill.load_mut()?.pending_buffer = Pubkey::default();
    Ok(())
}
