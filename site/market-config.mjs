// site/market-config.mjs - market constants and ABI word encoders
// Pure functions only: no DOM, no window, no fetch, no imports.
// Comments must stay ASCII-only: build pipeline rejects non-latin bytes.

export const MARKET = {
  chainIdHex: '0x2105',                                              // Base 8453
  market:   '0xC5BFc309a68dBf4e7eEca9BD91749d611c75C660',            // VexyMarketplace on Base, deployed 2026-09-20
  nft:      '0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652',            // lANTS positions collection
  usdc:     '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',            // USDC on Base, 6 decimals
  usdcDecimals: 6,
  operator: '0x3d4CCcfAA3B25997F4ab33f838558521259Eef1B',
  privyAppId: 'cmudz5sz902ru0bl8pns3vryh',
};

// Selectors measured via `cast sig`, used as-is.
export const SEL = {
  listingPrice:   '0x115bc936', // listingPrice(uint256)
  buyListing:     '0x4884f459', // buyListing(uint256)
  listings:       '0xde74e57b', // listings(uint256)
  listingsLength: '0x7afd81f5', // listingsLength()
  createListing:  '0x10e8ee82', // createListing(address,uint256,address,uint256,uint96,uint32,uint32)
  setApprovalForAll: '0xa22cb465', // setApprovalForAll(address,bool)
  allowance:      '0xdd62ed3e', // allowance(address,address)
  approve:        '0x095ea7b3', // approve(address,uint256)
  ownerOf:        '0x6352211e', // ownerOf(uint256)
  isApprovedForAll: '0xe985e9c5', // isApprovedForAll(address,address)
  balanceOf:      '0x70a08231', // balanceOf(address)
  // cast sig "cancelNftListings(address,uint256)"
  cancelNftListings: '0xa7faa28e',
  // Staker-related selectors
  stakerPositionCount: '0xd99a05cb', // stakerPositionCount(address)
  stakerTotalActiveStake: '0xb2d2457b', // stakerTotalActiveStake(address)
  stakerPositionIds: '0x5630d00a', // stakerPositionIds(address,uint256,uint256)
  pendingIndexedStakerReward: '0x0b19b283', // pendingIndexedStakerReward(uint256)
};

// Normalize input (BigInt / number / hex or decimal string) to BigInt.
function toBigInt(v) {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) throw new Error('not an integer: ' + v);
    return BigInt(v);
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '') throw new Error('empty value');
    if (/^(0x)?[0-9a-fA-F]+$/.test(s) && /^0x/i.test(s)) {
      return BigInt(s.toLowerCase());
    }
    if (/^[0-9]+$/.test(s)) return BigInt(s);
    throw new Error('bad value: ' + v);
  }
  throw new Error('unsupported type: ' + typeof v);
}

// Left-pad hex string to exactly 64 chars, lowercase, no 0x.
function padHexLeft(hex) {
  if (hex.startsWith('0x') || hex.startsWith('0X')) hex = hex.slice(2);
  hex = hex.toLowerCase();
  if (!/^[0-9a-f]*$/.test(hex)) throw new Error('bad hex');
  if (hex.length > 64) throw new Error('value too long for 32 bytes');
  return hex.padStart(64, '0');
}

// Pad any accepted value to a 32-byte hex word.
export function pad32(v) {
  if (typeof v === 'bigint' || typeof v === 'number' || typeof v === 'string') {
    // BigInt without 0x prefix should be treated as decimal, not hex,
    // so convert to hex digits first.
    const isHexString = typeof v === 'string' && /^0[xX]/.test(v) ? true : typeof v !== 'string';
    if (isHexString) {
      const asBig = toBigInt(v);
      return padHexLeft(asBig.toString(16));
    }
    // Plain hex-less string: could be decimal or bare hex; prefer decimal
    // per pad32(v) contract for BigInt/decimal strings; bare hex treat as hex.
    const s = v.trim();
    if (/^[0-9]+$/.test(s)) return padHexLeft(BigInt(s).toString(16));
    return padHexLeft(s);
  }
  return padHexLeft(v.toString(16));
}

