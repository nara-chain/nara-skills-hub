use anchor_lang::prelude::*;

/// PDA for a skill's custom JSON metadata, seeds = [b"meta", skill_record.key()].
/// Created lazily on first `update_metadata` call; defaults to `{}`.
/// Always allocated at MAX space so updates never need realloc.
#[account]
pub struct SkillMetadata {
    /// Arbitrary JSON string (max 800 bytes).
    pub data: String,
}

impl SkillMetadata {
    /// Solana transactions are capped at 1232 bytes; with account keys, blockhash,
    /// and instruction header overhead (~200 bytes) plus discriminator/name args (~24 bytes),
    /// ~800 bytes of data fits comfortably within a single transaction.
    pub const MAX_DATA_LEN: usize = 800;
    /// Fixed allocation: discriminator + String (u32 prefix + max bytes).
    pub const SPACE: usize = 8 + 4 + Self::MAX_DATA_LEN;
}
