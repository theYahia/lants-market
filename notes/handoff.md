# Handoff — lants.eth.limo (29.10.2026, сессия 16: antseedstats demand-посты)

## Session 16 — demand-посты antseedstats: usage / countdown / alloc / topmodels (НЕ закоммичено)

Дата: 29.10.2026. Всё в рабочем дереве, поверх сессии 15. План (источник правды):
`.kilo/plans/1793256926840-antseedstats-demand-posts.md`.

### Что добавлено

Бот теперь постит и спросовую сторону AntSeed, которую API antseedstats.com отдаёт,
а бот раньше игнорировал. Все новые типы — статистика (не рыночные):

- `usage` — 📡 24h спрос (requests/tokens/videos/coverage) из `network/summary.paid_usage_24h`.
  Change-only, ±5% по `requests` от последнего запощенного (`posted.requests24h`).
  Dedup-ключ `usage:{requests rounded to 1000}`.
- `countdown` — ⏳ «Epoch N ends in ~Xh … restake with +N% power bonus». Раз в эпоху на
  бакет (6h, 1h) из `epoch.seconds_left` + `staking/pools.restake_bonus_pct`.
- `alloc` — 🧮 эмиссионная аллокация из `epochs/{id}.economics.buckets` (cap_pct по
  убыванию), на закрытии эпохи (росте `maxCompletedEpoch`).
- `topmodels` — 🏅 top-3 моделей по usage с первой страницы `models`, раз в 7 дней.
  **GATED OFF** (`TOP_MODELS_ENABLED = false`) до проверки сортировки первой страницы.
- `buyers` — свёрнут в существующий `settled`-пост (`· N buyers`).
- `usage`+`generative` — две строки без эмодзи в недельный дайджест.
- `restake bonus` — свёрнут в epoch CTA (`Restake — … 🌱 (+N% power bonus)`).

### Adopt vs reject

- **Adopt**: usage, countdown, alloc, topmodels (gated), buyers→settled,
  usage+generative→digest, restake bonus→epoch CTA.
- **Reject** (записано в `docs/twitter-content-plan.md` «Rejected post types»):
  standalone buyers/coverage/generative/claimable, полный каталог models/prices,
  APY (`apy_*_pct`; 2y-цифра = «inflated yield»), внутренний plumbing
  (`buyer_ants_per_usd_projected`, `degraded`, `tokens_in/out`, `economics.stake`,
  `usage.pct_of_target`).
- **Отклонение от плана**: `lifetime` (settled_usd/fees/buyers/sellers/settles) из
  `network/summary` НЕ извлекается — не используется ни в одном посте и отсутствует в
  списке тестов плана. `modality_7d` тоже пропущен (план: «optional, for future use»).
- **«sorted by key» в плане** интерпретировано как «cap_pct по убыванию»: иначе `allocText`
  не совпадает с шаблоном поста из плана (seller pools → usage → team → reserve → verification).

### Файлы

- `bot/read-antseedstats.mjs` — расширены `parseNetworkSummary`/`parseStaking`/
  `parseEpochDetail` (economics.buckets/burn); `readAntseedStats` фетчит `/staking/pools`
  (мягко) и, при росте `maxCompletedEpoch`, `/epochs/{n}` (мягко, параметр
  `prevMaxCompletedEpoch`).
- `bot/antseed-snapshot.mjs` (НОВЫЙ) — `toAntseedSnapshot`/`toAntseedState`/
  `countdownBucket` вынесены из `read-antseedstats.mjs`, чтобы тот остался ≤300 строк
  (итого 274). Стейт сидит новые поля `posted.requests24h`, `countdownPosted`,
  `lastTopModelsAt`; апгрейд сидит их из текущего снапшота (без постов).
- `bot/format.mjs` — `usageText`/`countdownText`/`allocText`/`topModelsText`;
  `settledText(buyers)`, `digestText(usage+generative)`, `epochText(opts.restakeBonusPct)`.
- `bot/diff.mjs` — usage (±5%), countdown (бакет-дедуп по эпохе), alloc (на закрытии
  эпохи), topmodels (7-дневный гейт, `opts.topModelsEnabled`), buyers→settled.
  `diffFeed` принимает `restakeBonusPct`.
- `bot/state.mjs` — `STAT_COOLDOWN_HOURS.requests24h = 24`.
- `bot/run.mjs` — читает `restakeBonusPct` из снапшота и передаёт в `diffFeed`; дайджест
  получает `usage`+`generative`; пост-цикл двигает `countdownPosted`/`lastTopModelsAt`.

### Проверено

- `npm.cmd run bot` = **110/110 pass**.
- `npm.cmd test` = **305 (304 pass / 1 skip / 0 fail)** (skip — `expectedRuntimeHash`,
  forge-артефакт).
- `node bot/run.mjs --dry-run` — живой прогон OK: дайджест теперь с demand-строками
  (`24h 230.55K requests · 13.2B tokens`, `7d generative $2,459 · 3.16K videos`);
  `epochDetail` на живом API дал timeout → alloc-пост мягко пропущен (ожидаемо).
- `node --check` — все изменённые модули OK.

### Гейты / открытые вопросы (перенесены из плана)

1. `models` sort semantics — первая страница выглядит отсортированной по `usage`
   (descending), но `usage` vs `usage_all` windowing не подтверждён. `TOP_MODELS_ENABLED`
   = false; проверить по glossary перед включением.
2. Два close-поста за эпоху — `epochstats` (rewards) + `alloc` (allocation). По умолчанию
   раздельные; можно слить `alloc` в `epochstats`.
3. `countdown` бакеты 6h/1h — константы, максимум 2 поста/неделю.

Всё НЕ закоммичено и НЕ запушено (как и сессия 15). Деплой CI-only.

## Session 15 — бот @sxsiant: Sold/Floor убраны, листинги только свои (НЕ закоммичено)

Дата: 29.10.2026. Всё лежит в рабочем дереве; ничего не закоммичено и не запушено.
План независимой проверки: `.kilo/plans/1793255766104-bot-sold-floor-removal-verification.md`.
Контент-спека (единственный источник правды по текстам): `docs/twitter-content-plan.md`,
Phase 2 + «Removed post types».

### Решение владельца и почему (НЕ возвращать без пересмотра)

- **Бот перестал быть «вторым тикером».** Раньше он дублировал @antseedbot: постил продажи и
  движение агрегатного флора. Это история конкурента, а не наш инвентарь, и она не ведёт
  покупателя к нам.
- **Sold — удалён целиком.** Конкурент постит каждую сделку с контекстом («X% above
  24h avg»); наш deep-линк вёл на уже проданную позицию — тупик, конверсии ноль.
  Объём продаж остался только в недельном дайджесте (settled7d).
- **Floor move — удалён.** Движение агрегатного флора — не наше событие. Наш флор важен
  ровно в одном случае: его поставил НОВЫЙ свой листинг → «New floor listing».
- **Источник листингов — только VexyMarketplace** (наш маркет, 1% seller fee). Seaport-
  ордера конкурента не постим: пусть постит их сам.
- **Лимиты постинга сняты** по просьбе владельца: он смотрит, «как оно выглядит» вживую.
- **Эмодзи добавлены** по просьбе владельца (см. карту ниже).

Обоснование зафиксировано в `docs/twitter-content-plan.md` («Removed post types») и в
инвариантах `AGENTS.md`: бот постит только свои листинги, закрытия эпох и
атрибутированные данные antseedstats.

### Почему листинги читаются с цепи, а не из фида

`bot/read-own-listings.mjs` (НОВЫЙ) импортирует канонический `readListings` из
`site/own-listings.mjs` — второго читателя листингов в проекте нет. Нормализация в
`toOwnListing()` отбрасывает всё, что нельзя показать честно:

- `isLive !== true` (продан/истёк/отменён), `ownerMismatch` (NFT уже не у seller),
  `chainClosed` (позиция закрыта/выведена);
- `listingId ∈ INTERNAL_LISTING_IDS` (0–5 — внутренние сделки между нашими кошельками);
- `price <= 0` / `chainAmount <= 0` / `nftId < 0`;
- `lockDays` — только если `chainStakeEnd` в будущем.

Фильтра по адресу продавца нет: любой лот на нашем маркете с `listingId >= 6` постится
(лоты кошелька владельца — в их числе). Если нужен allowlist по адресу — нужен адрес,
это отдельная правка.

`hasIncompleteRows()`: живая строка, у которой не прочитался `positions()`
(`chainAmount === null`), валит весь own-read (`ok:false`, reason `partial`). Тогда
`run.mjs` берёт прежний набор листингов — сбой RPC не превращается в ложный
`Delisted` + `New listing` на восстановлении.

