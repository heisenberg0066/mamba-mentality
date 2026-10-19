// Copies the PWA into ./app so Electron bundles it for offline use.
// Source: $MM_APP_SRC, else the parent dir if it holds index.html (repo layout: <repo>/desktop),
// else ../app (local layout: /workspace/mamba-mentality/{app,windows}).
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const candidates = [process.env.MM_APP_SRC, path.resolve(root, '..'), path.resolve(root, '..', 'app')].filter(Boolean);
const from = candidates.find((d) => fs.existsSync(path.join(d, 'index.html')));
if (!from) throw new Error('PWA source not found');
const to = path.join(root, 'app');
const skip = new Set(['.git', '.github', 'screens', 'node_modules', 'desktop', 'windows', 'dist', 'tests', 'README.md', '.gitignore']);
fs.rmSync(to, { recursive: true, force: true });
(function copy(a, b) {
  fs.mkdirSync(b, { recursive: true });
  for (const n of fs.readdirSync(a)) {
    if (skip.has(n) || n.endsWith('.ics')) continue;
    const s = path.join(a, n), d = path.join(b, n);
    fs.statSync(s).isDirectory() ? copy(s, d) : fs.copyFileSync(s, d);
  }
})(from, to);
console.log('synced', from, '->', to);
