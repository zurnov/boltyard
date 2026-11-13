// Garage UI screenshots from the current game code (store, build) → capture/ui-*.png
import { chromium } from '/Users/dimitur/dev/guns-and-robots-rebith/node_modules/playwright-core/index.mjs';
const GAME = '/Users/dimitur/dev/boltyard-capture-src';
process.chdir(GAME);
const { createServer } = await import(GAME + '/node_modules/vite/dist/node/index.js');
const server = await createServer({ root: GAME, server: { port: 0, hmr: false, watch: null }, logLevel: 'warn' });
await server.listen();
const base = server.resolvedUrls.local[0];
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu'] });
for (const screen of ['store', 'build', 'workbench', 'upgrade', 'hub']) {
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto(`${base}?screen=${screen}&profile=rich&quality=high&dynres=0`);
  await p.waitForFunction(() => window.__game?.state === 'garage', null, { timeout: 120000 });
  await p.waitForTimeout(4000);
  await p.screenshot({ path: `/Users/dimitur/dev/boltyard-site/capture/ui-${screen}.png` });
  await p.close();
}
await b.close(); await server.close(); process.exit(0);
