use anchor_lang::prelude::*;

/// PDA metadata account for a skill, seeds = [b"skill", name.as_bytes()].
/// Stores the authority, a pointer to the content account, and an optional
/// pending-buffer pointer. Created by the contract via `register_skill`.
#[account(zero_copy)]
#[repr(C)]
pub struct SkillRecord {
    /// Who may update this skill.
    pub authority: Pubkey,
    /// Current SkillContent account. Pubkey::default() = no content yet.
    pub content: Pubkey,
    /// Active upload buffer, if any. Pubkey::default() = no pending buffer.
    pub pending_buffer: Pubkey,
    /// Unix timestamp when the skill was first registered.
    pub created_at: i64,
    /// Unix timestamp of the last content update (0 = no content yet).
    pub updated_at: i64,
    /// Content version. 0 = no content yet, set to 1 on first upload,
    /// incremented by 1 on every subsequent update.
    pub version: u32,
    /// Length of the name stored in the `name` array.
    pub name_len: u16,
    /// Length of the author stored in the `author` array.
    pub author_len: u16,
    /// Globally unique name (min 5 bytes, max 32 bytes).
    pub name: [u8; 32],
    /// Display name of the skill author (max 64 bytes).
    pub author: [u8; 64],
    pub _reserved: [u8; 64],
}

impl SkillRecord {
    pub const MAX_NAME_LEN: usize = 32;
    pub const SPACE: usize = 8 + std::mem::size_of::<Self>();
}
