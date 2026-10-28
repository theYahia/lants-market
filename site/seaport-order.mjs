// Validation of a Seaport order before showing a Buy action. Everything the
// canonical fulfillBasicOrder path assumes is checked here, so a stale, filled
// or exotic order can never be sent to the contract. Pure: no fetch, no DOM.

import { MARKET } from './market-config.mjs';
import {
  SEAPORT_16,
  ZERO_ADDRESS,
  ZERO_BYTES32,
  BASIC_ORDER_TYPE_ERC20_TO_ERC721_FULL_OPEN,
} from './seaport-abi.mjs';

const lower = (v) => (v == null ? '' : String(v).toLowerCase());

function toBig(v) {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return Number.isInteger(v) ? BigInt(v) : null;
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^[0-9]+$/.test(s)) return BigInt(s);
    if (/^0x[0-9a-fA-F]+$/.test(s)) return BigInt(s);
  }
  return null;
}

/**
 * @param {Object} order - GET /api/lants/order/{id} payload.
 * @param {Object} expected - { tokenId, now?, nft?, usdc? }
 * @returns {{ok:true, total:bigint, offerer:string, orderHash:string, counter:bigint,
 *            startTime:bigint, endTime:bigint, params:Object, additionalRecipients:Array} |
 *           {ok:false, reason:string}}
 */
export function validateOrder(order, expected = {}) {
  const fail = (reason) => ({ ok: false, reason });
  if (!order || typeof order !== 'object') return fail('schema');
  if (lower(order.protocolAddress) !== SEAPORT_16.toLowerCase()) return fail('protocol');

  const p = order.orderParameters;
  if (!p || typeof p !== 'object') return fail('schema');
  if (lower(p.offerer) !== lower(order.offerer)) return fail('offerer');

  if (Number(p.orderType) !== 0) return fail('order-type');
  if (lower(p.zone) !== ZERO_ADDRESS) return fail('zone');
  if (lower(p.zoneHash) !== ZERO_BYTES32) return fail('zone-hash');
  if (lower(p.conduitKey) !== ZERO_BYTES32) return fail('conduit-key');

  const offer = Array.isArray(p.offer) ? p.offer : [];
  if (offer.length !== 1) return fail('offer');
  const o = offer[0];
  if (Number(o.itemType) !== 2) return fail('offer-item-type');
  if (lower(o.token) !== lower(expected.nft ?? MARKET.nft)) return fail('offer-token');
  const wantedId = toBig(expected.tokenId);
  if (wantedId === null || toBig(o.identifierOrCriteria) !== wantedId) return fail('offer-id');
  if (toBig(o.startAmount) !== 1n || toBig(o.endAmount) !== 1n) return fail('offer-amount');

  const consideration = Array.isArray(p.consideration) ? p.consideration : [];
  if (consideration.length === 0) return fail('consideration');
  const usdc = lower(expected.usdc ?? MARKET.usdc);
  const parsed = [];
  let total = 0n;
  for (const c of consideration) {
    if (Number(c.itemType) !== 1) return fail('consideration-item-type');
    if (lower(c.token) !== usdc) return fail('consideration-token');
    const start = toBig(c.startAmount);
    const end = toBig(c.endAmount);
    if (start === null || end === null) return fail('schema');
    if (start !== end) return fail('consideration-dynamic');
    if (start <= 0n) return fail('consideration-amount');
    total += start;
    parsed.push({ amount: start, recipient: lower(c.recipient) });
  }
  if (parsed[0].recipient !== lower(p.offerer)) return fail('recipient');

  const startTime = toBig(p.startTime);
  const endTime = toBig(p.endTime);
  if (startTime === null || endTime === null) return fail('schema');
  const now = toBig(expected.now ?? Math.floor(Date.now() / 1000));
  if (now === null || now < startTime || now >= endTime) return fail('timing');

  if (!/^0x[0-9a-fA-F]+$/.test(String(order.signature || ''))) return fail('signature');
  const counter = toBig(p.counter);
  if (counter === null) return fail('counter');
  if (toBig(p.salt) === null) return fail('salt');
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(order.orderHash || ''))) return fail('order-hash');

  return {
    ok: true,
    total,
    offerer: lower(p.offerer),
    orderHash: String(order.orderHash).toLowerCase(),
    counter,
    startTime,
    endTime,
    params: p,
    additionalRecipients: parsed.slice(1),
  };
}

/**
 * Turn a validated order into BasicOrderParameters for fulfillBasicOrder.
 * Throws when the order is not valid for the expected token.
 */
export function toBasicOrderParameters(order, expected = {}) {
  const v = validateOrder(order, expected);
  if (!v.ok) throw new Error('invalid order: ' + v.reason);

  const p = v.params;
  const primary = p.consideration[0];
  return {
    considerationToken: primary.token,
    considerationIdentifier: toBig(primary.identifierOrCriteria) ?? 0n,
    considerationAmount: toBig(primary.startAmount),
    offerer: p.offerer,
    zone: p.zone,
    offerToken: p.offer[0].token,
    offerIdentifier: toBig(p.offer[0].identifierOrCriteria),
    offerAmount: toBig(p.offer[0].startAmount),
    basicOrderType: BASIC_ORDER_TYPE_ERC20_TO_ERC721_FULL_OPEN,
    startTime: v.startTime,
    endTime: v.endTime,
    zoneHash: p.zoneHash,
    salt: toBig(p.salt) ?? 0n,
    offererConduitKey: p.conduitKey,
    fulfillerConduitKey: ZERO_BYTES32,
    additionalRecipients: v.additionalRecipients.map((r) => ({ amount: r.amount, recipient: r.recipient })),
    signature: order.signature,
  };
}
