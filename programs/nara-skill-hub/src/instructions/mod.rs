pub mod close_buffer;
pub mod finalize_skill_new;
pub mod finalize_skill_update;
pub mod init_buffer;
pub mod register_skill;
pub mod set_description;
pub mod transfer_authority;
pub mod write_to_buffer;

// Re-export everything (context structs + instruction functions) so that
// lib.rs can use `use instructions::*;` and `Context<RegisterSkill>` etc.
// Function names are unique per module so there are no glob collisions.
pub use close_buffer::*;
pub use finalize_skill_new::*;
pub use finalize_skill_update::*;
pub use init_buffer::*;
pub use register_skill::*;
pub use set_description::*;
pub use transfer_authority::*;
pub use write_to_buffer::*;
