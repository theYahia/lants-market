// Claim a rebate for a node/agent key, from the published tree. Node only.
// Reads the versioned tree and rebate-claims.json, checks the pinned contract
// (address + runtimeCodeHash), the campaign root against the tree, and simulates
// the claim before sending. One of --dry / --send is required.
//
// Usage:
//   node scripts/site/rebate-claim-cli.mjs --tree rebates/27-52894.tree.json \
//     --campaign rebates/27-52894.campaign.json | --id N \
//     --account 0xBuyer [--claims site/rebate-claims.json] --dry | --send
// PRIVATE_KEY (env) is required for --send and never committed.

import { createPublicClient, createWalletClient, http, keccak256, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { leafFor } from '../../site/rebate-tree.mjs';

const VERSION = 'RebateClaims v1';
const abi = parseAbi([
  'function claim(uint256 id, uint256 index, address account, uint256 amount, bytes32[] merkleProof)',
  'function campaign(uint256 id) view returns (address, address, uint256, uint256, uint256, uint256, string, bytes32, uint256, uint256, uint256, uint256)'
]);

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tree') o.tree = argv[++i];
    else if (a === '--campaign') o.campaign = argv[++i];
    else if (a === '--id') o.id = argv[++i];
    else if (a === '--account') o.account = argv[++i];
    else if (a === '--claims') o.claims = argv[++i];
    else if (a === '--rpc') o.rpc = argv[++i];
    else if (a === '--dry') o.dry = true;
    else if (a === '--send') o.send = true;
    else throw new Error('unknown argument ' + a);
  }
  if (!o.tree || !o.account || o.dry === !!o.send) {
    throw new Error('need --tree, --account and exactly one of --dry / --send');
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
  const tree = JSON.parse(fs.readFileSync(path.resolve(o.tree), 'utf-8'));
  const claimsPath = path.resolve(o.claims || path.join(repoRoot, 'site/rebate-claims.json'));
  if (!fs.existsSync(claimsPath)) throw new Error('rebate-claims.json not found: ' + claimsPath);
  const claims = JSON.parse(fs.readFileSync(claimsPath, 'utf-8'));
  if (claims.chainId !== 8453) throw new Error('rebate-claims.json: wrong chainId ' + claims.chainId);

  const client = createPublicClient({ chain: base, transport: http(o.rpc, { timeout: 30000 }) });
  const code = await client.getCode({ address: claims.address });
  if (!code || code === '0x') throw new Error('no code at the claims contract ' + claims.address);
  if (keccak256(code) !== claims.runtimeCodeHash) {
    throw new Error(`${VERSION}: runtime code hash mismatch at ${claims.address} (refusing to sign)`);
  }

  let campaignId;
  if (o.id !== undefined) campaignId = BigInt(o.id);
  else if (o.campaign) {
    const c = JSON.parse(fs.readFileSync(path.resolve(o.campaign), 'utf-8'));
    campaignId = BigInt(c.campaignId);
  } else {
    throw new Error('pass --campaign file or --id N');
  }

  const c = await client.readContract({
    address: claims.address,
    abi,
    functionName: 'campaign',
    args: [campaignId]
  });
  const root = c[7];
  const funded = c[9];
  const sweepAfter = c[11];
  if (root === '0x' + '00'.repeat(32)) throw new Error('campaign is not finalized yet');
  if (root.toLowerCase() !== String(tree.root).toLowerCase()) {
    throw new Error(`root mismatch: campaign ${root} vs tree ${tree.root} (refusing to sign)`);
  }
  if (BigInt(tree.total) > funded) throw new Error('tree total is above the funded amount');

  const leaf = leafFor(tree, o.account);
  if (!leaf) {
    console.log(JSON.stringify({ account: o.account, claimable: false, reason: 'no leaf in this tree' }));
    return;
  }
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (now > sweepAfter) {
    console.log(JSON.stringify({ account: o.account, claimable: false, reason: 'claim window finished' }));
    return;
  }

  let wallet = null;
  if (o.send) {
    const key = process.env.PRIVATE_KEY;
    if (!key) throw new Error('PRIVATE_KEY is not set (never commit it)');
    const keyAccount = privateKeyToAccount(key.startsWith('0x') ? key : '0x' + key);
    wallet = createWalletClient({ account: keyAccount, chain: base, transport: http(o.rpc, { timeout: 30000 }) });
  }
  // claim is permissionless; in dry mode any caller is fine.
  const caller = wallet ? wallet.account.address : leaf.account;

  const { request } = await client.simulateContract({
    address: claims.address,
    abi,
    functionName: 'claim',
    args: [campaignId, BigInt(leaf.index), leaf.account, BigInt(leaf.amount), leaf.proof],
    account: caller
  });
  const plan = {
    account: o.account,
    campaignId: String(campaignId),
    index: leaf.index,
    amountMicro: leaf.amount,
    claimWindowEnds: String(sweepAfter)
  };
  if (o.dry) {
    console.log(JSON.stringify({ ...plan, dry: true, caller, simulation: 'ok' }, null, 2));
    return;
  }

  const hash = await wallet.writeContract(request);
  console.log(JSON.stringify({ ...plan, caller, tx: hash }, null, 2));
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120000 });
  console.log(JSON.stringify({ tx: hash, status: receipt.status }));
}

const isEntry = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isEntry) {
  main().catch((e) => {
    console.error('rebate-claim failed: ' + (e && e.message || e));
    process.exit(1);
  });
}