### Что изменено по файлам

- `bot/format.mjs` — удалены `floorText`/`tradeText` (+ мёртвые `price4`/`usd2`);
  `epochText` переписан в CTA-пост; `digestText` заканчивается `https://lants.eth.limo`;
  добавлены эмодзи; `epochText` при переполнении 280 бросает меры, а не пост.
- `bot/read-feed.mjs` — удалены trades (`normalizeTrade`/`parseTrades`/`fetchTrades`);
  остался market-контекст (floorAsk/avg24h/epoch/listedCount) и `fetchEmission`
  (сумма rewardByEpoch по снапшоту). `toState` = `{ epoch, listings }`.
- `bot/read-own-listings.mjs` (НОВЫЙ) + `bot/read-own-listings.test.mjs` (НОВЫЙ).
- `bot/diff.mjs` — `diffFeed` переписан: только свои листинги (listing/floor-listing/
  delist/epoch), флор считается из своих лотов. Если в одном прогоне ниже прежнего флора
  появились ДВА лота, «New floor listing» получает только самый глубокий, второй — обычный
  `listing`. Relist по новой цене = `delist(unlisted:old)` + `listing(listed:new)`;
  float-шум цены режется округлением до 4 знаков; холодный старт (`prev === null`) молчит.
- `bot/state.mjs` — `MARKET_EVENT_TYPES` = `listing`/`floor-listing`/`delist`/`epoch`
  (раньше `sold`/`newListing`/`newFloorListing` были мёртвыми именами, а реальные типы не
  попадали в приоритет/кап).
- `bot/run.mjs` — `curr.listings` только из `readOwnListings()`; при `own.ok === false`
  подставляется `state.last.listings`, epoch детектится независимо; лимиты выключены
  (`STATS_PER_RUN = 0`, `STATS_THROTTLE = false`).
- `.github/workflows/twitter-bot.yml` — убран `MAX_POSTS_PER_RUN: 3`.
- `package.json` — `npm run bot` включает `bot/read-own-listings.test.mjs`.
- Тесты обновлены: `format.test.mjs`, `diff.test.mjs`, `read-feed.test.mjs`, `state.test.mjs`.
- `docs/twitter-content-plan.md` — Phase 2 (листинги/epoch/cadence/эмодзи) и раздел
  «Removed post types». `AGENTS.md` — инвариант про Sold/Floor move.

### Как устроен один прогон

`readFeed()` (жёсткая зависимость: без него прогон не двигается) → `readOwnListings()`
(мягкая: фолбэк на прежний набор) → `diffFeed()` → `readAntseedStats()` +
`diffAntseedStats()` (мягкая) → недельный дайджест (раз в 7 дней) → `enqueue` (дедуп по
ключу, очередь старше 48 ч выбрасывается) → `orderEvents` (сначала рыночные) → постинг.
Epoch: `curr.epoch > prev.epoch` → постится эпоха `curr.epoch - 1`; эмиссия берётся из
снапшота и опциональна. Дайджест считается из фида + antseedstats, отсутствующие числа
просто не попадают в текст.

### Контракт постов (реальный вывод `bot/format.mjs`)

```
🆕 New listing: #206 · 🐜 400 ANTS @ $0.150 · lock 8w · lants.eth.limo/#position/206      (84)
🎯 New floor listing: #207 · 🐜 400 ANTS @ $0.120 · lock 8w · lants.eth.limo/#position/207 (90)
🗑️ Delisted: #205 · lants.eth.limo/#position/205                                          (49)

🏁 Epoch 27 has ended · 🐜 104,500 ANTS emitted · 24h avg $0.102

Staker rewards for epoch 27 are claimable now:
• Claim — ANTS to your wallet
• Restake — compound into a new position 🌱

Buyer rewards for epoch 27 can be staked into a seller pool.

https://lants.eth.limo                                                                    (272)

🔥 ANTS burn: 🐜 1.5M (epoch 25) · total 6M · data: antseedstats.com                       (68)
💰 AntSeed 7d settled: $12,804 (+8.4%) · 27,841 settlements · 70 sellers · data: antseedstats.com (97)
🌱 Staked: 1.54M ANTS (+5.2%) · 73% of stakable · data: antseedstats.com                   (72)
🏆 AntSeed 7d settled hit a record: $13,000 · data: antseedstats.com                       (68)
🎁 Epoch 21 rewards · 🐜 1.5M ANTS emission · $12,804.23 seller points · 1.5M burned · data: antseedstats.com (109)

📊 lANTS weekly

Floor $0.134 · 24h avg $0.130 · 17 listed
7d settled $13,462 · 70 sellers · 1.69M ANTS staked · 81% of stakable

https://lants.eth.limo · data: antseedstats.com                                            (177)
```

Эмодзи-карта (в коде — unicode-escape вида `\u{1F41C}`, файлы остаются ASCII): 🆕 листинг ·
🎯 флор · 🗑️ делist · 🏁 epoch · 🔥 burn · 💰 settled · 🌱 staked · 🏆 record ·
🎁 epoch rewards · 📊 дайджест. Внутри текста только два маркера: 🐜 перед суммой ANTS и
🌱 у стейкинга/роста (пост staked, bullet Restake).

### Лимиты: что снято и как вернуть

Снято по просьбе владельца (29.10), чтобы смотреть живое поведение:
`STATS_PER_RUN = 0` (нет капа на статистику за прогон), `STATS_THROTTLE = false`
(кулдауны 24 ч / 48 ч не применяются), нет `MAX_POSTS_PER_RUN` в workflow.
Остались: дедуп по ключу, отброс очереди старше 48 ч, дайджест раз в 7 дней, cron
`7 * * * *`. Вернуть троттлинг: `STATS_PER_RUN = 1`, `STATS_THROTTLE = true`,
`MAX_POSTS_PER_RUN` в `.github/workflows/twitter-bot.yml`.

### Проверено

- `npm.cmd run bot` = **87/87 pass, 0 fail**.
- `npm.cmd test` = **288 (287 pass / 1 skip / 0 fail)**, skip — `expectedRuntimeHash`
  (нет `contracts/out/RebateClaims.sol/RebateClaims.json`, нужен forge).
- `node bot/run.mjs --dry-run` — живой прогон OK (фид + свои листинги + antseedstats
  читаются; на момент проверки 1 digest).
- Независимая проверка (сессия 15) подтвердила: grep'ы на удалённый trade/floor-код
  (`Sold` остался только комментарием в `bot/read-feed.mjs:8`; `'floor'`/`'trade'` —
  только тестовые фикстуры), регресс-точки флора/делist/relist/float-шума/холодного
  старта, контракт полей `readListings` ↔ `toOwnListing` (BigInt-касты корректны).

### Открытые вопросы (на решение владельца, не регресс)

- Seaport-парсинг в `read-feed.mjs` `toMarket` больше не нужен для постинга: он остался
  ради shape-гейта `listedCount > 0 && listings пусто → ok:false`. При дрейфе
  конкурентского фида гейт может оборвать весь прогон (включая свои листинги и epoch).
- Allowlist по адресу продавца не сделан (см. выше).
- `bot/fixtures/lants-trades-2026-10-28.json` — неиспользуемая фикстура, осознанно не удалена.
- Education-посты P0.2/P0.3/P0.4 — ручной контент, постит человек.
- **Бот не задеплоен**: после push CI продолжит постить по cron; до этого правки живут
  только в рабочем дереве.

## Session 14 — независимый аудит UX/UI/кнопок (НЕ закоммичено)

По плану `.kilo/plans/1793211319802-full-site-ux-ui-button-audit.md`. Браузерный прогон —
Playwright chromium headless против `http://127.0.0.1:8099` (`site/`), 1280/768/375.
Полный отчёт: `notes/audit-2026-10-28.md`.

Найдено и исправлено 3 дефекта:

- **P1 «Listed only» сломан** — `site/storefront.mjs`: `ctx.lots.filter(matches)` передавал
  индекс массива как `listedOnly` (второй параметр `matches`), из-за чего все unlisted-лоты
  с индекса 1 молча отбрасывались при любом состоянии чекбокса. Добавлен `visibleLots()`
  + регрессионные тесты в `site/storefront.test.mjs`.
- **P1 Sales-таблица растягивает страницу** — глобальный `table{min-width:560px}` из
  `site/app.css` тёк в `#sales-panel .sales-table` (overflow 54px@1280 / 173px@768).
  Исправлено `#sales-body{overflow-x:auto}` + `min-width:0;table-layout:auto`.
