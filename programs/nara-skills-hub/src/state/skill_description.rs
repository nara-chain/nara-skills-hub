use anchor_lang::prelude::*;

/// PDA for a skill's short description, seeds = [b"desc", skill_record.key()].
/// Created / updated via `set_description`. Always allocated at fixed size.
#[account(zero_copy)]
#[repr(C)]
pub struct SkillDescription {
    /// Length of the description stored in the `description` array.
    pub description_len: u16,
    /// One-sentence description (max 512 bytes).
    pub description: [u8; 512],
    pub _reserved: [u8; 64],
}

impl SkillDescription {
    pub const MAX_DESC_LEN: usize = 512;
    pub const SPACE: usize = 8 + std::mem::size_of::<Self>();
}
