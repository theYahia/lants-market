# Contributing to lants-market

Thanks for wanting to help. This is a small, community-built project — keep changes focused and
we'll move fast.

## Run it locally

Static site, no server:

```bash
cd site && python -m http.server 8098
# open http://127.0.0.1:8098   (use 127.0.0.1 — the wallet modal won't open on a LAN IP)
```

## Run the tests before you push

```bash
node site/metrics.test.mjs

git submodule update --init      # pulls lib/forge-std
cd contracts && forge test --fork-url https://mainnet.base.org   # fork tests on Base
```

Site checks (Playwright) are in `scripts/site/check_*.py`.

## Pull requests

- **Small PRs, one topic each.** A PR that does two things is two PRs.
- Say *what* changed and *why* in the description.
- Keep tests green; add one if you fix a bug.
- Match the surrounding style; no drive-by reformatting.

## Issues

Open a GitHub issue for bugs, ideas, or anything about the contract. For the contract, discuss in an
issue **first** — see below.

## What we can't accept

- **Keys or secrets in code** — no private keys, RPC secrets, Filebase creds. Secrets live only in CI.
- **Contract changes without a prior issue.** The marketplace is deployed and verified on Base;
  any change to `contracts/` needs discussion in an issue before a PR.
- Reformat-only or unrelated bundled changes.
