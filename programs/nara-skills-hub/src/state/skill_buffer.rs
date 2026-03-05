use anchor_lang::prelude::*;

/// Client-created zero-copy account (owner = program) used for chunked uploads.
/// Fixed header followed by raw data bytes.
///
/// The client calls `system_program::create_account` with
///   `space = SkillBuffer::required_size(total_len), owner = program_id`
/// then calls `init_buffer`, which uses `load_init()` to write the header.
/// Subsequent `write_to_buffer` calls advance `write_offset` sequentially.
#[account(zero_copy)]
#[repr(C)]
pub struct SkillBuffer {
    /// Must match the SkillRecord's authority.
    pub authority: Pubkey,
    /// The SkillRecord PDA this buffer is uploading to.
    pub skill: Pubkey,
    /// Expected total number of data bytes.
    pub total_len: u32,
    /// Current write cursor. Each `write_to_buffer` call advances this.
    /// Client supplies the expected offset; contract rejects mismatches.
    pub write_offset: u32,
    pub _reserved: [u8; 64],
}

impl SkillBuffer {
    /// Discriminator (8) + struct fields.
    pub const HEADER_SIZE: usize = 8 + std::mem::size_of::<Self>();

    pub fn required_size(data_len: usize) -> usize {
        Self::HEADER_SIZE + data_len
    }
}
