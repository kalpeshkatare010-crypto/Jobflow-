// Takes review screenshots of a running build. Usage:
//   node scripts/screenshot.mjs http://localhost:4173/ out-prefix [chromePath]
import { chromium } from 'playwright-core';

const [url = 'http://localhost:4173/', prefix = 'shot', exe = '/usr/bin/google-chrome'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
for (const [name, width, height] of [['desktop', 1440, 1500], ['phone', 390, 844]]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(`${name}: horizontal overflow ${overflow}px`);
  await page.screenshot({ path: `${prefix}-${name}.png`, fullPage: true });
  await page.close();
}
await browser.close();
