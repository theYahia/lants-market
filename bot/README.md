# lANTS alerts — Telegram reminders for claimable rewards

A channel-only bot: it posts into a public Telegram channel, subscribers turn
on the bell. No commands, no storage of subscribers, no per-user data.

What it posts (rare, non-spammy):

1. **Weekly, on Thursday right after the epoch boundary** (09:54:21 UTC):
   staker rewards for the finished epoch are claimable (Claim / Restake),
   buyer rewards can be staked into a seller pool.
2. **When a rebate campaign opens**: claim your USDC on lants.eth.limo before
   the deadline (only for the canonical campaign of a published offer).
3. **48 hours before the rebate window closes**: last-chance reminder.

Everything is derived from the same sources the site uses: the epoch schedule
(`site/epochs.mjs`), the pinned claims config re-checked against Base, and the
published `offers.json` / `rebates/<epoch>-<pool>.*` files. No wallet, no keys
on-chain — public RPC reads only.

## Run

```bash
# selftests (no network)
npm run test:bot

# one tick without sending anything: decides + prints what it would post
TG_BOT_TOKEN=x TG_CHAT_ID=y npm run bot:dry

# one tick, live (external cron) or daemon (default, ticks every 10 min)
npm run bot:once
npm run bot
```

Environment:

| Variable | Meaning |
|---|---|
| `TG_BOT_TOKEN` | token from @BotFather (required) |
| `TG_CHAT_ID` | channel `@username` or `-100…` id (required) |
| `TG_API_URL` | override the API base (relay on RU boxes) |
| `RPC_URLS` | comma-separated Base RPCs (defaults: mainnet.base.org, blastapi) |
| `TICK_MS` | daemon tick interval (default 10 min) |
| `REBATE_INTERVAL_MS` | rebate watch throttle (default 6 h) |
| `STATE_FILE` | dedupe state path (default `bot/data/state.json`) |

## Deploy (sxsi.agency container)

1. Create the bot with @BotFather, get the token.
2. Create the public channel, add the bot as **admin** (it only needs to post).
3. Put the two values into `bot/.env` (gitignored):

   ```
   TG_BOT_TOKEN=123456:AA…
   TG_CHAT_ID=@lants_alerts
   ```

4. `cd bot && docker compose up -d --build`

The state file (`./data/state.json`) records what was already posted, so
restarts never repeat a message. On sxsi.agency Telegram is reachable
directly; no relay is needed. On the RU prod box (37.140.241.171) set
`TG_API_URL` to the Cloudflare relay.

## Files

| File | Role |
|---|---|
| `cron.mjs` | entrypoint: daemon loop, `--once`, `--dry-run` |
| `epoch-check.mjs` | weekly epoch reminder decision (pure) |
| `rebate-check.mjs` | rebate campaign watch (RPC + published files) |
| `telegram.mjs` | sendMessage with retries |
| `state.mjs` | dedupe state, atomic writes |
