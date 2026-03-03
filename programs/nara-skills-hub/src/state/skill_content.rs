use anchor_lang::prelude::*;

/// Client-created account (owner = program) that stores a skill's content.
/// Fixed header (40 bytes) followed immediately by raw content bytes.
///
/// The client calls `system_program::create_account` with
///   `space = SkillContent::required_size(content_len), owner = program_id`
/// then passes the account to `finalize_skill_new` / `finalize_skill_update`.
#[account]
pub struct SkillContent {
    /// The SkillRecord PDA this content belongs to.
    pub skill: Pubkey,
    // Raw content bytes follow at offset HEADER_SIZE (not declared as a Vec).
}

impl SkillContent {
    /// Discriminator (8) + skill (32).
    pub const HEADER_SIZE: usize = 8 + 32;

    pub fn required_size(content_len: usize) -> usize {
        Self::HEADER_SIZE + content_len
    }
}
