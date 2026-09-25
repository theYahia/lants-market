// Market read-view: connect wallet via eth_requestAccounts, check chainId,
// read listings with eth_call and render rows.  No eth_sendTransaction here.

let selectedProvider = null;
let connectedAccount = null;
const walletRequest = (args) => (selectedProvider ?? window.ethereum).request(args);

import {
  MARKET, SEL, encUint, encAddr, decodeWords, wordToBigInt, wordToAddr, formatUnits,
  cancelNftListings, encCreateListing, encSetApprovalForAll, INTERNAL_LISTING_IDS
} from './market-config.mjs';
import { computeMarketStats } from './market-stats.mjs';
import { isMaxLock, expectedReward, exitSlash } from './metrics.mjs';

// Lazily-built Privy island.  The Privy bundle is heavy, so it must never be
// pulled in via a static import at module load (a headless watchdog that does
// not click must not download it).  ensurePrivy() performs the only dynamic
// import in the file, mounts the React island exactly once and opens the modal.
let _privyMounted = false;
let _openPrivy = null;

// openPrivy() is a no-op until the React island has rendered and Privy is
// ready (bridge.connectWallet is assigned inside a useEffect).  Poll it on a
// short retry so the first click reliably opens the modal.
function _openWithRetry() {
  if (typeof _openPrivy !== 'function') return;
  let attempts = 0;
  const maxAttempts = 50; // ~5 s at 100 ms
  const tick = () => {
    // Stop once a wallet provider has been captured (modal did its job).
    if (selectedProvider) return;
    try { _openPrivy(); } catch (e) { /* ignore until ready */ }
    if (++attempts >= maxAttempts) return;
    setTimeout(tick, 100);
  };
  tick();
}

export async function ensurePrivy() {
  if (_privyMounted) {
    _openWithRetry();
    return;
  }
  _privyMounted = true;

  const m = await import('./vendor/privy/privy.js');
  _openPrivy = m.openPrivy;

  m.mountPrivy(MARKET.privyAppId, (provider, address) => {
    selectedProvider = provider;
    onConnect();
  });

  _openWithRetry();
}

// Disconnect flow: use the same chunk as ensurePrivy(), then reset local state
// and the header button back to its "Connect" appearance.
export async function disconnectWallet() {
  try {
    const m = await import('./vendor/privy/privy.js');
    if (typeof m.disconnectPrivy === 'function') {
      await m.disconnectPrivy();
    }
  } catch (e) {
    /* ignore disconnect errors */
  }

  selectedProvider = null;
  connectedAccount = null;

  const btn = document.getElementById('hdr-connect');
  if (btn) {
    btn.textContent = 'Connect';
    btn.classList.remove('mono', 'connected');
    btn.style.fontFamily = '';
    delete btn.dataset.connected;
  }

  const pfSnapshot = document.querySelector('.pf-snapshot');
  if (pfSnapshot) pfSnapshot.textContent = '';
}

// Put the header button into the "connected" state showing the short address.
function setConnectedButton(account) {
  const btn = document.getElementById('hdr-connect');
  if (!btn || !account) return;
  btn.textContent = account.slice(0, 6) + '…' + account.slice(-4);
  btn.classList.add('mono', 'connected');
  btn.style.fontFamily = 'monospace';
  btn.dataset.connected = '1';
}

const tableEl = () => document.getElementById('market-list');

const ZERO = '0x0000000000000000000000000000000000000000';
const SELECTORS = {
  listingsLength: SEL.listingsLength,
  listings: SEL.listings,
  listingPrice: SEL.listingPrice
};

// Live snapshot URLs: primary (data branch) first, IPNS fallback.
const LIVE_URLS = [
  'https://raw.githubusercontent.com/theYahia/lants-market/data/live.json',
  'https://ipfs.filebase.io/ipns/k51qzi5uqu5di86efhnadxw0k1sxnuo2tkcmegxcn2ra2r3exyfpv9htxhit6b/fixtures/snapshot-e23.live.json'
];

// Number of 32-byte words in the listings(uint256) struct (measured by ABI).
const WORDS_PER_LISTING = 11;

