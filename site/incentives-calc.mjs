// The reward calculator: pool + amount in two columns (>=768px), a large result
// number with a USDC second line, and the seller-rebate spend line. The board's
// "Calculate" action selects a pool here via the #inc-calc-amount input and the
// .inc-calc select.
import { poolModel } from './incentives-pool-model.mjs';
import { forecastHorizon, snapshotEpochInputs } from './incentives-forecast.mjs';
import { isValidOffer } from './incentives-offers.mjs';
import { validRebate, rebateLabel, rebateForSpend } from './rebate.mjs';

export function buildCalculator(snapshot, mode, offers, displayEpoch, poolNames) {
  const { poolData, estForPool } = poolModel(snapshot, mode);
  const positions = snapshot.positions || [];
  const container = document.createElement('div');
  container.className = 'inc-calc';
  const forecastOutput = document.createElement('div');
  forecastOutput.className = 'inc-calc-forecast';
  const forecastStatus = document.createElement('p');
  forecastStatus.textContent = 'Forecast: exact on-chain inputs required';
  forecastOutput.appendChild(forecastStatus);
  const forecastButton = document.createElement('button');
  forecastButton.type = 'button';
  forecastButton.textContent = 'Run forecast to unlock';
  forecastOutput.appendChild(forecastButton);
  forecastButton.addEventListener('click', () => {
    const owner = new Map();
    for (const position of positions) {
      const pool = String(position.agentId);
      const weight = position.weightsByEpoch?.[String(Number(mode.epoch) + 1)];
      if (weight !== undefined) owner.set(pool, BigInt(String(weight)));
    }
    const epochs = [];
    for (let i = 1; i <= 104; i += 1) {
      const input = snapshotEpochInputs(snapshot, Number(mode.epoch) + i, owner);
      epochs.push(input.unavailable ? input : input);
    }
    const result = forecastHorizon({ epochs, currentEpoch: mode.epoch, stakeEndEpoch: snapshot.stakeEndEpoch || Number(mode.epoch) + 104, discountRateBps: snapshot.forecastDiscountRateBps || 0 });
    forecastStatus.textContent = result.coverage < 1 ? `Forecast unavailable: coverage ${Math.round(result.coverage * 100)}%` : `Forecast: ${result.undiscountedRewardTotalFix / 10n ** 18n} ANTS undiscounted · ${result.discountedPvRewardFix / 10n ** 18n} ANTS discounted PV`;
  });

  const h3 = document.createElement('h3');
  h3.textContent = 'Estimated rewards calculator';
  container.appendChild(h3);

  const poolSelect = document.createElement('select');
  const poolOrder = [...poolData.keys()];
  const defaultPool = '52894';
  if (!poolOrder.includes(defaultPool)) {
    poolOrder.unshift(defaultPool);
  }
  for (const pool of poolOrder) {
    const option = document.createElement('option');
    option.value = pool;
    const name = poolNames[pool];
    option.textContent = name ? `${name} · ${pool}` : pool;
    if (pool === defaultPool) option.selected = true;
    poolSelect.appendChild(option);
  }

  const poolLabel = document.createElement('label');
  poolLabel.textContent = 'Pool: ';
  poolLabel.appendChild(poolSelect);

  const yInput = document.createElement('input');
  yInput.type = 'number';
  yInput.min = '0';
  yInput.step = '1';
  yInput.value = '1000';
  yInput.id = 'inc-calc-amount';
  const yLabel = document.createElement('label');
  yLabel.textContent = 'Amount of ANTS: ';
  yLabel.appendChild(yInput);

  const fields = document.createElement('div');
  fields.className = 'inc-calc-fields';
  fields.appendChild(poolLabel);
  fields.appendChild(yLabel);
  container.appendChild(fields);

  const result = document.createElement('div');
  result.className = 'inc-calc-result';
  const resultValue = document.createElement('div');
  resultValue.className = 'inc-calc-result-value';
  const resultSub = document.createElement('div');
  resultSub.className = 'inc-calc-result-sub';
  const resultUsdc = document.createElement('div');
  resultUsdc.className = 'inc-calc-result-usdc';
  result.appendChild(resultValue);
  result.appendChild(resultSub);
  result.appendChild(resultUsdc);
  container.appendChild(result);

  const rebateSpendInput = document.createElement('input');
  rebateSpendInput.type = 'number';
  rebateSpendInput.id = 'inc-calc-spend';
  rebateSpendInput.min = '0';
  rebateSpendInput.step = 'any';
  rebateSpendInput.value = '';
  rebateSpendInput.placeholder = '0';
  const rebateSpendLabel = document.createElement('label');
  rebateSpendLabel.textContent = 'Spend with this seller (USD): ';
  rebateSpendLabel.appendChild(rebateSpendInput);
  const rebateOutput = document.createElement('p');
  rebateOutput.className = 'inc-calc-rebate';
  container.appendChild(rebateSpendLabel);
  container.appendChild(rebateOutput);
  container.appendChild(forecastOutput);

  function updateRebate() {
    const pool = poolSelect.value;
    let offer = null;
    if (offers) {
      for (const o of offers) {
        if (validRebate(o) && o.pool === pool && o.epochs[0] === displayEpoch) {
          offer = o;
          break;
        }
      }
    }
    if (!offer) {
      rebateSpendLabel.style.display = 'none';
      rebateOutput.textContent = '';
      return;
    }
    rebateSpendLabel.style.display = '';
    const spend = Number(rebateSpendInput.value);
    if (!rebateSpendInput.value || !(spend > 0)) {
      rebateOutput.textContent = rebateLabel(offer, displayEpoch);
      return;
    }
    if (offer.minSpendUsdc !== undefined && spend < offer.minSpendUsdc) {
      rebateOutput.textContent = `${rebateLabel(offer, displayEpoch)} · minimum spend $${offer.minSpendUsdc}`;
      return;
    }
    const microSpend = BigInt(Math.round(spend * 1e6));
    const rebateBack = rebateForSpend(microSpend, offer);
    const rebateUsdc = Number(rebateBack) / 1e6;
    rebateOutput.textContent = `You get $${rebateUsdc.toFixed(2)} back · ${rebateLabel(offer, displayEpoch)}`;
  }

  function update() {
    const Y = Number(yInput.value);
    if (!yInput.value || !(Y > 0)) {
      result.style.display = 'none';
      return;
    }
    const pool = poolSelect.value;
    if (!pool) {
      result.style.display = 'none';
      return;
    }
    const wNext = poolData.get(pool)?.WN || 0;
    if (wNext === 0) {
      result.style.display = '';
      resultValue.textContent = 'Not counted next epoch';
      resultSub.textContent = '';
      resultUsdc.textContent = '';
      return;
    }
    const v = Y * 104;
    const estAnts = estForPool(pool, v);

    let usdc = '—';
    if (offers) {
      let best = null;
      for (const offer of offers) {
        if (!isValidOffer(offer, displayEpoch)) continue;
        if (offer.pool !== pool) continue;
        if (!best || offer.usdcPer1k > best.usdcPer1k) best = offer;
      }
      if (best) {
        if (best.pays === 'new') {
          let newN = 0;
          for (const pos of positions) {
            if (String(pos.agentId) === pool && Number(pos.stakeStartEpoch) === displayEpoch) {
              newN += Number(pos.weightsByEpoch?.[String(displayEpoch)] || 0) / 1e18 / 104;
            }
          }
          const usdcValue = Math.min(Y, Math.max(0, best.capAnts - newN)) / 1000 * best.usdcPer1k;
          usdc = usdcValue.toFixed(2) + ' USDC';
        } else if (best.pays === 'all') {
          const wN = (poolData.get(pool)?.WN || 0) / 104;
          const usdcValue = Y / 1000 * best.usdcPer1k * Math.min(1, best.capAnts / (wN + Y));
          usdc = usdcValue.toFixed(2) + ' USDC';
        }
      }
    }

    result.style.display = '';
    resultValue.textContent = `${estAnts.toFixed(2)} ANTS`;
    resultSub.textContent = 'est. per epoch (max lock)';
    resultUsdc.textContent = usdc === '—' ? '' : usdc;
  }

  poolSelect.addEventListener('input', update);
  yInput.addEventListener('input', update);
  poolSelect.addEventListener('input', updateRebate);
  rebateSpendInput.addEventListener('input', updateRebate);
  update();
  updateRebate();

  return container;
}
