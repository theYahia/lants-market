# lANTS alerts — Telegram reminders for claimable rewards

A Telegram bot with two halves: it posts reminders into a public channel
(subscribers turn on the bell), and it answers DM commands plus personal alerts
to anyone who `/start`s it. The DM layer stores only `chat_id` -> preferences:
no wallet addresses, no usernames.

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

## DM commands

Anyone who sends `/start` gets personal alerts in DM. Commands:

| Command | Reply |
|---|---|
| `/start` | subscribe + welcome |
| `/help` | command list |
| `/floor` | floor ask, 24h avg, listed count, epoch |
| `/epoch` | current epoch, time left, restake bonus |
| `/setfloor <0.12>` | personal floor threshold (presets `$0.10` / `$0.12` / `$0.15` / off) |
| `/top` | top models (gated off) |

Personal alerts: a new listing on our VexyMarketplace (broadcast, deduped by
token id), the floor dropping below the subscriber's threshold (once per
crossing, re-armed when it recovers), and epoch end (broadcast to subscribers).
Own listings are read on-chain by the fetch-only reader in `bot/own-listings.mjs`
(no viem, no node_modules); competitor Seaport orders from the feed are never
broadcast.

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

## Deploy

**Prod: Coolify on the akilon-box (37.140.241.171).** The root
`../docker-compose.yml` is the Coolify deployment: the container runs in the
host network (only that way it can reach the host sing-box on
`127.0.0.1:10808`, the box's only path to api.telegram.org) and routes only
Telegram through it; Base RPC / the site / GitHub stay direct via `NO_PROXY`.
Coolify app: project `stablebots`, app `lants-alerts`
(`iqfc2vo5wmuu2kwxmb2wkxd3`), git `theYahia/lants-market` branch `bot-alerts`,
build pack docker compose. Secrets (`TG_BOT_TOKEN`, `TG_CHAT_ID`) live in the
Coolify env store; keep the proxy vars (`NODE_USE_ENV_PROXY`, `HTTPS_PROXY`,
`NO_PROXY`) OUT of the store — as build-time env they would break the Docker
Hub pull (BuildKit would try the proxy inside the builder). They are literals
in the compose file. State volume: `/home/botuser/lants-alerts/data` on the box.

**Alternative: sxsi.agency container** (`bot/docker-compose.yml`): bridge
network, direct Telegram egress, secrets in `bot/.env`.

Setup on any host:

1. Create the bot with @BotFather, get the token.
2. Add the bot to the chat/channel and note its id (private chat number or
   channel `@username`).
3. Set the two values in the host's secret store (Coolify env store or
   `bot/.env`, gitignored).
4. Deploy: Coolify redeploy, or `cd bot && docker compose up -d --build`.

The state file (`data/state.json`) records what was already posted, so
restarts never repeat a message.

## Files

| File | Role |
|---|---|
| `cron.mjs` | entrypoint: daemon loop, `--once`, `--dry-run` |
| `epoch-check.mjs` | weekly epoch reminder decision (pure) |
| `rebate-check.mjs` | rebate campaign watch (RPC + published files) |
| `telegram.mjs` | channel sendMessage with retries |
| `state.mjs` | dedupe + DM state, atomic writes |
| `tg-poll.mjs` | each tick: DM getUpdates, commands, personal alerts |
| `tg-commands.mjs` / `tg-format.mjs` | pure command handlers + message texts |
| `tg-alerts.mjs` | floor/epoch alert logic (pure) |
| `tg-api.mjs` / `tg-state.mjs` | Bot API client + DM state helpers |
| `own-listings.mjs` / `read-own-listings.mjs` | fetch-only on-chain VexyMarketplace reader (no viem) |
| `market-config.mjs` / `market-stats.mjs` | ABI encoders and the BuyListing price helper for the reader |
