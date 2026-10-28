// Incentives dashboard entry point: loads the snapshot/offers/names in parallel,
// renders a skeleton while loading, then assembles hero, board, calculator, offers
// and the "no pool" section. Re-exports the pure helpers the tests import.
import { rewardMode } from './metrics.mjs';
import { epochBoundary } from './epochs.mjs';
import {
  loadSnapshot,
  loadOffers,
  loadPoolNames,
  networkMetrics,
  formatCountdown,
  formatUtc,
} from './incentives-data.mjs';
import { buildBoard } from './incentives-board.mjs';
import { buildCalculator } from './incentives-calc.mjs';
import { buildNoPool } from './incentives-nopool.mjs';
import { buildOfferSection } from './incentives-offers.mjs';
import { buildHero, buildMetrics, buildHeroActions, buildSection } from './incentives-hero.mjs';

export { isValidOffer, offerLine, offerCard, buildOfferRows, buildOfferSection } from './incentives-offers.mjs';
export { nextBudget, networkMetrics, formatCountdown, formatUtc, formatDate, cashbackUsage, cashbackCell, cashbackHead } from './incentives-data.mjs';
export { poolModel } from './incentives-pool-model.mjs';
export { buildHero, buildMetrics, buildSection, buildHeroActions, infoIcon } from './incentives-hero.mjs';
export { buildBoard } from './incentives-board.mjs';
export { buildCalculator } from './incentives-calc.mjs';
export { buildNoPool } from './incentives-nopool.mjs';

async function init() {
  const container = document.getElementById('incentives');
  if (!container) return;

  container.classList.add('inc-dashboard');

  // Skeleton: hero with "—" cards while the data loads.
  const skeleton = buildHero('Incentives', 'Loading…', '');
  skeleton.appendChild(buildMetrics(null, null, null, '—', null));
  container.innerHTML = '';
  container.appendChild(skeleton);

  try {
    const [snapshot, poolNames, offers] = await Promise.all([
      loadSnapshot(),
      loadPoolNames(),
      loadOffers().catch(() => null),
    ]);

    const mode = rewardMode(snapshot);
    const e = Number(mode.epoch);
    const N = e + 1;

    const { B, S, A } = networkMetrics(snapshot, N);
    const budgetText = B === null ? '—' : `${B.toLocaleString('en-US')} ANTS`;
    const avgText = A === null ? '—' : String(A);
    const netText = `From snapshot, epoch ${N}: ${budgetText} to stakers \u00B7 ${S.toLocaleString('en-US')} ANTS staked \u00B7 ${avgText} per 1,000 on average`;

    const hero = buildHero('Incentives', '', netText);
    const metaEl = hero.querySelector('.inc-hero-meta');
    const metrics = buildMetrics(B, S, A, '—', N);
    const countdownEl = metrics.querySelector('.inc-metric--countdown .inc-metric-value');

    // The banner advertises the first epoch that has not started yet. It is
    // wall-clock based, so it rolls to the next epoch right at the boundary
    // instead of waiting for the next published snapshot. The "Next epoch starts
    // in" card shares this same countdown.
    const setMeta = () => {
      const now = Date.now();
      let n = Number(mode.epoch) + 1;
      while (epochBoundary(n).getTime() <= now) n += 1;
      const nextBoundary = epochBoundary(n);
      const left = formatCountdown(nextBoundary.getTime() - now);
      metaEl.textContent = `Epoch ${n} \u00B7 stake now to count from it \u00B7 starts ${formatUtc(nextBoundary)} \u00B7 in ${left}`;
      if (countdownEl) countdownEl.textContent = left;
    };
    setMeta();
    setInterval(setMeta, 60000);

    hero.appendChild(metrics);
    hero.appendChild(buildHeroActions(N));

    const board = buildBoard(snapshot, mode, offers, N, poolNames);
    const boardSection = buildSection(
      'Pool board',
      'Stake into a seller pool to earn ANTS next epoch; offer USDC to attract stakers to yours.',
      board,
      'inc-board-section'
    );

    const calculator = buildCalculator(snapshot, mode, offers, N, poolNames);
    const offerSection = buildOfferSection(offers, N, poolNames);
    const nopoolDiv = buildNoPool(snapshot, poolNames);

    container.innerHTML = '';
    container.appendChild(hero);
    container.appendChild(boardSection);
    container.appendChild(calculator);
    container.appendChild(offerSection);
    if (nopoolDiv) {
      container.appendChild(nopoolDiv);
    }
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p>Failed to load incentive data.</p>';
  }
}

init();
