// Sell flow for own lANTS positions: pick a position, set price and duration,
// review gross/fee/net, then run the existing create-listing wallet path.
// Pure helpers live in sell-model.mjs, DOM in sell-modal-view.mjs.
import { MARKET, encUint, decodeWords, wordToBigInt } from './market-config.mjs';
import { ethCallTo, readListings } from './own-listings.mjs';
import { buildSellChoices, feeBreakdown, clampDays, etherToAnts, usdcToWei } from './sell-model.mjs';
import { renderSellModal } from './sell-modal-view.mjs';
import { createListingFlow } from './create-listing.mjs';

const POS_AMOUNT_WORD = 2; // positions(): owner, agentId, amount, ...

const state = {
  step: 'loading',
  choices: [],
  selected: null,
  price: '',
  days: '30',
  status: '',
  error: '',
  busy: false,
  deps: null,
  wired: false,
};

function render() {
  if (!state.deps) return;
  renderSellModal(state, handlers);
}

function closeModal() {
  const modal = document.getElementById('sell-modal');
  if (modal) modal.hidden = true;
  state.deps = null;
}

function wireModal() {
  if (state.wired) return;
  const modal = document.getElementById('sell-modal');
  if (!modal) return;
  state.wired = true;
  const x = modal.querySelector('.offer-x');
  if (x) x.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });
  document.addEventListener('listing:cancelled', () => {
    const el = document.getElementById('sell-modal');
    if (state.deps && el && !el.hidden) void refreshChoices();
  });
}

async function readAnts(tokenId) {
  try {
    const raw = await ethCallTo(MARKET.nft, '0x99fbab88' + encUint(BigInt(tokenId)));
    return etherToAnts(wordToBigInt(decodeWords(raw)[POS_AMOUNT_WORD] ?? '0x0'));
  } catch (e) {
    return null;
  }
}

async function pickPosition(tokenId) {
  state.selected = state.choices.find((c) => c.tokenId === tokenId) || { tokenId, state: 'unavailable', ants: null };
  if (!Number.isFinite(state.selected.ants)) state.selected.ants = await readAnts(tokenId);
  state.step = 'form';
  state.status = '';
  state.error = '';
  render();
}

const handlers = {
  close: closeModal,
  connect: () => { void (state.deps && state.deps.connect()); },
  select: (tokenId) => { void pickPosition(tokenId); },
  back: () => { state.step = 'form'; state.error = ''; render(); },
  review: () => {
    if (!(Number(state.price) > 0)) { state.error = 'Price must be greater than 0.'; render(); return; }
    const days = clampDays(state.days);
    if (days === null) { state.error = 'Duration must be between 1 and 60 days.'; render(); return; }
    state.days = String(days);
    state.error = '';
    state.step = 'review';
    render();
  },
  submit: () => { void submitListing(); },
};

async function submitListing() {
  const deps = state.deps;
  const fee = feeBreakdown(state.price, state.selected && state.selected.ants);
  const secs = deps.wallet.daysToSeconds(state.days);
  if (!state.selected) { state.error = 'Pick a position first.'; render(); return; }
  if (!fee) { state.error = 'Price must be greater than 0.'; state.step = 'form'; render(); return; }
  if (secs === null) { state.error = 'Duration must be between 1 and 60 days.'; state.step = 'form'; render(); return; }

  state.busy = true;
  state.error = '';
  state.status = 'Connecting...';
  render();
  try {
    await createListingFlow({
      request: deps.wallet.request,
      ensureChain: deps.wallet.ensureChain,
      waitReceipt: deps.wallet.waitReceipt,
      nftId: BigInt(state.selected.tokenId),
      priceWei: usdcToWei(fee.gross),
      durationSecs: secs,
      onStatus: (text) => { state.status = text; render(); },
    });
    state.status = '';
    state.step = 'done';
    await deps.refresh();
  } catch (e) {
    state.error = deps.wallet.humanError(e);
  }
  state.busy = false;
  render();
}

export async function openSellModal(deps) {
  const modal = document.getElementById('sell-modal');
  const body = document.getElementById('sell-modal-body');
  if (!modal || !body || !deps) return;
  wireModal();
  state.deps = deps;
  state.step = 'loading';
  state.choices = [];
  state.selected = null;
  state.price = '';
  state.days = '30';
  state.status = '';
  state.error = '';
  state.busy = false;
  modal.hidden = false;
  render();

  if (!deps.account) {
    state.step = 'connect';
    render();
    return;
  }

  state.choices = await readChoices(deps);
  state.step = 'pick';
  if (modal.hidden) return;
  render();
}

async function readChoices(deps) {
  const [snapRes, listRes] = await Promise.allSettled([
    deps.loadSnapshot(),
    deps.readListings ? deps.readListings() : readListings(),
  ]);
  const snapshot = snapRes.status === 'fulfilled' ? snapRes.value : null;
  const listings = listRes.status === 'fulfilled' ? listRes.value : [];
  return buildSellChoices({
    myIds: deps.myIds || [],
    positions: snapshot && snapshot.positions ? snapshot.positions : [],
    listings,
    account: deps.account,
    epoch: Number(snapshot && snapshot.epoch ? snapshot.epoch : 0),
  });
}

async function refreshChoices() {
  const deps = state.deps;
  if (!deps || !deps.account) return;
  state.choices = await readChoices(deps);
  state.selected = null;
  state.step = 'pick';
  render();
}