- **P1 deep page `#position/{id}` показывал market-strip + Listings** — не было CSS на
  `body.view-position`. Добавлено правило (как у portfolio/incentives).

Открытые находки (не фикшено, на решение владельца): rebate-campaign 404 на каждой
странице (dev-сервер без `site/rebates/`, в проде 404 только `tree.json` — ожидаемо);
RPC 400(drpc)/429(mainnet.base.org) — грациозный фолбэк на publicnode; «Total Volume»
считается из `readListings()` (наш контракт), а тултип обещает «native marketplace»; Share
в UI нет (спящий хендлер); incentives/rebate инициализируются на каждом роуте.

Проверки: `npm.cmd test` = **288 (287 pass / 1 skip / 0 fail)**, `npm.cmd run build` = OK
(345 файлов). Изменены `site/storefront.mjs`, `site/app.css`, `site/storefront.test.mjs`.

## Session 13 — UI-полировка витрины / Sales / портфеля (НЕ закоммичено)

Поверх незакоммиченных правок сеансов 4–9 (veXy-витрина) и тест-покрытия (Session 11).
Только локально, в рабочем дереве. Ключевые изменения:

- **Шрифт глобально крупнее**: `html { font-size: 18px → 20px }` (`site/app.css`); жёсткий
  `11px` у `.cf-note` → `var(--fs-12)`.
- **Лого на Buy** (`site/storefront.css`): убрана белая круглая подложка, размер 18→26px,
  `object-fit: contain`.
- **Sales-панель** (`site/app.css` + `site/side-panels.mjs`): колонка `Token` → `ID`;
  таблица компактнее (td padding 7→4px), шрифт sans + tabular-nums, id моно.
- **Витрина — сортировка кликом по шапке** (`site/storefront.mjs`,
  `site/storefront-table.mjs`, `site/storefront.css`, `site/index.html`):
  дропдаун `Sort $/ANTS` удалён; столбцы `Position ID · Price · Staked · Reward · Unlock`
  кликабельны (toggle asc/desc, стрелка ▲/▼, активный столбец зелёный). Заголовок
  `Position` → `Position ID`. `sortLots(lots, sort, dir)` учитывает направление;
  unlisted/пустые значения всегда в конце.
- **+ Sell → модалка «Select NFT»** (`site/market-view.mjs`, `site/index.html`,
  `site/app.css`): при не-подключённом кошельке сначала `ensurePrivy()` (коннект), после
  коннекта (`pendingSellConnect` → `openSelectNftModal`) открывается диалог; пустое
  состояние «You don't currently own any qualifying NFTs» / «Get some NFTs in your wallet…»;
  при наличии позиций — список `#id`, клик подставляет id в форму и ведёт в «List a position».
- **My Portfolio** (`site/market-view.mjs`): из пустого состояния убрано «· Stake on AntSeed».
- **Формы List/Manage/Stake buyer reward** (`site/index.html`): ⓘ-подсказки на все поля
  (NFT id, Price, Duration, Position id, Split amount, Move to pool, Buyer address, Epoch,
  Pool, Stake epochs).
- **Make Offer** (`site/index.html`, `site/market-view.mjs`): убрана лишняя строка `$10`
  (`#offer-sum-usd`) — дублировала «Budget X USDC».

### Файлы (рабочее дерево)

`site/app.css`, `site/storefront.css`, `site/index.html`, `site/market-view.mjs`,
`site/storefront.mjs`, `site/storefront-table.mjs`, `site/side-panels.mjs`,
`site/storefront.test.mjs`, `site/storefront-table.test.mjs`.

### Проверки

- `node --check` — OK (все изменённые модули).
- `npm.cmd test` = **268 тестов: 267 pass / 0 fail / 1 skip** (skip — forge-артефакт).
- `npm.cmd run build` = OK, **337 файлов**.

### Дальше

- Браузерный смоук `http://127.0.0.1:8099/#market` (Ctrl+Shift+R — кэш модулей).
- Разбить незакоммиченные site-правки на логические коммиты + push (деплой CI/IPFS).

## Session 12 — Twitter-бот @sxsiant: 403 починен + пост-улучшения (ЗАКОММИЧЕНО, всё в main)

### Итог
Бот живой и постит на @sxsiant по cron (каждый час на 7-й минуте, change-only). 403 исправлен;
добавлены приоритет очереди, cooldown статистики, deep-ссылки и еженедельный дайджест.

### Причина 403 (и как чинили)
Рассинхрон секретов: `X_REFRESH_TOKEN` сменили на rainonbase (`2067642568423170048`), а
`X_CLIENT_ID`/`X_CLIENT_SECRET` остались от TheTieTieTies (`cmZ3U0x3...`). Бот авторизовался
как TheTieTieTies, токен принадлежал rainonbase → `invalid_request: Value passed for the
token was invalid` (воспроизведено curl-ом). Дополнительно Actions-кэш `twitter-bot-state-main-*`
хранил `state.json` со старым `refreshToken`, который перекрывал секрет (`readCreds` берёт
`state.refreshToken || secret`). Лечилось: секреты записаны через `gh` (PAT пользователя),
все кэши `twitter-bot-state-main-*` удалены.

### Коммиты (всё в origin/main)
- `ccca9bf` — диагностика 403: `send()` → `headers` (rate-limit/www-authenticate),
  `getMe()` → `GET /2/users/me`, `scopeAllowsWrite()`; hard-gate по `tweet.write`.
- `ce6b811` — cron `7 * * * *` включён, шаг `Feed diagnostic` + блок `feed-diag.log` удалены.
- `559bd63`, `5f238e8` — при фейле refresh в лог пишутся префиксы `client_id` и `refresh_token`
  (GitHub маскирует полные секреты, поэтому пишутся только префиксы).
- `6abe22b` — пост-улучшения: приоритетная очередь, кап статистики, cooldown, deep-ссылки,
  еженедельный дайджест.

### Секреты (GitHub + bot/.env) — rainonbase
`X_CLIENT_ID`=`Q1BtQURS…`, `X_CLIENT_SECRET`=`T0ehUWZi…`, `X_REFRESH_TOKEN` — ротируется
автоматически шагом `Rotate X refresh token secret` (gh secret set из `bot/.rotated-token`).
Scope: `tweet.write users.read tweet.read offline.access`. Аккаунт: @sxsiant (id `1947687125513560064`).

### Пост-логика (актуальная)
- Приоритет: рыночные (`sold`/`newFloorListing`/`floor`/`newListing`/`delist`/`epoch`) раньше
  статистики; максимум 1 статистический пост за прогон (`STATS_PER_RUN=1`), общий кап 3 (`MAX_POSTS_PER_RUN`).
- Cooldown: `settled7d`/`settled30d` — 24ч, `stakedAnts` — 48ч; `burn`/`record7d`/`epochstats` — сразу.
- Deep-ссылки: позиционные посты ведут на `lants.eth.limo/#position/{id}`.
- Дайджест: `digestText` раз в 7 дней (`state.lastDigestAt`, интервал `DIGEST_INTERVAL_MS`).
- Логика в `bot/state.mjs` (helpers `orderEvents`/`capStats`/`withinCooldown`/`isMarketEvent`),
  `bot/format.mjs` (тексты + `digestText`), `bot/run.mjs` (связка), `postedAt` в `toAntseedState`.

### Проверки
`npm.cmd run bot` = **87/87**, `npm.cmd test` = **287 pass / 1 skip / 0 fail** (skip — forge-артефакт).
Живой прогон подтвердил: `token refresh ok → authenticated as @sxsiant → posted` (вышли 2 реальных
поста: рекорд 7d settled и еженедельный дайджест).

### Осталось (мелочи)
- Удалить PAT `lants secrets fix` (GitHub → Settings → Developer settings → Tokens) — если ещё не удалён.
- Тестовый твит `lants.eth.limo market bot online` (id `2115504770702032913`) — удалить руками.
- `tmp-pkce-mint.mjs` удалён; правило `tmp-*.mjs` в `.gitignore` оставлено (не закоммичено).

### Отложено (следующие улучшения постов, НЕ сделано)
- Merge нескольких antseedstats-метрик в один пост (сейчас решает кап + cooldown).
- Посты «модель/цена» (`/models`, `/prices`) — пагинация по 100 таймаутит на free-тарифе.
- Контекст floor-постов («lowest listing removed» и т.п.).

## Session 11 — bot hardening перед schedule (ЗАКОММИЧЕНО, план 1793201198338-bot-hardening.md)

Секции 1–4 плана реализованы, протестированы и закоммичены (`npm.cmd run bot` = **76/76**).

