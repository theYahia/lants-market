# Weekly epoch recap — template

Post every Thursday after 09:54 UTC. Fill every `{…}` from the probes, nothing from memory:

```bash
node scripts/probes/net-state.cjs          # positions, locked, weights
node scripts/probes/seller-rank.cjs <N-1>  # sales of the epoch that just ended
node scripts/probes/staker-rewards.cjs     # staker rewards per position
```

---

Epoch {N-1} on @antseed, in numbers #buildinpublic

• lANTS positions: {positions} (+{new} this week)
• ANTS locked: {locked}
• transfers between wallets: {transfers}
• top pools by weight: {pool1} {share1}%, {pool2} {share2}%, {pool3} {share3}%
• recognized sales: ${sales} across {sellers} sellers

Our position #27: staker reward {staker_reward} ANTS, buyer reward {buyer_reward} ANTS, both restaked.

Building lants-market: {one line on what shipped this week, which free model wrote it}.
