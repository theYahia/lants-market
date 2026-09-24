import { readFileSync } from 'node:fs';

const PATH = 'site/fixtures/snapshot-e23.live.json';

function fail(msg) {
  console.error('sanity_failed: ' + msg);
  process.exit(1);
}

let snapshot;
try {
  snapshot = JSON.parse(readFileSync(PATH, 'utf8'));
} catch (e) {
  fail('cannot read ' + PATH + ': ' + e.message);
}

// positions length is at least 20
if (!Array.isArray(snapshot.positions) || snapshot.positions.length < 20) {
  fail('positions length must be at least 20, got ' + (Array.isArray(snapshot.positions) ? snapshot.positions.length : 'none'));
}

// epoch is at least 23
const epoch = Number(snapshot.epoch);
if (!Number.isFinite(epoch) || epoch < 23) {
  fail('epoch must be at least 23, got ' + snapshot.epoch);
}

// stakerBudget is a positive number
const stakerBudget = Number(snapshot.stakerBudget);
if (!Number.isFinite(stakerBudget) || stakerBudget <= 0) {
  fail('stakerBudget must be a positive number, got ' + snapshot.stakerBudget);
}

// poolWeightByEpoch has a nonzero entry
const pwb = snapshot.poolWeightByEpoch;
let hasNonzeroWeight = false;
if (pwb && typeof pwb === 'object') {
  for (const byEpoch of Object.values(pwb)) {
    if (byEpoch && typeof byEpoch === 'object') {
      for (const v of Object.values(byEpoch)) {
        if (Number(v) > 0) { hasNonzeroWeight = true; break; }
      }
    }
    if (hasNonzeroWeight) break;
  }
}
if (!hasNonzeroWeight) {
  fail('poolWeightByEpoch must have a nonzero entry');
}

// salesByPool is a non-empty object
const sbp = snapshot.salesByPool;
if (!sbp || typeof sbp !== 'object' || Array.isArray(sbp) || Object.keys(sbp).length === 0) {
  fail('salesByPool must be a non-empty object');
}

// generatedAt is within the last two hours
const generatedAt = Date.parse(snapshot.generatedAt);
if (Number.isNaN(generatedAt)) {
  fail('generatedAt is not a valid date: ' + snapshot.generatedAt);
}
const twoHours = 2 * 60 * 60 * 1000;
const age = Date.now() - generatedAt;
if (age > twoHours) {
  fail('generatedAt is older than two hours (' + Math.round(age / 60000) + ' minutes ago)');
}

console.log('sanity_ok');