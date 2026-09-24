# Decision log

Newest first. Each entry says what we chose, why, and what would make us change it.

| # | Date | Decision | Why | Revisit when |
|---:|---|---|---|---|
| D10 | 20.09 | Ship our own market via a **fork of VexyMarketplace** (USDC-only) instead of building from scratch | Vexy is battle-tested for atomic, non-custodial NFT sales; we add one line (`require(currency == USDC)`), swap Solmate `Owned.sol` for a minimal MIT one, and keep custody at zero | fee volume or a feature OpenSea can't serve justifies a bespoke contract 
| D9 | 17.09 | Develop on a free `github.io` mirror; publish only releases to `lants.eth` | every change of an ENS contenthash is an L1 transaction (≈ $0.1 at 0.44 gwei) | many releases per week → switch to IPNS |
| D8 | 17.09 | Host on **IPFS + ENS** (`lants.eth`, served through eth.limo) | ~$5 a year, paid in ETH, no server, nothing to take down | eth.limo proves unreliable → DNS domain |
| D7 | 17.09 | The page reads Base **directly in the browser** | the RPC and antscan both allow cross-origin reads, so the static build never goes stale | RPC limits bite → cached snapshot |
| D6 | 17.09 | Name: `lants-market` | says what it is; the community searches for "lANTS" | brand for launch (02.10) |
| D5 | 17.09 | Code is written by **free models on AntSeed**, the plan by one paid session, acceptance by a human | cost, and a story worth telling the community | a stage fails twice for model reasons |
| D4 | 17.09 | **No pool analytics** | antseed-zh already does it | never |
| D3 | 17.09 | **No fee** in v1 | there is no order book of our own and zero transfers — nothing to charge | phase 4 with real volume |
| D2 | 17.09 | **No custody** in v1: one thin marketplace contract (Vexy fork), atomic buys, owner controls only feeRecipient | holding other people's assets needs an audit; an atomic non-custodial contract does not | phase 3 signal passes for anything holding assets |
| D1 | 17.09 | v1 = a valuation layer on top of OpenSea, plus a seller perks board | OpenSea already trades lANTS but hides what a position contains | — |
| D0 | 09.09 | Do not build a market yet; watch the signals | 14 positions and zero transfers at the time | positions and staked ANTS grew → reopened 17.09 |

## Rejected, and why

| Idea | Why not (for now) |
|---|---|
| Copy Vexy's contracts verbatim | `UNLICENSED` — instead we forked, swapped `Owned.sol` for a minimal MIT file, kept Vexy files' UNLICENSED header, and made listings USDC-only (D10) |
| A Safe as operator for our own restaking | the browser wallet signs once a week in a minute; handing over the operator role is a one-way risk |
| A hub that holds everyone's positions and issues a tradable receipt | custody plus audit, and a tradable receipt works around the protocol's choice to keep ANTS non-transferable |
| "We hold the biggest stake" as a strategy | within five hours two other holders matched it (our weight share 99.99 % → 34.7 %); up to 250 650 ANTS of buyer rewards can arrive every epoch |
