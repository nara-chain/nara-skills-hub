use anchor_lang::prelude::*;
use crate::state::{SkillRecord, ProgramConfig};
use crate::error::SkillHubError;
use crate::MIN_NAME_LEN;

#[derive(Accounts)]
#[instruction(name: String)]
pub struct RegisterSkill<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = SkillRecord::space(name.len()),
        seeds = [b"skill", name.as_bytes()],
        bump,
    )]
    pub skill: Account<'info, SkillRecord>,
    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, ProgramConfig>,
    /// CHECK: must equal config.fee_recipient; validated by constraint below.
    #[account(
        mut,
        constraint = fee_recipient.key() == config.fee_recipient @ SkillHubError::InvalidFeeRecipient,
    )]
    pub fee_recipient: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn register_skill(ctx: Context<RegisterSkill>, name: String) -> Result<()> {
    require!(name.len() >= MIN_NAME_LEN, SkillHubError::NameTooShort);

    let fee = ctx.accounts.config.register_fee;
    // Skip CPI when fee is zero or when authority == fee_recipient (no-op transfer).
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

    let skill = &mut ctx.accounts.skill;
    skill.authority = ctx.accounts.authority.key();
    skill.bump = ctx.bumps.skill;
    skill.name = name;
    skill.pending_buffer = None;
    skill.content = Pubkey::default();
    Ok(())
}