async function ethCallTo(to, data) {
  const READ_RPCS = [
    'https://base-rpc.publicnode.com',
    'https://base.drpc.org',
    'https://mainnet.base.org'
  ];
  for (const rpc of READ_RPCS) {
    try {
      const response = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [{ to, data }, 'latest']
        })
      });
      if (!response.ok) continue;
      const json = await response.json();
      if (typeof json.result === 'string') {
        return json.result;
      }
    } catch (_) {
      // try next RPC
    }
  }
  throw new Error('all public RPCs failed');
}
async function ethCall(data) { return ethCallTo(MARKET.market, data); }

// Ensure the wallet is on the expected chain, switching (and adding if needed)
// instead of bailing out with a 'wrong network' message.
async function ensureChain() {
  let chainId = await walletRequest({ method: 'eth_chainId' });
  if (
    String(chainId).toLowerCase() ===
    String(MARKET.chainIdHex).toLowerCase()
  ) {
    return true;
  }

  try {
    await walletRequest({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x2105' }]
    });
  } catch (e) {
    if (e && e.code === 4902) {
      await walletRequest({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x2105',
          chainName: 'Base',
          rpcUrls: ['https://mainnet.base.org'],
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          blockExplorerUrls: ['https://basescan.org']
        }]
      });
    } else {
      throw e;
    }
  }

  chainId = await walletRequest({ method: 'eth_chainId' });
  return (
    String(chainId).toLowerCase() ===
    String(MARKET.chainIdHex).toLowerCase()
  );
}

// Load the snapshot honouring the ?data=frozen switch.
// frozen -> local full fixture.
// otherwise -> live URL, then local live fixture, then local full fixture.
async function loadSnapshot() {
  let frozen = false;
  try {
    frozen = new URLSearchParams(window.location.search).get('data') === 'frozen';
  } catch (e) {
    frozen = false;
  }

  if (frozen) {
    const res = await fetch('./fixtures/snapshot-e23.full.json');
    return await res.json();
  }

  // Try live URLs first (primary then fallback)
  for (const url of LIVE_URLS) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = await res.json();
      if (json && json.generatedAt) return json;
    } catch (_) {
      // ignore and try next URL
    }
  }
  // Fallback to local fixtures (exactly as before)
  try {
    const res = await fetch('./fixtures/snapshot-e23.live.json');
    if (!res.ok) throw new Error('bad status ' + res.status);
    return await res.json();
  } catch (e2) {
    const res = await fetch('./fixtures/snapshot-e23.full.json');
    return await res.json();
  }
}

// Read *all* listings on-chain (live, sold and expired).
async function readListings() {
  const now = BigInt(Math.floor(Date.now() / 1000));

  const lenRaw = await ethCall(SELECTORS.listingsLength);
  const n = Number(wordToBigInt(decodeWords(lenRaw)[0] || lenRaw));

  const out = [];
  for (let i = 0n; i < BigInt(n); i++) {
    const raw = await ethCall(SELECTORS.listings + encUint(i));
    const w = decodeWords(raw);
    if (!w || w.length < WORDS_PER_LISTING) continue;

    const listingId = i;
    const seller = wordToAddr(w[0]);
    const currency = wordToAddr(w[4]);
    const nftId = wordToBigInt(w[3]);
    const endTime = wordToBigInt(w[9]);
    const soldTime = wordToBigInt(w[10]);

    // fetch the (Dutch-auction) price - needed for every row
    let price = 0n;
    try {
      const pRaw = await ethCall(SELECTORS.listingPrice + encUint(i));
      price = wordToBigInt(decodeWords(pRaw)[0] || pRaw);
    } catch (e) {
      throw new Error(
        'listingPrice failed for #' + i + ': ' +
        (e && e.message ? e.message : e)
      );
    }

    const isLive = (soldTime === 0n && endTime >= now);
    let owner = null;
    if (isLive) {
      try {
        const oRaw = await ethCallTo(MARKET.nft,
          SEL.ownerOf + encUint(nftId));
        owner = wordToAddr(decodeWords(oRaw)[0]);
      } catch {
        owner = null;
      }
    }
    const ownerMismatch = isLive && (!owner || owner.toLowerCase() !== seller.toLowerCase());
    // read the on‑chain position data for fresh listings that are not yet in the snapshot
    let chainAmount = null;
    let chainClosed = false;
    if (isLive) {
      try {
        const pRaw = await ethCallTo(MARKET.nft,
          '0x99fbab88' + encUint(nftId)); // positions(uint256)
        const words = decodeWords(pRaw);
        chainAmount = wordToBigInt(words[2]); // amount
        const closedAt = wordToBigInt(words[6]);
        const withdrawn = wordToBigInt(words[7]);
        chainClosed = closedAt > 0n || withdrawn > 0n;
      } catch {
        chainAmount = null;
        chainClosed = false;
      }
    }
    out.push({
      listingId,
      nftId,
      seller,
      currency,
      price,
      soldTime,
      endTime,
      isLive,
      ownerMismatch,
      chainAmount,
      chainClosed
    });
  }

  // ensure deterministic order
  out.sort((a, b) => (a.listingId < b.listingId ? -1 : a.listingId > b.listingId ? 1 : 0));
  return out;
}

