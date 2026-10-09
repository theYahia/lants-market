// Deploy the shared RebateClaims contract, once per platform (operator only).
// Node only. Usage:
//   node site/rebate-deploy.mjs --dry                 (all checks, no key needed)
//   node site/rebate-deploy.mjs --send [--verify]     (needs PRIVATE_KEY in env)
// The deployer key is never stored in the repo. --send writes site/rebate-claims.json
// (address, chainId, deployTx, commit, verified, runtimeCodeHash, initCodeHash)
// without overwriting; the file is one of the FILES published in dist.

import { createPublicClient, createWalletClient, http, keccak256, parseAbi, encodeAbiParameters } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CHAIN_ID = 8453;
const ARTIFACT = 'contracts/out/RebateClaims.sol/RebateClaims.json';
const erc20Abi = parseAbi([
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)'
]);

// { initCodeHash, runtimeCodeHash, bytecode, abi } from the forge artifact.
export function artifactHashes(artifact) {
  const bytecode = artifact.bytecode?.object ?? artifact.bytecode;
  const deployed = artifact.deployedBytecode?.object ?? artifact.deployedBytecode;
  if (typeof bytecode !== 'string' || !bytecode.startsWith('0x') || bytecode.length <= 2) {
    throw new Error('rebate-deploy: artifact has no bytecode (run forge build)');
  }
  if (typeof deployed !== 'string' || !deployed.startsWith('0x') || deployed.length <= 2) {
    throw new Error('rebate-deploy: artifact has no deployedBytecode (run forge build)');
  }
  return {
    abi: artifact.abi,
    bytecode,
    initCodeHash: keccak256(bytecode),
    runtimeCodeHash: keccak256(deployed)
  };
}

// Automatic token checks: chainId, code, symbol, decimals (plan §6 deploy).
export async function usdcChecks(client) {
  const chainId = await client.getChainId();
  if (chainId !== CHAIN_ID) throw new Error(`rebate-deploy: wrong chain ${chainId}, want ${CHAIN_ID}`);
  const code = await client.getCode({ address: USDC });
  if (!code || code === '0x') throw new Error('rebate-deploy: USDC has no code at ' + USDC);
  const symbol = await client.readContract({ address: USDC, abi: erc20Abi, functionName: 'symbol' });
  if (symbol !== 'USDC') throw new Error(`rebate-deploy: USDC.symbol() is ${symbol}`);
  const decimals = await client.readContract({ address: USDC, abi: erc20Abi, functionName: 'decimals' });
  if (Number(decimals) !== 6) throw new Error(`rebate-deploy: USDC.decimals() is ${decimals}`);
  return { chainId, usdc: USDC, symbol, decimals: Number(decimals) };
}

function findForge() {
  const candidates = [process.env.FORGE, 'forge', path.join(os.homedir(), '.foundry/bin/forge')].filter(Boolean);
  for (const c of candidates) {
    try {
      execFileSync(c, ['--version'], { stdio: 'ignore' });
      return c;
    } catch {
      // next
    }
  }
  return null;
}

// `constructor(address)` ABI-encoded, the form foundry's --constructor-args wants.
// Passing the bare address (the old bug) made every verification fail.
export function constructorArgsHex(usdc) {
  return encodeAbiParameters([{ type: 'address' }], [usdc]);
}

