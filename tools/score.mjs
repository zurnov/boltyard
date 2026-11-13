// Render the trailer score: loads tools/score.js in headless Chrome and runs it on a spec.
// Usage: node tools/score.mjs capture/score.json capture/trailer-score.wav
// Needs the local server on :8420 (serves /Users/dimitur/dev) so the page can fetch the game's sounds.
import { chromium } from '/Users/dimitur/dev/guns-and-robots-rebith/node_modules/playwright-core/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
const [specPath, outPath] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage();
p.on('pageerror', (e) => console.error('pageerror', e.message));
await p.goto('http://localhost:8420/boltyard-site/tools/score-host.html');
await p.addScriptTag({ content: readFileSync(new URL('./score.js', import.meta.url), 'utf8') });
const r = await p.evaluate((s) => window.renderScore(s), spec);
writeFileSync(outPath, Buffer.from(r.wav, 'base64'));
console.log('score rendered, peak', r.peak.toFixed(3), '->', outPath);
await b.close();
