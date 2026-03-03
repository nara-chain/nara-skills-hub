use anchor_lang::prelude::*;
use crate::state::{SkillRecord, SkillBuffer};
use crate::error::SkillHubError;

#[derive(Accounts)]
#[instruction(name: String)]
pub struct WriteToBuffer<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"skill", name.as_bytes()],
        bump = skill.bump,
        has_one = authority @ SkillHubError::Unauthorized,
    )]
    pub skill: Account<'info, SkillRecord>,
    #[account(
        mut,
        constraint = Some(buffer.key()) == skill.pending_buffer @ SkillHubError::BufferMismatch,
    )]
    pub buffer: AccountLoader<'info, SkillBuffer>,
}

/// Write a data chunk into the buffer at the given `offset`.
///
/// `offset` MUST equal `buffer.write_offset` — enforces strictly sequential
/// writes. On a failed transaction the client reads `write_offset` from the
/// buffer account and resumes from that position (断点续传).
///
/// Each call should carry ≤800 bytes to stay within Solana's 1232-byte tx limit.
pub fn write_to_buffer(
    ctx: Context<WriteToBuffer>,
    _name: String,
    offset: u32,
    data: Vec<u8>,
) -> Result<()> {
    {
        let buf = ctx.accounts.buffer.load()?;
        require_keys_eq!(buf.authority, ctx.accounts.authority.key(), SkillHubError::Unauthorized);
        require!(offset == buf.write_offset, SkillHubError::OffsetMismatch);
        require!(
            offset as usize + data.len() <= buf.total_len as usize,
            SkillHubError::WriteOutOfBounds
        );
    } // Ref dropped

    // Write chunk into the raw data region (offset 80+ in the account).
    {
        let buf_info = ctx.accounts.buffer.to_account_info();
        let mut buf_data = buf_info.try_borrow_mut_data()?;
        let start = SkillBuffer::HEADER_SIZE + offset as usize;
        buf_data[start..start + data.len()].copy_from_slice(&data);
    } // RefMut released before advancing the cursor.

    // Advance write cursor.
    ctx.accounts.buffer.load_mut()?.write_offset += data.len() as u32;
    Ok(())
}
