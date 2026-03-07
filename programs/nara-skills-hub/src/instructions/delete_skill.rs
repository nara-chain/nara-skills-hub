use anchor_lang::prelude::*;
use crate::state::SkillRecord;
use crate::error::SkillHubError;

#[derive(Accounts)]
#[instruction(name: String)]
pub struct DeleteSkill<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    /// SkillRecord PDA — closed by Anchor after the handler returns.
    #[account(
        mut,
        seeds = [b"skill", name.as_bytes()],
        bump,
        close = authority,
    )]
    pub skill: AccountLoader<'info, SkillRecord>,
    /// CHECK: SkillDescription PDA (seeds = [b"desc", skill]).
    ///        Closed inside the handler if it has been created.
    #[account(
        mut,
        seeds = [b"desc", skill.key().as_ref()],
        bump,
    )]
    pub description: UncheckedAccount<'info>,
    /// CHECK: SkillMetadata PDA (seeds = [b"meta", skill]).
    ///        Closed inside the handler if it has been created.
    #[account(
        mut,
        seeds = [b"meta", skill.key().as_ref()],
        bump,
    )]
    pub metadata: UncheckedAccount<'info>,
    /// CHECK: SkillContent account. Must equal skill.content when skill has content.
    ///        Pass any account (e.g. authority) when skill has no content.
    #[account(mut)]
    pub content_account: UncheckedAccount<'info>,
}

pub fn delete_skill(ctx: Context<DeleteSkill>, _name: String) -> Result<()> {
    let (content_key, has_content, has_pending) = {
        let skill = ctx.accounts.skill.load()?;
        require_keys_eq!(skill.authority, ctx.accounts.authority.key(), SkillHubError::Unauthorized);
        (
            skill.content,
            skill.content != Pubkey::default(),
            skill.pending_buffer != Pubkey::default(),
        )
    };

    require!(!has_pending, SkillHubError::HasPendingBuffer);

    if has_content {
        require_keys_eq!(
            ctx.accounts.content_account.key(),
            content_key,
            SkillHubError::ContentMismatch
        );
        super::close_raw_account(
            &ctx.accounts.content_account.to_account_info(),
            &ctx.accounts.authority.to_account_info(),
        )?;
    }

    if ctx.accounts.description.lamports() > 0 {
        super::close_raw_account(
            &ctx.accounts.description.to_account_info(),
            &ctx.accounts.authority.to_account_info(),
        )?;
    }

    if ctx.accounts.metadata.lamports() > 0 {
        super::close_raw_account(
            &ctx.accounts.metadata.to_account_info(),
            &ctx.accounts.authority.to_account_info(),
        )?;
    }

    Ok(())
}
