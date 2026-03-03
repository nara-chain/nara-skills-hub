use anchor_lang::prelude::*;
use crate::state::{SkillRecord, SkillBuffer};
use crate::error::SkillHubError;

#[derive(Accounts)]
#[instruction(name: String)]
pub struct InitBuffer<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"skill", name.as_bytes()],
        bump,
        has_one = authority @ SkillHubError::Unauthorized,
    )]
    pub skill: Account<'info, SkillRecord>,
    /// Pre-created by the client (owner = this program, data all zeros).
    /// load_init() writes the discriminator + header fields.
    #[account(zero)]
    pub buffer: AccountLoader<'info, SkillBuffer>,
}

pub fn init_buffer(ctx: Context<InitBuffer>, _name: String, total_len: u32) -> Result<()> {
    require!(
        ctx.accounts.skill.pending_buffer.is_none(),
        SkillHubError::PendingBufferExists
    );
    require!(
        ctx.accounts.buffer.to_account_info().data_len()
            == SkillBuffer::required_size(total_len as usize),
        SkillHubError::InvalidBufferSize
    );

    {
        let mut buf = ctx.accounts.buffer.load_init()?;
        buf.authority = ctx.accounts.authority.key();
        buf.skill = ctx.accounts.skill.key();
        buf.total_len = total_len;
        buf.write_offset = 0;
    }

    ctx.accounts.skill.pending_buffer = Some(ctx.accounts.buffer.key());
    Ok(())
}