// Find a position in the snapshot by its NFT id (snapshot ids are strings).
function findPos(snapshot, nftId) {
  const key = nftId.toString();
  const positions = snapshot.positions || snapshot.rows || [];
  return positions.find(p => String(p.id) === key) || null;
}

// Helper: format USDC price without trailing zeros / dot.
function fmtPrice(raw) {
  let s = formatUnits(raw, MARKET.usdcDecimals);
  if (s.includes('.')) {
    s = s.replace(/\.?0+$/g, '');
  }
  return s;
}

// Helper: create a <span data-field="…">value</span>
function makeSpan(field, value) {
  const s = document.createElement('span');
  s.dataset.field = field;
  s.textContent = value;
  return s;
}

function updateTiles(items, snapshot) {
  const s = computeMarketStats(items || [], snapshot || null, INTERNAL_LISTING_IDS, Math.floor(Date.now() / 1000));
  const vol = document.querySelector('#m-positions .metric-value');
  const fdv = document.querySelector('#m-locked .metric-value');
  if (vol) { vol.textContent = s.volumeText; vol.setAttribute('data-src', 'computed'); }
  if (fdv) { fdv.textContent = s.fdvText; fdv.setAttribute('data-src', 'computed'); }
}
function render(snapshot, items) {
  updateTiles(items, snapshot);
  const table = tableEl();
  table.textContent = '';
  if (!items.length) {
    table.textContent = 'no active listings';
    return;
  }

  const epoch = String(Number(snapshot.epoch) + 1);

  for (const item of items) {
    const pos = findPos(snapshot, item.nftId);
    const row = document.createElement('div');
    row.className = 'market-row';
    row.dataset.listingId = item.listingId.toString(); // for possible CSS
    row.dataset.listingId = item.listingId; // keep attribute as in spec
    row.setAttribute('data-listing-id', item.listingId.toString());

    // ---- values for the fields ----
    const listingIdVal = item.listingId.toString();
    const nftIdVal = item.nftId.toString();
    const priceVal = fmtPrice(item.price);

    // defaults for non-live rows
    let lockedVal = '\u2014';
    let lockVal = '\u2014';
    let rewardVal = '\u2014';
    let slashVal = '\u2014';
    let unclaimedVal = '\u2014';

    if (item.isLive && pos) {
      const ants = Number(pos.amount) / 1e18;
      lockedVal = ants.toFixed(2);
      lockVal = isMaxLock(pos, epoch) ? 'max' : 'fading';
      const rew = expectedReward(snapshot, pos, epoch);
      rewardVal = Number(rew).toFixed(2);
      // add percent sign to slash value (null = exit not computable yet)
      slashVal = exitSlash(pos) == null ? '—' : `${exitSlash(pos)}%`;
      const cur = String(Number(snapshot.epoch));
      const prev = String(Number(snapshot.epoch) - 1);
      const unclaimed = (Number(BigInt(pos.rewardByEpoch?.[prev] ?? 0)) + Number(BigInt(pos.rewardByEpoch?.[cur] ?? 0))) / 1e18;
      unclaimedVal = unclaimed.toFixed(2);
    }

    // a position is dead if the snapshot says so, otherwise fall back to the on‑chain flag
    const dead = pos ? (pos.withdrawn || Number(pos.closedAtEpoch) > 0) : !!item.chainClosed;
    // a live listing is invalid only when it is dead or the owner mismatches; missing snapshot data is now allowed
    const invalid = item.isLive && (dead || item.ownerMismatch);
    // if we have on‑chain amount but no snapshot entry, show it as a locked value
    if (item.isLive && !pos && item.chainAmount != null) {
      lockedVal = (Number(item.chainAmount) / 1e18).toFixed(2);
    }
    const stateVal = invalid ? 'invalid' :
      (item.isLive ? 'live' :
        (item.soldTime !== 0n ? (INTERNAL_LISTING_IDS.map(String).includes(String(item.listingId)) ? 'sold · internal' : 'sold') : 'expired'));

    // ---- build DOM ----
    // "#<listingId>"
    row.appendChild(document.createTextNode('#'));
    row.appendChild(makeSpan('listingId', listingIdVal));

    // " <nftId>"
    row.appendChild(document.createTextNode(' '));
    row.appendChild(makeSpan('nftId', nftIdVal));

    // " · price <price>"
    row.appendChild(document.createTextNode(' \u00b7 price '));
    row.appendChild(makeSpan('price', priceVal));

    // " · locked <locked>"
    row.appendChild(document.createTextNode(' \u00b7 locked '));
    row.appendChild(makeSpan('locked', lockedVal));

    // " \u00b7 <lock>"
    row.appendChild(document.createTextNode(' \u00b7 '));
    row.appendChild(makeSpan('lock', lockVal));

    // " \u00b7 reward <reward>"
    row.appendChild(document.createTextNode(' \u00b7 reward '));
    row.appendChild(makeSpan('reward', rewardVal));
    row.appendChild(document.createTextNode(' \u00b7 unclaimed '));
    row.appendChild(makeSpan('unclaimed', unclaimedVal));
    row.appendChild(document.createTextNode(' \u2192 buyer'));

    // " \u00b7 slash <slash>"
    row.appendChild(document.createTextNode(' \u00b7 slash '));
    row.appendChild(makeSpan('slash', slashVal));

    // " \u00b7 <state>"
    row.appendChild(document.createTextNode(' \u00b7 '));
    row.appendChild(makeSpan('state', stateVal));

    // button for live rows - Buy
    if (item.isLive) {
      if (!invalid) {
        const btnBuy = document.createElement('button');
        btnBuy.className = 'buy';
        btnBuy.dataset.id = item.listingId.toString();
        btnBuy.dataset.price = item.price.toString();
        btnBuy.dataset.currency = item.currency;
        btnBuy.textContent = 'Buy';
        row.appendChild(document.createTextNode(' '));
        row.appendChild(btnBuy);
      }

      // button for cancelling the listing - Cancel
      const btnCancel = document.createElement('button');
      btnCancel.className = 'cancel';
      btnCancel.dataset.id = item.listingId.toString();
      // calldata for cancelNftListings(address nftCollection, uint256 nftId)
      btnCancel.dataset.calldata = cancelNftListings(MARKET.nft, item.nftId);
      btnCancel.textContent = 'Cancel';
      row.appendChild(document.createTextNode(' '));
      row.appendChild(btnCancel);
    }

    table.appendChild(row);
  }

  // Add caveat nodes as separate elements
  const caveat1 = document.createElement('div');
  caveat1.dataset.caveat = 'Listing contents shown as of purchase and may change before the sale.';
  caveat1.textContent = caveat1.dataset.caveat;
  table.appendChild(caveat1);

  const caveat2 = document.createElement('div');
  caveat2.dataset.caveat = 'Only one active listing per NFT.';
  caveat2.textContent = caveat2.dataset.caveat;
  table.appendChild(caveat2);

  const caveat3 = document.createElement('div');
  caveat3.dataset.caveat = 'Unclaimed staker rewards transfer to the buyer with the NFT. Sellers: claim before listing. Only the previous and current epoch are counted here.';
  caveat3.textContent = caveat3.dataset.caveat;
  table.appendChild(caveat3);

  const caveat4 = document.createElement('div');
  caveat4.dataset.caveat = 'A listing on a closed, split, moved or transferred position is invalid and cannot be bought.';
  caveat4.textContent = caveat4.dataset.caveat;
  table.appendChild(caveat4);
}

