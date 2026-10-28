// Seaport 1.6 encoding, pinned to the Base deployment. The browser has no
// viem/SDK, so the one call we need (fulfillBasicOrder) and the reads that
// verify an order are encoded by hand. Calldata is cross-checked byte for byte
// against viem in seaport-abi.test.mjs.

import { encAddr, encUint } from './market-config.mjs';

export const SEAPORT_16 = '0x0000000000000068F116a894984e2DB1123eB395';

// BasicOrderType.ERC20_TO_ERC721_FULL_OPEN
export const BASIC_ORDER_TYPE_ERC20_TO_ERC721_FULL_OPEN = 8;

export const SEL = {
  fulfillBasicOrder: '0xfb0f3ee1',
  getOrderStatus: '0x46423aa7',
  getCounter: '0xf07ec373',
};

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const ZERO_BYTES32 = '0x' + '0'.repeat(64);

const strip = (hex) => String(hex).replace(/^0x/i, '').toLowerCase();

export function encBytes32(value) {
  const s = strip(value);
  if (!/^[0-9a-f]{64}$/.test(s)) throw new Error('bad bytes32: ' + value);
  return s;
}

export function encBytes(value) {
  const s = strip(value);
  if (s.length % 2 !== 0 || !/^[0-9a-f]*$/.test(s)) throw new Error('bad bytes: ' + value);
  const len = s.length / 2;
  const padded = s.padEnd(Math.ceil(s.length / 64) * 64, '0');
  return { length: encUint(len), body: padded };
}

/**
 * Encode fulfillBasicOrder(BasicOrderParameters).
 *
 * @param {Object} p - BasicOrderParameters in plain JS values:
 *   considerationToken, considerationIdentifier, considerationAmount,
 *   offerer, zone, offerToken, offerIdentifier, offerAmount, basicOrderType,
 *   startTime, endTime, zoneHash, salt, offererConduitKey, fulfillerConduitKey,
 *   additionalRecipients [{ amount, recipient }], signature.
 * @returns {string} 0x calldata.
 */
export function encodeFulfillBasicOrder(p) {
  const recipients = Array.isArray(p.additionalRecipients) ? p.additionalRecipients : [];
  const signature = encBytes(p.signature);

  const HEAD_WORDS = 18;
  const recipientsOffset = HEAD_WORDS * 32;
  const recipientsBody = encUint(recipients.length) + recipients
    .map((r) => encUint(r.amount) + encAddr(r.recipient))
    .join('');
  const signatureOffset = recipientsOffset + recipientsBody.length / 2;
  const signatureBody = signature.length + signature.body;

  const head = [
    encAddr(p.considerationToken),
    encUint(p.considerationIdentifier),
    encUint(p.considerationAmount),
    encAddr(p.offerer),
    encAddr(p.zone),
    encAddr(p.offerToken),
    encUint(p.offerIdentifier),
    encUint(p.offerAmount),
    encUint(p.basicOrderType),
    encUint(p.startTime),
    encUint(p.endTime),
    encBytes32(p.zoneHash),
    encUint(p.salt),
    encBytes32(p.offererConduitKey),
    encBytes32(p.fulfillerConduitKey),
    encUint(recipients.length), // totalOriginalAdditionalRecipients
    encUint(recipientsOffset),
    encUint(signatureOffset),
  ].join('');

  // A tuple argument with dynamic members is itself dynamic: the function
  // argument head first carries its offset (0x20), then the tuple body.
  return SEL.fulfillBasicOrder + encUint(32) + head + recipientsBody + signatureBody;
}

export function encGetOrderStatus(orderHash) {
  return SEL.getOrderStatus + encBytes32(orderHash);
}

export function encGetCounter(offerer) {
  return SEL.getCounter + encAddr(offerer);
}

// getOrderStatus returns (bool isValidated, bool isCancelled, uint256 totalFilled, uint256 totalSize).
export function decodeOrderStatus(words) {
  const w = words || [];
  return {
    validated: w[0] != null && BigInt('0x' + w[0]) !== 0n,
    cancelled: w[1] != null && BigInt('0x' + w[1]) !== 0n,
    totalFilled: w[2] != null ? BigInt('0x' + w[2]) : 0n,
    totalSize: w[3] != null ? BigInt('0x' + w[3]) : 0n,
  };
}