- **Коммит 1 `9367b22`** — ротация refresh-токена write-ahead: `bot/token-store.mjs`
  (saveRotatedToken → state + `bot/.rotated-token`), в `run.mjs` сразу после refresh;
  workflow шаг `Rotate X refresh token secret` (`gh secret set X_REFRESH_TOKEN < bot/.rotated-token`,
  `GH_TOKEN: GH_SECRETS_PAT`, `if: always() && hashFiles(...)`); `.gitignore` + `bot/.rotated-token`.
- **Коммит 2 `dd343bc`** — кап: `MAX_POSTS_PER_RUN: 3` в env шага `Run bot`.
- **Коммит 3 `5016c19`** — antseedstats: `parseNetworkSummary` читает `settles`/`sellers`
  по окнам; тексты `AntSeed 7d settled: $12,804 (+6.7%) · 27,841 settlements · 70 sellers`,
  `ANTS burn: 1.5M (epoch 26) · total 7.5M`, `Staked: 1.6M ANTS (+6.7%) · 74% of stakable`;
  порог ±5% считается от **последнего опубликованного** значения (`state.antseed.posted`,
  сидится из текущих без поста при апгрейде), meta на событиях двигает baseline только
  после успешного поста; 24h не постится (остаётся в снапшоте); рекорд 7d
  (`record7d:<rounded $100>`) постится независимо от ±5%.
- **Коммит 4 `6013f80`** — diff: продажа больше не даёт `Delisted` (пропускается delist для
  id с новым listing-trade); relist по цене — ключи `listing:{id}:listed:{price}` /
  `unlisted:{prevPrice}` (4 знака, чтобы шум float не фейкал relist; legacy plain-id стейт
  принят); новый лот под полом — один пост `New floor listing`, без `New listing`+`Floor`.

Изменённые файлы: `bot/token-store.mjs`(новый), `bot/token-store.test.mjs`(новый),
`bot/run.mjs`, `bot/format.mjs`, `bot/format.test.mjs`(новый, добавлен в бот-сьют),
`bot/diff.mjs`, `bot/diff.test.mjs`, `bot/read-antseedstats.mjs`, `bot/read-antseedstats.test.mjs`,
`bot/read-feed.mjs`, `bot/read-feed.test.mjs`, `bot/state.mjs`, `bot/state.test.mjs`,
`.github/workflows/twitter-bot.yml`, `.gitignore`, `package.json` (бот-сьют теперь включает
`format.test.mjs` + `token-store.test.mjs`).

### Не сделано (гейты человека / отложено)

- **T6 / секция 5** — первый реальный `workflow_dispatch` (не dry-run), проверка поста на
  `@sxsiant`, подтверждение ротации секрета → после этого: удалить шаг `Feed diagnostic` +
  блок `feed-diag.log` и раскомментировать `cron '7 * * * *'`. Cron НЕ включён.
- **Секция 6** — ссылки `lants.eth.limo/#position/{id}`, `−X% vs 24h avg` / `vs floor`,
  `$ANTS`-касштег, еженедельный дайджест — после стабилизации schedule.
- **Секция 7** — незакоммиченные site-правки сеансов 5–9 (витрина veXy, лого, listed-only,
  Seaport-унификация, Sales, полировка, Share-фикс) + `scripts/site/*` + `AGENTS.md` +
  `package.json` + `notes/handoff.md` + untracked site-тесты: разбить на логические коммиты
  перед деплоем. `tmp-*.mjs` удалены.

### Текущий статус бота (на 28.10, после run #7/#8) — ГЛАВНОЕ ДЛЯ СЛЕДУЮЩЕЙ СЕССИИ

- Все 5 коммитов **запушены** (`6356d31..c2acf02`): `9367b22` token, `dd343bc` cap,
  `5016c19` antseedstats, `6013f80` diff, `c2acf02` logger (body + scope в лог).
  `npm.cmd run bot` = **76/76**.
- **Run #7 (первый реальный) — 403 Forbidden на постинг, job FAILED exit 4** из-за
  отсутствовавшего `GH_SECRETS_PAT` (шаг ротации секрета). Фид ок: 16 листингов, включая
  **новый лот #775 @ $0.13 под полом** (New floor listing) — виден бо��ом, НЕ запощен.
- **Run #8 — job SUCCESS** (секрет `GH_SECRETS_PAT` создан пользователем, ротация прошла),
  но **пост снова 403**:
  `token refresh ok (scope: tweet.write tweet.read offline.access)` →
  `X response: {"title":"Forbidden","type":"about:blank","status":403,"detail":"Forbidden"}`.
- **Диагноз**: generic 403 `detail:"Forbidden"` при валидном scope `tweet.write` — отказ на
  уровне приложения X. NOT «нет прав» / NOT «денег нет» (у пользователя Read&Write и $9).
  Кандидаты (в порядке вероятности):
  1. **User authentication settings → app permissions = Read** (у OAuth 2.0 приложения это
     отдельная настройка от страницы приложения). Токен показывает старые scopes → после
     смены на Read&Write нужен **re-auth (переснять refresh-токен)**.
  2. **Automated app label** не назначен приложению / не подтвер��дён @sxsiant (X для
     автоматических постов требует label; без него 403).
  3. **PKCE-минт сделан с приложения `rainonbase` (2067642568423170048, OAuth 1.0), а не
     `TheTieTieTies` (2115408906172485912)** — handoff предупреждал «не перепутать».
- **Что делать дальше (человек, X Developer Portal)**:
  1. App `TheTieTieTies` → Settings → **User authentication settings** → app permissions =
     **Read and Write** (Save).
  2. **Automated app label**: назначить приложению, подтвердить на @sxsiant.
  3. Убедиться, что минт-токен на `2115408906172485912`.
  4. **Переснять refresh-токен** после любых прав (старые токены не апгрейдятся) → обновить
     GitHub secret `X_REFRESH_TOKEN`. Для этого НУЖНО восстановить PKCE-helper
     (`tmp-pkce-mint.mjs` удалён; файл не в git; два фазных шага: URL авторизации →
     `code` из редиректа → token-обмен через прокси `curl -x http://127.0.0.1:10808`,
     т.к. локально api.x.com SNI-заблокирован).
  5. Потом: `workflow_dispatch` снова → ждём SUCCESS с реальным постом (в pending накоплен
     `New floor listing: #775 @ $0.13` и др.) → T6: удалить `Feed diagnostic` +
     `feed-diag.log` блок, раскомментировать cron `7 * * * *`, закоммитить.
- **Примечание**: токен ротируется КАЖДЫМ успешным refresh; ротация записывается в секрет
  автоматически (шаг Rotate), так что после починки прав всё подхватится само.

Проверки: `npm.cmd run bot` = **76/76**. Локальный живой cold-start (импорт run.mjs) записал
baseline в `bot/state.json` с новым форматом (listings с perAntUsd, antseed.posted/max7d) —
файл удалён, он gitignored.



## Session 11 — сплошное покрытие тестами (план `.kilo/plans/1793198256553-test-coverage-sweep.md`; НЕ закоммичено)

`npm.cmd test` полностью зелёный: **266 тестов, 265 pass, 1 skip, 0 fail**,
`authorizations_ok=1`. `npm.cmd run bot` = **43/43**, `npm.cmd run build` = OK,
`node scripts/site/guard-selftest.mjs` = `selftest=OK`. Добавлен замер покрытия:
`npm.cmd run test:coverage` (итог: lines 52.77%, branch 80.30%, functions 69.04%;
непокрытыми остались осознанно `render.mjs` и wallet-DOM glue в `market-view.mjs`).

### Новые тесты (все `node --test`, `site/*.test.mjs`)

- `market-config.test.mjs` — 20 тестов, энкодеры byte-for-byte против `viem`
  `encodeFunctionData` + golden-вектор `encCreateListing`; **98.56%** линий (было 0).
- `market-view.test.mjs` — `humanError` (все ветки) + `daysToSeconds` (кап 60 дней).
- `bot/format.test.mjs` — все форматтеры (13 тестов, ASCII-разделители `·`/`→`).
- `rpc-multicall.test.mjs` — `multicallResilient` с фейк-клиентом; **100%** линий.
- `own-listings.test.mjs` — `decodeListing` golden (11 слов), `ethCallTo` fallback
  по RPC, `readListings` через фейк-fetch (live и cancelled-пути); **90.04%**.
- `market-buy.test.mjs` — 8 сценариев флоу с инъекцией deps (нет кошелька, wrong
  network, allowance ≥/< price, approve/buy revert, success + `market:refresh`).
- `seaport-buy.test.mjs` — 12 сценариев на фикстуре `fixtures/seaport/order-205.json`
  (token/validate/price→needsConfirm/owner/approval/counter/filled/approve/simulate/success).