// Fill the data-panel="my-listings" panel with the current wallet's own lots
// and wire cancellation through the existing cancelNftListings calldata path.
export async function renderMyListingsPanel() {
  const panel = document.querySelector('[data-panel="my-listings"]');
  if (!panel) return;

  panel.textContent = '';

  if (!(selectedProvider ?? window.ethereum)) { panel.textContent = 'no wallet'; return; }
  if (MARKET.market === ZERO) { panel.textContent = 'market not deployed yet'; return; }

  // The account is captured from the eth_requestAccounts flow run in onConnect.
  const account = connectedAccount;
  if (!account) { panel.textContent = 'connect a wallet first'; return; }

  // Reserved handle for future personal-position enumeration via stakerPositionIds.
  const { stakerPositionIds } = SEL;
  void stakerPositionIds;

  const all = await readListings();
  const mine = all.filter(
    (it) => it.seller && it.seller.toLowerCase() === account.toLowerCase()
  );

  if (!mine.length) {
    panel.textContent = 'no listings for this wallet';
    return;
  }

  for (const item of mine) {
    const row = document.createElement('div');
    row.className = 'market-row';
    row.setAttribute('data-listing-id', item.listingId.toString());

    row.appendChild(document.createTextNode('#'));
    row.appendChild(makeSpan('listingId', item.listingId.toString()));

    row.appendChild(document.createTextNode(' '));
    row.appendChild(makeSpan('nftId', item.nftId.toString()));

    row.appendChild(document.createTextNode(' \u00b7 price '));
    row.appendChild(makeSpan('price', fmtPrice(item.price)));

    const stateVal = item.isLive ? 'live' :
      (item.soldTime !== 0n ? 'sold' : 'expired');
    row.appendChild(document.createTextNode(' \u00b7 '));
    row.appendChild(makeSpan('state', stateVal));

    if (item.isLive) {
      // Cancel button - same calldata path as the main table.
      const btnCancel = document.createElement('button');
      btnCancel.className = 'cancel';
      btnCancel.dataset.id = item.listingId.toString();
      btnCancel.dataset.calldata = cancelNftListings(MARKET.nft, item.nftId);
      btnCancel.textContent = 'Cancel';
      row.appendChild(document.createTextNode(' '));
      row.appendChild(btnCancel);
    }

    panel.appendChild(row);
  }
}