// Address (20 bytes) into a 32-byte word.
export function encAddr(a) {
  if (typeof a !== 'string') throw new Error('address must be string');
  let s = a.trim();
  if (s.startsWith('0x') || s.startsWith('0X')) s = s.slice(2);
  if (!/^[0-9a-fA-F]+$/.test(s) || s.length > 40) throw new Error('bad address');
  return pad32('0x' + s.toLowerCase());
}

// Unsigned integer into a 32-byte word.
export function encUint(n) {
  const b = toBigInt(n);
  if (b < 0n) throw new Error('negative uint');
  return pad32('0x' + b.toString(16));
}

// Encode calldata for cancelNftListings(address nftCollection, uint256 nftId)
export function cancelNftListings(nftCollection, nftId) {
  // selector + two padded arguments
  return SEL.cancelNftListings + encAddr(nftCollection) + encUint(nftId);
}

// Split raw eth_call hex response (0x...) into 32-byte words.
export function decodeWords(hex) {
  if (typeof hex !== 'string') throw new Error('response must be string');
  let s = hex.trim();
  if (s.startsWith('0x') || s.startsWith('0X')) s = s.slice(2);
  if (s === '') return [];
  if (!/^[0-9a-fA-F]+$/.test(s)) throw new Error('bad hex response');
  if (s.length % 64 !== 0) throw new Error('length not multiple of 32 bytes');
  const words = [];
  for (let i = 0; i < s.length; i += 64) {
    words.push(s.slice(i, i + 64).toLowerCase());
  }
  return words;
}

// 32-byte word -> BigInt.
export function wordToBigInt(w) {
  if (typeof w !== 'string') throw new Error('word must be string');
  let s = w.trim();
  if (s.startsWith('0x') || s.startsWith('0X')) s = s.slice(2);
  if (!/^[0-9a-fA-F]+$/.test(s) || s.length > 64) throw new Error('bad word');
  return BigInt('0x' + s.toLowerCase());
}

// 32-byte word -> address 0x... (last 20 bytes), lowercase.
export function wordToAddr(w) {
  const s = padHexLeft(w);
  return '0x' + s.slice(24);
}

// BigInt value -> decimal string with decimal point, exact integer math.
export function formatUnits(v, decimals) {
  const d = toBigInt(decimals);
  if (d < 0n) throw new Error('negative decimals');
  const value = toBigInt(v);
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const base = 10n ** d;
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = d === 0n ? '' : '.' + frac.toString().padStart(Number(d), '0');
  return (neg ? '-' : '') + whole.toString() + fracStr;
}

// Encode calldata for createListing(address,uint256,address,uint256,uint96,uint32,uint32)
export function encCreateListing({ nftCollection, nftId, currency, price, slopeMax, slopeDuration, fixedDuration }) {
  return SEL.createListing
    + encAddr(nftCollection)
    + encUint(nftId)
    + encAddr(currency)
    + encUint(price)
    + encUint(slopeMax)
    + encUint(slopeDuration)
    + encUint(fixedDuration);
}

// Encode calldata for setApprovalForAll(address operator, bool approved)
export function encSetApprovalForAll(operator, approved) {
  return SEL.setApprovalForAll + encAddr(operator) + encUint(approved ? 1n : 0n);
}

// Encode calldata for one-address calls (selector + one padded address word)
export function encOneAddressCall(selector, address) {
  return selector + encAddr(address);
}

// Encode calldata for address-plus-two-numbers calls (selector + address + two uint256 words)
export function encAddressPlusTwoNumbers(selector, address, num1, num2) {
  return selector + encAddr(address) + encUint(num1) + encUint(num2);
}

// Listing ids of trades between our own wallets. They are marked internal on the market and never count toward
// volume, price per ANTS or implied FDV. Add an id here in a commit after an internal trade; a lot bought by
// an outside wallet is a real external sale and is NOT added.
export const INTERNAL_LISTING_IDS = [];