- `storefront-card.test.mjs` (12) + `storefront-table.test.mjs` (8) — jsdom,
  оба **100%** линий; `card-actions.test.mjs` (7) — делегированные клики.
- `storefront.test.mjs` (9) — `sortLots`/`matches`/`enrich`; `incentives.test.mjs`
  (16) — `isValidOffer`/`offerLine`/`buildOfferRows`/`nextBudget`/`cashback*`/
  `formatCountdown`/`formatUtc`/`buildOfferSection`.

### Аддитивные рефакторы продуктива (поведение не меняется)

- `site/own-listings.mjs` — вынесен чистый `decodeListing(words, { listingId })`;
  `ethCallTo(to, data, fetchImpl = fetch)`, `readListings(opts = { fetchImpl })`
  — fetch-инъекция прошита во все чтения (eth_call/blockNumber/getLogs).
- `site/market-buy.mjs` — `buyListing(input, report, deps = { walletRequest,
  ensureChain, waitReceipt, loadPublicMarket })`.
- `site/seaport-buy.mjs` — `buySeaportOrder(input, deps = { walletRequest,
  ensureChain, waitReceipt, loadPublicMarket, ethCallTo, fetch })`.
- `site/card-actions.mjs` — `opts.buyListing`/`opts.buySeaportOrder`/`opts.copy`
  (дефолты — реальные импорты); добавлен аддитивный share-хендлер `.sf-share`
  (clipboard + execCommand-fallback; кнопки в UI пока нет — код спящий).
- `site/storefront.mjs` — экспортированы `sortLots(lots, sort = state.sort)` /
  `matches(lot, listedOnly = state.listedOnly)` / `enrich(lot, snapshot, shares)`.
- `site/incentives.mjs` — экспортированы 8 чистых хелперов + `buildOfferSection`.
- `site/rebate-deploy.test.mjs` — `expectedRuntimeHash` под `existsSync` → `t.skip`
  («needs forge build»); без артефакта скип, с артефактом — проверка как раньше.

### Инфраструктура

- `jsdom@^30.1.3` в devDependencies; `site/dom-test-helper.mjs` (ASCII, 69 строк,
  В МАНИФЕСТ build-dist НЕ ДОБАВЛЯТЬ) — `setupDom(html)`, `teardown()`, `stubWallet()`.
- `package.json`: `"test:coverage": "node --test --experimental-test-coverage site/*.test.mjs"`.
- Модули с top-level `init()` (storefront/incentives) импортируются в тестах
  динамически ПОСЛЕ `setupDom()`; их init с сетью не тестируется.

### Проверки (все зелёные)

- `npm.cmd test` → 266/265/1-skip/0 (было 149/150 с 1 фейлом).
- `npm.cmd run bot` → 43/43. `npm.cmd run build` → OK, `dist_files=337`
  (+1 к плановым 336 — это `site/side-panels.mjs`, уже был в манифесте
  незакоммиченным, не результат этой сессии).
- `git status`: все изменения сессии — в рабочем дереве, НЕ закоммичены.

## Session 10 — Twitter bot @sxsiant: запуск (T0, баг CI, baseline) — ЗАКОММИЧЕНО и запушено

Бот запущен: креды заведены, критический баг CI найден и исправлен, baseline
записан в Actions cache. Остался только первый реальный пост (T6).

### T0 — креды + биллинг (человек, сделано)

- OAuth 2.0 на app **TheTieTieTies** (`2115408906172485912`): Type = Web App,
  Automated App or Bot (confidential client), redirect
  `https://lants.eth.limo/callback`, scopes `tweet.write tweet.read offline.access`.
  App permissions (OAuth 1.0a) = Read (минимум, OAuth 1.0a не используем).
- PKCE-минт refresh-токена под `@sxsiant`: двухфазный helper
  `tmp-pkce-mint.mjs` (root, НЕ коммитится; verifier в `%TEMP%\kilo\tmp-pkce-state.json`).
- GitHub Secrets: `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_REFRESH_TOKEN`.
- Billing (Pay Per Use): карта Visa ••••5324 (expires **10/2026** — обновить при
  пополнении!) + **$9 кредитов** на балансе.
- X **ротирует refresh-токен** при каждом refresh: в CI бот пишет ротированный в
  `state.json` (Actions cache), GitHub-секрет = стартовый fallback.

### Сеть (наблюдение, важно локально)

- Локально `api.x.com` / `api.twitter.com` недоступны напрямую (SNI-блокировка):
  терминал ходит только через системный прокси `127.0.0.1:10808`. Токен-обмен
  гонялся через `curl.exe -x http://127.0.0.1:10808`. В GitHub Actions API
  доступен — там бот и постит. Browser `twitter.com` работает (VPN/прокси).
- `antseedmarkets.com` доступен отовсюду (Cloudflare, без challenge).

### Коммиты этой сессии (все в origin/main)

- `27e92ba` feat(bot): add @sxsiant Twitter automation (bot/ + workflow).
- `b3ed759` fix(bot): report run mode and only cache state when written
  (workflow: guard save `hashFiles('bot/state.json') != ''` + summary с
  dry_run/логом/статусом state).
- `472c3dd`, `bcfd825` fix(bot): диагностика фида в workflow (временные шаги —
  убрать при включении schedule).
- `6356d31` fix(bot): add perAntUsd and includeNonFulfillable to seaport feed
  (site/seaport-feed.mjs + site/seaport-feed.test.mjs) — **критично**.

### Критический баг (найден и исправлен)

- В CI бот падал `feed unavailable (market-shape)`. Причина: правки сессии 4 в
  `site/seaport-feed.mjs` (`includeNonFulfillable` + поле `perAntUsd` в
  `normalizeSeaportItem`) остались **незакоммичены**. Локально бот работал (в
  рабочем дереве они есть), а в Actions чекаутился старый парсер без `perAntUsd`
  → `toMarket` отбрасывал все лоты → `market-shape`. Диагностика реальным
  код-путём (Feed diagnostic, временный) подтвердила, фикс — `6356d31`.

### Статус T6

- Baseline записан: run #6, `state.json written (3680 bytes)`, кэшируется
  (`twitter-bot-state-main-*`).
- Осталось: дождаться изменения рынка (floor/листинг/трейд/закрытие epoch или
  antseedstats: burn/settled/staked/epochstats) → `workflow_dispatch` без dry_run
  → проверить первый пост на `@sxsiant` → раскомментировать `schedule` в
  `.github/workflows/twitter-bot.yml` и убрать диагностические шаги (Feed
  diagnostic + лишний вывод в Summarize).
- Проверки: `npm.cmd run bot` = **43/43**.

### Мелочи

- Есть второе X-приложение **rainonbase** (`2067642568423170048`, OAuth 1.0 для
  @sxsiant, Client ID `Q1BtQURS…`) — НЕ путать с TheTieTieTies; бот на
  TheTieTieTies.
- `tmp-pkce-mint.mjs` и `%TEMP%\kilo\tmp-pkce-state.json` можно удалить (не
  коммитятся).

## Session 9 — veXy-полировка шапки/табов/таблицы + Share-фикс (НЕ закоммичено)

Всё в рабочем дереве, поверх сеансов 4–8. UI под veXy.

- **Порядок плиток шапки** (`index.html`): Floor Ask/ANTS → Avg Price (24H) →
  24H Volume → Listed/Supply → Implied MC → Implied FDV (сначала действенное,
  оценки в конец).
- **Market strip** (`index.html`): убраны 3 строки `ms-sub` («locked staking»,
  «positions · Base», «positions are splittable»); осталось «lANTS Market» +
  ссылки (сайт, X, Market, Positions) — как «sAERO Market» на veXy.
- **Табы** (`index.html`): «All positions» → **Listings**, «Listings» →
  **Offers** (как у veXy). Внимание: контент второй вкладки не троган — там
  по-прежнему формы «List a position» / «Manage a position».
- **Table/List убран** (`index.html`, `storefront.mjs`, `storefront.css`):
  переключатель и логика `setView`/`state.view` удалены; осталась только
  veXy-таблица. Мёртвый CSS `.sf-views`/`.sf-view-btn`/`.sf-toolbar.is-list`
  убран. Легаси `render.mjs` оставлен скрытым (AGENTS.md «prefer not to modify»).
- **+ Sell** (`index.html`, `storefront.css`): переехал из строки табов в
  тулбар таблицы (справа от Sort/Listed only), залитая акцентная кнопка
  `.sf-sell`. Клик → открывает «Offers» и фокусирует `#cf-nftid` в «List a
  position».
