use anchor_lang::prelude::*;

/// PDA metadata account for a skill, seeds = [b"skill", name.as_bytes()].
/// Stores the authority, a pointer to the content account, and an optional
/// pending-buffer pointer. Created by the contract via `register_skill`.
#[account]
pub struct SkillRecord {
    /// Who may update this skill.
    pub authority: Pubkey,
    /// PDA bump stored for efficient re-validation.
    pub bump: u8,
    /// Globally unique name (min 4 bytes, max 32 bytes enforced by Solana PDA seed limit).
    pub name: String,
    /// Active upload buffer, if any. Must be closed before starting a new one.
    pub pending_buffer: Option<Pubkey>,
    /// Current SkillContent account. Pubkey::default() = no content yet.
    pub content: Pubkey,
}

impl SkillRecord {
    /// Byte size for `init` space calculation (allocates exactly what the name needs).
    pub fn space(name_len: usize) -> usize {
        8           // discriminator
        + 32        // authority
        + 1         // bump
        + 4 + name_len  // name (String: u32 prefix + bytes)
        + 1 + 32    // Option<Pubkey>
        + 32        // content
    }
}
