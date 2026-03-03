use anchor_lang::prelude::*;

/// PDA metadata account for a skill, seeds = [b"skill", name.as_bytes()].
/// Stores the authority, a pointer to the content account, and an optional
/// pending-buffer pointer. Created by the contract via `register_skill`.
#[account]
pub struct SkillRecord {
    /// Who may update this skill.
    pub authority: Pubkey,
    /// Globally unique name (min 5 bytes, max 32 bytes enforced by Solana PDA seed limit).
    pub name: String,
    /// Display name of the skill author (max 64 bytes, set freely by the authority).
    pub author: String,
    /// Active upload buffer, if any. Must be closed before starting a new one.
    pub pending_buffer: Option<Pubkey>,
    /// Current SkillContent account. Pubkey::default() = no content yet.
    pub content: Pubkey,
    /// Content version. 0 = no content yet, set to 1 on first upload,
    /// incremented by 1 on every subsequent update.
    pub version: u32,
    /// Unix timestamp when the skill was first registered.
    pub created_at: i64,
    /// Unix timestamp of the last content update (0 = no content yet).
    pub updated_at: i64,
}

impl SkillRecord {
    /// Byte size for `init` space calculation (allocates exactly what the name/author need).
    pub fn space(name_len: usize, author_len: usize) -> usize {
        8               // discriminator
        + 32            // authority
        + 4 + name_len  // name (String: u32 prefix + bytes)
        + 4 + author_len // author
        + 1 + 32        // Option<Pubkey>
        + 32            // content
        + 4             // version
        + 8             // created_at
        + 8             // updated_at
    }
}
