use anchor_lang::prelude::*;
use crate::state::{SkillRecord, SkillDescription};
use crate::error::SkillHubError;

#[derive(Accounts)]
#[instruction(name: String)]
pub struct SetDescription<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"skill", name.as_bytes()],
        bump = skill.bump,
        has_one = authority @ SkillHubError::Unauthorized,
    )]
    pub skill: Account<'info, SkillRecord>,
    #[account(
        init_if_needed,
        payer = authority,
        space = SkillDescription::SPACE,
        seeds = [b"desc", skill.key().as_ref()],
        bump,
    )]
    pub description_account: Account<'info, SkillDescription>,
    pub system_program: Program<'info, System>,
}

pub fn set_description(
    ctx: Context<SetDescription>,
    _name: String,
    description: String,
) -> Result<()> {
    require!(
        description.len() <= SkillDescription::MAX_DESC_LEN,
        SkillHubError::DescriptionTooLong
    );
    let desc = &mut ctx.accounts.description_account;
    desc.bump = ctx.bumps.description_account;
    desc.description = description;
    Ok(())
}
