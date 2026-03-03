use anchor_lang::prelude::*;
use crate::state::*;
use crate::error::SkillHubError;
use crate::MAX_NAME_LEN;

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
    pub system_program: Program<'info, System>,
}

pub fn register_skill(ctx: Context<RegisterSkill>, name: String) -> Result<()> {
    require!(name.len() <= MAX_NAME_LEN, SkillHubError::NameTooLong);
    let skill = &mut ctx.accounts.skill;
    skill.authority = ctx.accounts.authority.key();
    skill.bump = ctx.bumps.skill;
    skill.name = name;
    skill.pending_buffer = None;
    skill.content = Pubkey::default();
    Ok(())
}
