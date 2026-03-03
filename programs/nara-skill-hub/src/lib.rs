use anchor_lang::prelude::*;

declare_id!("54CFypri3UxCawUCLNvFebvpE1qWssKmVfk7RoKzLTkU");

pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;

pub const MAX_NAME_LEN: usize = 32;

#[program]
pub mod nara_skill_hub {
    use super::*;

    pub fn register_skill(ctx: Context<RegisterSkill>, name: String) -> Result<()> {
        instructions::register_skill::register_skill(ctx, name)
    }

    pub fn transfer_authority(
        ctx: Context<TransferAuthority>,
        name: String,
        new_authority: Pubkey,
    ) -> Result<()> {
        instructions::transfer_authority::transfer_authority(ctx, name, new_authority)
    }

    pub fn set_description(
        ctx: Context<SetDescription>,
        name: String,
        description: String,
    ) -> Result<()> {
        instructions::set_description::set_description(ctx, name, description)
    }

    pub fn init_buffer(ctx: Context<InitBuffer>, name: String, total_len: u32) -> Result<()> {
        instructions::init_buffer::init_buffer(ctx, name, total_len)
    }

    pub fn write_to_buffer(
        ctx: Context<WriteToBuffer>,
        name: String,
        offset: u32,
        data: Vec<u8>,
    ) -> Result<()> {
        instructions::write_to_buffer::write_to_buffer(ctx, name, offset, data)
    }

    pub fn finalize_skill_new(ctx: Context<FinalizeSkillNew>, name: String) -> Result<()> {
        instructions::finalize_skill_new::finalize_skill_new(ctx, name)
    }

    pub fn finalize_skill_update(ctx: Context<FinalizeSkillUpdate>, name: String) -> Result<()> {
        instructions::finalize_skill_update::finalize_skill_update(ctx, name)
    }

    pub fn close_buffer(ctx: Context<CloseBuffer>, name: String) -> Result<()> {
        instructions::close_buffer::close_buffer(ctx, name)
    }
}
