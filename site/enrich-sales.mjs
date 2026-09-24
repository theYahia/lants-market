import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const PATH = 'site/fixtures/snapshot-e23.live.json';
const FULL_PATH = 'site/fixtures/snapshot-e23.full.json';

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return null;
}

function readJsonSafe(path) {
  try {
    if (!path || !existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

try {
  const raw = readFileSync(PATH, 'utf8');
  const snapshot = JSON.parse(raw);

  // Previous sales: prefer the live.json snapshot, fall back to full.json.
  const prevSalesByPool =
    (snapshot && snapshot.salesByPool) ||
    (readJsonSafe(FULL_PATH) || {}).salesByPool ||
    {};

  const sellersFile = getArg('--sellers');
  const sellers = readJsonSafe(sellersFile);

  let result;

  if (!sellersFile || !existsSync(sellersFile) || sellers === null) {
    // Sellers file not provided / missing / unreadable:
    // keep previous salesByPool, do not fail the workflow.
    result = {
      ...snapshot,
      salesByPool: prevSalesByPool,
    };
    writeFileSync(PATH, JSON.stringify(result, null, 2));
    console.log('sales_skipped pools=' + Object.keys(prevSalesByPool).length);
  } else {
    const salesByPool = {};
    let nonzeroPools = 0;
    for (const { agentId, sellerPoints } of sellers) {
      const val = Number(sellerPoints);
      if (!Number.isNaN(val) && val !== 0) {
        salesByPool[agentId] = val;
        nonzeroPools++;
      }
    }

    result = {
      ...snapshot,
      salesByPool,
    };
    writeFileSync(PATH, JSON.stringify(result, null, 2));
    console.log('sales_ok pools=' + nonzeroPools);
  }
} catch (e) {
  console.error(e);
  process.exit(1);
}