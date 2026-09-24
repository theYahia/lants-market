// Sanity check: verify site/market-config.mjs exports the market address, selector
// set, and the calldata encoders the storefront needs. Prints encoders_ok=1 or 0.
// Usage: node scripts/site/check_encoders.mjs
let ok = true;
let m = {};

try {
  m = await import('../../site/market-config.mjs').catch(() => ({}));
} catch {
  m = {};
}

const required = ['MARKET', 'SEL', 'encCreateListing', 'encSetApprovalForAll'];
for (const key of required) {
  if (!(key in m)) ok = false;
}

if (typeof m.encCreateListing !== 'function') ok = false;
if (typeof m.encSetApprovalForAll !== 'function') ok = false;

console.log(ok ? 'encoders_ok=1' : 'encoders_ok=0');
process.exit(0);