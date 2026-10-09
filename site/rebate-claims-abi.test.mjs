import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFunctionData, encodeEventTopics, encodeAbiParameters, parseAbi, parseAbiParameters } from 'viem';
import {
  SEL,
  TOPIC,
  encClaimData,
  encCreateCampaignData,
  encSetMerkleRootData,
  encIdData,
  encTransferOwnershipData,
  encIsClaimedData,
  encCampaignData,
  decodeCampaign,
  decodeBool,
  decodeAddress,
  decodeUint,
  parseCampaignCreated
} from './rebate-claims-abi.mjs';

const abi = parseAbi([
  'function claim(uint256 id, uint256 index, address account, uint256 amount, bytes32[] merkleProof)',
  'function createCampaignAndFund(uint256 cancelDeadline, uint256 finalizeDeadline, uint256 claimWindow, uint256 epochId, string poolId, uint256 amount) returns (uint256)',
  'function setMerkleRoot(uint256 id, bytes32 root, uint256 total)',
  'function cancel(uint256 id)',
  'function sweep(uint256 id)',
  'function transferCampaignOwnership(uint256 id, address newOwner)',
  'function acceptOwnership(uint256 id)',
  'function campaign(uint256 id) view returns (address, address, uint256, uint256, uint256, uint256, string, bytes32, uint256, uint256, uint256, uint256)',
  'function isClaimed(uint256 id, uint256 index) view returns (bool)',
  'event CampaignCreated(uint256 indexed id, address indexed owner, uint256 epochId, string poolId)'
]);

const ACCOUNT = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OWNER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const ROOT = '0x' + 'ab'.repeat(32);
const PROOF = ['0x' + '01'.repeat(32), '0x' + '02'.repeat(32), '0x' + '03'.repeat(32)];

test('claim calldata matches viem byte for byte', () => {
  const mine = encClaimData({ id: 3n, index: 0n, account: ACCOUNT, amount: 2000000n, proof: PROOF });
  const theirs = encodeFunctionData({
    abi,
    functionName: 'claim',
    args: [3n, 0n, ACCOUNT, 2000000n, PROOF]
  });
  assert.equal(mine, theirs);
});

test('createCampaignAndFund calldata matches viem (dynamic string tail)', () => {
  const mine = encCreateCampaignData({
    cancelDeadline: 1792058061n,
    finalizeDeadline: 1792662861n,
    claimWindow: 1209600n,
    epochId: 27n,
    poolId: '52894',
    amount: 20000000n
  });
  const theirs = encodeFunctionData({
    abi,
    functionName: 'createCampaignAndFund',
    args: [1792058061n, 1792662861n, 1209600n, 27n, '52894', 20000000n]
  });
  assert.equal(mine, theirs);
});

test('setMerkleRoot, cancel, sweep, ownership, isClaimed, campaign selectors match viem', () => {
  assert.equal(encSetMerkleRootData(7n, ROOT, 123n), encodeFunctionData({ abi, functionName: 'setMerkleRoot', args: [7n, ROOT, 123n] }));
  assert.equal(encIdData(SEL.cancel, 7n), encodeFunctionData({ abi, functionName: 'cancel', args: [7n] }));
  assert.equal(encIdData(SEL.sweep, 7n), encodeFunctionData({ abi, functionName: 'sweep', args: [7n] }));
  assert.equal(encTransferOwnershipData(7n, OWNER), encodeFunctionData({ abi, functionName: 'transferCampaignOwnership', args: [7n, OWNER] }));
  assert.equal(encIdData(SEL.acceptOwnership, 7n), encodeFunctionData({ abi, functionName: 'acceptOwnership', args: [7n] }));
  assert.equal(encIsClaimedData(7n, 2n), encodeFunctionData({ abi, functionName: 'isClaimed', args: [7n, 2n] }));
  assert.equal(encCampaignData(7n), encodeFunctionData({ abi, functionName: 'campaign', args: [7n] }));
});

test('decodeCampaign round-trips a hand-built campaign struct (dynamic poolId)', () => {
  const word = (v) => BigInt(v).toString(16).padStart(64, '0');
  const pool = '52894';
  let poolHex = '';
  for (const ch of pool) poolHex += ch.charCodeAt(0).toString(16).padStart(2, '0');
  const stringTail = word(pool.length) + poolHex.padEnd(64, '0');
  const head = [
    OWNER.replace(/^0x/, '').toLowerCase().padStart(64, '0'),
    '0'.repeat(64),
    word(1792058061n),
    word(1792662861n),
    word(1209600n),
    word(27n),
    word(12 * 32),
    ROOT.replace(/^0x/, ''),
    word(9999986n),
    word(20000000n),
    word(2000000n),
    word(1792662861n)
  ].join('');
  const decoded = decodeCampaign('0x' + head + stringTail);
  assert.equal(decoded.owner.toLowerCase(), OWNER.toLowerCase());
  assert.equal(decoded.pendingOwner, '0x0000000000000000000000000000000000000000');
  assert.equal(decoded.cancelDeadline, 1792058061n);
  assert.equal(decoded.finalizeDeadline, 1792662861n);
  assert.equal(decoded.claimWindow, 1209600n);
  assert.equal(decoded.epochId, 27n);
  assert.equal(decoded.poolId, '52894');
  assert.equal(decoded.root, ROOT);
  assert.equal(decoded.total, 9999986n);
  assert.equal(decoded.funded, 20000000n);
  assert.equal(decoded.claimed, 2000000n);
  assert.equal(decoded.sweepAfter, 1792662861n);
});

test('scalar decoders and the CampaignCreated event parse', () => {
  assert.equal(decodeUint('0x' + '0'.repeat(63) + '5'), 5n);
  assert.equal(decodeBool('0x' + '0'.repeat(63) + '1'), true);
  assert.equal(decodeBool('0x' + '0'.repeat(64)), false);
  assert.equal(decodeAddress('0x' + '0'.repeat(24) + 'aa'.repeat(20)), '0x' + 'aa'.repeat(20));

  const topics = encodeEventTopics({ abi, eventName: 'CampaignCreated', args: { id: 12n, owner: OWNER } });
  const data = encodeAbiParameters(parseAbiParameters('uint256 epochId, string poolId'), [27n, '52894']);
  assert.equal(topics[0], TOPIC.CampaignCreated);
  const parsed = parseCampaignCreated({ topics, data });
  assert.equal(parsed.id, 12n);
  assert.equal(parsed.owner.toLowerCase(), OWNER.toLowerCase());
  assert.equal(parsed.epochId, 27n);
  assert.equal(parsed.poolId, '52894');
  assert.equal(parseCampaignCreated({ topics: ['0x' + 'ff'.repeat(32)], data: '0x' }), null);
});
