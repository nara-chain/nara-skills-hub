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
    )]
    pub skill: AccountLoader<'info, SkillRecord>,
    #[account(
        init_if_needed,
        payer = authority,
        space = SkillMetadata::SPACE,
        seeds = [b"meta", skill.key().as_ref()],
        bump,
    )]
    pub metadata: AccountLoader<'info, SkillMetadata>,
    pub system_program: Program<'info, System>,
}

pub fn update_metadata(ctx: Context<UpdateMetadata>, _name: String, data: String) -> Result<()> {
    {
        let skill = ctx.accounts.skill.load()?;
        require_keys_eq!(skill.authority, ctx.accounts.authority.key(), SkillHubError::Unauthorized);
    }

    require!(
        data.len() <= SkillMetadata::MAX_DATA_LEN,
        SkillHubError::MetadataTooLong
    );

    let is_new = {
        let info = ctx.accounts.metadata.to_account_info();
        let d = info.try_borrow_data()?;
        d[..8] == [0u8; 8]
    };

    if is_new {
        let mut meta = ctx.accounts.metadata.load_init()?;
        meta.data_len = data.len() as u16;
        meta.data[..data.len()].copy_from_slice(data.as_bytes());
    } else {
        let mut meta = ctx.accounts.metadata.load_mut()?;
        let old_len = meta.data_len as usize;
        meta.data[..old_len].fill(0);
        meta.data_len = data.len() as u16;
        meta.data[..data.len()].copy_from_slice(data.as_bytes());
    }
    Ok(())
}
