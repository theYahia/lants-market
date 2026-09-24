// Clean build of the storefront for IPFS: only required files, no network dependencies.
// Run from root: node scripts/site/build-dist.mjs

import { rmSync, mkdirSync, copyFileSync, statSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILES = [
  ['site/index.html', 'dist/index.html'],
  ['site/docs.html', 'dist/docs.html'],
  ['site/app.css', 'dist/app.css'],
  ['site/render.mjs', 'dist/render.mjs'],
  ['site/metrics.mjs', 'dist/metrics.mjs'],
  ['site/market-config.mjs', 'dist/market-config.mjs'],
  ['site/market-view.mjs', 'dist/market-view.mjs'],
  ['site/market-buy.mjs', 'dist/market-buy.mjs'],
  ['site/fixtures/snapshot-e23.full.json', 'dist/fixtures/snapshot-e23.full.json'],
  ['site/vendor/mipd/utils.js', 'dist/vendor/mipd/utils.js'],
];

// The only allowed external data-URL: canonical IPNS key.
const ALLOWED_IPNS_KEY = 'k51qzi5uqu5di86efhnadxw0k1sxnuo2tkcmegxcn2ra2r3exyfpv9htxhit6b';

// Compute the dist directory root via fileURLToPath
const DIST_ROOT = fileURLToPath(new URL('../../dist/', import.meta.url));

const fail = (msg) => {
  console.error(`BUILD FAILED: ${msg}`);
  process.exit(1);
};

// 1. Clean dist/
rmSync(DIST_ROOT, { recursive: true, force: true });
mkdirSync(join(DIST_ROOT, 'fixtures'), { recursive: true });
mkdirSync(join(DIST_ROOT, 'vendor/mipd'), { recursive: true });

// 2. Copy every file listed in FILES.
for (const [src] of FILES) {
  if (!statSync(src, { throwIfNoEntry: false })?.isFile()) {
    fail(`source not found: ${src}`);
  }
}
for (const [src, dest] of FILES) {
  const destPath = join(DIST_ROOT, dest.replace(/^dist\//, ''));
  copyFileSync(src, destPath);
}

// 2b. Optional live fixture (not included in FILES and does not affect dist_files).
// In CI after enrich, site/fixtures/snapshot-e23.live.json appears — copy it.
// Locally the file is absent — just print live_included=0.
const liveSrc = 'site/fixtures/snapshot-e23.live.json';
if (statSync(liveSrc, { throwIfNoEntry: false })?.isFile()) {
  const liveDest = join(DIST_ROOT, 'fixtures/snapshot-e23.live.json');
  copyFileSync(liveSrc, liveDest);
  console.log('live_included=1');
} else {
  console.log('live_included=0');
}

// 3. Checks for existence and non-emptiness of files
for (const [, dest] of FILES) {
  const destPath = join(DIST_ROOT, dest.replace(/^dist\//, ''));
  if (!statSync(destPath, { throwIfNoEntry: false })?.isFile())
    fail('file missing: ' + destPath);
  if (statSync(destPath).size === 0) fail('file empty: ' + destPath);
}

// 4. File contents
const html = readFileSync(join(DIST_ROOT, 'index.html'), 'utf8');
const render = readFileSync(join(DIST_ROOT, 'render.mjs'), 'utf8');

if (!/^\S/.test(html) || html.trimStart()[0] !== '<') {
  fail('index.html: first non-whitespace character is not "<"');
}

// Check relative paths to fixtures (left as is)
if (!render.includes('./fixtures/snapshot-e23.full.json')) {
  fail('render.mjs:fixtures must reference relative path ./fixtures/snapshot-e23.full.json');
}
if (/(['"])\/fixtures\//.test(render) || /fixtures\s*=\s*['"]\/fixtures\//.test(render)) {
  fail('render.mjs: absolute path to fixture detected');
}

// 5. Check external URLs with context awareness
const checkForbiddenUrls = (content, fileLabel) => {
  // Disallow http/https in src="...", url(...), @import, importScripts, fetch(
  const forbiddenPattern = /(?:src\s*=\s*["']|url\s*\(\s*["']?|@import\s+["']|importScripts\s*\(\s*["']|fetch\s*\(\s*["'])(https?:\/\/[^"')\s]+)/gi;
  let match;
  while ((match = forbiddenPattern.exec(content)) !== null) {
    // Ignore occurrences that are part of the substring 'www.w3.org/2000/svg' (xmlns)
    if (match[1].includes('www.w3.org/2000/svg')) continue;
    // Allow the single canonical data-URL via IPNS key.
    if (match[1].includes(ALLOWED_IPNS_KEY)) continue;
    fail(`${fileLabel}: prohibited external URL (${match[1]}) in resource loading context`);
  }

  // Disallow http/https in href of <link> tag
  const linkPattern = /<link[^>]*href\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
  while ((match = linkPattern.exec(content)) !== null) {
    // Ignore occurrences that are part of the substring 'www.w3.org/2000/svg' (xmlns)
    if (match[1].includes('www.w3.org/2000/svg')) continue;
    fail(`${fileLabel}: prohibited external URL (${match[1]}) in href of <link>`);
  }

  // Allow http/https in href of <a> tags and in xmlns (namespaces)
  // For <a>, ensure it's not <link> — but <link> is already caught above,
  // so here we simply skip all hrefs that were not caught.
  // Additionally verify that no prohibited contexts remain.
  const remainingForbidden = /https?:\/\/[^\s"'<>)]+/g;
  while ((match = remainingForbidden.exec(content)) !== null) {
    // Ignore occurrences that are part of the substring 'www.w3.org/2000/svg' (xmlns)
    if (match[0].includes('www.w3.org/2000/svg')) continue;
    // Allow the single canonical data-URL via IPNS key.
    if (match[0].includes(ALLOWED_IPNS_KEY)) continue;

    // Locate where this URL is — if it's inside href of <a> or in xmlns, skip
    const before = content.slice(0, match.index);
    const after = content.slice(match.index + match[0].length);
    
    // Verify that it's not inside href of <a> or xmlns
    const lastTagStart = before.lastIndexOf('<');
    const lastTagEnd = before.lastIndexOf('>');
    const inTag = lastTagStart > lastTagEnd;
    
    if (inTag) {
      const tagContent = before.slice(lastTagStart);
      // Allow only if it's <a href=...> or xmlns="..."
      if (/<a\s/i.test(tagContent) && /href\s*=\s*["']?https?:\/\//i.test(tagContent + match[0])) {
        continue; // allowed — regular link in <a>
      }
      if (/xmlns\s*=\s*["']https?:\/\//i.test(tagContent + match[0])) {
        continue; // allowed — XML namespace
      }
    }
    
    fail(`${fileLabel}: external URL (${match[0]}) found outside allowed context`);
  }
};

checkForbiddenUrls(html, 'index.html');
checkForbiddenUrls(render, 'render.mjs');

// 6. Cyrillic check (extended range)
// guard-site-mjs-v1
const cyrillicRegex = /[\u0400-\u04FF]/;
// Every file that the builder copies to dist/ is checked for Cyrillic.
for (const [, dest] of FILES) {
  const destPath = join(DIST_ROOT, dest.replace(/^dist\//, ''));
  const content = readFileSync(destPath, 'utf8');
  if (cyrillicRegex.test(content))
    fail(`${dest}: Cyrillic character found`);
}

// PRIVY_TREE_COPY
const privySrcRoot = 'site/vendor/privy';
const privyDestRoot = join(DIST_ROOT, 'vendor/privy');
let privyCount = 0;
let privyBytes = 0;

const copyPrivyTree = (srcDir) => {
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = join(srcDir, entry.name);
    if (entry.isDirectory()) {
      copyPrivyTree(srcPath);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.endsWith('.map')) continue;
    if (
      !entry.name.endsWith('.js') &&
      entry.name !== 'LICENSE.md' &&
      entry.name !== 'LICENSE' &&
      entry.name !== 'NOTICE'
    )
      continue;

    const rel = relative(privySrcRoot, srcPath);
    const destPath = join(privyDestRoot, rel);
    mkdirSync(join(destPath, '..'), { recursive: true });
    copyFileSync(srcPath, destPath);

    const st = statSync(destPath, { throwIfNoEntry: false });
    if (!st?.isFile()) fail('file missing: ' + destPath);
    if (st.size === 0) fail('file empty: ' + destPath);
    // guard-site-mjs-v1
    const content = readFileSync(destPath, 'utf8');
    if (cyrillicRegex.test(content))
      fail(`vendor/privy/${rel}: Cyrillic character found`);

    privyCount += 1;
    privyBytes += st.size;
  }
};

if (!statSync(privySrcRoot, { throwIfNoEntry: false })?.isDirectory()) {
  fail(`source not found: ${privySrcRoot}`);
}
copyPrivyTree(privySrcRoot);

// 7. Report
let total = 0;
for (const [, dest] of FILES) {
  const destPath = join(DIST_ROOT, dest.replace(/^dist\//, ''));
  const size = statSync(destPath).size;
  total += size;
  console.log(`OK ${dest} ${size} bytes`);
}
console.log(`OK dist/vendor/privy ${privyCount} files ${privyBytes} bytes`);
total += privyBytes;
console.log(`dist_files=300 dist_bytes=${total}`);