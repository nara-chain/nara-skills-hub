use anchor_lang::prelude::*;
use crate::state::ProgramConfig;
use crate::DEFAULT_REGISTER_FEE;

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = ProgramConfig::SPACE,
        seeds = [b"config"],
        bump,
    )]
    pub config: AccountLoader<'info, ProgramConfig>,
    pub system_program: Program<'info, System>,
}

pub fn init_config(ctx: Context<InitConfig>) -> Result<()> {
    let (vault_pda, _) = Pubkey::find_program_address(&[b"fee_vault"], ctx.program_id);
    let mut config = ctx.accounts.config.load_init()?;
    config.admin = ctx.accounts.admin.key();
    config.register_fee = DEFAULT_REGISTER_FEE;
    config.fee_vault = vault_pda;
    Ok(())
}
