// Render trailer title cards (1920x1080 PNG) in the game's fonts → capture/cards/*.png
import { chromium } from '/Users/dimitur/dev/guns-and-robots-rebith/node_modules/playwright-core/index.mjs';
const css = `<link href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@700;800&display=swap" rel="stylesheet">
<style>*{margin:0}body{width:1920px;height:1080px;background:#0f0c09;color:#fff4dc;font-family:Nunito;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden}
.d{font-family:'Lilita One';line-height:.95}.a{color:#ffb22e}
.hz{position:absolute;left:0;right:0;height:22px;background:repeating-linear-gradient(-45deg,#ffb22e 0 28px,#0f0c09 28px 56px)}
small{font-size:34px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#c4bca9}</style>`;
const cards = {
  open: `<small>A fan-made robot arena game</small><div class="d a" style="font-size:240px;margin-top:24px;text-shadow:0 10px 0 #6a3d00">BOLTYARD</div>`,
  build: `<div class="d" style="font-size:200px">Build it.</div>`,
  bolt: `<div class="d" style="font-size:200px">Bolt it.</div>`,
  break: `<div class="d a" style="font-size:200px">Break theirs.</div>`,
  end: `<div class="hz" style="top:0"></div><div class="d a" style="font-size:200px;text-shadow:0 10px 0 #6a3d00">BOLTYARD</div>
        <div style="font-size:44px;font-weight:800;margin-top:34px">In development. Want to help?</div>
        <div style="font-size:38px;font-weight:700;margin-top:14px;color:#ffb22e">zurnov.github.io/boltyard</div><div class="hz" style="bottom:0"></div>`,
};
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
for (const [n, html] of Object.entries(cards)) {
  await p.setContent(css + html, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `capture/cards/${n}.png` });
}
await b.close();
