use anchor_lang::prelude::*;

/// PDA for a skill's custom JSON metadata, seeds = [b"meta", skill_record.key()].
/// Created lazily on first `update_metadata` call.
/// Always allocated at fixed size.
#[account(zero_copy)]
#[repr(C)]
pub struct SkillMetadata {
    /// Length of the data stored in the `data` array.
    pub data_len: u16,
    /// Arbitrary JSON string (max 800 bytes).
    pub data: [u8; 800],
    pub _reserved: [u8; 64],
}

impl SkillMetadata {
    pub const MAX_DATA_LEN: usize = 800;
    pub const SPACE: usize = 8 + std::mem::size_of::<Self>();
}