async function onConnect() {
  const table = tableEl();

  if (!(selectedProvider ?? window.ethereum)) {
    table.textContent = 'no wallet';
    return;
  }
  if (MARKET.market === ZERO) {
    table.textContent = 'market not deployed yet';
    return;
  }

  try {
    const accounts = await walletRequest({ method: 'eth_requestAccounts' });

    const onChain = await ensureChain();
    if (!onChain) {
      table.textContent = 'wrong network';
      return;
    }

    // portfolio-wallet
    // Rewards contract address: use from MARKET if present, otherwise local constant
    const REWARDS_CONTRACT = MARKET.rewardsContract || '0x83cc5b9aa0c8cb8683f35462c385a5baaa755ee5';
    // TODO: move to MARKET
    const POSITIONS_CONTRACT = '0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652';
    const { stakerPositionCount, stakerTotalActiveStake, stakerPositionIds, pendingIndexedStakerReward } = SEL;

    const account = accounts && accounts[0];
    connectedAccount = account;
    if (account) {
      setConnectedButton(account);

      // Reveal portfolio body and hide placeholder before writing values
      const pfPlaceholder = document.getElementById('pf-placeholder');
      const pfBody = document.getElementById('pf-body');
      if (pfPlaceholder) {
        pfPlaceholder.hidden = true;
      }
      if (pfBody) {
        pfBody.hidden = false;
      }

      const pfValues = document.querySelectorAll('#portfolio .pf-value');
      const pfSnapshot = document.querySelector('.pf-snapshot');

      const encAddress = (addr) => addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
      const encUint256 = (val) => BigInt(val).toString(16).padStart(64, '0');

      try {
        // stakerPositionCount
        const countRaw = await walletRequest({
          method: 'eth_call',
          params: [{ to: POSITIONS_CONTRACT, data: stakerPositionCount + encAddress(account) }, 'latest']
        });
        const count = countRaw === '0x' ? 0 : parseInt(countRaw, 16);

        if (count === 0) {
          if (pfValues.length >= 3) {
            pfValues[0].textContent = '0';
            pfValues[1].textContent = '0.00';
            pfValues[2].textContent = '0.00';
          }
          if (pfSnapshot) {
            pfSnapshot.textContent = account.slice(0, 6) + '…' + account.slice(-4);
          }
        } else {
          // stakerTotalActiveStake
          const totalRaw = await walletRequest({
            method: 'eth_call',
            params: [{ to: POSITIONS_CONTRACT, data: stakerTotalActiveStake + encAddress(account) }, 'latest']
          });
          const totalStake = totalRaw === '0x' ? 0n : BigInt(totalRaw);

          // stakerPositionIds
          const idsRaw = await walletRequest({
            method: 'eth_call',
            params: [{ to: POSITIONS_CONTRACT, data: stakerPositionIds + encAddress(account) + encUint256(0) + encUint256(count) }, 'latest']
          });
          const idsWords = decodeWords(idsRaw);
          const ids = [];
          for (let i = 0; i < count; i++) {
            ids.push(wordToBigInt(idsWords[i]));
          }

          // Sum pending rewards
          let rewardsSum = 0n;
          for (const id of ids) {
            const rewardRaw = await walletRequest({
              method: 'eth_call',
              params: [{ to: REWARDS_CONTRACT, data: pendingIndexedStakerReward + encUint256(id) }, 'latest']
            });
            if (rewardRaw !== '0x') {
              rewardsSum += BigInt(rewardRaw);
            }
          }

          if (pfValues.length >= 3) {
            pfValues[0].textContent = String(count);
            pfValues[1].textContent = (Number(totalStake) / 1e18).toFixed(2);
            pfValues[2].textContent = (Number(rewardsSum) / 1e18).toFixed(2);
          }
          if (pfSnapshot) {
            pfSnapshot.textContent = account.slice(0, 6) + '…' + account.slice(-4);
          }
        }
      } catch (e) {
        if (pfSnapshot) {
          pfSnapshot.textContent = 'error: ' + (e && e.message ? e.message : String(e));
        }
      }
    }

    const snapshot = await loadSnapshot();
    const items = await readListings();
    render(snapshot, items);
    await renderMyListingsPanel();
  } catch (e) {
    // surface any eth_call / connect error, never stay silent
    table.textContent =
      'error: ' + (e && e.message ? e.message : String(e));
  }
}

