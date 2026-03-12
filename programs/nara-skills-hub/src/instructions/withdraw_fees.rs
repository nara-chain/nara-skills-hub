use anchor_lang::prelude::*;
use crate::state::ProgramConfig;
use crate::error::SkillHubError;

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        seeds = [b"config"],
        bump,
    )]
    pub config: AccountLoader<'info, ProgramConfig>,
    /// CHECK: vault PDA that holds collected fees.
    #[account(
        mut,
        seeds = [b"fee_vault"],
        bump,
    )]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn withdraw_fees(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
    let config = ctx.accounts.config.load()?;
    require_keys_eq!(config.admin, ctx.accounts.admin.key(), SkillHubError::Unauthorized);

    require!(amount > 0, SkillHubError::InsufficientVaultBalance);
    require!(
        amount <= ctx.accounts.vault.lamports(),
        SkillHubError::InsufficientVaultBalance
    );

    let bump = ctx.bumps.vault;
    anchor_lang::system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.admin.to_account_info(),
            },
            &[&[b"fee_vault", &[bump]]],
        ),
        amount,
    )?;

    Ok(())
}
