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
        bump = skill.bump,
        has_one = authority @ SkillHubError::Unauthorized,
    )]
    pub skill: Account<'info, SkillRecord>,
    #[account(
        mut,
        constraint = Some(buffer.key()) == skill.pending_buffer @ SkillHubError::BufferMismatch,
        close = authority,
    )]
    pub buffer: AccountLoader<'info, SkillBuffer>,
    pub system_program: Program<'info, System>,
}

/// Discard the active upload buffer without finalizing.
/// The buffer account is closed (rent returned to authority) and
/// `skill.pending_buffer` is cleared, allowing a fresh upload to begin.
pub fn close_buffer(ctx: Context<CloseBuffer>, _name: String) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.buffer.load()?.authority,
        ctx.accounts.authority.key(),
        SkillHubError::Unauthorized
    );
    ctx.accounts.skill.pending_buffer = None;
    Ok(())
}
