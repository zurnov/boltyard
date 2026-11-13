// Z-fighting detector: freeze a map, render each viewpoint twice with a 1 cm camera nudge and
// save both frames; pixels that flip between them are coplanar / overlapping faces.
// Usage: node tools/zfight.mjs [--near=0.1] [--maps=foundry2,...]  → capture/zf/<map>-<view>-{a,b}.png
import { chromium } from '/Users/dimitur/dev/guns-and-robots-rebith/node_modules/playwright-core/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const GAME = '/Users/dimitur/dev/boltyard-capture-src';
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const near = Number(args.near ?? 0.1);
const B = { foundry2: [100, 72], gulch2: [102, 70], drydock2: [104, 72], frostworks2: [98, 74], wrenfield2: [100, 72] };
const maps = (args.maps ?? Object.keys(B).join(',')).split(',');
process.chdir(GAME);
const { createServer } = await import(GAME + '/node_modules/vite/dist/node/index.js');
const server = await createServer({ root: GAME, server: { port: 0, hmr: false, watch: null }, logLevel: 'warn' });
await server.listen();
const base = server.resolvedUrls.local[0];
mkdirSync('/Users/dimitur/dev/boltyard-site/capture/zf', { recursive: true });
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu'] });
for (const map of maps) {
  const [X, Z] = B[map];
  const views = {
    crane0: [[-X * 0.95, 66, -Z * 1.1], [-6, 0, 0]],
    crane1: [[X * 0.35, 56, -Z * 1.08], [8, 0, 6]],
    dive0: [[-X * 0.62, 62, -Z * 0.95], [0, 0, 0]],
    dive1: [[-X * 0.3, 18, -Z * 0.35], [X * 0.1, 2, 0]],
    ne: [[X * 0.95, 70, Z * 1.1], [0, 0, 0]],
    street: [[-X * 0.15, 3, -Z * 0.1], [X * 0.2, 1.5, Z * 0.1]],
  };
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await p.goto(`${base}?quick=1&map=${map}&mode=tdm&teamSize=5&seed=3&quality=high&dynres=0`);
  await p.waitForFunction(() => window.__game?.world && window.__game.state === 'match', null, { timeout: 120000 });
  await p.waitForTimeout(2500);
  await p.evaluate((near) => {
    const g = window.__game.game;
    g.perf.shouldRender = () => false; clearInterval(g.watchdog);
    window.__t = performance.now(); g.last = window.__t; g.timeScale = 0;
    for (const el of document.querySelectorAll('.ui-layer')) el.style.visibility = 'hidden';
    const cam = g.renderer.camera; const orig = g.camera.update.bind(g.camera);
    g.camera.opacityOf = () => 1; g.camera.occluderFades = () => new Map(); g.camera.cutRoom = () => null; g.camera.cutFocus = () => null;
    g.camera.update = (...a) => { orig(...a); if (window.__cv) { cam.near = near; cam.fov = 50; cam.updateProjectionMatrix(); cam.position.set(...window.__cv[0]); cam.lookAt(...window.__cv[1]); } };
    window.__shot = (v) => { window.__cv = v; window.__t += 16; g.advance(window.__t); window.__t += 16; g.advance(window.__t); return g.renderer.renderer.domElement.toDataURL('image/png'); };
  }, near);
  for (const [name, [pos, look]] of Object.entries(views)) {
    const a = await p.evaluate((v) => window.__shot(v), [pos, look]);
    const bb = await p.evaluate((v) => window.__shot(v), [[pos[0] + 0.01, pos[1] + 0.01, pos[2] + 0.01], look]);
    for (const [t, d] of [['a', a], ['b', bb]]) writeFileSync(`/Users/dimitur/dev/boltyard-site/capture/zf/${map}-${name}-${t}.png`, Buffer.from(d.split(',')[1], 'base64'));
  }
  await p.close();
  console.log(map, 'done');
}
await b.close(); await server.close(); process.exit(0);
