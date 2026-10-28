# Session handoff — lants.eth.limo (28.10.2026)

Компактный контекст для продолжения работ по стороннему маркетплейсу lANTS
(залоченные ANTS-позиции AntSeed) на Base. Конкурент — официальный
antseedmarkets.com/markets.

## Адреса / контракты

- Market (VexyMarketplace): `0xC5BFc309a68dBf4e7eEca9BD91749d611c75C660` (комиссия 1% с продавца)
- NFT/positions: `0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652`
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- ANTS token: `0xa87EE81b2C0Bc659307ca2D9ffdC38514DD85263`
  - `MAX_SUPPLY()` селектор `0x32cb6b0c` = 1.04B
  - `totalSupply` `0x18160ddd` ≈ 130M
- Seaport 1.6 (Base): `0x0000000000000068F116a894984e2DB1123eB395`
- Кошельки юзера:
  - payer `0x3d4cccfaa3b25997f4ab33f838558521259eef1b` (13 позиций)
  - node `0x86bb4278389572d6ffc803d72661552be096e473` (0)

## Сделано

- Коммит `1894f60` — шапка из 6 плиток из живых оферов (VWAP), MC/FDV по
  `MAX_SUPPLY`, цена проданных лотов из `BuyListing`.
- Спринт «storefront + deep page + Seaport»:
  - дефолтный «All positions» — витрина карточек (`site/storefront.mjs`,
    `storefront-card.mjs`, `storefront.css`); Grid/List, сортировка
    ($/ANTS, amount, APR, unlock), фильтр источника и listed-only.
  - `#position/{id}` — `site/position-page.mjs`: owner, lock/unlock, APR
    (только staking reward), boost-бейдж, лоты, implied MC/FDV, история.
  - Seaport-агрегация: `seaport-feed.mjs` (paginated feed + per-item
    validation), `listing-model.mjs` (единая модель лотов, дедуп по tokenId),
    `position-yield.mjs` (APR/ANTS-per-epoch/pool share).
  - Шапка: Seaport-аске в `computeImpliedFromAsks` (`seaportAsAskItems`),
    вторая строка «24h avg» под 24H Volume.
  - Свои листинги вынесены в `own-listings.mjs` (общий кэш чтения для
    таблицы, витрины и deep page).
- Seaport fulfill готов кодом: `seaport-abi.mjs` (ручной энкодер
  `fulfillBasicOrder`, byte-for-byte сверен с viem), `seaport-order.mjs`
  (validateOrder, все отказные ветки), `seaport-buy.mjs` (проверка
  owner/approval/counter/getOrderStatus, exact USDC approve, симуляция,
  fulfill, проверка нового owner).
- **Seaport Buy выключен флагом:** `SEAPORT_BUY_ENABLED = false` в
  `site/market-config.mjs`. На машине нет anvil/forge, поэтому Base-fork
  прогон не сделан; карточки Seaport показывают link-out на
  antseedmarkets.com. Перед включением: fork-тест ордера #205 (owner = buyer,
  продавец получил точную сумму USDC), затем флаг в true.

## Новые модули

`site/`: `seaport-feed.mjs`, `listing-model.mjs`, `position-yield.mjs`,
`own-listings.mjs`, `storefront.mjs`, `storefront-card.mjs`,
`card-actions.mjs`, `position-page.mjs`, `seaport-abi.mjs`,
`seaport-order.mjs`, `seaport-buy.mjs`, `storefront.css`.
Фикстуры: `site/fixtures/seaport/lants-market-2026-10-28.json`,
`site/fixtures/seaport/order-205.json`.

## Деплой (НЕ ручной — есть CI)

- `.github/workflows/snapshot.yml`: cron ежечасно + `workflow_dispatch`.
  Делает enrich-snapshot → build → publish (Filebase CAR + IPNS «lants»).
  `FILEBASE_KEY`/`SECRET` уже GitHub-секреты, локально не нужны.
- Гейт свежести: cron пропускает, если снапшот свежий для 6ч-слота (06/14/22 UTC);
  ручной триггер (`source=manual`) паблишит всегда.
- **Как выкатить:** GitHub → Actions → `snapshot` → Run workflow → source=manual
  (gh CLI на машине нет — триггерит юзер, 2 клика).

## Тесты

- `npm test` = 145/146. Единственный фейл pre-existing: rebate-deploy
  `expectedRuntimeHash` — нужен `forge build`/`contracts/out`.
- `npm run build` = OK, 333 файла.
- Playwright smoke (локально, `http.server` 8099): 15 Seaport-карточек,
  фильтры, deep link `#position/205`, back/forward, шапка с Seaport-асками.

## Что дальше

1. Fork-тест Seaport fulfill и включение `SEAPORT_BUY_ENABLED`.
2. Мониторинг фида antseedmarkets.com: при падении Seaport-лоты скрываются,
   свои продолжают рендериться (баннер на витрине).
3. Bribe/incentive proof page — вне этого спринта.

## Локальный сервер

`http://127.0.0.1:8099` (`python -m http.server` в `site/`) — для итераций,
потом одним деплоем на живой.
