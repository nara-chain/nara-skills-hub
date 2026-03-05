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
        bump,
    )]
    pub skill: AccountLoader<'info, SkillRecord>,
}

pub fn transfer_authority(
    ctx: Context<TransferAuthority>,
    _name: String,
    new_authority: Pubkey,
) -> Result<()> {
    let mut skill = ctx.accounts.skill.load_mut()?;
    require_keys_eq!(skill.authority, ctx.accounts.authority.key(), SkillHubError::Unauthorized);
    require!(
        skill.pending_buffer == Pubkey::default(),
        SkillHubError::HasPendingBuffer
    );
    skill.authority = new_authority;
    Ok(())
}
