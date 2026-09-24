#!/usr/bin/env node
// scripts/deploy/publish.mjs
//
// Publish flow:
//   1. VERIFY dist/fixtures/snapshot-e23.live.json exists. If missing, refuse
//      to publish: exit non-zero, do NOT PUT the CAR, do NOT PUT IPNS.
//   2. Pack dist into a CAR via the ipfs-car CLI (no directory wrapping — the
//      CAR root is the CONTENTS of dist, i.e. index.html sits at the root).
//   3. PUT the CAR to Filebase S3 (SigV4) with header x-amz-meta-import: car,
//      then verify the response x-amz-meta-cid matches the CLI root CID.
//   4. PUT the IPNS name "lants" with the root CID.

import { createHash, createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const DIST_DIR = 'dist';
const LIVE_SNAPSHOT = path.join(DIST_DIR, 'fixtures', 'snapshot-e23.live.json');

const S3_ENDPOINT = 'https://s3.filebase.com';
const S3_HOST = 's3.filebase.com';
const S3_BUCKET = 'lants-site';
const S3_REGION = 'us-east-1';
const S3_SERVICE = 's3';

const IPNS_NAME = 'lants';
const IPNS_ENDPOINT = 'https://api.filebase.io/v1/names/lants';

const DRY_RUN = process.argv.includes('--dry-run');

function fail(msg) {
  console.error(`[publish] FATAL: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Step 1: Verify the live snapshot exists BEFORE anything else.
// ---------------------------------------------------------------------------
async function verifyLiveSnapshot() {
  if (!existsSync(LIVE_SNAPSHOT)) {
    fail(
      `Refusing to publish: ${LIVE_SNAPSHOT} is missing. ` +
        `No CAR PUT and no IPNS PUT will be performed.`,
    );
  }
  const s = await stat(LIVE_SNAPSHOT);
  if (!s.isFile() || s.size === 0) {
    fail(`Refusing to publish: ${LIVE_SNAPSHOT} is empty or not a file.`);
  }
  console.log(`[publish] verified live snapshot present: ${LIVE_SNAPSHOT}`);
}

// ---------------------------------------------------------------------------
// Step 2: Pack dist into a CAR via the ipfs-car CLI.
//   Command: npx -y ipfs-car pack dist --output <car>
//   No wrapping — CAR root == contents of dist (index.html at root).
//   The root CID is the last non-empty line of stdout (bafy…).
// ---------------------------------------------------------------------------
function runIpfsCarPack(outPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'npx',
      ['-y', 'ipfs-car', 'pack', DIST_DIR, '--output', outPath],
      { shell: process.platform === 'win32' },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(`ipfs-car pack exited with code ${code}: ${stderr.trim()}`),
        );
        return;
      }
      resolve(stdout);
    });
  });
}

async function packCar() {
  const outPath = 'dist.car';
  const stdout = await runIpfsCarPack(outPath);

  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const rootCid = lines[lines.length - 1];

  if (!rootCid || !rootCid.startsWith('baf')) {
    fail(`could not parse root CID from ipfs-car output: ${JSON.stringify(stdout)}`);
  }

  console.log(`[publish] packed CAR ${outPath} rootCID=${rootCid}`);
  return { carPath: outPath, cid: rootCid };
}

// ---------------------------------------------------------------------------
// SigV4 signing for the S3 PUT.
// ---------------------------------------------------------------------------
function hmac(key, data) {
  return createHmac('sha256', key).update(data).digest();
}

function sha256hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

function amzDates() {
  const now = new Date();
  const amzDate = now
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, '')
    .replace(/(\d{8})T(\d{6})Z/, '$1T$2Z');
  const dateStamp = amzDate.slice(0, 8);
  return { amzDate, dateStamp };
}

function signingKey(secret, dateStamp, region, service) {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

async function putCar({ carPath, cid }) {
  const key = process.env.FILEBASE_KEY;
  const secret = process.env.FILEBASE_SECRET;
  if (!key || !secret) fail('FILEBASE_KEY / FILEBASE_SECRET not set');

  const body = await readFile(carPath);
  const objectName = `${cid}.car`;
  const canonicalUri = `/${S3_BUCKET}/${objectName}`;
  const url = `${S3_ENDPOINT}${canonicalUri}`;

  const { amzDate, dateStamp } = amzDates();
  const payloadHash = sha256hex(body);

  // Headers that participate in the signature (sorted by lowercase name).
  const importHeader = 'car'; // x-amz-meta-import: car
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date;x-amz-meta-import';
  const canonicalHeaders =
    `host:${S3_HOST}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-meta-import:${importHeader}\n`;

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${S3_REGION}/${S3_SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256hex(canonicalRequest),
  ].join('\n');

  const sig = createHmac(
    'sha256',
    signingKey(secret, dateStamp, S3_REGION, S3_SERVICE),
  )
    .update(stringToSign)
    .digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${key}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${sig}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Host: S3_HOST,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      'x-amz-meta-import': importHeader,
      Authorization: authorization,
      'Content-Type': 'application/vnd.ipld.car',
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    fail(`CAR PUT failed: HTTP ${res.status} ${text}`);
  }

  const respCid = res.headers.get('x-amz-meta-cid');
  if (!respCid) {
    fail(`CAR PUT response missing x-amz-meta-cid header`);
  }
  if (respCid !== cid) {
    fail(
      `CID mismatch: CLI root=${cid} but S3 x-amz-meta-cid=${respCid}`,
    );
  }

  console.log(
    `[publish] CAR PUT ok: ${url} (HTTP ${res.status}), x-amz-meta-cid=${respCid}`,
  );
}

// ---------------------------------------------------------------------------
// Step 4: Update IPNS name "lants".
// ---------------------------------------------------------------------------
async function putIpns(cid) {
  const key = process.env.FILEBASE_KEY;
  const secret = process.env.FILEBASE_SECRET;
  if (!key || !secret) fail('FILEBASE_KEY / FILEBASE_SECRET not set');

  const bearer = Buffer.from(`${key}:${secret}`).toString('base64');

  const res = await fetch(IPNS_ENDPOINT, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cid }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    fail(`IPNS PUT (names/lants) failed: HTTP ${res.status} ${text}`);
  }
  console.log(`[publish] IPNS names/lants updated to ${cid} (HTTP ${res.status})`);
}

// ---------------------------------------------------------------------------
async function main() {
  await verifyLiveSnapshot(); // gate: refuse if snapshot-e23.live.json missing
  const { carPath, cid } = await packCar();

  if (DRY_RUN) {
    console.log(`packed cid=${cid}`);
    process.exit(0);
  }

  await putCar({ carPath, cid });
  await putIpns(cid);
  console.log(`[publish] done. root CID = ${cid}`);
}

main().catch((err) => {
  console.error('[publish] error:', err);
  process.exit(1);
});