function verifyOnExplorer(address, contractsDir) {
  const forge = findForge();
  if (!forge) return { verified: false, note: 'forge not found; verify manually' };
  const targets = [['blockscout', 'https://base.blockscout.com/api/']];
  if (process.env.ETHERSCAN_API_KEY) targets.push(['etherscan', 'https://api.basescan.org/api']);
  const args = constructorArgsHex(USDC);
  const notes = [];
  let anyVerified = false;
  for (const [verifier, url] of targets) {
    try {
      const out = execFileSync(
        forge,
        [
          'verify-contract',
          address,
          'src/RebateClaims.sol:RebateClaims',
          '--verifier',
          verifier,
          '--verifier-url',
          url,
          '--constructor-args',
          args
        ],
        { cwd: contractsDir, encoding: 'utf-8', timeout: 180000 }
      );
      anyVerified = true;
      notes.push(`${verifier}: ${out.trim().split('\n').slice(-1)[0] || 'ok'}`);
    } catch (e) {
      notes.push(`${verifier}: ${String((e && e.stderr) || e.message || e).slice(-160)}`);
    }
  }
  return { verified: anyVerified, note: notes.join(' | ') };
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const send = args.includes('--send');
  const verify = args.includes('--verify');
  let outFile = 'site/rebate-claims.json';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') outFile = args[++i];
  }
  if (dry === send) {
    console.error('usage: node site/rebate-deploy.mjs --dry | --send [--verify] [--out file]');
    process.exit(2);
  }

  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  const artifactPath = path.join(repoRoot, ARTIFACT);
  if (!fs.existsSync(artifactPath)) {
    console.error(`rebate-deploy: artifact not found: ${ARTIFACT} (run forge build in contracts/)`);
    process.exit(1);
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
  const { abi, bytecode, initCodeHash, runtimeCodeHash } = artifactHashes(artifact);

  const client = createPublicClient({ chain: base, transport: http(undefined, { timeout: 30000 }) });
  let checks;
  try {
    checks = await usdcChecks(client);
  } catch (e) {
    console.error('rebate-deploy: ' + (e && e.message || e));
    process.exit(1);
  }

  if (dry) {
    console.log(
      JSON.stringify(
        {
          dry: true,
          artifact: ARTIFACT,
          bytecodeBytes: (bytecode.length - 2) / 2,
          initCodeHash,
          runtimeCodeHash,
          ...checks
        },
        null,
        2
      )
    );
    return;
  }

  const key = process.env.PRIVATE_KEY;
  if (!key) {
    console.error('rebate-deploy: PRIVATE_KEY is not set (never commit it)');
    process.exit(1);
  }
  const account = privateKeyToAccount(key.startsWith('0x') ? key : '0x' + key);
  const wallet = createWalletClient({ account, chain: base, transport: http(undefined, { timeout: 30000 }) });

  console.error(`rebate-deploy: deploying from ${account.address} ...`);
  const txHash = await wallet.deployContract({ abi, bytecode, args: [USDC] });
  const receipt = await client.waitForTransactionReceipt({ hash: txHash, timeout: 120000 });
  if (receipt.status !== 'success' || !receipt.contractAddress) {
    console.error('rebate-deploy: deployment failed: ' + txHash);
    process.exit(1);
  }
  const address = receipt.contractAddress;
  const code = await client.getCode({ address });
  const onchainHash = keccak256(code);
  if (onchainHash !== runtimeCodeHash) {
    console.error(`rebate-deploy: runtime code hash mismatch on chain (${onchainHash} != ${runtimeCodeHash})`);
    process.exit(1);
  }

  let verifiedInfo = { verified: false, note: 'not requested' };
  if (verify) verifiedInfo = verifyOnExplorer(address, path.join(repoRoot, 'contracts'));

  let commit = '';
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf-8' }).trim();
  } catch {
    // not a git repo
  }

  const outPath = path.join(repoRoot, outFile);
  if (fs.existsSync(outPath)) {
    console.error('rebate-deploy: output file already exists: ' + outFile);
    process.exit(1);
  }
  const record = {
    address,
    chainId: CHAIN_ID,
    usdc: USDC,
    deployTx: txHash,
    deployBlock: String(receipt.blockNumber),
    commit,
    verified: verifiedInfo.verified,
    verifyNote: verifiedInfo.note,
    runtimeCodeHash: onchainHash,
    initCodeHash
  };
  fs.writeFileSync(outPath, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(record, null, 2));
}

const isEntry = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isEntry) {
  main().catch((e) => {
    console.error('rebate-deploy failed: ' + (e && e.message || e));
    process.exit(1);
  });
}
