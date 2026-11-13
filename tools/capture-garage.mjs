// Garage capture: the robot assembles on the turntable with the game's own drop-in animation,
// then morphs through the bot preset builds (only changed parts drop). Also a clean garage
// portrait of every preset for the build wall.
// Usage: node tools/capture-garage.mjs [--only=assemble,wall]
import { chromium } from '/Users/dimitur/dev/guns-and-robots-rebith/node_modules/playwright-core/index.mjs';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME = '/Users/dimitur/dev/boltyard-capture-src';
const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const only = new Set((args.only ?? 'assemble,wall').split(','));
const featured = JSON.parse(readFileSync(join(SITE, 'tools/featured.json'), 'utf8'));
const presets = JSON.parse(readFileSync(join(SITE, 'tools/presets.json'), 'utf8'));
const P = Object.fromEntries(presets.map((p) => [p.id, p.loadout]));

process.chdir(GAME);
const { createServer } = await import(join(GAME, 'node_modules/vite/dist/node/index.js'));
const server = await createServer({ root: GAME, server: { port: 0, hmr: false, watch: null }, logLevel: 'warn' });
await server.listen();
const base = server.resolvedUrls.local[0];

function rig() {
  const g = window.__game.game;
  g.perf.shouldRender = () => false;
  clearInterval(g.watchdog);
  let t = performance.now();
  g.last = t;
  const hide = () => { for (const el of document.querySelectorAll('.ui-layer')) el.style.visibility = 'hidden'; };
  hide();
  let view = { yaw: 0.6, dist: 7.2, height: 2.2, look: 1.25, fov: 30, spin: 0.18 };
  let time = 0;
  const orig = g.stage.update.bind(g.stage);
  g.stage.update = (dt) => {
    orig(dt);
    time += dt;
    const cam = g.renderer.activeCamera;
    // swing: rock back and forth inside a clear arc instead of orbiting through the garage props
    const a = view.swing ? view.yaw + view.swing * Math.sin(time * view.spin) : view.yaw + time * view.spin;
    cam.filmOffset = 0;
    cam.fov = view.fov;
    cam.updateProjectionMatrix();
    cam.position.set(Math.sin(a) * view.dist, view.height, Math.cos(a) * view.dist);
    cam.lookAt(0, view.look, 0);
  };
  const turntable = () => { let f = null; g.renderer.activeScene.traverse((o) => { if (!f && o.parent && Math.abs(o.position.y - 0.16) < 1e-6 && o.children.length) f = o.parent; }); return f; };
  return {
    face(y = 0) { const t = turntable(); if (t) t.rotation.y = y; return !!t; },
    view(v) { view = { ...view, ...v }; },
    resetTime() { time = 0; },
    set(build, animate) { g.stage.setRobot(build, { animate }); },
    step(n, dt = 1 / 60) { for (let i = 0; i < n; i++) { t += dt * 1000; g.advance(t); } hide(); },
    shot(q = 0.93) { t += 1000 / 60; g.advance(t); return g.renderer.renderer.domElement.toDataURL('image/jpeg', q); },
  };
}

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(base + '?screen=hub&profile=rich&quality=high&dynres=0');
await page.waitForFunction(() => window.__game?.state === 'garage', null, { timeout: 120000 });
await page.waitForTimeout(2500);
await page.evaluate(`window.__g = (${rig.toString()})()`);
await page.evaluate(() => window.__g.step(30));

const save = (dir, i, data) => writeFileSync(join(dir, String(i).padStart(4, '0') + '.jpg'), Buffer.from(data.split(',')[1], 'base64'));

if (only.has('assemble')) {
  const dir = join(SITE, 'capture/frames/garage-assemble');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const o = P.octopus;
  const empty = { name: 'x', chassis: o.chassis, body: null, head: null, weapons: [], devices: [null, null] };
  const seq = [
    [null, 0.5],
    [empty, 0.75],
    [{ ...empty, body: o.body }, 0.6],
    [{ ...empty, body: o.body, head: o.head }, 0.55],
    [{ ...empty, body: o.body, head: o.head, weapons: [o.weapons[0]] }, 0.4],
    [{ ...empty, body: o.body, head: o.head, weapons: [o.weapons[0], o.weapons[1]] }, 0.4],
    [{ ...empty, body: o.body, head: o.head, weapons: [o.weapons[0], o.weapons[1], o.weapons[2]] }, 0.4],
    [{ ...empty, body: o.body, head: o.head, weapons: o.weapons }, 0.45],
    [o, 1.1],
    // same frame and shell, new arms
    [P.torchbearer, 1.0], [P.hailstorm, 1.0],
    // everything changes
    [P.quadgun, 1.1], [P.bastion, 1.0], [P.gatling, 1.1], [P.lighthouse, 1.0], [P.warden, 1.1],
    [P.mortarman, 1.0], [P.stitcher, 1.0], [P.arcwelder, 1.0], [P.mauler, 1.0], [P.longneck, 1.0], [P.boomer, 1.3],
  ];
  await page.evaluate(() => { window.__g.view({ yaw: 1.2, swing: 0.65, dist: 9.0, height: 2.5, look: 1.3, fov: 28, spin: 0.3 }); window.__g.resetTime(); });
  let i = 0;
  for (const [build, hold] of seq) {
    await page.evaluate(([b]) => window.__g.set(b, true), [build]);
    const n = Math.round(hold * 60);
    for (let k = 0; k < n; k++) save(dir, i++, await page.evaluate(() => window.__g.shot()));
  }
  console.log('garage-assemble', i, 'frames');
}

if (only.has('wall')) {
  const dir = join(SITE, 'capture/wall');
  mkdirSync(dir, { recursive: true });
  await page.setViewportSize({ width: 1200, height: 1200 });
  await page.evaluate(() => window.__g.step(10));
  for (const p of presets) {
    await page.evaluate(([b]) => { window.__g.set(null, false); window.__g.set(b, false); window.__g.view({ yaw: 0.65, dist: 6.3, height: 2.0, look: 1.2, fov: 27, spin: 0 }); window.__g.resetTime(); window.__g.step(20); }, [p.loadout]);
    writeFileSync(join(dir, p.id + '.jpg'), Buffer.from((await page.evaluate(() => window.__g.shot(0.95))).split(',')[1], 'base64'));
  }
  console.log('wall', presets.length);
}
if (only.has('featured')) {
  const dir = join(SITE, 'capture/featured');
  mkdirSync(dir, { recursive: true });
  await page.setViewportSize({ width: 1400, height: 1400 });
  await page.evaluate(() => window.__g.step(10));
  for (const f of featured) for (const [tag, yaw] of [['a', 0.6], ['b', -0.6]]) {
    await page.evaluate(([b, yaw]) => { window.__g.set(null, false); window.__g.set(b, false); window.__g.face(0); window.__g.view({ yaw, dist: 9.2, height: 2.6, look: 1.3, fov: 28, spin: 0 }); window.__g.resetTime(); window.__g.step(20); }, [f.l, yaw]);
    writeFileSync(join(dir, f.id + '-' + tag + '.jpg'), Buffer.from((await page.evaluate(() => window.__g.shot(0.95))).split(',')[1], 'base64'));
  }
  console.log('featured', featured.length);
}
await browser.close();
await server.close();
process.exit(0);
