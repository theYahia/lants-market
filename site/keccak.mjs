// keccak-256 (the original Keccak, not FIPS SHA3-256) in pure JS, Node +
// browser. The single hash primitive the claim UI needs to re-check the pinned
// runtime code and verify the published merkle tree against the on-chain root.
// Cross-checked against viem in site/keccak.test.mjs.

const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
];

// rho rotation offsets, flat [x + 5y].
const ROT = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14
];

const MASK = (1n << 64n) - 1n;

function rotl(x, n) {
  const v = x & MASK;
  if (n === 0) return v;
  return ((v << BigInt(n)) | (v >> BigInt(64 - n))) & MASK;
}

function permute(A) {
  for (let round = 0; round < 24; round++) {
    const C = [];
    for (let x = 0; x < 5; x++) C[x] = A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20];
    for (let x = 0; x < 5; x++) {
      const D = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1);
      for (let y = 0; y < 5; y++) A[x + 5 * y] = (A[x + 5 * y] ^ D) & MASK;
    }
    const B = new Array(25);
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(A[x + 5 * y], ROT[x + 5 * y]);
      }
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        A[x + 5 * y] = (B[x + 5 * y] ^ (~B[((x + 1) % 5) + 5 * y] & MASK & B[((x + 2) % 5) + 5 * y])) & MASK;
      }
    }
    A[0] ^= RC[round];
  }
}

export function hexToBytes(hex) {
  const h = String(hex).replace(/^0x/, '');
  if (h.length % 2 !== 0) throw new Error('keccak: odd hex length');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes) {
  let out = '0x';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

// keccak256 over bytes (Uint8Array) or a 0x-hex string.
export function keccak256(input) {
  const bytes = typeof input === 'string' ? hexToBytes(input) : input;
  const rate = 136;
  const padded = new Uint8Array(Math.ceil((bytes.length + 1) / rate) * rate);
  padded.set(bytes);
  padded[bytes.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;

  const A = new Array(25).fill(0n);
  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let b = 7; b >= 0; b--) lane = (lane << 8n) | BigInt(padded[off + i * 8 + b]);
      A[i] ^= lane;
    }
    permute(A);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    let v = A[i];
    for (let b = 0; b < 8; b++) {
      out[i * 8 + b] = Number(v & 0xffn);
      v >>= 8n;
    }
  }
  return bytesToHex(out);
}

// Concatenation of byte sources (hex strings or Uint8Array) into one hash.
export function keccakConcat(parts) {
  let len = 0;
  const chunks = parts.map((p) => (typeof p === 'string' ? hexToBytes(p) : p));
  for (const c of chunks) len += c.length;
  const all = new Uint8Array(len);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.length;
  }
  return keccak256(all);
}
