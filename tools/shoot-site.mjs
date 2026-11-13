// Full-page screenshots of the site (desktop + phone) for review → capture/site-*.png
import { chromium } from '/Users/dimitur/dev/guns-and-robots-rebith/node_modules/playwright-core/index.mjs';
const url = process.argv[2] ?? 'http://localhost:8420/boltyard-site/';
const b = await chromium.launch({ channel: 'chrome' });
for (const [name, w, h, m] of [['desktop', 1440, 900, false], ['phone', 390, 844, true]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: m ? 2 : 1, isMobile: m, hasTouch: m });
  await p.goto(url, { waitUntil: 'networkidle' });
  for (let y = 0; y < 30000; y += 600) { await p.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), y); await p.waitForTimeout(60); }
  await p.evaluate(() => { document.querySelectorAll('.reveal').forEach((e) => e.classList.add('in')); window.scrollTo({ top: 0, behavior: 'instant' }); });
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(600);
  await p.screenshot({ path: `capture/site-${name}.png`, fullPage: true });
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(name, 'horizontal overflow px:', overflow);
  await p.close();
}
await b.close();
