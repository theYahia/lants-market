// Hand-rolled ABI subset for the shared RebateClaims contract, shared by the
// browser claim UI and the node CLI (no bundler on this site: selectors and
// topics below are precomputed with cast, encoders/decoders are pure). The
// calldata/return encoding is cross-checked against viem in
// site/rebate-claims-abi.test.mjs.
//
//   claim(uint256,uint256,address,uint256,bytes32[])                      0x5d4df3bf
//   createCampaignAndFund(uint256,uint256,uint256,uint256,string,uint256) 0x76d52212
//   setMerkleRoot(uint256,bytes32,uint256)                                0x2e7a923f
//   cancel(uint256)                                                       0x40e58ee5
//   sweep(uint256)                                                        0xaa60e733
//   transferCampaignOwnership(uint256,address)                            0x4feedaa1
//   acceptOwnership(uint256)                                              0x952289cf
//   campaign(uint256)                                                     0xccd39037
//   isClaimed(uint256,uint256)                                            0xf364c90c
//   nextCampaignId()                                                      0x7903a756
//   USDC()                                                                0x89a30271

export const SEL = {
  claim: '0x5d4df3bf',
  createCampaignAndFund: '0x76d52212',
  setMerkleRoot: '0x2e7a923f',
  cancel: '0x40e58ee5',
  sweep: '0xaa60e733',
  transferCampaignOwnership: '0x4feedaa1',
  acceptOwnership: '0x952289cf',
  campaign: '0xccd39037',
  isClaimed: '0xf364c90c',
  nextCampaignId: '0x7903a756',
  usdc: '0x89a30271'
};

export const TOPIC = {
  CampaignCreated: '0xa0b75b3d48f1d411faf8eb6b3a6985271fc12369efb160c320304fbcfdc3f3b3'
};

const strip = (h) => String(h).replace(/^0x/, '');

export function encUint(v) {
  const h = BigInt(v).toString(16);
  return h.padStart(64, '0');
}

export function encAddr(a) {
  const h = strip(a).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(h)) throw new Error('bad address: ' + a);
  return h.padStart(64, '0');
}

export function encBytes32(h) {
  const s = strip(h).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(s)) throw new Error('bad bytes32: ' + h);
  return s;
}

// bytes32[] body (length + items), without the head offset word.
export function encProofBody(proof) {
  if (!Array.isArray(proof)) throw new Error('bad proof');
  return encUint(proof.length) + proof.map(encBytes32).join('');
}

// claim(id, index, account, amount, proof): 5 head words (proof is a tail), then the array.
export function encClaimData({ id, index, account, amount, proof }) {
  return (
    SEL.claim +
    encUint(id) +
    encUint(index) +
    encAddr(account) +
    encUint(amount) +
    encUint(5 * 32) +
    encProofBody(proof)
  );
}

// createCampaignAndFund(cancelDeadline, finalizeDeadline, claimWindow, epochId, poolId, amount):
// poolId is the only dynamic value, so it goes to the tail; its head slot is the offset
// 6 * 32 = 192 (six head words precede the tail).
export function encCreateCampaignData({ cancelDeadline, finalizeDeadline, claimWindow, epochId, poolId, amount }) {
  const bytes = new TextEncoder().encode(String(poolId));
  const len = encUint(bytes.length);
  let body = '';
  for (const b of bytes) body += b.toString(16).padStart(2, '0');
  const padded = body.padEnd(Math.ceil(body.length / 64) * 64, '0');
  return (
    SEL.createCampaignAndFund +
    encUint(cancelDeadline) +
    encUint(finalizeDeadline) +
    encUint(claimWindow) +
    encUint(epochId) +
    encUint(6 * 32) +
    encUint(amount) +
    len +
    padded
  );
}

export function encSetMerkleRootData(id, root, total) {
  return SEL.setMerkleRoot + encUint(id) + encBytes32(root) + encUint(total);
}

export function encIdData(selector, id) {
  return selector + encUint(id);
}

export function encTransferOwnershipData(id, newOwner) {
  return SEL.transferCampaignOwnership + encUint(id) + encAddr(newOwner);
}

export function encIsClaimedData(id, index) {
  return SEL.isClaimed + encUint(id) + encUint(index);
}

export function encCampaignData(id) {
  return SEL.campaign + encUint(id);
}

function word(hex, i) {
  return strip(hex).slice(i * 64, (i + 1) * 64);
}

export function decodeUint(result, i = 0) {
  return BigInt('0x' + word(result, i));
}

export function decodeAddress(result, i = 0) {
  return '0x' + word(result, i).slice(24);
}

export function decodeBool(result, i = 0) {
  return BigInt('0x' + word(result, i)) !== 0n;
}

export function decodeBytes32(result, i = 0) {
  return '0x' + word(result, i);
}

export function decodeString(result, i) {
  const off = Number(decodeUint(result, i));
  const body = strip(result);
  const start = off * 2;
  const len = Number(BigInt('0x' + body.slice(start, start + 64)));
  const hex = body.slice(start + 64, start + 64 + len * 2);
  const bytes = [];
  for (let j = 0; j < hex.length; j += 2) bytes.push(parseInt(hex.slice(j, j + 2), 16));
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

// campaign(id) returns 12 values; poolId is dynamic (offset word at index 6).
export function decodeCampaign(result) {
  return {
    owner: decodeAddress(result, 0),
    pendingOwner: decodeAddress(result, 1),
    cancelDeadline: decodeUint(result, 2),
    finalizeDeadline: decodeUint(result, 3),
    claimWindow: decodeUint(result, 4),
    epochId: decodeUint(result, 5),
    poolId: decodeString(result, 6),
    root: decodeBytes32(result, 7),
    total: decodeUint(result, 8),
    funded: decodeUint(result, 9),
    claimed: decodeUint(result, 10),
    sweepAfter: decodeUint(result, 11)
  };
}

// CampaignCreated(uint256 indexed id, address indexed owner, uint256 epochId, string poolId).
export function parseCampaignCreated(log) {
  const topics = log.topics || [];
  if (!topics.length || topics[0].toLowerCase() !== TOPIC.CampaignCreated) return null;
  return {
    id: BigInt(topics[1]),
    owner: ('0x' + strip(topics[2]).slice(24)).toLowerCase(),
    epochId: decodeUint(log.data, 0),
    poolId: decodeString(log.data, 1)
  };
}