- **Share-фикс** (`card-actions.mjs`): ссылка была захардкожена на
  `https://lants.eth.limo/` → вела «вникуда» (прод старый, без роута
  `#position/{id}`). Теперь `shareBase()` считает `origin+pathname` лениво
  (локально работает; без top-level `window`, чтобы не ломать Node-тесты).
- **Смоук-гарды** (`scripts/site/check_sticky.py`, `check_fresh.py`):
  «All positions» → «Listings».
- **Listed/Supply 15/15 — не баг**: числитель = `listedCount` (15) из фида,
  знаменатель = `totalNfts` (483) из фида; `market-view.mjs` берёт `totalNfts`.
  «15/15» — стейл-кэш браузера (Ctrl+F5). Корректно: **15/483**.

Проверки: `npm.cmd test` = **149/150** (прежний `rebate-deploy`), `npm.cmd run
build` = OK, **336 файлов**.

## Session 8 — унификация источника, кнопки, Sales, де-брендинг доков (НЕ закоммичено)

### Унификация источника (план `.kilo/plans/seaport-unification.md`, T1–T3)

- `market-config.mjs`: `SEAPORT_BUY_ENABLED = true` (гейт T0 — fork-прогон — НЕ записан).
- `storefront-card.mjs` / `storefront-table.mjs`: убраны бейджи `Seaport`/`lants`,
  бейджи `also on …`, строки `Seaport order · listed on antseedmarkets.com`.
- `storefront.mjs` + `index.html`: убран фильтр Source (`#sf-source`), `state.source`
  и ветка `matches()`; баннеры де-брендированы («Some listings are temporarily
  unavailable.»).
- `card-actions.mjs`: убран link-out fallback и импорт `SEAPORT_MARKET_URL`.
- `seaport-buy.mjs`: ошибки без «Buy on antseedmarkets.com»/«Seaport».
- `position-page.mjs`: в History убрана подпись `seaport`/`lants` (остались дата + цена).
- Полный де-брендинг UI-текста: `index.html` tooltip Floor Ask → «across all
  listings»; `docs/03-listings.md` («Aggregated Seaport lots» → «Aggregated
  listings», колонка `Source` → `Kind`, строка `Seaport` → `Aggregated order`);
  `docs/05-snapshot-data.md` («Price sources» → «Price measures», `Source` →
  `Origin`, «Seaport feed (antseedmarkets.com)» → «market feed»). `docs.html`
  пересобран. Grep по `index.html`/`docs.html` — «Seaport»/«antseedmarkets» в
  видимом UI отсутствуют.
- Оставлено намеренно (не UI-брендинг): `Seaport 1.6` как имя контракта в доках,
  URL/комменты фида в коде (`seaport-feed.mjs`/`seaport-buy.mjs`/`position-page.mjs`),
  инварианты в `AGENTS.md`.

### Кнопки и CSS

- `storefront.css`: удалены `.sf-badge-{lants,seaport,alt}`, `.sf-attrib`,
  `.sf-btn-link`; у `.sf-buy` убран `flex: 1 1 auto` (кнопка не растягивается);
  `.sf-share` получил `min-width: 96px` (без скачка на «Copied»).

### Sales-панель (internal-продажи)

- `market-config.mjs`: `INTERNAL_LISTING_IDS = [0, 1, 2, 3, 4, 5]` (1-5 — наши
  кошельки, 2026-10-01). Автоматически исключены из volume/FDV/implied.
- `market-view.mjs` `updateSales`: internal-продажи больше не выводятся в панели
  Sales (убраны пометка «internal» и note «internal = our own wallets…»).
- `listing-model.test.mjs`: фикстуры `listingId` сдвинуты на 50/60/70/51/52/53,
  чтобы не пересекаться с расширенным `INTERNAL_LISTING_IDS`.

Проверки: `npm.cmd test` = 149/150 (pre-existing `rebate-deploy`), `npm.cmd run
build` = OK, 336 файлов. Локальный превью: `http://127.0.0.1:8099`.

Полный контекст для следующей сессии. Спринт «storefront + deep page + Seaport
aggregation» реализован целиком; код лежит в 14 незапушенных коммитов поверх
`origin/main` (`8c8b692..b249ba5`). Деплой не запускался.

## NEXT — Twitter bot: antseedstats сделано, остались гейты человека

План `.kilo/plans/twitter-bot-automation.md` §13. Бот в рабочем дереве
(`bot/`, `.github/workflows/twitter-bot.yml`), **не закоммичен**. Реализовано
всё, кроме гейтов человека T0/T6: `npm.cmd run bot` = **43/43**.

### Сделано (сеансы 4–5)

- **1/day-гейт убран** (`todayUtc`/`lastPostDay` выпилены из `state.mjs`);
  постит все pending. Опциональный кап на прогон: `--max-posts N` /
  `MAX_POSTS_PER_RUN` (по умолчанию 0 = без капа).
- **Cold start = baseline** — без постов, как было.
- **X ANTS emitted** — из нашего `data/live.json`, не фид конкурента.
- **antseedstats.com** (`read-antseedstats.mjs` + фикстуры + тесты) — 4 типа
  постов, атрибуция `data: antseedstats.com`:
  - `burn` (дискретный) — `burns[]` из `/api/v1/ants/supply`.
  - `settled` 24h/7d/30d (непрерывный, порог ±5%) — `/api/v1/network/summary`.
  - `staked` (непрерывный, ±5%) — `partition.staked_ants`/`staked_pct` из
    `/api/v1/ants/supply` (1.54M / 73.2%).
  - `epochstats` (дискретный) — обогащённый close из `/api/v1/epochs`:
    emission / seller points / burn (когда финализирован).

### Находки (решения)

- **staked берём из `/api/v1/ants/supply`**, не `/staking/pools`: числа 1.54M /
  73.2% — это `partition.staked_ants` / `staked_pct`. `/staking/pools` даёт
  другой «active stake» (`total_stake_ants` ≈ 1.16M) + `budget_ants`; не постим.
- **новая модель / изменение цены отложены**: `/api/v1/models` и `/api/v1/prices`
  пагинируют по 100 (total 789 / 1906), полные страницы (`?limit=1000`) на
  free-тарифе таймаутят → change-only по полному каталогу ненадёжно. Парсеры
  (`parseModels`, `parsePrices`) и фикстуры оставлены и покрыты тестами;
  `readAntseedStats` фетчит только 3 надёжные секции (network, supply, epochs).

### Гейты человека (не изменились)

- **T0**: OAuth 2.0 у app `2115408906172485912`, scopes (`tweet.write`,
  `tweet.read`, `offline.access`), PKCE-флоу под `@sxsiant`, карта в Billing,
  секреты `X_CLIENT_ID`/`X_CLIENT_SECRET`/`X_REFRESH_TOKEN` в GitHub.
- **T6**: первый `workflow_dispatch` = baseline (постов нет); реальный пост —
  на следующем изменении (или подсеять старый floor в `bot/state.json`);
  затем раскомментировать `schedule` в `.github/workflows/twitter-bot.yml`.

## Session 7 — «Listed only» по умолчанию + план Seaport-унификации (НЕ закоммичено)

Две правки: галочка «Listed only» на витрине теперь включена по умолчанию.

- `site/storefront.mjs` — `state.listedOnly: false → true`.
- `site/index.html` — у `<input id="sf-listed">` добавлен `checked` (совпадает
  с DOM до инициализации JS).

Проверки: `npm.cmd test` = **149/150** (тот же pre-existing `rebate-deploy`
`expectedRuntimeHash`, нет `contracts/out/RebateClaims.sol/RebateClaims.json` —
нужен `forge build`), `npm.cmd run build` = OK, **336 файлов**.

Отдельно зафиксирован план следующей большой темы — **Seaport-унификация**
(спрятать источник: юзер не должен видеть разницу, покупает ли он у нас или у
antseedmarkets.com): `.kilo/plans/seaport-unification.md`. Кратко: убрать
бейджи/атрибуцию «Seaport» и фильтр Source из таблицы и карточек, включить
единый Buy через `SEAPORT_BUY_ENABLED = true` (гейт — Base-fork fulfil-тест,
на машине нет forge/anvil), чуть поменять структуру таблицы (уточнить форму).

## Session 6 — прыгающий логотип (НЕ закоммичено)

По просьбе сделать лого «прыгающим, как эмодзи» (исходники — `.tgs`/`.gif`
в `C:\Users\romim\OneDrive\Рабочий стол\AntseedEmoji`, в браузер не ставятся —
это Telegram-стикеры). Прыжок воспроизведён чистым CSS на статичном
`antseed-mark.png`.

