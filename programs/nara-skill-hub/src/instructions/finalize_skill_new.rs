use anchor_lang::prelude::*;
use crate::state::{SkillRecord, SkillBuffer, SkillContent};
use crate::error::SkillHubError;

#[derive(Accounts)]
#[instruction(name: String)]
pub struct FinalizeSkillNew<'info> {
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
    /// CHECK: pre-created by the client (owner = this program,
    /// space = SkillContent::required_size(total_len)).
    /// This instruction writes the discriminator + header + content bytes.
    #[account(
        mut,
        owner = crate::ID @ SkillHubError::InvalidContentOwner,
    )]
    pub new_content: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

/// Finalise a buffer upload for a skill that has **no existing content**.
///
/// 1. Validates buffer is fully written.
/// 2. Writes SkillContent header + content bytes into `new_content`.
/// 3. Sets `skill.content = new_content`, clears `pending_buffer`.
/// 4. `close = authority` returns buffer rent to authority after this handler.
pub fn finalize_skill_new(ctx: Context<FinalizeSkillNew>, _name: String) -> Result<()> {
    let total_len = {
        let buf = ctx.accounts.buffer.load()?;
        require_keys_eq!(buf.authority, ctx.accounts.authority.key(), SkillHubError::Unauthorized);
        require!(buf.write_offset == buf.total_len, SkillHubError::BufferIncomplete);
        buf.total_len as usize
    }; // Ref dropped

    require!(
        ctx.accounts.skill.content == Pubkey::default(),
        SkillHubError::ContentAlreadyExists
    );
    require!(
        ctx.accounts.new_content.data_len() == SkillContent::required_size(total_len),
        SkillHubError::InvalidContentSize
    );

    let skill_key = ctx.accounts.skill.key();
    let authority_key = *ctx.accounts.authority.key;

    // Copy buffer raw data → new_content (buffer is still intact; close = authority
    // runs in Anchor's exit handler after this function returns).
    {
        let buf_info = ctx.accounts.buffer.to_account_info();
        let buf_data = buf_info.try_borrow_data()?;
        let slice = &buf_data[SkillBuffer::HEADER_SIZE..SkillBuffer::HEADER_SIZE + total_len];

        let mut nc = ctx.accounts.new_content.try_borrow_mut_data()?;
        nc[..8].copy_from_slice(&SkillContent::DISCRIMINATOR);
        nc[8..40].copy_from_slice(authority_key.as_ref());
        nc[40..72].copy_from_slice(skill_key.as_ref());
        nc[72..72 + total_len].copy_from_slice(slice);
    }

    let skill = &mut ctx.accounts.skill;
    skill.content = ctx.accounts.new_content.key();
    skill.pending_buffer = None;
    Ok(())
}