async function loadPublicMarket() {
  if (MARKET.market === ZERO) return;
  try {
    const snapshot = await loadSnapshot();
    const items = await readListings();
    render(snapshot, items);
  } catch (e) {
    console.warn('public market load failed', e);
  }
}

export function initMarketView() {
  const btn = document.getElementById('hdr-connect');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (btn.dataset.connected === '1') {
      await disconnectWallet();
      return;
    }
    await ensurePrivy();
  });
}

// Convert days to seconds, reject anything above the contract cap of 60 days.
export function daysToSeconds(days) {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return null;
  const secs = Math.floor(n * 86400);
  return secs > 5184000 ? null : secs;
}

export function initCreateListing() {
  const btn = document.getElementById('cf-submit');
  if (!btn) return;
  const status = document.getElementById('create-status');
  const say = (t) => { if (status) status.textContent = t; };
  btn.addEventListener('click', async () => {
    if (!(selectedProvider ?? window.ethereum)) { say('Connect a wallet first'); return; }
    const nftId = document.getElementById('cf-nftid').value;
    const priceHuman = document.getElementById('cf-price').value;
    const secs = daysToSeconds(document.getElementById('cf-days').value);
    if (!nftId) { say('Enter the NFT id'); return; }
    if (!priceHuman) { say('Enter the price in USDC'); return; }
    if (secs === null) { say('Duration must be between 1 and 60 days'); return; }
    const price = BigInt(Math.round(Number(priceHuman) * 10 ** MARKET.usdcDecimals));
    btn.disabled = true;
    try {
      const accounts = await walletRequest({ method: 'eth_requestAccounts' });
      const from = accounts && accounts[0];
      if (!from) { say('No account'); btn.disabled = false; return; }
      say('Checking marketplace approval...');
      const aRaw = await ethCallTo(MARKET.nft, SEL.isApprovedForAll + encAddr(from) + encAddr(MARKET.market));
      const approved = wordToBigInt(decodeWords(aRaw)[0]) !== 0n;
      if (!approved) {
        say('Approving the marketplace...');
        await walletRequest({
          method: 'eth_sendTransaction',
          params: [{ from, to: MARKET.nft, data: encSetApprovalForAll(MARKET.market, true) }]
        });
        say('Approval sent. Wait for confirmation, then press Create listing again.');
        btn.disabled = false;
        return;
      }
      // continue to createListing as now
      say('Creating the listing...');
      const data = encCreateListing({
        nftCollection: MARKET.nft,
        nftId: BigInt(nftId),
        currency: MARKET.usdc,
        price,
        slopeMax: 0n,
        slopeDuration: 0n,
        fixedDuration: BigInt(secs)
      });
      const tx = await walletRequest({
        method: 'eth_sendTransaction',
        params: [{ from, to: MARKET.market, data }]
      });
      say('Sent: ' + tx);
    } catch (e) {
      say('Error: ' + (e && e.message ? e.message : String(e)));
    }
    btn.disabled = false;
  });
}

