use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_program as sol_system;
use crate::state::{SkillRecord, SkillBuffer, SkillContent};
use crate::error::SkillHubError;

#[derive(Accounts)]
#[instruction(name: String)]
pub struct FinalizeSkillUpdate<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"skill", name.as_bytes()],
        bump,
        has_one = authority @ SkillHubError::Unauthorized,
        constraint = skill.content != Pubkey::default() @ SkillHubError::ContentNotFound,
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
    #[account(
        mut,
        owner = crate::ID @ SkillHubError::InvalidContentOwner,
    )]
    pub new_content: UncheckedAccount<'info>,
    /// CHECK: existing SkillContent account to close. Must equal skill.content.
    #[account(
        mut,
        constraint = old_content.key() == skill.content @ SkillHubError::ContentMismatch,
    )]
    pub old_content: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

/// Finalise a buffer upload that **replaces existing content**.
///
/// 1. Validates buffer is fully written and skill already has content.
/// 2. Closes `old_content` (drain lamports → authority, zero data, reassign owner).
/// 3. Writes SkillContent header + content bytes into `new_content`.
/// 4. Sets `skill.content = new_content`, clears `pending_buffer`.
/// 5. `close = authority` returns buffer rent to authority after this handler.
pub fn finalize_skill_update(ctx: Context<FinalizeSkillUpdate>, _name: String) -> Result<()> {
    let total_len = {
        let buf = ctx.accounts.buffer.load()?;
        require_keys_eq!(buf.authority, ctx.accounts.authority.key(), SkillHubError::Unauthorized);
        require!(buf.write_offset == buf.total_len, SkillHubError::BufferIncomplete);
        buf.total_len as usize
    }; // Ref dropped

    require!(
        ctx.accounts.new_content.data_len() == SkillContent::required_size(total_len),
        SkillHubError::InvalidContentSize
    );

    let skill_key = ctx.accounts.skill.key();

    // Close old_content — mirrors Anchor's `close = authority` constraint.
    {
        let old_lamports = ctx.accounts.old_content.lamports();
        **ctx.accounts.old_content.try_borrow_mut_lamports()? = 0;
        **ctx.accounts.authority.try_borrow_mut_lamports()? += old_lamports;
        ctx.accounts.old_content.to_account_info().assign(&sol_system::ID);
        ctx.accounts.old_content.try_borrow_mut_data()?.fill(0);
    }

    // Write new_content header + content bytes.
    {
        let buf_info = ctx.accounts.buffer.to_account_info();
        let buf_data = buf_info.try_borrow_data()?;
        let slice = &buf_data[SkillBuffer::HEADER_SIZE..SkillBuffer::HEADER_SIZE + total_len];

        let mut nc = ctx.accounts.new_content.try_borrow_mut_data()?;
        nc[..8].copy_from_slice(&SkillContent::DISCRIMINATOR);
        nc[8..40].copy_from_slice(skill_key.as_ref());
        nc[40..40 + total_len].copy_from_slice(slice);
    }

    let skill = &mut ctx.accounts.skill;
    skill.content = ctx.accounts.new_content.key();
    skill.pending_buffer = None;
    skill.version += 1;
    skill.updated_at = Clock::get()?.unix_timestamp;
    Ok(())
}
