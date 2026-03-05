use anchor_lang::prelude::*;

/// Client-created account (owner = program) that stores a skill's content.
/// Fixed header followed immediately by raw content bytes.
///
/// The client calls `system_program::create_account` with
///   `space = SkillContent::required_size(content_len), owner = program_id`
/// then passes the account to `finalize_skill_new` / `finalize_skill_update`.
#[account(zero_copy)]
#[repr(C)]
pub struct SkillContent {
    /// The SkillRecord PDA this content belongs to.
    pub skill: Pubkey,
    pub _reserved: [u8; 64],
}

impl SkillContent {
    /// Discriminator (8) + struct fields.
    pub const HEADER_SIZE: usize = 8 + std::mem::size_of::<Self>();

    pub fn required_size(content_len: usize) -> usize {
        Self::HEADER_SIZE + content_len
    }
}
