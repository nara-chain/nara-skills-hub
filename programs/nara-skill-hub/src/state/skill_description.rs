use anchor_lang::prelude::*;

/// PDA for a skill's short description, seeds = [b"desc", skill_record.key()].
/// Created / updated via `set_description`. Always allocated at MAX space to
/// avoid realloc on subsequent updates.
#[account]
pub struct SkillDescription {
    /// PDA bump.
    pub bump: u8,
    /// One-sentence description (max 512 bytes).
    pub description: String,
}

impl SkillDescription {
    pub const MAX_DESC_LEN: usize = 512;
    /// Fixed allocation: always use max space so updates never need realloc.
    pub const SPACE: usize = 8 + 1 + 4 + Self::MAX_DESC_LEN;
}
