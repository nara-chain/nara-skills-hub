pub mod close_buffer;
pub mod delete_skill;
pub mod finalize_skill_new;
pub mod finalize_skill_update;
pub mod init_buffer;
pub mod init_config;
pub mod register_skill;
pub mod set_description;
pub mod transfer_authority;
pub mod update_admin;
pub mod update_fee_recipient;
pub mod update_metadata;
pub mod update_register_fee;
pub mod write_to_buffer;

// Re-export everything (context structs + instruction functions) so that
// lib.rs can use `use instructions::*;` and `Context<RegisterSkill>` etc.
// Function names are unique per module so there are no glob collisions.
pub use close_buffer::*;
pub use delete_skill::*;
pub use finalize_skill_new::*;
pub use finalize_skill_update::*;
pub use init_buffer::*;
pub use init_config::*;
pub use register_skill::*;
pub use set_description::*;
pub use transfer_authority::*;
pub use update_admin::*;
pub use update_fee_recipient::*;
pub use update_metadata::*;
pub use update_register_fee::*;
pub use write_to_buffer::*;

use anchor_lang::prelude::AccountInfo;

pub(crate) fn close_raw_account<'info>(account: &AccountInfo<'info>, destination: &AccountInfo<'info>) -> anchor_lang::Result<()> {
    use anchor_lang::solana_program::system_program as sol_system;
    let lamports = account.lamports();
    **account.try_borrow_mut_lamports()? = 0;
    **destination.try_borrow_mut_lamports()? += lamports;
    account.assign(&sol_system::ID);
    account.try_borrow_mut_data()?.fill(0);
    Ok(())
}
