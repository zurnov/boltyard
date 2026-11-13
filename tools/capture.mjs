// Cinematic capture rig for the BOLTYARD website.
// Drives the real game in headless Chrome, takes over its clock (one fixed step per captured
// frame, so clips are perfectly smooth regardless of render speed), hides the HUD and flies a
// scripted camera. Frames land in capture/frames/<shot>/NNNN.jpg; encode.mjs turns them into video.
//
// Usage: node tools/capture.mjs [--only=shotA,shotB] [--url=http://localhost:5173/] [--scale=1]
// Shot list: tools/shots.json. The game repo is read-only here (started with its own Vite).
import { chromium } from '/Users/dimitur/dev/guns-and-robots-rebith/node_modules/playwright-core/index.mjs';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME = '/Users/dimitur/dev/boltyard-capture-src';
const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const only = args.only ? new Set(args.only.split(',')) : null;
const shots = JSON.parse(readFileSync(join(SITE, args.list ?? 'tools/shots.json'), 'utf8')).filter((s) => !only || only.has(s.name));

let server = null;
let base = args.url;
if (!base) {
  process.chdir(GAME);
  const { createServer } = await import(join(GAME, 'node_modules/vite/dist/node/index.js'));
  server = await createServer({ root: GAME, server: { port: 0, strictPort: false, hmr: false, watch: null }, logLevel: 'warn' });
  await server.listen();
  base = server.resolvedUrls?.local?.[0];
}

