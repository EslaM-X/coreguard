// CoreGuard brand PNG exporter — renders official SVGs to fixed sizes.
// Usage: node scripts/brand-export.mjs
// Cf: assets/coreguard-mark.svg (single source of truth for the mark).
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const targets = [
  { src: 'assets/coreguard-mark.svg',    sizes: [512, 256, 128, 64, 32], out: 'assets/icons/coreguard-mark' },
  { src: 'assets/coreguard-mark.svg',    sizes: [512],                   out: 'assets/icons/coreguard-mono', mono: true },
  { src: 'assets/coreguard-appicon.svg', sizes: [512, 256, 128],         out: 'assets/icons/coreguard-appicon' },
  { src: 'og-cover.svg',                 sizes: [1200],                  out: 'assets/og-cover' },
];

mkdirSync(join(ROOT, 'assets/icons'), { recursive: true });

let count = 0;
for (const t of targets) {
  let svg = readFileSync(join(ROOT, t.src), 'utf8');
  if (t.mono) svg = svg.replaceAll('#FF8A00', '#0B0F14').replaceAll('#FFC53D', '#0B0F14')
                       .replaceAll('#F4610A', '#0B0F14').replaceAll('#FFD867', '#0B0F14')
                       .replaceAll('url(#cgSteel)', '#0B0F14').replaceAll('url(#cgOrange)', '#0B0F14');
  for (const size of t.sizes) {
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: size },
      font: { loadSystemFonts: true },
    });
    const png = resvg.render().asPng();
    const file = `${t.out}-${size}.png`;
    writeFileSync(join(ROOT, file), png);
    count++;
    console.log('rendered', file);
  }
}
console.log(`done — ${count} PNGs written to assets/icons/`);
