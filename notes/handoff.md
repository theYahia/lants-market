# Handoff — lants.eth.limo (28.10.2026, session 2)

Полный контекст для следующей сессии. Спринт «storefront + deep page + Seaport
aggregation» реализован целиком; код лежит в 13 незапушенных коммитах поверх
`origin/main` (`8c8b692..54a1e68`). Деплой не запускался.

## Состояние на конец сессии

- Ветка `main`, tracking `origin/main`, **13 коммитов впереди** (не запушены).
- `npm test` = **147/148**. Единственный фейл pre-existing: `rebate-deploy`
  `expectedRuntimeHash` — нужен `forge build` / `contracts/out`.
- `npm run build` = OK, **335 файлов**, `dist_bytes` ≈ 5.95 MB.
- Playwright-смоук (локальный `http.server` 8099): витрина, 15 Seaport-карточек,
  фильтры Grid/List, `#position/205` напрямую и back/forward, баннер при
  недоступном фиде, шапка с Seaport-асками, favicon/logo — без ошибок в консоли.
- Seaport Buy **выключен** флагом `SEAPORT_BUY_ENABLED = false`
  (`site/market-config.mjs`): на машине нет `anvil`/`forge`, fork-прогон не сделан.
  Карточки Seaport показывают link-out на antseedmarkets.com.

## Сделано (13 коммитов)

| Коммит | Что |
|---|---|
| `8c8b692` | Исправлены ложные утверждения в `docs/seaport-recon.md` и `docs/planning-context.md`: у Seaport нет on-chain discovery; APR = только staking reward; три разные ценовые меры. |
| `dbd838e` | `seaport-feed.mjs`: пагинация `GET /api/lants-market`, строгая валидация лотов, union `{ok:true|false}`; фикстура `lants-market-2026-10-28.json`. |
| `100664e` | `own-listings.mjs` (вынесено из `market-view.mjs`, −229 строк) + `listing-model.mjs` (join со снапшотом, дедуп по tokenId, `alsoOn`, исключение `INTERNAL_LISTING_IDS`). |
| `a0b41f7` | `position-yield.mjs`: APR, ANTS/epoch, pool share, unlock date/max-lock. |
| `25590ee` | Витрина карточек `storefront.mjs` + `storefront-card.mjs` + `storefront.css`; Grid/List, сортировки, фильтры; List = старая таблица. |
| `55abd71` | `#position/{id}`: router в `index.html`, `position-page.mjs`, view-model + тест. |
| `113b63c` | Seaport-аске в `computeImpliedFromAsks` (`seaportAsAskItems`), «24h avg» под 24H Volume, tooltips, docs «Price sources». |
| `8c12234` | `seaport-abi.mjs` (ручной энкодер, byte-for-byte с viem), `seaport-order.mjs` (validateOrder), `seaport-buy.mjs` (полный flow), `card-actions.mjs`; фикстура `order-205.json`. |
| `ce917ef` | Доки `03-listings.md` (0% vs 1% seller fee), обновлён этот handoff, пересобран `docs.html`. |
| `1b5c04b` | При провале валидации Seaport-ордера Buy заменяется ссылкой на antseedmarkets.com. |
| `8d75709` | Витрина не зависает при ошибке загрузки (`try/finally`, баннер). |
| `53db6ad` | Favicon + лого из `antseed-ant-mark-eyes-preview.png`: `site/favicon.png` (64×64), `site/antseed-mark.png` (96×96), обновлены index/docs, build-dist копирует PNG и не проверяет бинарники на кириллицу. |
| `54a1e68` | Исправлены 9 находок ревью (см. ниже). |

## Результаты ревью (платные модели, 6 треков)

Ревью незапушенных коммитов прогнано DeepSeek V4 Pro (high) по security,
performance, business logic, deploy safety, duplication, dead code. Все
материальные находки исправлены в `54a1e68`:

- `currency` не копировался в lANTS-лот → Buy на витрине падал на allowance.
  Теперь `buildLots` кладёт `currency: item.currency`.
- Hex-`salt` превращался в `0n` в `toBasicOrderParameters` → calldata не
  соответствовал подписи. Теперь `toBig` принимает `0x`-hex, `validateOrder`
  отбрасывает невалидный `salt` (`fail('salt')`).
- Лоты с `ownerMismatch`/`chainClosed` показывались как живые → теперь
  отфильтровываются в `buildLots`.
- Расхождение epoch-конвеншена: deep page считал `snapshot.epoch + 1`, витрина —
  `snapshot.epoch`. Теперь общий `isActivePosition` и `curEpoch = snapshot.epoch`;
  `nextEpoch = curEpoch + 1` только для lock/boost.
- `loadSnapshot()` дедуплицирует параллельные чтения (`snapshotInFlight`).
- `poolShares()` — один проход по позициям вместо O(P²) `poolShare` на карточку.
- Удалён мёртвый код: `mergeStorefrontLots`, `refreshStorefront`, CSS `.pp-lot*`.

Открытых находок ревью нет. Не вошло в фикс (осознанно, вне таблицы ревью):
единый кэш фида для storefront/position-page (сейчас кэш только в
`market-view.mjs`) и ограничение параллельных RPC в `readListings()` —
поведение унаследовано из старого кода.

## Архитектура и модули

Новые модули `site/` (все ≤300 строк):