// ---------------------------------------------------------------- in-page rig
function installRig() {
  const G = window.__game;
  const g = G.game;
  g.perf.shouldRender = () => false; // the rAF loop no longer advances anything
  clearInterval(g.watchdog);
  let t = performance.now();
  g.last = t;
  let hud = false;
  const hideUi = () => {
    if (hud) {
      for (const el of document.querySelectorAll('.ui-layer *')) if (el.childElementCount === 0 && /AUTOPLAY|Click to capture/.test(el.textContent || '')) el.style.visibility = 'hidden';
      return;
    }
    for (const el of document.querySelectorAll('.ui-layer, .hud-root, [class*="overlay"]')) el.style.visibility = 'hidden';
  };
  hideUi();
  const cam = g.renderer.camera;
  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    lerp: (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k],
    flat: (a) => { const l = Math.hypot(a[0], a[2]) || 1; return [a[0] / l, 0, a[2] / l]; },
  };
  const world = () => G.world;
  const view = (id) => g.robotViews.get(id)?.root;
  const posOf = (id) => {
    const r = view(id);
    if (r) return [r.position.x, r.position.y, r.position.z];
    return [...world().getRobot(id).pos];
  };
  const nearestEnemy = (id, maxD = 60) => {
    const w = world();
    const me = w.getRobot(id);
    let best = null;
    let bd = maxD;
    for (const r of w.robots) {
      if (!r.alive || r.team === me.team) continue;
      const d = Math.hypot(r.pos[0] - me.pos[0], r.pos[2] - me.pos[2]);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  };
  
  const clampCam = (focus, pos) => {
    const d = V.sub(pos, focus);
    const L = V.len(d);
    if (L < 0.01) return pos;
    const hit = world().physics.raycast(focus, d, L, 0x0001);
    if (!hit) return pos;
    return V.add(focus, V.mul(d, Math.max(0.6, hit.distance - 0.45) / L));
  };
  // raise the camera until it can see every point of interest (a natural crane-up after smoothing)
  const unblock = (pos, pts) => {
    const p = [...pos];
    for (let k = 0; k < 10; k++) {
      if (pts.every((q) => world().physics.lineOfSight(p, q))) return p;
      p[1] += 0.7;
    }
    return p;
  };
  const sizeOf = (id) => { const b = world().moduleBox(world().getRobot(id), 'body'); return Math.max(b.half[0], b.half[2], 0.5); };
  let shot = null;
  let sm = null; // smoothed camera state
  let frame = 0;
  let dtCam = 1 / 60;
  const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

  const solve = () => {
    const s = shot;
    const T = frame * dtCam;
    const u = s.frames ? Math.min(1, frame / s.frames) : 0;
    if (s.type === 'path') {
      const k = ease(u);
      return { pos: V.lerp(s.from[0], s.to[0], k), look: V.lerp(s.from[1], s.to[1], k), fov: s.fov ?? 50 };
    }
    const hero = posOf(s.hero);
    let tgt = s.target != null ? world().getRobot(s.target) : null;
    if (!tgt || !tgt.alive) { tgt = nearestEnemy(s.hero); if (tgt) s.target = tgt.id; }
    const tp = tgt ? posOf(tgt.id) : V.add(hero, [0, 0, 10]);
    const toT = V.flat(V.sub(tp, hero));
    const right = [toT[2], 0, -toT[0]];
    if (s.type === 'chase') {
      // behind the hero, off one shoulder, looking past it at the target
      const side = s.side ?? 1;
      const dist = Math.max(s.dist ?? 4.5, sizeOf(s.hero) * 2.6 + 2.4);
      const pos = V.add(hero, V.add(V.mul(toT, -dist), V.add(V.mul(right, side * (s.off ?? 2.2)), [0, s.height ?? 1.6, 0])));
      const look = V.add(V.lerp(hero, tp, s.lookK ?? 0.45), [0, 1.0, 0]);
      return { pos: unblock(clampCam(V.add(hero, [0, 1.3, 0]), pos), [V.add(tp, [0, 1, 0])]), look, fov: s.fov ?? 45 };
    }
    if (s.type === 'orbit') {
      const a = (s.start ?? 0) + T * (s.speed ?? 0.25);
      const r = s.radius ?? 5;
      const pos = V.add(hero, [Math.cos(a) * r, s.height ?? 1.4, Math.sin(a) * r]);
      return { pos: unblock(clampCam(V.add(hero, [0, 1.2, 0]), pos), [V.add(hero, [0, 1.1, 0])]), look: V.add(hero, [0, s.lookH ?? 1.1, 0]), fov: s.fov ?? 40 };
    }
    if (s.type === 'duel') {
      // side-on to the line of fire, framing both robots, slow dolly along it
      const mid = V.lerp(hero, tp, 0.5);
      const d = Math.hypot(tp[0] - hero[0], tp[2] - hero[2]);
      const dist = Math.max(s.min ?? 6, d * (s.k ?? 0.75));
      const slide = (u - 0.5) * (s.slide ?? 4);
      const pos = V.add(mid, V.add(V.mul(right, (s.side ?? 1) * dist), V.add(V.mul(toT, slide), [0, s.height ?? 1.8, 0])));
      return { pos: unblock(clampCam(V.add(mid, [0, 1.2, 0]), pos), [V.add(hero, [0, 1.1, 0]), V.add(tp, [0, 1.1, 0])]), look: V.add(mid, [0, 0.9, 0]), fov: s.fov ?? 42 };
    }
    if (s.type === 'low') {
      // a fixed low camera the hero drives past (chosen at shot start)
      if (!s.anchor) {
        const ahead = V.add(hero, V.add(V.mul(toT, s.ahead ?? 7), V.mul(right, s.off ?? 2.5)));
        s.anchor = [ahead[0], hero[1] + (s.height ?? 0.35), ahead[2]];
      }
      return { pos: s.anchor, look: V.add(hero, [0, 0.9, 0]), fov: s.fov ?? 38 };
    }
    if (s.type === 'hero') {
      // close portrait from the front quarter, slow push-in
      const fwd = V.flat([Math.sin(world().getRobot(s.hero).chassisYaw), 0, Math.cos(world().getRobot(s.hero).chassisYaw)]);
      const r2 = [fwd[2], 0, -fwd[0]];
      const dist = (s.dist ?? 4) - u * (s.push ?? 1);
      const pos = V.add(hero, V.add(V.mul(fwd, dist), V.add(V.mul(r2, s.off ?? 1.6), [0, s.height ?? 0.9, 0])));
      return { pos: clampCam(V.add(hero, [0, 1.2, 0]), pos), look: V.add(hero, [0, s.lookH ?? 1.2, 0]), fov: s.fov ?? 35 };
    }
    throw new Error('unknown shot type ' + s.type);
  };

  const origUpdate = g.camera.update.bind(g.camera);
  g.camera.update = (...a) => {
    origUpdate(...a);
    if (!shot) return;
    const want = solve();
    const k = shot.type === 'path' || shot.type === 'low' ? 1 : 1 - Math.exp(-(shot.smooth ?? 3.5) * dtCam);
    if (!sm || shot.snap) { sm = { pos: want.pos, look: want.look }; shot.snap = false; }
    else { sm.pos = V.lerp(sm.pos, want.pos, k); sm.look = V.lerp(sm.look, want.look, k * 1.3 > 1 ? 1 : k * 1.3); }
    cam.fov = want.fov;
    cam.updateProjectionMatrix();
    cam.position.set(...sm.pos);
    cam.lookAt(...sm.look);
  };
  g.camera.opacityOf = () => 1;
  g.camera.occluderFades = () => new Map();
  g.camera.cutRoom = () => null;
  g.camera.cutFocus = () => null;

  return {
    step(n = 1, dt = 1 / 60, scale = 1) {
      g.timeScale = scale;
      dtCam = dt;
      for (let i = 0; i < n; i++) {
        t += dt * 1000;
        g.advance(t);
        if (shot) frame++;
      }
      hideUi();
    },
    setShot(s) { shot = s ? { ...s, snap: true } : null; frame = 0; },
    setHud(on) { hud = on; for (const el of document.querySelectorAll('.ui-layer, .hud-root, [class*="overlay"]')) el.style.visibility = on ? '' : 'hidden'; hideUi(); },
    /** Put the hero and its nearest enemy on two open spots facing each other (clear line of sight). */
    stage(heroId, opts) {
      const w = world();
      const ground = (p) => { const h = w.physics.raycast([p[0], p[1] + 6, p[2]], [0, -1, 0], 20, 0x0001); return h ? h.point[1] : p[1]; };
      const spots = w.pickups.map((p) => { const q = [p.pos[0], 0, p.pos[2]]; q[1] = ground(p.pos); return q; });
      for (const r of w.robots) spots.push([r.pos[0], ground(r.pos), r.pos[2]]);
      const pairs = [];
      for (let i = 0; i < spots.length; i++) for (let j = 0; j < spots.length; j++) {
        if (i === j) continue;
        const a = spots[i], b = spots[j];
        const d = Math.hypot(a[0] - b[0], a[2] - b[2]);
        if (d < (opts.dmin ?? 10) || d > (opts.dmax ?? 18) || Math.abs(a[1] - b[1]) > 0.6) continue;
        if (!w.physics.lineOfSight([a[0], a[1] + 1.3, a[2]], [b[0], b[1] + 1.3, b[2]])) continue;
        if (!w.physics.lineOfSight([a[0], a[1] + 0.5, a[2]], [b[0], b[1] + 0.5, b[2]])) continue;
        pairs.push([a, b]);
      }
      if (!pairs.length) return { ok: false, why: 'no pairs' };
      const [a, b] = pairs[(opts.pair ?? 0) % pairs.length];
      const me = w.getRobot(heroId);
      const foe = opts.enemy != null ? w.getRobot(opts.enemy) : nearestEnemy(heroId, 500);
      const yawAB = Math.atan2(b[0] - a[0], b[2] - a[2]);
      w.spawnRobotAt(me, [a[0], a[1] + 0.05, a[2]], yawAB);
      w.spawnRobotAt(foe, [b[0], b[1] + 0.05, b[2]], yawAB + Math.PI);
      if (opts.clear) {
        // push everyone else at least `clear` metres away from the duel, back toward their spawns
        for (const r of w.robots) {
          if (r === me || r === foe || !r.alive) continue;
          const mid = [(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2];
          if (Math.hypot(r.pos[0] - mid[0], r.pos[2] - mid[2]) < opts.clear) w.spawnRobotAt(r, w.map.spawns?.[r.team]?.[r.spawnIndex]?.pos ?? r.pos, 0);
        }
      }
      return { ok: true, a, b, target: foe.id, pairs: pairs.length };
    },
    /** Fast-forward until the hero (default: the player robot) is firing at an enemy within maxD. */
    findAction(heroId, maxD, maxSeconds, minShots = 2) {
      const shots = (id) => world().getRobot(id).weapons.reduce((a, w) => a + w.shotsFired, 0);
      let prev = shots(heroId);
      const recent = [];
      for (let i = 0; i < maxSeconds * 20; i++) {
        t += 50; g.timeScale = 1;
        g.advance(t);
        const w = world();
        if (w.mode.phase === 'ended') return { ok: false, why: 'ended' };
        const me = w.getRobot(heroId);
        if (!me.alive) return { ok: false, why: 'hero dead' };
        const n = shots(heroId);
        if (n > prev) recent.push(w.time);
        prev = n;
        while (recent.length && w.time - recent[0] > 1.5) recent.shift();
        const e = nearestEnemy(heroId, maxD);
        if (e && recent.length >= minShots) return { ok: true, target: e.id, t: w.time };
      }
      return { ok: false, why: 'timeout' };
    },
    /** Fast-forward a number of seconds (no capture). */
    skip(seconds) { for (let i = 0; i < seconds * 20; i++) { t += 50; g.timeScale = 1; g.advance(t); } },
    stepCapture(dt, q = 0.93) { this.step(1, dt); return g.renderer.renderer.domElement.toDataURL('image/jpeg', q); },
    capture(q = 0.93) { return g.renderer.renderer.domElement.toDataURL('image/jpeg', q); },
    info(heroId) {
      const w = world();
      return { phase: w.mode.phase, time: w.time, robots: w.robots.map((r) => ({ id: r.id, team: r.team, name: r.name, alive: r.alive, pos: r.pos.map((v) => +v.toFixed(1)), firing: r.weapons.some((x) => x.firing) })), hero: heroId };
    },
    pickHero(team) {
      // the alive robot (optionally of one team) closest to any enemy
      const w = world();
      let best = null; let bd = 1e9;
      for (const r of w.robots) {
        if (!r.alive || (team && r.team !== team)) continue;
        const e = nearestEnemy(r.id, 200);
        if (!e) continue;
        const d = Math.hypot(e.pos[0] - r.pos[0], e.pos[2] - r.pos[2]);
        if (d < bd) { bd = d; best = r.id; }
      }
      return best;
    },
  };
}

const W = Number(args.w ?? 1920);
const H = Number(args.h ?? 1080);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  for (const s of shots) {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: Number(args.scale ?? s.scale ?? 1) });
    page.on('pageerror', (e) => errors.push(`[${s.name}] ${e.message}`));
    const q = new URLSearchParams({ quick: '1', autoplay: '1', map: s.map, mode: s.mode ?? 'tdm', teamSize: String(s.teamSize ?? 5), seed: String(s.seed ?? 1), quality: 'high', dynres: '0', profile: 'rich', difficulty: s.difficulty ?? 'hard' });
    await page.goto(new URL('/?' + q, base).href);
    await page.waitForFunction(() => window.__game?.world && window.__game.state === 'match', null, { timeout: 120000 });
    if (s.loadout) {
      await page.evaluate(async (s) => { await window.__game.startMatch({ map: s.map, mode: s.mode ?? 'tdm', teamSize: s.teamSize ?? 5, seed: s.seed ?? 1, autoplay: true, loadout: s.loadout, difficulty: s.difficulty ?? 'hard', team: s.team ?? 'red' }); }, s);
      await page.waitForFunction(() => window.__game?.world && window.__game.state === 'match', null, { timeout: 120000 });
    }
    await page.getByText('GOT IT', { exact: false }).first().click({ timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.evaluate(`window.__cine = (${installRig.toString()})()`);
    // let the countdown pass
    await page.evaluate((sec) => window.__cine.skip(sec), s.skip ?? 6);
    let hero = s.hero ?? 1;
    let target = null;
    if (s.type !== 'path') {
      if (s.hero === 'auto') hero = await page.evaluate(() => window.__cine.pickHero());
      if (s.stage) {
        const st = await page.evaluate(([h, o]) => window.__cine.stage(h, o), [hero, s.stage]);
        console.log(s.name, 'stage:', JSON.stringify(st));
        if (st.ok && s.stage.direct) { target = st.target; }
      }
      const found = target ? { ok: true, target } : await page.evaluate(([h, d, m]) => window.__cine.findAction(h, d, m), [hero, s.maxD ?? 26, s.search ?? 90]);
      console.log(s.name, 'action:', JSON.stringify(found));
      if (!found.ok) {
        if (found.why === 'hero dead' || found.why === 'timeout') {
          hero = await page.evaluate(() => window.__cine.pickHero());
          const f2 = await page.evaluate(([h, d]) => window.__cine.findAction(h, d, 60), [hero, s.maxD ?? 26]);
          console.log(s.name, 'retry hero', hero, JSON.stringify(f2));
          if (!f2.ok) { await page.close(); continue; }
          target = f2.target;
        } else { await page.close(); continue; }
      } else target = found.target;
      if (s.lead) await page.evaluate((sec) => window.__cine.skip(sec), s.lead);
    }
    const dir = join(SITE, 'capture/frames', s.name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const fps = s.fps ?? 60;
    const slow = s.slow ?? 1; // 2 = half speed
    const frames = Math.round((s.seconds ?? 6) * fps);
    if (s.hud) await page.evaluate(() => window.__cine.setHud(true));
    else await page.evaluate(([s, hero, target, frames]) => window.__cine.setShot({ ...s, hero, target, frames }), [s, hero, target, frames]);
    // warm-up frames so smoothing settles
    await page.evaluate(([n, dt]) => window.__cine.step(n, dt), [Math.round(fps * 0.25), 1 / fps / slow]);
    const t0 = Date.now();
    for (let i = 0; i < frames; i++) {
      let data;
      if (s.hud) {
        await page.evaluate((dt) => window.__cine.step(1, dt), 1 / fps / slow);
        data = 'x,' + (await page.screenshot({ type: 'jpeg', quality: 92 })).toString('base64');
      } else data = await page.evaluate(([dt, q]) => window.__cine.stepCapture(dt, q), [1 / fps / slow, s.jpeg ?? 0.93]);
      writeFileSync(join(dir, String(i).padStart(4, '0') + '.jpg'), Buffer.from(data.split(',')[1], 'base64'));
      if (s.still != null && i === Math.round(s.still * frames)) writeFileSync(join(SITE, 'capture', s.name + '-still.jpg'), Buffer.from(data.split(',')[1], 'base64'));
    }
    console.log(`${s.name}: ${frames} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    await page.close();
  }
} finally {
  await browser.close();
  await server?.close();
}
if (errors.length) console.log('page errors:\n' + [...new Set(errors)].join('\n'));
process.exit(0);
