// Market read-view: connect wallet via eth_requestAccounts, check chainId,
// read listings with eth_call and render rows.  No eth_sendTransaction here.

let selectedProvider = null;
let connectedAccount = null;
export const walletRequest = (args) => (selectedProvider ?? window.ethereum).request(args);

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
    // Provider already captured (pre-authorized injected wallet): the Privy
    // connect modal has nothing left to do but stays open blurring the page.
    // Dismiss it via Escape, retrying until the backdrop is gone.
    let closeTries = 0;
    const closeModal = () => {
      const backdrop = document.getElementById('privy-dialog-backdrop');
      if (!backdrop) return;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      if (++closeTries < 30) setTimeout(closeModal, 100);
    };
    closeModal();
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
export async function waitReceipt(hash, tries = 90) {
  for (let i = 0; i < tries; i++) {
    const r = await walletRequest({ method: 'eth_getTransactionReceipt', params: [hash] });
    if (r) return r;
    await new Promise((res) => setTimeout(res, 2000));
  }
  return null;
}

export async function ensureChain() {
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

    // A cancel (or a newer listing of the same NFT) bumps the seller's nonce; the old lot can no longer be bought.
    let cancelled = false;
    if (soldTime === 0n) {
      try {
        const nRaw = await ethCall('0x444c74aa' + encAddr(seller) + encAddr(MARKET.nft) + encUint(nftId)); // sellerNftNonce(address,address,uint256)
        cancelled = wordToBigInt(decodeWords(nRaw)[0]) !== wordToBigInt(w[1]); // listings(): 0 seller, 1 sellerNftNonce, 2 nftCollection, 3 nftId, 4 currency
      } catch {
        cancelled = false;
      }
    }
    const isLive = (soldTime === 0n && endTime >= now && !cancelled);
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
    // read the on-chain position for every listing (live and sold): the snapshot lacks fresh split positions
    let chainAmount = null;
    let chainClosed = false;
    let chainStakeEnd = null;
    try {
      const pRaw = await ethCallTo(MARKET.nft,
        '0x99fbab88' + encUint(nftId)); // positions(uint256)
      const words = decodeWords(pRaw);
      chainAmount = wordToBigInt(words[2]); // amount
      chainStakeEnd = wordToBigInt(words[5]); // stakeEndEpoch
      const closedAt = wordToBigInt(words[6]);
      const withdrawn = wordToBigInt(words[7]);
      chainClosed = closedAt > 0n || withdrawn > 0n;
    } catch {
      chainAmount = null;
      chainClosed = false;
      chainStakeEnd = null;
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
      chainClosed,
      chainStakeEnd,
      cancelled
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

  // Header row
  const head = document.createElement('div');
  head.className = 'market-head';
  
  const headers = ['LOT', 'POSITION', 'PRICE', 'ANTS', 'USDC/ANTS', 'LOCK', 'STATUS', ''];
  for (let i = 0; i < headers.length; i++) {
    const th = document.createElement('span');
    if (i === 4) {
      th.textContent = 'USDC/ANTS';
      const info = document.createElement('span');
      info.className = 'info';
      info.dataset.tip = 'Price in USDC per 1 locked ANTS.';
      info.textContent = 'ⓘ';
      th.appendChild(info);
    } else if (i === 6) {
      th.textContent = 'STATUS';
      const info = document.createElement('span');
      info.className = 'info';
      info.dataset.tip = 'live can be bought; sold · internal = between our own wallets, not in volume.';
      info.textContent = 'ⓘ';
      th.appendChild(info);
    } else {
      th.textContent = headers[i];
    }
    head.appendChild(th);
  }
  table.appendChild(head);

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'market-empty';
    empty.textContent = 'No active listings yet.';
    table.appendChild(empty);
    return;
  }

  const epoch = String(Number(snapshot.epoch) + 1);
  // Cancel is offered only to the connected seller (Privy or injected wallet).
  const me = (connectedAccount || '').toLowerCase();

  for (const item of items) {
    const pos = findPos(snapshot, item.nftId);
    const row = document.createElement('div');
    row.className = 'market-row';
    row.dataset.listingId = item.listingId.toString();
    row.setAttribute('data-listing-id', item.listingId.toString());

    // LOT
    const lotSpan = document.createElement('span');
    lotSpan.dataset.field = 'listingId';
    lotSpan.textContent = `#${item.listingId.toString()}`;
    row.appendChild(lotSpan);

    // POSITION
    const posSpan = document.createElement('span');
    posSpan.dataset.field = 'nftId';
    posSpan.textContent = item.nftId.toString();
    row.appendChild(posSpan);

    // PRICE
    const priceSpan = document.createElement('span');
    priceSpan.dataset.field = 'price';
    priceSpan.textContent = `${(Number(formatUnits(item.price, MARKET.usdcDecimals))).toFixed(2)} USDC`;
    row.appendChild(priceSpan);

    // ANTS
    const antsSpan = document.createElement('span');
    antsSpan.dataset.field = 'ants';
    let antsNumeric = null;
    if (pos) {
      antsNumeric = Number(pos.amount) / 1e18;
    } else if (item.chainAmount != null) {
      antsNumeric = Number(item.chainAmount) / 1e18;
    }
    antsSpan.textContent = antsNumeric != null ? antsNumeric.toFixed(2) : '—';
    row.appendChild(antsSpan);

    // USDC/ANTS
    const unitPriceSpan = document.createElement('span');
    unitPriceSpan.dataset.field = 'unitPrice';
    const usdcPrice = Number(formatUnits(item.price, MARKET.usdcDecimals));
    if (antsNumeric != null && antsNumeric > 0) {
      unitPriceSpan.textContent = (usdcPrice / antsNumeric).toFixed(4);
    } else {
      unitPriceSpan.textContent = '—';
    }
    row.appendChild(unitPriceSpan);

    // LOCK
    const lockSpan = document.createElement('span');
    lockSpan.dataset.field = 'lock';
    const weeksFrom = (end) => `${Math.max(0, Number(end) - Number(epoch))}w`;
    let lockVal = '—';
    if (item.isLive) {
      if (pos) {
        lockVal = isMaxLock(pos, epoch) ? 'max' : weeksFrom(pos.stakeEndEpoch);
      } else if (item.chainStakeEnd != null) {
        lockVal = weeksFrom(item.chainStakeEnd);
      }
    }
    lockSpan.textContent = lockVal;
    row.appendChild(lockSpan);

    // STATUS
    const stateSpan = document.createElement('span');
    stateSpan.dataset.field = 'state';
    const dead = pos ? (pos.withdrawn || Number(pos.closedAtEpoch) > 0) : !!item.chainClosed;
    const invalid = item.isLive && (dead || item.ownerMismatch);
    let stateVal;
    if (invalid) {
      stateVal = 'invalid';
    } else if (item.isLive) {
      stateVal = 'live';
    } else if (item.soldTime !== 0n) {
      stateVal = INTERNAL_LISTING_IDS.map(String).includes(String(item.listingId)) ? 'sold · internal' : 'sold';
    } else if (item.cancelled) {
      stateVal = 'cancelled';
    } else {
      stateVal = 'expired';
    }
    stateSpan.textContent = stateVal;
    row.appendChild(stateSpan);

    // Action cell
    const actionSpan = document.createElement('span');
    if (item.isLive) {
      if (!invalid) {
        const btnBuy = document.createElement('button');
        btnBuy.className = 'buy';
        btnBuy.dataset.id = item.listingId.toString();
        btnBuy.dataset.price = item.price.toString();
        btnBuy.dataset.currency = item.currency;
        btnBuy.textContent = 'Buy';
        actionSpan.appendChild(btnBuy);
      }
      if (me && me === item.seller.toLowerCase()) {
        const btnCancel = document.createElement('button');
        btnCancel.className = 'cancel';
        btnCancel.dataset.id = item.listingId.toString();
        btnCancel.dataset.calldata = cancelNftListings(MARKET.nft, item.nftId);
        btnCancel.textContent = 'Cancel';
        actionSpan.appendChild(btnCancel);
      }
    }
    row.appendChild(actionSpan);

    table.appendChild(row);
  }

  // Caveats
  const caveats = [
    'Listing contents shown as of purchase and may change before the sale.',
    'Only one active listing per NFT.',
    "Staking rewards for the open epoch can't be claimed before listing and pass to the buyer with the NFT.",
    'A listing on a closed, split, moved or transferred position is invalid and cannot be bought.'
  ];
  for (const caveatText of caveats) {
    const caveat = document.createElement('div');
    caveat.className = 'market-caveat';
    caveat.dataset.caveat = caveatText;
    caveat.textContent = caveatText;
    table.appendChild(caveat);
  }
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

    row.appendChild(document.createTextNode(' \u00b7 '));
    row.appendChild(makeSpan('price', (Number(item.price) / 1e6).toFixed(2) + ' USDC'));

    const stateVal = item.isLive ? 'live' :
      (item.soldTime !== 0n ? 'sold' : (item.cancelled ? 'cancelled' : 'expired'));
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
        const countRaw = await ethCallTo(POSITIONS_CONTRACT, stakerPositionCount + encAddress(account));
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
          const totalRaw = await ethCallTo(POSITIONS_CONTRACT, stakerTotalActiveStake + encAddress(account));
          const totalStake = totalRaw === '0x' ? 0n : BigInt(totalRaw);

          // stakerPositionIds
          const idsRaw = await ethCallTo(POSITIONS_CONTRACT, stakerPositionIds + encAddress(account) + encUint256(0) + encUint256(count));
          const idsWords = decodeWords(idsRaw);
          const ids = [];
          for (let i = 0; i < count; i++) {
            ids.push(wordToBigInt(idsWords[i]));
          }

          // Sum pending rewards
          let rewardsSum = 0n;
          for (const id of ids) {
            const rewardRaw = await ethCallTo(REWARDS_CONTRACT, pendingIndexedStakerReward + encUint256(id));
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

export async function loadPublicMarket() {
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

export function initManagePosition() {
  const MANAGE_ADDR = MARKET.nft;
  const REWARDS_ADDR = '0x78330bF154172F1137219Bb559d4F3A270B3201F';
  const MINT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const splitSel = '0xdc310451';
  const moveSel = '0x5437910a';
  const maxlockSel = '0xedcb5e4e';
  const positionsSel = '0x99fbab88';
  const posMaxLockSel = '0xdb39a228';
  const currentEpochSel = '0x76671808';
  const pendingSel = '0xb19101a2';
  const stakeSel = '0xd95e60b9';

  const mfPosid = document.getElementById('mf-posid');
  if (!mfPosid) return;

  const mfCard = document.getElementById('mf-card');
  const mfSplit = document.getElementById('mf-split');
  const mfSplitBtn = document.getElementById('mf-split-btn');
  const mfAgent = document.getElementById('mf-agent');
  const mfMoveBtn = document.getElementById('mf-move-btn');
  const mfMaxlockBtn = document.getElementById('mf-maxlock-btn');
  const manageStatus = document.getElementById('manage-status');
  const brBuyer = document.getElementById('br-buyer');
  const brEpoch = document.getElementById('br-epoch');
  const brAgent = document.getElementById('br-agent');
  const brEpochs = document.getElementById('br-epochs');
  const brSummary = document.getElementById('br-summary');
  const brSubmit = document.getElementById('br-submit');
  const brStatus = document.getElementById('br-status');

  function setStatus(el, msg) {
    if (el) el.textContent = msg;
  }

  function extractMints(receipt) {
    const ids = [];
    if (!receipt || !receipt.logs) return ids;
    for (const log of receipt.logs) {
      if (log.address && log.address.toLowerCase() === MARKET.nft.toLowerCase() &&
          log.topics && log.topics[0] === MINT_TOPIC &&
          log.topics[1] === '0x0000000000000000000000000000000000000000000000000000000000000000' &&
          log.topics[3]) {
        ids.push(BigInt(log.topics[3]));
      }
    }
    return ids;
  }

  async function refreshCard() {
    const idStr = mfPosid.value.trim();
    if (!idStr) { setStatus(mfCard, ''); return; }
    const id = BigInt(idStr);
    try {
      const posData = await ethCallTo(MANAGE_ADDR, positionsSel + encUint(id));
      const words = decodeWords(posData);
      if (words.length < 5) throw new Error('bad positions response');
      const owner = wordToAddr(words[0]);
      const agentId = wordToBigInt(words[1]);
      const amount = wordToBigInt(words[2]) / 1000000000000000000n;
      const stakeStartEpoch = wordToBigInt(words[4]);
      const epochData = await ethCallTo(MANAGE_ADDR, currentEpochSel);
      const epochWords = decodeWords(epochData);
      const currentEpoch = wordToBigInt(epochWords[0]);
      let maxLock = false;
      try {
        const mlData = await ethCallTo(MANAGE_ADDR, posMaxLockSel + encUint(id) + encUint(currentEpoch));
        const mlWords = decodeWords(mlData);
        maxLock = mlWords.length > 0 && BigInt(mlWords[0]) > 0n;
      } catch { /* keep false */ }
      setStatus(mfCard, `Position ${id.toString()} · ${amount.toString()} ANTS · pool ${agentId.toString()} · start epoch ${stakeStartEpoch.toString()} · ${maxLock ? 'max-lock ON' : 'off'}`);
    } catch (e) {
      setStatus(mfCard, 'unavailable');
    }
  }

  async function sendTx(to, data, btn, statusEl, successMsg) {
    if (!btn || !statusEl) return;
    btn.disabled = true;
    try {
      if (!(await ensureChain())) {
        setStatus(statusEl, 'Wrong network');
        return;
      }
      const accounts = await walletRequest({ method: 'eth_requestAccounts' });
      const from = accounts[0];
      setStatus(statusEl, 'Sent … waiting');
      const txHash = await walletRequest({
        method: 'eth_sendTransaction',
        params: [{ from, to, data }]
      });
      const receipt = await waitReceipt(txHash);
      if (receipt && receipt.status === '0x1') {
        setStatus(statusEl, successMsg);
        return receipt;
      } else {
        setStatus(statusEl, 'failed');
        return null;
      }
    } catch (e) {
      setStatus(statusEl, e.message || String(e));
      return null;
    } finally {
      btn.disabled = false;
    }
  }

  mfPosid.addEventListener('input', refreshCard);

  mfSplitBtn.addEventListener('click', async () => {
    const posidStr = mfPosid.value.trim();
    const splitStr = mfSplit.value.trim();
    if (!posidStr || !splitStr) {
      setStatus(manageStatus, 'Enter position id and split amount');
      return;
    }
    const posid = BigInt(posidStr);
    const x = parseFloat(splitStr);
    if (!(x > 0)) {
      setStatus(manageStatus, 'Split amount must be > 0');
      return;
    }
    const amountWei = BigInt(Math.round(x * 1e18));
    try {
      const posData = await ethCallTo(MANAGE_ADDR, positionsSel + encUint(posid));
      const words = decodeWords(posData);
      const posAmount = wordToBigInt(words[2]);
      if (amountWei >= posAmount) {
        setStatus(manageStatus, 'Split amount must be less than position amount');
        return;
      }
    } catch (e) {
      setStatus(manageStatus, 'Cannot read position: ' + (e.message || e));
      return;
    }
    const receipt = await sendTx(
      MANAGE_ADDR,
      splitSel + encUint(posid) + encUint(amountWei),
      mfSplitBtn, manageStatus, ''
    );
    if (!receipt) return;
    const mints = extractMints(receipt);
    if (mints.length < 2) {
      setStatus(manageStatus, 'Split failed: expected 2 mints');
      return;
    }
    const idA = mints[0];
    const idB = mints[1];
    let smallId, largeId;
    try {
      const dataA = await ethCallTo(MANAGE_ADDR, positionsSel + encUint(idA));
      const dataB = await ethCallTo(MANAGE_ADDR, positionsSel + encUint(idB));
      const amtA = wordToBigInt(decodeWords(dataA)[2]);
      const amtB = wordToBigInt(decodeWords(dataB)[2]);
      if (amtA <= amtB) { smallId = idA; largeId = idB; }
      else { smallId = idB; largeId = idA; }
    } catch {
      smallId = idA; largeId = idB;
    }
    const cfNftid = document.getElementById('cf-nftid');
    if (cfNftid) {
      cfNftid.value = smallId.toString();
      cfNftid.dispatchEvent(new Event('input', { bubbles: true }));
    }
    mfPosid.value = largeId.toString();
    await refreshCard();
    setStatus(manageStatus, `Split: SMALL ${smallId.toString()} -> #cf-nftid, LARGE ${largeId.toString()}`);
  });

  mfMoveBtn.addEventListener('click', async () => {
    const posidStr = mfPosid.value.trim();
    const agentStr = mfAgent.value.trim();
    if (!posidStr || !agentStr) {
      setStatus(manageStatus, 'Enter position id and target agent id');
      return;
    }
    const posid = BigInt(posidStr);
    const agentId = BigInt(agentStr);
    if (agentId <= 0n) {
      setStatus(manageStatus, 'Agent id must be > 0');
      return;
    }
    const receipt = await sendTx(
      MANAGE_ADDR,
      moveSel + encUint(posid) + encUint(agentId),
      mfMoveBtn, manageStatus, ''
    );
    if (!receipt) return;
    const mints = extractMints(receipt);
    if (mints.length === 0) {
      setStatus(manageStatus, 'Move failed: no new position minted');
      return;
    }
    const newId = mints[0];
    mfPosid.value = newId.toString();
    await refreshCard();
    setStatus(manageStatus, `Moved to new position ${newId.toString()}`);
  });

  mfMaxlockBtn.addEventListener('click', async () => {
    const posidStr = mfPosid.value.trim();
    if (!posidStr) {
      setStatus(manageStatus, 'Enter position id');
      return;
    }
    const posid = BigInt(posidStr);
    const receipt = await sendTx(
      MANAGE_ADDR,
      maxlockSel + encUint(posid),
      mfMaxlockBtn, manageStatus, ''
    );
    if (!receipt) return;
    await refreshCard();
    setStatus(manageStatus, 'Max-lock enabled');
  });

  if (brBuyer) {
    const setBuyerDefault = () => {
      if (connectedAccount && !brBuyer.value) {
        brBuyer.value = connectedAccount;
      }
    };
    setBuyerDefault();
    window.addEventListener('accountsChanged', setBuyerDefault);

    const updateSummary = async () => {
      const buyer = brBuyer.value.trim();
      const epoch = brEpoch.value.trim();
      if (!buyer || !epoch) {
        setStatus(brSummary, '');
        return;
      }
      try {
        const data = await ethCallTo(REWARDS_ADDR, pendingSel + encAddr(buyer) + encUint(BigInt(epoch)));
        const words = decodeWords(data);
        const pending = words.length > 0 ? wordToBigInt(words[0]) / 1000000000000000000n : 0n;
        setStatus(brSummary, `Pending: ${pending.toString()} ANTS`);
      } catch (e) {
        setStatus(brSummary, 'unavailable');
      }
    };

    brBuyer.addEventListener('input', updateSummary);
    brEpoch.addEventListener('input', updateSummary);
    brAgent.addEventListener('input', updateSummary);
    brEpochs.addEventListener('input', updateSummary);

    brSubmit.addEventListener('click', async () => {
      const buyer = brBuyer.value.trim();
      const epochStr = brEpoch.value.trim();
      const agentStr = brAgent.value.trim();
      const epochsStr = brEpochs.value.trim();
      if (!buyer || !epochStr || !agentStr || !epochsStr) {
        setStatus(brStatus, 'Fill all buyer reward fields');
        return;
      }
      const epoch = BigInt(epochStr);
      const agentId = BigInt(agentStr);
      const epochs = BigInt(epochsStr);
      if (epoch <= 0n || agentId <= 0n) {
        setStatus(brStatus, 'Epoch and agent id must be > 0');
        return;
      }
      if (epochs < 1n || epochs > 104n) {
        setStatus(brStatus, 'Epochs must be 1..104');
        return;
      }
      try {
        const data = await ethCallTo(REWARDS_ADDR, pendingSel + encAddr(buyer) + encUint(epoch));
        const words = decodeWords(data);
        const pending = words.length > 0 ? wordToBigInt(words[0]) : 0n;
        if (pending === 0n) {
          setStatus(brStatus, 'No pending reward');
          return;
        }
      } catch (e) {
        setStatus(brStatus, 'Cannot check pending reward: ' + (e.message || e));
        return;
      }
      const receipt = await sendTx(
        REWARDS_ADDR,
        stakeSel + encAddr(buyer) + encUint(epoch) + encUint(agentId) + encUint(epochs),
        brSubmit, brStatus, ''
      );
      if (!receipt) return;
      const mints = extractMints(receipt);
      if (mints.length === 0) {
        setStatus(brStatus, 'Staked but no position minted');
        return;
      }
      const newId = mints[0];
      mfPosid.value = newId.toString();
      await refreshCard();
      setStatus(brStatus, `Staked reward, new position ${newId.toString()}`);
    });
  }
}

export function initCancelHandler() {
  document.addEventListener('click', async (event) => {
    const btn = event.target.closest('button.cancel');
    if (!btn) return;

    const row = btn.closest('.market-row');
    let msgEl = row?.querySelector('.msg');
    if (row && !msgEl) {
      msgEl = document.createElement('span');
      msgEl.className = 'msg';
      row.appendChild(msgEl);
    }
    const setMessage = (text) => {
      if (msgEl) msgEl.textContent = text;
    };

    btn.disabled = true;
    try {
      const accounts = await walletRequest({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) {
        setMessage('connect wallet first');
        return;
      }
      const from = accounts[0];

      if (!(await ensureChain())) {
        setMessage('wrong network');
        return;
      }

      const tx = await walletRequest({
        method: 'eth_sendTransaction',
        params: [{ from, to: MARKET.market, data: btn.dataset.calldata }]
      });
      setMessage('cancel sent, waiting…');

      const r = await waitReceipt(tx);
      if (r && r.status === '0x1') {
        setMessage('cancelled');
        await loadPublicMarket();
        if (typeof renderMyListingsPanel === 'function') {
          await renderMyListingsPanel();
        }
      } else {
        setMessage('cancel failed');
      }
    } catch (e) {
      setMessage(e.message);
    } finally {
      btn.disabled = false;
    }
  });
}

export function initCreateListing() {
  const btn = document.getElementById('cf-submit');
  if (!btn) return;
  const status = document.getElementById('create-status');
  const say = (t) => { if (status) status.textContent = t; };
  const POS_AMOUNT_WORD = 2; // positions(): owner, agentId, amount, ...
  const summaryEl = document.getElementById('cf-summary');
  const nftEl = document.getElementById('cf-nftid');
  const priceEl = document.getElementById('cf-price');
  async function updateSummary() {
    if (!summaryEl) return;
    const id = nftEl.value;
    const priceHuman = Number(priceEl.value);
    if (!id || !(priceHuman > 0)) { summaryEl.textContent = ''; return; }
    let ants;
    try {
      const raw = await ethCallTo(MARKET.nft, '0x99fbab88' + encUint(BigInt(id))) /* positions(uint256) */;
      ants = wordToBigInt(decodeWords(raw)[POS_AMOUNT_WORD] ?? '0x0');
    } catch (e) { summaryEl.textContent = `Position ${id} · unavailable`; return; }
    const antsH = Number(ants) / 1e18;
    const receive = priceHuman * 0.99;
    const perAnts = antsH > 0 ? priceHuman / antsH : 0;
    summaryEl.textContent = `Position ${id} · ${antsH.toFixed(2)} ANTS · you receive ${receive.toFixed(2)} USDC · ${perAnts.toFixed(4)} USDC/ANTS`;
  }
  if (nftEl) nftEl.addEventListener('input', updateSummary);
  if (priceEl) priceEl.addEventListener('input', updateSummary);
  btn.addEventListener('click', async () => {
    const nftId = document.getElementById('cf-nftid').value;
    const priceHuman = document.getElementById('cf-price').value;
    const secs = daysToSeconds(document.getElementById('cf-days').value);
    if (!nftId) { say('Enter the NFT id'); return; }
    if (!priceHuman || Number(priceHuman) <= 0) { say('Price must be greater than 0'); return; }
    if (secs === null) { say('Duration must be between 1 and 60 days'); return; }
    if (!(selectedProvider ?? window.ethereum)) { say('Connect a wallet first'); return; }
    const price = BigInt(Math.round(Number(priceHuman) * 10 ** MARKET.usdcDecimals));
    btn.disabled = true;
    try {
      const accounts = await walletRequest({ method: 'eth_requestAccounts' });
      const from = accounts && accounts[0];
      if (!from) { say('No account'); btn.disabled = false; return; }
      if (!(await ensureChain())) { say('Wrong network'); btn.disabled = false; return; }
      const oRaw = await ethCallTo(MARKET.nft, SEL.ownerOf + encUint(BigInt(nftId)));
      const owner = wordToAddr(decodeWords(oRaw)[0]);
      if (owner.toLowerCase() !== from.toLowerCase()) { say('You do not own this NFT'); btn.disabled = false; return; }
      say('Checking marketplace approval...');
      const aRaw = await ethCallTo(MARKET.nft, SEL.isApprovedForAll + encAddr(from) + encAddr(MARKET.market));
      const approved = wordToBigInt(decodeWords(aRaw)[0]) !== 0n;
      if (!approved) {
        say('Approving the marketplace...');
        const aTx = await walletRequest({
          method: 'eth_sendTransaction',
          params: [{ from, to: MARKET.nft, data: encSetApprovalForAll(MARKET.market, true) }]
        });
        say('Approval sent, waiting for confirmation...');
        const aRcpt = await waitReceipt(aTx);
        if (!aRcpt || aRcpt.status !== '0x1') { say('Approval failed'); btn.disabled = false; return; }
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
      say('Sent: ' + tx + ' — waiting for confirmation...');
      const rcpt = await waitReceipt(tx);
      if (rcpt && rcpt.status === '0x1') {
        say('Listing created.');
        await loadPublicMarket();
      } else {
        say('Listing failed');
      }
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
  initCancelHandler();
  initManagePosition();
  initOfferForm();
  updateTiles([], null);
  loadPublicMarket();
}
