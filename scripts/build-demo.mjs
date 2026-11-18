/**
 * build-demo.mjs — assemble dist-demo/, the static public demo.
 *
 *   npm run build:demo
 *
 * One step: the desk UI, built with VITE_MD_DEMO=1 (demo mode baked
 * in; src/app/demoMode) into dist-demo/ instead of the normal dist/.
 * The normal `npm run build` is not touched and does not set the flag.
 * A _redirects SPA fallback is written for Cloudflare Pages; the
 * Workers route gets the same behaviour from wrangler.jsonc.
 * See DEMO.md.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDemo = path.join(repoRoot, 'dist-demo');

execFileSync('npx', ['vite', 'build', '--outDir', distDemo, '--emptyOutDir'], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: { ...process.env, VITE_MD_DEMO: '1' },
});

fs.writeFileSync(path.join(distDemo, '_redirects'), '/* /index.html 200\n');

const kb = (p) => (fs.statSync(p).size / 1024).toFixed(0);
console.log(`\ndist-demo ready: index.html ${kb(path.join(distDemo, 'index.html'))} KB`);
