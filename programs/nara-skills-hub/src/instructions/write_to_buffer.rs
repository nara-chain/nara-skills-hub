use anchor_lang::prelude::*;
use crate::state::{SkillRecord, SkillBuffer};
use crate::error::SkillHubError;

#[derive(Accounts)]
#[instruction(name: String)]
pub struct WriteToBuffer<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"skill", name.as_bytes()],
        bump,
    )]
    pub skill: AccountLoader<'info, SkillRecord>,
    #[account(mut)]
    pub buffer: AccountLoader<'info, SkillBuffer>,
}

pub fn write_to_buffer(
    ctx: Context<WriteToBuffer>,
    _name: String,
    offset: u32,
    data: Vec<u8>,
) -> Result<()> {
    {
        let skill = ctx.accounts.skill.load()?;
        require_keys_eq!(skill.authority, ctx.accounts.authority.key(), SkillHubError::Unauthorized);
        require_keys_eq!(ctx.accounts.buffer.key(), skill.pending_buffer, SkillHubError::BufferMismatch);
    }

    {
        let buf = ctx.accounts.buffer.load()?;
        require_keys_eq!(buf.authority, ctx.accounts.authority.key(), SkillHubError::Unauthorized);
        require!(offset == buf.write_offset, SkillHubError::OffsetMismatch);
        require!(
            offset as usize + data.len() <= buf.total_len as usize,
            SkillHubError::WriteOutOfBounds
        );
    }

    {
        let buf_info = ctx.accounts.buffer.to_account_info();
        let mut buf_data = buf_info.try_borrow_mut_data()?;
        let start = SkillBuffer::HEADER_SIZE + offset as usize;
        buf_data[start..start + data.len()].copy_from_slice(&data);
    }

    ctx.accounts.buffer.load_mut()?.write_offset += data.len() as u32;
    Ok(())
}
