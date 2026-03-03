use anchor_lang::prelude::*;

#[error_code]
pub enum SkillHubError {
    #[msg("Name too short: min 5 bytes")]
    NameTooShort,
    #[msg("Description too long: max 512 bytes")]
    DescriptionTooLong,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Buffer write offset mismatch: writes must be sequential")]
    OffsetMismatch,
    #[msg("Write out of bounds")]
    WriteOutOfBounds,
    #[msg("Buffer not fully written")]
    BufferIncomplete,
    #[msg("A pending buffer already exists; call close_buffer first")]
    PendingBufferExists,
    #[msg("Buffer account size does not match total_len")]
    InvalidBufferSize,
    #[msg("Buffer account must be owned by this program")]
    InvalidBufferOwner,
    #[msg("Buffer account does not match skill.pending_buffer")]
    BufferMismatch,
    #[msg("Content account must be owned by this program")]
    InvalidContentOwner,
    #[msg("Content account size does not match buffer total_len")]
    InvalidContentSize,
    #[msg("old_content account does not match skill.content")]
    ContentMismatch,
    #[msg("Skill already has content; use finalize_skill_update instead")]
    ContentAlreadyExists,
    #[msg("Skill has no existing content; use finalize_skill_new instead")]
    ContentNotFound,
    #[msg("Cannot perform this operation while a pending buffer exists")]
    HasPendingBuffer,
    #[msg("Fee recipient does not match config.fee_recipient")]
    InvalidFeeRecipient,
    #[msg("Author name too long: max 64 bytes")]
    AuthorTooLong,
    #[msg("Metadata too long: max 800 bytes")]
    MetadataTooLong,
}
