# BOLTYARD website

The public page for **BOLTYARD**, a fan-made robot arena game inspired by Guns and Robots:
<https://zurnov.github.io/boltyard/>

Build a robot from parts in your garage, then fight 5v5 battles where every bolt can be shot off.
The game itself lives in a private repository; this repo is only the website.

**Want to help?** [Open an issue](https://github.com/zurnov/boltyard/issues/new) and say what
you'd like to do (code, art, sound, maps, testing), or reach Dimitar on
[LinkedIn](https://linkedin.com/in/zurnov) or [zurnov.com](https://zurnov.com).

## What's here

| Path | What |
|---|---|
| `index.html`, `assets/site.css`, `assets/site.js` | The page. Plain HTML/CSS/JS, no build step |
| `assets/img/` | Screenshots, robot renders, arena shots (WebP), `og.jpg` link preview |
| `assets/video/` | Trailer, hero loop and gameplay clips (H.264 MP4) |
| `robots.txt`, `sitemap.xml`, `llms.txt` | Search and AI-crawler files |
| `tools/` | How the footage was made (see below) |

## How the footage is made

Every frame is the real game running in headless Chrome. `tools/capture.mjs` takes over the
game's clock (one fixed simulation step per captured frame, so clips are perfectly smooth),
hides the HUD (except for the gameplay clips), stages a fight between two robots and flies a
scripted camera: chase, orbit, side-on duel, close-up, crane and dive shots.

```sh
node tools/make-shots.mjs     # writes the shot list (tools/shots.json)
node tools/capture.mjs        # frames → capture/frames/<shot>/  (needs the game repo next door)
node tools/cards.mjs          # title cards
python3 tools/encode.py       # cuts tools/edit.json into assets/video/*.mp4
tools/build-robots.sh         # roster + garage images
python3 tools/zflicker.py     # flags z-fighting (flickering overlapped faces) in the edit's segments
node tools/zfight.mjs         # same check on fixed map viewpoints, for fixing the maps themselves
```

`capture/` is not committed.

BOLTYARD is an independent fan project and is not affiliated with Guns and Robots or its developers.
