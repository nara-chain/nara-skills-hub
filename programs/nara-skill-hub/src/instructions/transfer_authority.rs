use anchor_lang::prelude::*;
use crate::state::SkillRecord;
use crate::error::SkillHubError;

#[derive(Accounts)]
#[instruction(name: String)]
pub struct TransferAuthority<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"skill", name.as_bytes()],
        bump = skill.bump,
        has_one = authority @ SkillHubError::Unauthorized,
    )]
    pub skill: Account<'info, SkillRecord>,
}

pub fn transfer_authority(
    ctx: Context<TransferAuthority>,
    _name: String,
    new_authority: Pubkey,
) -> Result<()> {
    require!(
        ctx.accounts.skill.pending_buffer.is_none(),
        SkillHubError::HasPendingBuffer
    );
    ctx.accounts.skill.authority = new_authority;
    Ok(())
}