| Модуль | Роль |
|---|---|
| `seaport-feed.mjs` | Чтение и валидация фида antseedmarkets.com, пагинация до `listedCount`. |
| `own-listings.mjs` | Все листинги с цепочки + supply ANTS; in-flight dedupe; экспорт `ethCallTo`, `getMinted`, `getMaxSupply`. |
| `listing-model.mjs` | Единый лот: join со снапшотом, дедуп c `alsoOn`, unlisted-позиции, `isActivePosition`. |
| `position-yield.mjs` | APR (staking only), ANTS/epoch, `poolShare`/`poolShares`, unlock. |
| `storefront.mjs` / `storefront-card.mjs` / `storefront.css` | Витрина: состояние sort/source/listed/view, чистый DOM-билдер карточки. |
| `card-actions.mjs` | Делегированные Buy / Make offer / Share для витрины и deep page. |
| `position-page.mjs` | `position:open` → owner, лоты, implied MC/FDV, история (наши sales + `/api/lants/trades`). |
| `seaport-abi.mjs` | Seaport 1.6, `fulfillBasicOrder` (0xfb0f3ee1), `getOrderStatus`, `getCounter`; calldata сверен с viem. |
| `seaport-order.mjs` | Fail-closed `validateOrder` (protocol/orderType/zone/zoneHash/conduitKey/offer/consideration/timing/recipient/signature/counter/salt/orderHash/price). |
| `seaport-buy.mjs` | Fetch order → validate → price re-confirm → owner/approval/counter/status → exact USDC approve → eth_call simulate → fulfill → owner check + refresh. |

Данные: снапшот (`loadSnapshot` в `market-view.mjs`, live URL → IPNS → локальные
фикстуры), свои листинги (`readListings`), фид Seaport, `pool-names.json`.
`market-view.mjs` уменьшился с 2007 до ~1850 строк; `render.mjs` не менялся.

Ключевые инварианты (не ломать):

- APR / «≈X ANTS/epoch» — только staking reward. Boost — отдельный бейдж
  (доля веса пула в следующем epoch), в yield не складывается.
- Шапка: floor ask, implied (VWAP живых асков, свои + Seaport), 24h avg sale
  (вторая строка под 24H Volume). $0.094 — avg-sales сетевого поста, не floor.
- Фид Seaport — жёсткая зависимость для Seaport-лотов: упал → лоты скрыты,
  баннер, свои лоты рендерятся. On-chain fallback для discovery не существует.
- Buyer price финальный в обоих источниках; 1% — только с продавца (копия в
  форме листинга).

## Что делать дальше (по порядку)

1. **Запушить 13 коммитов** в `origin/main` (ревью пройдено).
2. **Fork-тест Seaport fulfill**: Base fork (anvil), ордер `order-205.json`
   или свежий live-ордер; проверить `ownerOf = buyer` и точную сумму USDC
   продавцу. Только после этого включить `SEAPORT_BUY_ENABLED = true`.
3. **Деплой**: GitHub → Actions → `snapshot` → Run workflow → `source=manual`
   (CI сам enrich → build → publish CAR + IPNS). Локально ничего не публиковать.
4. Возможные follow-up: единый кэш/дедуп Seaport-фида для storefront и
   position-page; ограничить параллелизм `readListings()` (публичные RPC уже
   давали 429/400 в смоуке); мониторинг фида конкурента.

## Команды / окружение

- PowerShell блокирует `npm.ps1` → использовать `npm.cmd test`, `npm.cmd run build`.
- Локальный сервер: `python -m http.server 8099` в `site/`
  (`http://127.0.0.1:8099/index.html`).
- Доки: после правок `site/docs/*.md` запускать
  `node scripts/site/build-docs.mjs` (обновляет `site/docs.html`).
- Новые ассеты: `site/favicon.png`, `site/antseed-mark.png`
  (источник — `C:\Users\romim\OneDrive\Рабочий стол\antseed-ant-mark-eyes-preview.png`).

## Не коммитить

В рабочем дереве есть незатрекованные файлы, не относящиеся к спринту:
`.kilo/` (включая plan-файл), `lants-thread/`, `notes/README.md`,
`notes/aisurplus.md`, `docs/twitter-content-plan.md`, `tmp-*.mjs` в корне.
Их не добавлять в коммиты. Plan-файл:
`.kilo/plans/1793182796132-storefront-seaport-aggregation.md` (T0–T8 выполнены).

## Адреса / контракты

- Market (VexyMarketplace): `0xC5BFc309a68dBf4e7eEca9BD91749d611c75C660` (1% с продавца)
- NFT/positions: `0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652`
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- ANTS: `0xa87EE81b2C0Bc659307ca2D9ffdC38514DD85263`
- Seaport 1.6 (Base): `0x0000000000000068F116a894984e2DB1123eB395`
- Кошельки юзера: payer `0x3d4cccfaa3b25997f4ab33f838558521259eef1b`,
  node `0x86bb4278389572d6ffc803d72661552be096e473`

## Деплой (без изменений)

`.github/workflows/snapshot.yml`: cron ежечасно + `workflow_dispatch`;
гейт свежести для 6ч-слотов (06/14/22 UTC), ручной `source=manual` публикует
всегда. `FILEBASE_KEY`/`SECRET` — в GitHub Secrets. После публикации CI
обновляет ветку `data` (`live.json`).
