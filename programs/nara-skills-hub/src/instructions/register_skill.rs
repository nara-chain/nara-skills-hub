use anchor_lang::prelude::*;
use crate::state::{SkillRecord, ProgramConfig};
use crate::error::SkillHubError;
use crate::{MIN_NAME_LEN, MAX_AUTHOR_LEN};

#[derive(Accounts)]
#[instruction(name: String)]
pub struct RegisterSkill<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = SkillRecord::SPACE,
        seeds = [b"skill", name.as_bytes()],
        bump,
    )]
    pub skill: AccountLoader<'info, SkillRecord>,
    #[account(
        seeds = [b"config"],
        bump,
    )]
    pub config: AccountLoader<'info, ProgramConfig>,
    /// CHECK: must equal config.fee_recipient; validated in handler.
    #[account(mut)]
    pub fee_recipient: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn register_skill(ctx: Context<RegisterSkill>, name: String, author: String) -> Result<()> {
    require!(name.len() >= MIN_NAME_LEN, SkillHubError::NameTooShort);
    require!(name.len() <= SkillRecord::MAX_NAME_LEN, SkillHubError::NameTooLong);
    require!(author.len() <= MAX_AUTHOR_LEN, SkillHubError::AuthorTooLong);

    let (fee, expected_recipient) = {
        let config = ctx.accounts.config.load()?;
        (config.register_fee, config.fee_recipient)
    };
    require_keys_eq!(
        ctx.accounts.fee_recipient.key(),
        expected_recipient,
        SkillHubError::InvalidFeeRecipient
    );

    if fee > 0 && ctx.accounts.fee_recipient.key() != ctx.accounts.authority.key() {
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.authority.to_account_info(),
                    to: ctx.accounts.fee_recipient.to_account_info(),
                },
            ),
            fee,
        )?;
    }

    let now = Clock::get()?.unix_timestamp;
    let mut skill = ctx.accounts.skill.load_init()?;
    skill.authority = ctx.accounts.authority.key();
    skill.name_len = name.len() as u16;
    skill.name[..name.len()].copy_from_slice(name.as_bytes());
    skill.author_len = author.len() as u16;
    skill.author[..author.len()].copy_from_slice(author.as_bytes());
    skill.pending_buffer = Pubkey::default();
    skill.content = Pubkey::default();
    skill.version = 0;
    skill.created_at = now;
    skill.updated_at = 0;
    Ok(())
}
