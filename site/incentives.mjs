// Incentives dashboard entry point: loads the snapshot/offers/names in parallel,
// renders a skeleton while loading, then assembles the network hero and three
// audience sections (stakers, buyers, providers), followed by offers.
// Re-exports the pure helpers the tests import.
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
import { buildBuyersSection } from './incentives-buyers.mjs';
import { buildProvidersSection } from './incentives-providers.mjs';
import { buildOfferSection } from './incentives-offers.mjs';
import { forecastEpoch, forecastHorizon, decimalToFix, snapshotEpochInputs } from './incentives-forecast.mjs';
import { buildHero, buildMetrics, buildHeroActions, buildSection } from './incentives-hero.mjs';

export { isValidOffer, offerLine, offerCard, buildOfferRows, buildOfferSection } from './incentives-offers.mjs';
export { nextBudget, networkMetrics, formatCountdown, formatUtc, formatDate, cashbackUsage, cashbackCell, cashbackHead } from './incentives-data.mjs';
export { sellerPointsUsage, sellerRewardCell, buyerAntsForSpend, buyerCapSpend, poolBoost, listPools, formatAntsWei } from './incentives-points.mjs';
export { poolModel } from './incentives-pool-model.mjs';
export { buildHero, buildMetrics, buildSection, buildHeroActions, buildPostOfferButton, infoIcon } from './incentives-hero.mjs';
export { buildBoard } from './incentives-board.mjs';
export { buildCalculator } from './incentives-calc.mjs';
export { buildBuyersSection } from './incentives-buyers.mjs';
export { buildProvidersSection } from './incentives-providers.mjs';
export { buildNoPool } from './incentives-nopool.mjs';
export { forecastEpoch, forecastHorizon, decimalToFix, snapshotEpochInputs } from './incentives-forecast.mjs';

async function init() {
  const container = document.getElementById('incentives');
  if (!container) return;

  container.classList.add('inc-dashboard');

  const buildPreparingBanner = () => {
    const banner = document.createElement('div');
    banner.className = 'inc-preparing';
    banner.textContent = 'PREPARING \u2014 work in progress';
    return banner;
  };

  // Skeleton: hero with "—" cards while the data loads.
  const skeleton = buildHero('Incentives', 'Loading…', '');
  skeleton.appendChild(buildMetrics(null, null, null, '—', null));
  container.innerHTML = '';
  container.appendChild(buildPreparingBanner());
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

    // For stakers: the pool board plus the reward calculator.
    const stakerBody = document.createElement('div');
    stakerBody.className = 'inc-staker-body';
    stakerBody.appendChild(buildBoard(snapshot, mode, offers, N, poolNames));
    stakerBody.appendChild(buildCalculator(snapshot, mode, offers, N, poolNames));
    const stakerSection = buildSection(
      'For stakers',
      'Stake into a seller pool to earn ANTS next epoch; offer USDC to attract stakers to yours.',
      stakerBody,
      'inc-stakers-section'
    );

    // For buyers and providers: the rest of the points model, by audience.
    const buyersSection = buildBuyersSection(snapshot, mode, poolNames);
    const providersSection = buildProvidersSection(snapshot, mode, poolNames, offers, N);

    // Offers stay last: rebate-claim.mjs mounts on the .inc-offers selector.
    const offerSection = buildOfferSection(offers, N, poolNames);

    container.innerHTML = '';
    container.appendChild(buildPreparingBanner());
    container.appendChild(hero);
    container.appendChild(stakerSection);
    container.appendChild(buyersSection);
    container.appendChild(providersSection);
    container.appendChild(offerSection);
  } catch (err) {
    console.error(err);
    container.innerHTML = '';
    container.appendChild(buildPreparingBanner());
    const error = document.createElement('p');
    error.textContent = 'Failed to load incentive data.';
    container.appendChild(error);
  }
}

init();