- `site/storefront.css` — `.brand-mark`: 30→40px, `transform-origin: 50% 100%`;
  `@keyframes brand-hop-in` (одиночный хоп с разворотом −4°→+4°, squash/stretch,
  `animation-iteration-count: 1` — играет только при загрузке); `.brand:hover
  .brand-mark` → `@keyframes brand-hop-loop` (мягкий повторный баунс при
  наведении). `prefers-reduced-motion: reduce` отключает обе анимации.
- `site/index.html` — из шапки убран `<span>lANTS</span>` (марка самодостаточна;
  слово осталось в `market-strip` «lANTS Market»), `img.brand-mark` 30→40,
  `alt="lANTS"` (для скринридеров), `aria-label` ссылки-домой не тронут.

Решение UX: бесконечный цикл убран намеренно (движение в шапке на всех вкладках
отвлекает) — оставлен разовый входной хоп + hover-баунс.

Проверки: `npm.cmd test` = **149/150** (тот же pre-existing `rebate-deploy`),
`npm.cmd run build` = OK, **336 файлов** (dist_bytes ≈ 5.96 MB).

## Session 5 — veXy-style таблица витрины + фиксы вёрстки (НЕ закоммичено)

Карточки витрины заменены на таблицу в духе veXy.fi (та же раскладка, те же
данные). Всё лежит в рабочем дереве, не запушено.

### Таблица витрины

- `site/storefront-table.mjs` (НОВЫЙ) — сборка строк `<table>`; колонки
  `Position | Price | Staked | Reward | Unlock | Actions`. Маппинг на наши
  данные: Discount → `$/ANTS` (под ценой), Staked → `X ANTS`, Lock →
  `15w · 11 Feb 2027` / `max lock`, плюс наша колонка Reward
  (`100.8% ≈14.78 ANTS/epoch`).
- `site/storefront.mjs` — `renderGrid` → `renderTable`, рендер `<table>` в
  `#sf-grid`.
- `site/storefront-card.mjs` — экспортированы `el`/`badge`/`buyNode`/
  `formatPrice`/`formatPerAnt` (переиспользуются таблицей).
- `site/card-actions.mjs` — делегирование ловит и `.sf-row`.
- `site/index.html` — кнопка «Grid» → «Table».
- `scripts/site/build-dist.mjs` — новый файл в манифест.

### Фиксы этого сеанса (по отзывам пользователя)

1. **Наложение текста** `Seaport order · listed on antseedmarkets.com` —
   глобальные правила `app.css` протекали на `.sf-table` (`table-layout:fixed`,
   `min-width:560px`, `th/td:nth-child{width:%}`, `td{white-space:nowrap}`).
   В `storefront.css` добавлены оверрайды: `table-layout:auto`, `min-width:0`,
   `width:auto`, `white-space:normal`, `overflow-wrap:anywhere` на `.sf-sub`.
2. **Кнопки Actions в линию** — `.sf-table .sf-actions {flex-wrap:nowrap}`
   (иначе при `table-layout:auto` колонка получала ширину самой широкой кнопки
   и кнопки переносились в столбик).
3. **Вернул сайдбар** (Sales + Discount vs Lock Size) — панели были вложены в
   скрытый `#all-list-view`, поэтому в «Table» правая колонка 320px пустовала
   и таблица не шла на всю ширину. Перестроил `.all-layout` в `index.html`:
   добавлен wrapper `.main-col` (toolbar + таблица + CTA), `aside.side-panels`
   вынесен в правую колонку, CTA — под таблицу. CSS в `app.css` (`.main-col`
   flex-column + явный grid placement: `.side-panels` в col 2, `.snap-footer`
   в col 1).
4. **Свитч Table ⇄ List ломался** — `render.mjs` (легаси-таблица «List»)
   использовал нескоупленные `document.querySelector('table tbody')` /
   `('table thead th')`; после появления `.sf-table` писал/сортировал в чужую
   таблицу. Скоуплено на `#rows` / `#all-list-view table thead th`.

### Проверки

- `npm.cmd test` = **149/150**; единственный фейл pre-existing `rebate-deploy`
  (`expectedRuntimeHash` — нет `forge build` / `contracts/out/RebateClaims.sol/*.json`).
- `npm.cmd run build` = OK, **336 файлов**, `dist_bytes` ≈ 5.96 MB.
- Браузером локально не смоукено (у модели нет image-входа); проверить вручную
  `http://127.0.0.1:8099/index.html#market` (Ctrl+F5).

### Открыто / заметки

- **Discount vs Lock Size** — статичная заглушка «SOON»; источника данных под
  график нет (отдельный график, как на veXy).
- **Sales** — наполняется динамически `market-view.mjs` (`updateSales`) из
  чейн-продаж; при отсутствии продаж — заглушка.
- Шапка статов veXy (7-Day Sales / Avg Discount / Volume) над таблицей НЕ
  добавлена (была предложена, не запрошена).
- Мелочь (pre-existing): в «List» тулбар Sort/Source/Listed виден, но фильтрует
  только «Table».
- `render.mjs` изменён вопреки заметке AGENTS.md «prefer not to modify» — но
  минимально (скроуплены 4 селектора), иначе List-вью сломана.

## Session 4 — Twitter bot @sxsiant (в рабочем дереве, НЕ закоммичено)

План: `.kilo/plans/twitter-bot-automation.md`. Сделаны T1–T5 и T7; **T0**
(креды/PKCE/биллинг) и **T6** (первый пост + включение cron) — гейты человека.
Тексты постов — `docs/twitter-content-plan.md`.

- `site/seaport-feed.mjs` расширен аддитивно: опция `includeNonFulfillable`,
  поля `currentEpoch`/`offeredCount`/`antsTotalSupply`, у лота `lockDays`/
  `perAntUsd`. Витрина не затронута (по умолчанию фильтр `fulfillableHere`).
- `bot/read-feed.mjs` — общий парсер фида + `/api/lants/trades` (только
  USDC-филлы; ETH/WETH-офферы с `amount: null` отбрасываются) + эмиссия
  закрытого epoch из живого снапшота.
- `bot/diff.mjs` — чистое change-only сравнение; холодный старт только пишет
  baseline, ничего не объявляет.
- `bot/format.mjs` — сборка текстов; `\u00b7`/`\u2192` эскейпами (ASCII).
- `bot/state.mjs` — очередь `pending`, dedup-ключи, гейт «1 пост/UTC-день»,
  история отправленного (cap 200), стейл-очередь 48ч.
- `bot/xapi.mjs` — OAuth 2.0 refresh (Basic auth) + `POST /2/tweets`, без SDK.
- `bot/run.mjs` — CLI; `--dry-run` печатает точный текст и ничего не постит.
  Коды выхода: 0 — норма/retryable (429/сеть), 1 — нужен человек (креды/401/403).
- `.github/workflows/twitter-bot.yml` — `workflow_dispatch` (+ `dry_run`), cron
  закомментирован; состояние в Actions cache по ветке. Секреты:
  `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_REFRESH_TOKEN`.
- `bot/.env.example` — локальные переменные; `bot/state.json` в `.gitignore`.

Проверки: `npm.cmd run bot` = **28/28**. Site-сьют (`npm.cmd test`) — единственный
фейл прежний `rebate-deploy` (`forge build` / `contracts/out`), новых нет.
Dry-run на живом фиде печатает все 5 типов: floor, listing, delist, trade,
epoch (`Epoch 27 closed · 75,613 ANTS emitted · 24h avg $0.102 · lants.eth.limo`);
гейт 1/день и cold-start (baseline без постов) проверены локально.

Самопроверка (ревью незакоммиченных изменений) — исправлены 2 находки, обе с
регрессионными тестами: (1) при недоступном трейд-фиде `tradeIds` больше не
сбрасывается в `[]` (иначе следующий прогон постил бы всю историю как новые
«Sold»); (2) пагинация трейдов считается по raw-ид, а не по нормализованным
USDC (иначе обрыв после первой страницы при истории > `pageSize`).

Решения/отклонения от буквы плана:

- «X ANTS emitted» берётся из живого снапшота (сумма `rewardByEpoch[closedEpoch]`
  по позициям) — третий источник только для epoch-поста; если недоступен, пост
  выходит без X, а не с выдуманным числом.
- Epoch-пост объявляет **закрытый** epoch (`currentEpoch - 1`): в фиде
  `currentEpoch` — активный, при переходе 28→29 закрылся 28.
- Только USDC-трейды (`currency === 'USDC'`); `tradeType: offer` не постится как
  «Sold».
- Ротация refresh-токена сохраняется в `state.json` (кэш CI); GitHub-секрет —
  fallback, при протухании нужен повторный PKCE-flow.

