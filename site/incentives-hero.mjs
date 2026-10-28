// Hero, metric cards and the small layout shell shared across the dashboard.
// All DOM builders here; no network.

export function infoIcon(tip) {
  const info = document.createElement('span');
  info.className = 'info';
  info.tabIndex = 0;
  info.textContent = 'ⓘ';
  info.setAttribute('role', 'img');
  info.setAttribute('aria-label', 'info');
  if (tip) info.dataset.tip = tip;
  return info;
}

export function buildHero(title, meta, summaryText) {
  const hero = document.createElement('section');
  hero.className = 'inc-hero';
  const head = document.createElement('div');
  head.className = 'inc-header';
  const h2 = document.createElement('h2');
  h2.className = 'inc-hero-title';
  h2.textContent = title;
  const metaEl = document.createElement('p');
  metaEl.className = 'inc-hero-meta';
  metaEl.textContent = meta;
  const net = document.createElement('p');
  net.className = 'inc-net';
  net.textContent = summaryText;
  head.appendChild(h2);
  head.appendChild(metaEl);
  head.appendChild(net);
  hero.appendChild(head);
  return hero;
}

// B, S, A are the network numbers for the target epoch (null -> "—"); countdownText
// is the wall-clock countdown to the next epoch boundary; N labels the cards as coming
// from that snapshot epoch (null omits the caption, used by the skeleton).
export function buildMetrics(B, S, A, countdownText, N) {
  const grid = document.createElement('div');
  grid.className = 'inc-metrics';

  if (N !== null && N !== undefined) {
    const caption = document.createElement('p');
    caption.className = 'inc-metrics-caption';
    caption.textContent = `From snapshot, epoch ${N}`;
    grid.appendChild(caption);
  }

  const addCard = (label, value, modifier, tip) => {
    const card = document.createElement('div');
    card.className = modifier ? `inc-metric ${modifier}` : 'inc-metric';
    const lbl = document.createElement('span');
    lbl.className = 'inc-metric-label';
    const text = document.createElement('span');
    text.className = 'inc-metric-label-text';
    text.textContent = label;
    lbl.appendChild(text);
    if (tip) lbl.appendChild(infoIcon(tip));
    const val = document.createElement('span');
    val.className = 'inc-metric-value';
    val.textContent = value;
    card.appendChild(lbl);
    card.appendChild(val);
    grid.appendChild(card);
  };

  addCard('Next-epoch staker budget', B === null || B === undefined ? '—' : `${B.toLocaleString('en-US')} ANTS`, 'inc-metric--budget');
  addCard('ANTS staked next epoch', S === null || S === undefined ? '—' : S.toLocaleString('en-US'), '');
  addCard('Avg reward per 1,000 ANTS / epoch', A === null || A === undefined ? '—' : String(A), '', 'Average ANTS a staker earns per epoch for each 1,000 ANTS staked at max lock, from the snapshot budget and stake.');
  addCard('Next epoch starts in', countdownText === null || countdownText === undefined ? '—' : countdownText, 'inc-metric--countdown');
  return grid;
}

export function buildSection(title, lead, body, className) {
  const section = document.createElement('section');
  section.className = className ? `inc-section ${className}` : 'inc-section';
  const h3 = document.createElement('h3');
  h3.className = 'inc-section-title';
  h3.textContent = title;
  section.appendChild(h3);
  if (lead) {
    const p = document.createElement('p');
    p.className = 'inc-section-lead';
    p.textContent = lead;
    section.appendChild(p);
  }
  if (body) {
    section.appendChild(body);
  }
  return section;
}

function buildPostOfferButton(displayEpoch) {
  const wrap = document.createElement('div');
  wrap.className = 'inc-post-offer-wrap';

  const postBtn = document.createElement('a');
  postBtn.className = 'inc-post-offer';
  postBtn.textContent = 'Post an offer on GitHub ↗';
  const title = `Incentive offer for pool (epoch ${displayEpoch})`;
  const bodyLines = [
    'Pool: ',
    'Type: stake | rebate',
    'epochs: ' + JSON.stringify([displayEpoch]),
    'USDC per 1,000 ANTS: ',
    'Cap: ',
    'Payer: ',
    'Pays: all | new',
    'pctBps (rebate, 100 = 1%): ',
    'capUsdc (rebate, total USDC): ',
    'capPerBuyerUsdc (rebate, optional): ',
    'minSpendUsdc (rebate, optional): ',
    'stakeGate.minStakeAnts (rebate, optional, ANTS): ',
    'Paid in USDC on Base to the position owner within 7 days after epoch ' + displayEpoch + ' ends, from the last published snapshot of epoch ' + displayEpoch + '.'
  ];
  const body = bodyLines.join('\n');
  postBtn.href = 'https://github.com/theYahia/lants-market/issues/new?title=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body);
  postBtn.target = '_blank';
  postBtn.rel = 'noopener noreferrer';
  wrap.appendChild(postBtn);

  return wrap;
}

// Primary action is for stakers (estimate rewards); the GitHub CTA is secondary.
export function buildHeroActions(displayEpoch) {
  const actions = document.createElement('div');
  actions.className = 'inc-hero-actions';

  const estimateBtn = document.createElement('button');
  estimateBtn.type = 'button';
  estimateBtn.className = 'inc-estimate-btn';
  estimateBtn.textContent = 'Estimate my rewards';
  estimateBtn.addEventListener('click', () => {
    const calc = document.querySelector('.inc-calc');
    if (calc && typeof calc.scrollIntoView === 'function') {
      calc.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    const amount = document.querySelector('#inc-calc-amount');
    if (amount) amount.focus();
  });
  actions.appendChild(estimateBtn);

  const label = document.createElement('span');
  label.className = 'inc-cta-label';
  label.textContent = 'Have a pool? Offer USDC to its stakers next epoch.';
  actions.appendChild(label);
  actions.appendChild(buildPostOfferButton(displayEpoch));
  return actions;
}
