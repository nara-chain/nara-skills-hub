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
        bump,
    )]
    pub skill: AccountLoader<'info, SkillRecord>,
    #[account(
        init_if_needed,
        payer = authority,
        space = SkillDescription::SPACE,
        seeds = [b"desc", skill.key().as_ref()],
        bump,
    )]
    pub description_account: AccountLoader<'info, SkillDescription>,
    pub system_program: Program<'info, System>,
}

pub fn set_description(
    ctx: Context<SetDescription>,
    _name: String,
    description: String,
) -> Result<()> {
    {
        let skill = ctx.accounts.skill.load()?;
        require_keys_eq!(skill.authority, ctx.accounts.authority.key(), SkillHubError::Unauthorized);
    }

    require!(
        description.len() <= SkillDescription::MAX_DESC_LEN,
        SkillHubError::DescriptionTooLong
    );

    let is_new = {
        let data = ctx.accounts.description_account.to_account_info();
        let d = data.try_borrow_data()?;
        d[..8] == [0u8; 8]
    };

    if is_new {
        let mut desc = ctx.accounts.description_account.load_init()?;
        desc.description_len = description.len() as u16;
        desc.description[..description.len()].copy_from_slice(description.as_bytes());
    } else {
        let mut desc = ctx.accounts.description_account.load_mut()?;
        let old_len = desc.description_len as usize;
        desc.description[..old_len].fill(0);
        desc.description_len = description.len() as u16;
        desc.description[..description.len()].copy_from_slice(description.as_bytes());
    }
    Ok(())
}