Осталось (человек): **T0** — в app `2115408906172485912` включить OAuth 2.0,
задать redirect URI + scopes (`tweet.write`, `tweet.read`, `offline.access`),
прогнать PKCE-flow под `@sxsiant`, добавить карту в Billing и секреты в GitHub;
**T6** — первый `workflow_dispatch` пишет только baseline (change-only: cold
start не постит); затем `dry_run=false` на следующем изменении (трейд/floor) или
подсеять `bot/state.json` со старым floor, проверить пост на `@sxsiant`,
раскомментировать `schedule` в `twitter-bot.yml`.

## Session 3 — FDV/MC/Supply fix (в рабочем дереве, НЕ закоммичено)

После спринта, по отзыву кофаундера (Amos, Node.Capital: «FDV not calculated
well», «theirs looks better») и сравнению с antseedmarkets.com, исправлен
расчёт шапки. Всё ниже — незакоммиченные изменения в рабочем дереве.

Причина расхождения: у нас MC/FDV считались от **VWAP живых асков** ($0.416 →
FDV $432M); конкурент и стандарт (CoinGecko: «based on its current market
price») используют **реализованную цену** = 24h avg продаж ($0.1019 → $106M).

Что изменено:
- `site/market-stats.mjs` — `computeImpliedFromAsks` принимает `referencePrice`;
  MC/FDV = referencePrice × supply (VWAP — только fallback, для тестов).
- `site/market-view.mjs` — `updateTiles`: referencePrice = feed `avgPrice24h`;
  supply = feed `totalNfts` (fallback — открытые позиции снапшота, не весь
  леджер). AvgPrice/MC/FDV = «—» без фида (не искажённый VWAP).
- `site/index.html` — «Implied Price/ANTS» → «Avg Price (24H)»; FDV-тултип:
  «priced via locked lANTS, not liquid ANTS».
- `site/market-stats.test.mjs` — тесты 13/14 на referencePrice.
- `site/docs/05-snapshot-data.md` + `docs.html` — таблица price sources и
  дисклеймер про locked-цену и totalSupply (не circulating).
- `AGENTS.md` — инвариант шапки обновлён.
- `scripts/site/check_market_tiles.py`, `check_tips.py` — докстринг/метка.

Результат (сверено с фид-фикстурой): Avg Price $0.1019, MC $13.24M, FDV
$106.0M, Listed/Supply 15/483, Floor $0.14 — совпадает с конкурентом.

Открытые оговорки (осознанные, задокументированы): MC берёт totalSupply, а не
circulating; FDV считается через цену залоченных lANTS (дисконт локи), т.к.
жидкого рынка ANTS нет.

Проверки: `npm test` 147/148 (pre-existing `rebate-deploy`), build 335 файлов.

## Состояние на конец сессии

- Ветка `main`, синхронизирована с `origin/main` (все site-коммиты + бот +
  фиксы запушены; HEAD `6356d31`). В рабочем дереве остались незакоммиченные
  правки сеансов 4–9 (twitter bot + veXy-таблица + вёрстка + прыгающий лого +
  «Listed only» по умолчанию + Seaport-унификация + Sales-фикс + veXy-полировка
  шапки/табов/таблицы + Share-фикс) + tmp-файлы.
- `npm test` = **149/150**. Единственный фейл pre-existing: `rebate-deploy`
  `expectedRuntimeHash` — нужен `forge build` / `contracts/out`.
- `npm.cmd run bot` = **43/43**. Twitter bot @sxsiant **закоммичен и запушен**:
  5 рыночных типов (floor/listing/delist/trade/epoch) + 4 antseedstats-типа
  (burn/settled/staked/epochstats, атрибуция `data: antseedstats.com`);
  1/day-гейт убран, опциональный кап `--max-posts N`. **T0 сделан** (креды,
  секреты, биллинг $9, см. Session 10); baseline в CI записан; остался первый
  пост **T6** — детали в Session 10 выше.
- `npm run build` = OK, **336 файлов**, `dist_bytes` ≈ 5.96 MB.
- Шапка: лого-марка 40px без текста `lANTS`, разовый входной хоп + hover-баунс
  (CSS, `prefers-reduced-motion` учитывается).
- Витрина — **только таблица** (переключатель Table/List удалён): колонки
  Position/Price/Staked/Reward/Unlock/Actions + сайдбар Sales / Discount vs Lock
  Size справа; CTA под таблицей; в тулбаре справа кнопка **+ Sell** (открывает
  форму «List a position»). Табы: **Listings** / **Offers**. Шапка-плитки
  переставлены (Floor → Avg → Volume → Listed/Supply → MC → FDV), market strip
  без подстрок («lANTS Market» + ссылки). Браузерный смоук не гонялся (нет
  image-входа у модели) — проверить вручную
  `http://127.0.0.1:8099/index.html#market`.
- Фильтр «Listed only» включён по умолчанию (`storefront.mjs` + `index.html`).
- Seaport-унификация выполнена (T1–T3): де-брендинг везде (карточки, таблица,
  баннеры, ошибки, tooltip шапки, доки), фильтр Source убран, единый Buy,
  `SEAPORT_BUY_ENABLED = true`. Кнопки Buy/Share компактнее.
- Sales-панель: `INTERNAL_LISTING_IDS = [0..5]`, internal-продажи скрыты.
- Base-fork fulfil-прогон (гейт T0) так и не записан — флаг `true` временный,
  путь закрыт `validateOrder` + on-chain проверками + `eth_call`-симуляцией.

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

**Бот @sxsiant — остался T6 (код запушен, T0 сделан; детали — Session 10 выше):**

- **T6 (первый пост)** — дождаться изменения рынка (floor / listing / delist /
  trade / закрытие epoch / antseedstats: burn/settled/staked/epochstats),
  запустить `workflow_dispatch` **без** dry_run → проверить пост на `@sxsiant`.
  После проверки: раскомментировать `schedule` в
  `.github/workflows/twitter-bot.yml` и убрать диагностические шаги (Feed
  diagnostic + лишний вывод в Summarize).
- Мелочи: обновить карту Visa ••••5324 (expires 10/2026) при пополнении; можно
  удалить `tmp-pkce-mint.mjs` + `%TEMP%\kilo\tmp-pkce-state.json`.

1. **Fork-тест Seaport fulfill** (гейт T0): записать Base-fork fulfil-транскрипт —
   `ownerOf = buyer`, точная сумма USDC продавцу, fee, `getOrderStatus` → filled.
   Ордер `order-205.json` или свежий live-ордер. На машине нет `forge`/`anvil` —
   поставить Foundry или прогнать на другой машине. Флаг уже `true` (по решению
   пользователя), тест — верификация перед деплоем, а не гейт включения.
2. **T4 — структура таблицы**: уточнить форму у пользователя (колонка
   Seller/Provider?).
3. **Запушить 14 коммитов** в `origin/main` (ревью пройдено) + решить, что
   коммитить из незакоммиченных правок сеансов 4–9 (бот, veXy-таблица, лого,
   «Listed only», унификация, Sales-фикс, veXy-полировка UI, Share-фикс).
4. **Деплой**: GitHub → Actions → `snapshot` → Run workflow → `source=manual`
   (CI сам enrich → build → publish CAR + IPNS). Локально ничего не публиковать.
5. Возможные follow-up: единый кэш/дедуп Seaport-фида для storefront и
   position-page; ограничить параллелизм `readListings()` (публичные RPC уже
   давали 429/400 в смоуке); мониторинг фида конкурента.
6. Уточнить у пользователя семантику вкладки **«Offers»**: сейчас внутри —
   формы «List a position» / «Manage a position» (мисмэтч с названием). Нужен ли
   отдельный список офферов, или «+ Sell» вести на отдельную модалку/страницу
   «выбрать NFT для продажи» (как у veXy).

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
`.kilo/` (включая plan-файлы), `lants-thread/`, `notes/README.md`,
`notes/aisurplus.md`, `docs/twitter-content-plan.md`, `tmp-*.mjs` в корне.
Их не добавлять в коммиты. Планы:
`.kilo/plans/1793182796132-storefront-seaport-aggregation.md` (T0–T8) и
`.kilo/plans/twitter-bot-automation.md` (код запушен, §13; **T0 done, остался T6**
— первый пост + cron, детали в Session 10).
`bot/state.json` — рантайм-стейт, гитигнорится (в CI — Actions cache);
`docs/twitter-content-plan.md` — компаньон бота, решение о коммите за человеком.
Новый план: `.kilo/plans/seaport-unification.md` (T0–T5; T0 — fork-тест/гейт).

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
