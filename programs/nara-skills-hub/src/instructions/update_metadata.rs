use anchor_lang::prelude::*;
use crate::state::{SkillRecord, SkillMetadata};
use crate::error::SkillHubError;

#[derive(Accounts)]
#[instruction(name: String)]
pub struct UpdateMetadata<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"skill", name.as_bytes()],
        bump,
        has_one = authority @ SkillHubError::Unauthorized,
    )]
    pub skill: Account<'info, SkillRecord>,
    #[account(
        init_if_needed,
        payer = authority,
        space = SkillMetadata::SPACE,
        seeds = [b"meta", skill.key().as_ref()],
        bump,
    )]
    pub metadata: Account<'info, SkillMetadata>,
    pub system_program: Program<'info, System>,
}

pub fn update_metadata(ctx: Context<UpdateMetadata>, _name: String, data: String) -> Result<()> {
    require!(
        data.len() <= SkillMetadata::MAX_DATA_LEN,
        SkillHubError::MetadataTooLong
    );
    ctx.accounts.metadata.data = data;
    Ok(())
}
