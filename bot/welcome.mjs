// The pinned welcome post: what this channel does, when, and where the full
// picture lives (the Incentives tab on the site). Static text, sent once.

export function welcomeText() {
  return [
    '👋 What this channel does',
    '',
    'This bot posts claim reminders for lANTS / AntSeed (Base):',
    '',
    '• Weekly, on Thursday after the epoch closes (09:54 UTC) — staker rewards for the finished epoch are claimable (Claim or Restake), buyer rewards can be staked into a seller pool.',
    '• When a rebate claim window opens — one post with the deadline.',
    '• 48h before a rebate window closes — one last-chance reminder.',
    '',
    '📊 Incentives',
    '',
    'The full picture of active offers is on the Incentives tab of the site: seller staking rewards, USDC rebate campaigns and other offers.',
    '',
    'https://lants.eth.limo/#incentives',
    '',
    'This bot only watches lANTS rewards and rebate windows; third-party offers live on the site.'
  ].join('\n');
}