// Offer form: pure client-side estimator.  No offer network calls at all.
// Floor price used to translate a USDC budget into a maximum ANTS size.
const FLOOR_USD_PER_ANTS = 0.01;

export function initOfferForm() {
  const discountEl = document.getElementById('offer-discount');
  const budgetEl = document.getElementById('offer-budget');
  const cta = document.getElementById('offer-cta');
  const maxBtn = document.getElementById('offer-max');

  const sumDiscount = document.getElementById('offer-sum-discount');
  const sumBudget = document.getElementById('offer-sum-budget');
  const sumUsd = document.getElementById('offer-sum-usd');
  const sumMax = document.getElementById('offer-sum-max');

  // Recompute the summary line from the two inputs.
  const recompute = () => {
    const d = parseFloat(discountEl && discountEl.value) || 0;
    const b = parseFloat(budgetEl && budgetEl.value) || 0;
    const price = FLOOR_USD_PER_ANTS * (1 - d / 100);
    const maxSize = price > 0 ? Math.floor(b / price) : 0;

    if (sumDiscount) sumDiscount.textContent = d.toFixed(2) + ' %';
    if (sumBudget) sumBudget.textContent = b + ' USDC';
    if (sumUsd) sumUsd.textContent = '$' + b;
    if (sumMax) sumMax.textContent = maxSize + ' ANTS';
  };

  // Reflect the honest wallet-connection state on the CTA button.
  const updateCta = () => {
    if (!cta) return;
    if (selectedProvider) {
      cta.textContent = 'Offers are not available on this market';
      cta.disabled = true;
    } else {
      cta.textContent = 'Connect Wallet';
      cta.disabled = false;
    }
  };

  if (discountEl) discountEl.addEventListener('input', recompute);
  if (budgetEl) budgetEl.addEventListener('input', recompute);

  if (cta) {
    cta.addEventListener('click', async () => {
      // Connected state is honestly disabled; only act while disconnected.
      if (selectedProvider) return;
      await ensurePrivy();
    });
  }

  // offer-max is a no-op: there is no USDC balance to read here.
  if (maxBtn) {
    maxBtn.addEventListener('click', (e) => { e.preventDefault(); });
  }

  recompute();
  updateCta();

  // Keep the CTA honest after a wallet connects (onConnect flips selectedProvider).
  setInterval(updateCta, 500);
}

// auto-init if button already in DOM
if (typeof document !== 'undefined' && document.getElementById('hdr-connect')) {
  initMarketView();
  initCreateListing();
  initOfferForm();
  updateTiles([], null);
  loadPublicMarket();
}
