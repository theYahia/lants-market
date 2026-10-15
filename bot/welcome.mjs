// The pinned welcome post: what this channel does and when. Static text,
// sent once and edited in place when it changes (state keeps its hash).

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
    'Claim everything on the site:',
    '',
    'https://lants.eth.limo'
  ].join('\n');
}
