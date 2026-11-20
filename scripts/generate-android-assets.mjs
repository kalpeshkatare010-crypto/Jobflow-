// Renders the Android launcher icons and splash screens from the JobFlow mark.
// Run after `npx cap add android` or when the logo changes:
//   node scripts/generate-android-assets.mjs [chromePath]
import { chromium } from 'playwright-core';
import { readdirSync, existsSync } from 'node:fs';

const exe = process.argv[2] ?? '/usr/bin/google-chrome';
const RES = 'android/app/src/main/res';
const NAVY = '#14213D';
const YELLOW = '#F2D24B';
const CANVAS = '#EEF0F3';

/** The three stepped bars, centred, `scale` = share of the shorter side. */
function bars(width, height, scale) {
  const s = (Math.min(width, height) * scale) / 18;
  const ox = (width - 18 * s) / 2;
  const oy = (height - 18 * s) / 2;
  const bar = (x, y, h, fill) =>
    `<rect x="${ox + x * s}" y="${oy + y * s}" width="${5 * s}" height="${h * s}" rx="${1.5 * s}" fill="${fill}"/>`;
  return bar(0, 11, 7, '#FFFFFF') + bar(6.5, 6, 12, '#FFFFFF') + bar(13, 0, 18, YELLOW);
}

const shapes = {
  legacy: (n) => `<rect width="${n}" height="${n}" rx="${n * 0.22}" fill="${NAVY}"/>${bars(n, n, 0.56)}`,
  round: (n) => `<circle cx="${n / 2}" cy="${n / 2}" r="${n / 2}" fill="${NAVY}"/>${bars(n, n, 0.5)}`,
  // Adaptive icon foreground: transparent, mark inside the 66/108 safe zone.
  foreground: (n) => bars(n, n, 0.36),
  splash: (w, h) => {
    const mark = Math.min(w, h) * 0.22;
    const x = (w - mark) / 2;
    const y = (h - mark) / 2;
    return `<rect width="${w}" height="${h}" fill="${CANVAS}"/>
      <g transform="translate(${x} ${y})"><rect width="${mark}" height="${mark}" rx="${mark * 0.28}" fill="${NAVY}"/>${bars(mark, mark, 0.56)}</g>`;
  },
};

const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const jobs = [];
for (const [density, size] of Object.entries(densities)) {
  jobs.push({ file: `${RES}/mipmap-${density}/ic_launcher.png`, w: size, h: size, body: shapes.legacy(size) });
  jobs.push({ file: `${RES}/mipmap-${density}/ic_launcher_round.png`, w: size, h: size, body: shapes.round(size) });
  const fg = Math.round(size * 2.25);
  jobs.push({ file: `${RES}/mipmap-${density}/ic_launcher_foreground.png`, w: fg, h: fg, body: shapes.foreground(fg) });
}
const splashSizes = {
  'drawable/splash.png': [480, 320],
  'drawable-land-mdpi/splash.png': [480, 320],
  'drawable-land-hdpi/splash.png': [800, 480],
  'drawable-land-xhdpi/splash.png': [1280, 720],
  'drawable-land-xxhdpi/splash.png': [1600, 960],
  'drawable-land-xxxhdpi/splash.png': [1920, 1280],
  'drawable-port-mdpi/splash.png': [320, 480],
  'drawable-port-hdpi/splash.png': [480, 800],
  'drawable-port-xhdpi/splash.png': [720, 1280],
  'drawable-port-xxhdpi/splash.png': [960, 1600],
  'drawable-port-xxxhdpi/splash.png': [1280, 1920],
};
for (const [file, [w, h]] of Object.entries(splashSizes)) {
  jobs.push({ file: `${RES}/${file}`, w, h, body: shapes.splash(w, h) });
}

if (!existsSync(RES) || readdirSync(RES).length === 0) throw new Error(`${RES} not found. Run npx cap add android first.`);

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
for (const job of jobs) {
  const page = await browser.newPage({ viewport: { width: job.w, height: job.h } });
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="${job.w}" height="${job.h}">${job.body}</svg></body></html>`,
  );
  await page.screenshot({ path: job.file, omitBackground: true });
  await page.close();
}
await browser.close();
console.log(`Wrote ${jobs.length} images under ${RES}`);
