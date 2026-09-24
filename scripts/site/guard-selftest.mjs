// scripts/site/guard-selftest.mjs — mutation self‑test guard
import { cpSync, rmSync, mkdtempSync, existsSync, appendFileSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const BUILDER = 'scripts/site/build-dist.mjs';

function fail(what) { console.log(`selftest=FAIL:${what}`); process.exit(1); }

const SRC_CANDIDATES = ['site', 'src/site', 'public', 'www', 'src', 'scripts/site', '.'];
const SRC = SRC_CANDIDATES.find(
  (c) => existsSync(join(ROOT, c, 'index.html')) && existsSync(join(ROOT, c, 'render.mjs'))
);
if (!SRC) fail('src-not-found');

const SKIP = new Set(['node_modules', '.git', 'dist']);
function freshTree() {
  const t = mkdtempSync(join(tmpdir(), 'guard-selftest-'));
  cpSync(ROOT, t, {
    recursive: true,
    filter: (s) => {
      if (s === ROOT) return true;
      const top = s.slice(ROOT.length + 1).split(/[\\/]/)[0];
      return !SKIP.has(top);
    },
  });
  // Sanitizing copy from external URLs and Cyrillic
  const idx = existsSync(join(t, 'site', 'index.html'))
    ? join(t, 'site', 'index.html')
    : join(t, 'index.html');
  let html = readFileSync(idx, 'utf8');
  html = html
    .replace(/https?:\/\/[^\s"'<>)]+/g, '#')
    .replace(/[\u0400-\u04FF]/g, 'x');
  writeFileSync(idx, html);
  return t;
}

function runBuild(tree) {
  const r = spawnSync(process.execPath, [BUILDER], { cwd: tree, encoding: 'utf8' });
  return r.status;
}

const MUTATIONS = [
  ['cyrillic-index',  (t) => appendFileSync(join(t, SRC, 'index.html'), '\n<!-- \u041f\u0440\u0438\u0432\u0435\u0442 -->\n')],
  ['cyrillic-render', (t) => appendFileSync(join(t, SRC, 'render.mjs'), '\n// \u041f\u0440\u0438\u0432\u0435\u0442\n')],
  ['external-link',   (t) => appendFileSync(join(t, SRC, 'index.html'), '\n<img src="http://evil.example/x.png">\n')],
  ['missing-file',    (t) => rmSync(join(t, SRC, 'render.mjs'))],
  ['empty-file',      (t) => writeFileSync(join(t, SRC, 'index.html'), '')],
];

{
  const t = freshTree();
  try { if (runBuild(t) !== 0) fail('clean-build'); }
  finally { rmSync(t, { recursive: true, force: true }); }
}

for (const [name, mutate] of MUTATIONS) {
  const t = freshTree();
  try {
    mutate(t);
    if (runBuild(t) === 0) fail(name);
  } finally {
    rmSync(t, { recursive: true, force: true });
  }
}

console.log('selftest=OK');
process.exit(0);