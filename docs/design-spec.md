# Specification for the lants.eth storefront — layout analysis of vexy.fi

Created with vision model `claude-opus-4.8` @ Apex based on a live screenshot of vexy.fi 19.09.2026, $0.035099.
We take the structure, not the code: their contracts and markup are not provided under a license.

## Specification for the MARKUP

### 1. Order of blocks from top to bottom
1. **Header (sticky):** logo “lANTS” on the left; centered tab menu `Market / My Portfolio`; on the right an activation toggle `lANTS` + `Connect` button.
2. **Market header bar:** pool avatar + `lANTS Market` with links (site/socials), to the right in a row — 3 metric tiles, and on the far right a `Make Offer` button.
3. **Main 2‑column grid** (≈65% / 35%):
   - Left column: tabs `Listings / Offers` + `+ Sell` button, then **positions table**, below it a block “Not seeing anything you like? → Make an offer”.
   - Right column (sticky): **Sales** block (latest deals + pagination), below it **Discount vs Lock Size** block (scatter chart) + our weight legend.
4. **Footer:** Terms of Service / Privacy Policy + social media icons.

### 2. Metric tiles (3 pieces, in a single row)
- `7-Day Sales` → integer (e.g., `62`).
- `Avg Discount` → percentage (`12,24 %`).
- `7-Day Volume` → amount in $ (`$379 694`).
- Metric label — small, muted gray, on top; **value — large, white, monospaced**, below. Next to the label a small “i” icon (tooltip).

### 3. Positions table (Listings)
Columns left to right:
1. `ID` (monospace, `#12345`, left).
2. `Discount` — **badge/colored text**, right‑aligned; default sorting (arrow ↓).
3. `Locked` — number, right.
4. `Price` (in token) + mini token icon, right.
5. `Price USD` — right, compact format (`$5,4k`).
6. `Lock` — duration (`max` or `3.73y`), right.
7. **[Our 4 columns — see item 7]**.
8. `Buy` — green outline button, right, fixed width.

Rules:
- All numbers — **monospaced font, right‑aligned**, thousands separated by non‑breaking space, decimal with comma.
- `Discount` — color accent: the higher the discount, the more saturated green (or badge). Negative/zero values — gray/red.
- Rows have equal height, hover — subtle row highlight.

### 4. Colors and theme
- **Dark theme:** background almost black (#0B0F0E), cards slightly lighter (#12181A), borders thin gray‑green.
- **Accent — green** (#3FE0A8 / teal) for buttons, discount, chart points.
- **Positive** — green; **negative/penalty** — red‑orange (#FF6B5C).
- Text: primary white/light‑gray, labels — muted gray.

### 5. Typography
- **Monospaced** — all numbers (ID, discount, amounts, durations, metrics).
- **Regular (sans)** — headings, labels, buttons, navigation.
- Hierarchy: market H1 ≈ 24–28px; block headings (`Sales`, `Discount vs Lock Size`) ≈ 18–20px; metric values ≈ 20–24px; table text ≈ 13–14px; labels ≈ 11–12px.

### 6. Mobile (390px)
- Metrics: 3 tiles → horizontal row of 3 narrow ones or a 2+1 grid; values stay large.
- Sidebar (Sales + chart) moves **down, below the table**.
- **Table → cards:** each position = a card. Card top: `#ID` left + `Discount` (large, colored) right. Inside — “label: value” pairs in 2 columns: Locked, Price USD, Lock + our 4 fields. `Buy` button full‑width at the bottom of the card.
- In the card hide `Price` in token (keep only Price USD), Locked can be collapsed under “show details”.

### 7. What they lack — our 4 mandatory columns
Add **to the listings table, immediately after `Discount`** (these are important for valuation), in order:
1. **`Payout Start`** — when the position will start paying (date/after N epochs; if already paying — `active` in green).
2. **`Weight`** — decaying or not: badge `decaying ↓` (orange) / `stable →` (green/gray).
3. **`Next Epoch Reward`** — expected reward, number + $ in parentheses, right, monospaced.
4. **`Exit Penalty`** — early‑exit percentage; red text, right (`—` if none).

Placement:
- On **desktop** — 4 columns between `Discount` and `Locked` (or immediately after `Lock` if price is more important). Visibility priority: `Discount → Payout Start → Weight → Reward → Penalty`.
- On **mobile** — these 4 fields appear in pairs inside the card under the header.
- In the **Discount vs Lock Size** block add **point color = weight status** (green stable / orange decaying) and legend label.

---

## MEASUREMENT (if space runs out)
Check total width: 8 base + 4 of our columns may not fit into the 65% column.
- **If it fits (>1100px working area):** all 12 columns in a row.
- **If it does not fit:** collapse `Price` (token) and `Locked` under an expandable detail row, keep our 4 columns always visible — they have higher priority.
