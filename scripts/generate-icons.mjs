// Renders the JobFlow app icons (PNG) from the logo drawing.
// Run when the logo changes: node scripts/generate-icons.mjs [chromePath]
// Needs Google Chrome or Chromium installed; the PNGs are committed to git.
import { chromium } from 'playwright-core';

const exe = process.argv[2] ?? '/usr/bin/google-chrome';
const NAVY = '#14213D';
const YELLOW = '#F2D24B';

// scale: share of the canvas the bars occupy; rounded: corner radius share.
function svg(size, { scale, rounded }) {
  const r = rounded ? size * 0.28 : 0;
  const s = (size * scale) / 18; // the bar group is 18 units wide
  const ox = (size - 18 * s) / 2;
  const oy = (size - 18 * s) / 2;
  const bar = (x, y, h, fill) =>
    `<rect x="${ox + x * s}" y="${oy + y * s}" width="${5 * s}" height="${h * s}" rx="${1.5 * s}" fill="${fill}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${r}" fill="${NAVY}"/>
    ${bar(0, 11, 7, '#FFFFFF')}${bar(6.5, 6, 12, '#FFFFFF')}${bar(13, 0, 18, YELLOW)}
  </svg>`;
}

const icons = [
  { file: 'icon-192.png', size: 192, scale: 0.56, rounded: true },
  { file: 'icon-512.png', size: 512, scale: 0.56, rounded: true },
  // Maskable: full-bleed square; the mark stays inside the 80% safe zone.
  { file: 'icon-maskable-512.png', size: 512, scale: 0.42, rounded: false },
  { file: 'apple-touch-icon.png', size: 180, scale: 0.5, rounded: false },
];

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
for (const icon of icons) {
  const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(icon.size, icon)}</body></html>`);
  await page.screenshot({ path: `public/icons/${icon.file}`, omitBackground: true });
  await page.close();
  console.log(`public/icons/${icon.file}`);
}
await browser.close();
