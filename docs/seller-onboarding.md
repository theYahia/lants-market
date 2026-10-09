# Seller onboarding — rebate offers

The same process for every seller (Apex, D5V1N2, …). The operator runs the CLI and PR steps; the
seller only connects wallets. Contract facts and deadlines: [incentives.md](incentives.md).

## 0. Selection

- The pool must have on-chain sales (`poolPointsByEpoch > 0` in recent epochs). Without a pool a
  seller can post a stake offer, not a rebate.
- Agree the terms with the seller: `pctBps`, `capUsdc` (**≤ 20**, D18), `capPerBuyerUsdc`,
  `minSpendUsdc`, optional `stakeGate`, and `payer` = the seller's main address.
- The seller prepares a **campaign wallet** (fresh Privy wallet, burner or Safe). The payer only
  signs one EIP-712 authorization — never a transaction; only the campaign wallet funds and runs
  the campaign.

## 1. Offer (PR)

- Add the offer entry to `site/offers.json` and generate the campaign params:
  `node site/rebate-campaign.mjs --offer offers/<seller>.json --epoch N --out rebates`
- PR: the offer + `rebates/<N>-<pool>.campaign-params.json`. `npm test` green → merge → publish dist.

## 2. Authorization (PR)

- The seller opens the site → Rebate claims → **Sign payer authorization** (campaign wallet address,
  main wallet signs EIP-712; nothing is sent) and returns the JSON.
- `node site/rebate-authorize.mjs --offer offers/<seller>.json --epoch N --auth signed.json --claims <claims address> --out rebates`
- PR: `rebates/<N>-<pool>.campaign.json`. The CI guard re-verifies the signature on every `npm test`;
  without a valid signature nothing is written.

## 3. Funding (before the epoch starts!)

- The seller connects the campaign wallet and presses **Launch & fund** before `cancelDeadline`
  (epoch start). The approval is the exact cap, to the pinned contract address.
- After the tx: add `"campaignId": "<id>"` to `rebates/<N>-<pool>.campaign.json` (PR) and check the
  site shows `funded $X of $X` with no warning.

## 4. After the epoch

- Payout: `node site/rebate-payout.mjs --epoch N --pool <pool> --offer offers/<seller>.json --out rebates`
  → PR with `.json/.csv/.tree.json`; 48 h for objections (a correction is a new tree version).
- The seller presses **Finalize** (campaign wallet) → claims open for 14 days → **Withdraw unclaimed**.

## Deadlines — quote them in every message to the seller

| When | What |
|---|---|
| `cancelDeadline` = epoch start | fund (Launch & fund) or the offer is gone; otherwise cancel |
| `finalizeDeadline` = epoch end + 72 h | Finalize after the 48 h objections window |
| `sweepAfter` = finalize + 14 days | claim window closes, the seller withdraws the remainder |

## Operator checklist per epoch

One line per seller: `<seller>: payout → PR → remind Finalize (until <date>)`; after Finalize:
`claims close <date>, sweep reminder <date>`. Every number in a message to a seller comes from a
command. New offers also arrive via GitHub → New issue → **Rebate offer**
(`.github/ISSUE_TEMPLATE/rebate-offer.yml`).
