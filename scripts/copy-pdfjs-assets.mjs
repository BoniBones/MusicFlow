// Copies PDF.js character maps and standard fonts into /public so that
// PDFs with non-embedded fonts render correctly — and offline (they are
// precached by the service worker).
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pdfjsRoot = resolve(root, 'node_modules', 'pdfjs-dist');

if (!existsSync(pdfjsRoot)) {
  console.log('[copy-pdfjs-assets] pdfjs-dist not installed yet, skipping.');
  process.exit(0);
}

for (const dir of ['cmaps', 'standard_fonts']) {
  const from = resolve(pdfjsRoot, dir);
  const to = resolve(root, 'public', 'pdfjs', dir);
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}
console.log('[copy-pdfjs-assets] Copied cmaps and standard_fonts to public/pdfjs');
