use anchor_lang::prelude::*;

declare_id!("54CFypri3UxCawUCLNvFebvpE1qWssKmVfk7RoKzLTkU");
// declare_id!("SkiLLHub11111111111111111111111111111111111");

pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;

pub const MIN_NAME_LEN: usize = 5;
pub const MAX_AUTHOR_LEN: usize = 64;
pub const DEFAULT_REGISTER_FEE: u64 = 1_000_000_000; // 1 NARA in lamports

#[program]
pub mod nara_skills_hub {
    use super::*;

    pub fn init_config(ctx: Context<InitConfig>) -> Result<()> {
        instructions::init_config::init_config(ctx)
    }

    pub fn update_admin(ctx: Context<UpdateAdmin>, new_admin: Pubkey) -> Result<()> {
        instructions::update_admin::update_admin(ctx, new_admin)
    }

    pub fn update_fee_recipient(ctx: Context<UpdateFeeRecipient>, new_recipient: Pubkey) -> Result<()> {
        instructions::update_fee_recipient::update_fee_recipient(ctx, new_recipient)
    }

    pub fn update_register_fee(ctx: Context<UpdateRegisterFee>, new_fee: u64) -> Result<()> {
        instructions::update_register_fee::update_register_fee(ctx, new_fee)
    }

    pub fn register_skill(ctx: Context<RegisterSkill>, name: String, author: String) -> Result<()> {
        instructions::register_skill::register_skill(ctx, name, author)
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

    pub fn update_metadata(ctx: Context<UpdateMetadata>, name: String, data: String) -> Result<()> {
        instructions::update_metadata::update_metadata(ctx, name, data)
    }

    pub fn delete_skill(ctx: Context<DeleteSkill>, name: String) -> Result<()> {
        instructions::delete_skill::delete_skill(ctx, name)
    }
}
