#!/usr/bin/env python3
"""Cut the beat-synced trailer with its own score.

tools/trailer.json is the edit on a beat grid: at 30 fps a beat is 14 frames (128.57 bpm), so every
cut lands exactly on a beat. Each cut is a shot window or a title card, with optional speed ramp,
punch-in, white flash and screen shake. This script

  1. renders the picture frame by frame (PIL) and pipes it to ffmpeg,
  2. writes the sound spec: song sections, title hits, whooshes, and game sound effects placed where
     muzzle flashes and explosions appear on screen (capture/flashes.json, from tools/flashes.py),
     plus a clank on every part drop in the garage,
  3. renders the score in headless Chrome (tools/score.js) and muxes it in.

Usage: tools/trailer.py [--no-video] [--no-audio] [--out assets/video/trailer.mp4]
"""
import json, math, os, random, subprocess, sys
import numpy as np
from PIL import Image

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FR = os.path.join(SITE, 'capture', 'frames')
CARDS = os.path.join(SITE, 'capture', 'cards')
CAP = os.path.join(SITE, 'capture')
W, H, FPS, BEAT = 1920, 1080, 30, 14
GRADE = 'eq=contrast=1.06:saturation=1.12:gamma=0.98,vignette=angle=PI/5'
AUDIO = 'http://localhost:8420/boltyard-capture-src/public/audio/'
SRC = 'http://localhost:8420/boltyard-capture-src/assets-src/audio/sources/'

args = sys.argv[1:]
OUT = os.path.join(SITE, args[args.index('--out') + 1]) if '--out' in args else os.path.join(SITE, 'assets/video/trailer.mp4')
spec = json.load(open(os.path.join(SITE, 'tools', 'trailer.json')))
flashes = json.load(open(os.path.join(CAP, 'flashes.json')))
manifest = json.load(open('/Users/dimitur/dev/boltyard-capture-src/public/audio/manifest.json'))['sounds']
rng = random.Random(7)

_files = {}
def files(shot):
    if shot not in _files:
        _files[shot] = sorted(f for f in os.listdir(os.path.join(FR, shot)) if f.endswith('.jpg'))
    return _files[shot]

def src_fps(shot):
    return 30 if shot.endswith('-hud') else 60

def positions(cut, n):
    """Source frame (float) for each of the cut's n output frames, honouring speed / ramps."""
    shot = cut['shot']
    total = len(files(shot))
    start = cut.get('frame', cut.get('start', 0) * total)
    ramp = cut.get('ramp') or [[0, cut.get('speed', 1)], [1, cut.get('speed', 1)]]
    step = src_fps(shot) / FPS
    pos, p = [], start
    for k in range(n):
        x = k / max(1, n - 1)
        for (x0, s0), (x1, s1) in zip(ramp, ramp[1:]):
            if x0 <= x <= x1:
                sp = s0 + (s1 - s0) * ((x - x0) / max(1e-9, x1 - x0))
                break
        pos.append(min(total - 1, p))
        p += sp * step
    return pos

# ---------------------------------------------------------------- timeline
timeline, t = [], 0  # (cut, first output frame, n frames)
for cut in spec['cuts']:
    n = round(cut['beats'] * BEAT)
    timeline.append((cut, t, n))
    t += n
TOTAL = t
print(f'{len(timeline)} cuts, {TOTAL} frames, {TOTAL / FPS:.2f} s, {TOTAL / BEAT / 4:.2f} bars')

# ---------------------------------------------------------------- picture
_cache = {}
def load(path):
    if path not in _cache:
        if len(_cache) > 6: _cache.clear()
        im = Image.open(path).convert('RGB')
        if im.size != (W, H): im = im.resize((W, H), Image.LANCZOS)
        _cache[path] = im
    return _cache[path]

def frame_for(cut, k, n, pos):
    if 'card' in cut:
        im = load(os.path.join(CARDS, cut['card'] + '.png'))
    elif 'black' in cut:
        return Image.new('RGB', (W, H))
    else:
        im = load(os.path.join(FR, cut['shot'], files(cut['shot'])[int(pos[k])]))
    # punch-in: scale eases from `punch` to 1 over the first beat; zoom: slow push over the cut
    s = 1.0
    if cut.get('punch'):
        e = min(1, k / (BEAT * 0.8)); s *= 1 + (cut['punch'] - 1) * (1 - e) ** 3
    if cut.get('zoom'):
        s *= 1 + cut['zoom'] * (k / max(1, n - 1))
    if cut.get('crop'): s *= cut['crop']
    dx = dy = 0.0
    for sk in cut.get('shake', []):  # [beat offset, amplitude px]
        kk = k - round(sk[0] * BEAT)
        if 0 <= kk < 10:
            a = sk[1] * (1 - kk / 10) ** 2
            dx += a * math.sin(kk * 2.7 + 1.3); dy += a * math.cos(kk * 3.1)
    if s != 1 or dx or dy:
        cw, ch = W / s, H / s
        x0, y0 = (W - cw) / 2 + dx, (H - ch) / 2 + dy + cut.get('lift', 0)
        im = im.transform((W, H), Image.EXTENT, (x0, y0, x0 + cw, y0 + ch), Image.BILINEAR)
    a = np.asarray(im, dtype=np.float32)
    fl = 0.0
    for f in cut.get('flash', []):  # [beat offset, strength]
        kk = k - round(f[0] * BEAT)
        if 0 <= kk < 5: fl = max(fl, f[1] * (1 - kk / 5))
    if fl: a = a + (255 - a) * fl
    if cut.get('fadein'):
        a *= min(1, k / (cut['fadein'] * FPS))
    if cut.get('fadeout'):
        a *= min(1, (n - 1 - k) / (cut['fadeout'] * FPS))
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

if '--no-video' not in args:
    silent = os.path.join(CAP, 'trailer-silent.mp4')
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-vf', GRADE + ',format=yuv420p', '-c:v', 'libx264', '-crf', '14', '-preset', 'fast', silent], stdin=subprocess.PIPE)
    for cut, t0, n in timeline:
        pos = positions(cut, n) if 'shot' in cut else None
        for k in range(n):
            ff.stdin.write(frame_for(cut, k, n, pos).tobytes())
        print(f"  {t0 / FPS:6.2f}s  {cut.get('shot') or cut.get('card') or 'black':24s} {n / BEAT:4.1f} beats")
    ff.stdin.close(); ff.wait()

# ---------------------------------------------------------------- sound spec
SAMPLES = {}
def sample(name, i=None):
    files_ = manifest[name]['files']
    f = files_[rng.randrange(len(files_)) if i is None else i % len(files_)]['file']
    key = f[:-4]
    SAMPLES[key] = AUDIO + f
    return key

events, hits = [], []
GUNS = ['rivet', 'stitch', 'slugger', 'hammer', 'churn', 'pepper', 'longshot', 'lancet', 'volley']
for cut, t0, n in timeline:
    T0 = t0 / FPS
    for h in cut.get('hits', []):  # [beat offset, kind, gain]
        hits.append({'t': T0 + h[0] * BEAT / FPS, 'k': h[1], 'g': h[2] if len(h) > 2 else 1})
    if cut.get('whoosh'):
        hits.append({'t': T0, 'k': 'whoosh', 'len': 0.3, 'g': cut['whoosh']})
    if 'shot' not in cut:
        continue
    shot = cut['shot']
    pos = positions(cut, n)
    if shot == 'garage-assemble':
        # a clank on every part drop (frame indices of the capture sequence)
        drops = cut.get('drops', [])
        for d in drops:
            for k in range(n - 1):
                if pos[k] <= d < pos[k + 1] or (k == 0 and abs(pos[0] - d) < 1):
                    t = T0 + k / FPS
                    events.append({'t': t, 's': sample('hitMetal'), 'g': 0.9, 'rate': rng.uniform(0.8, 1.0), 'pan': rng.uniform(-0.3, 0.3), 'verb': 0.35})
                    events.append({'t': t, 's': sample('step'), 'g': 0.7, 'rate': 0.85})
                    break
        if cut.get('swap'):
            events.append({'t': T0 + 0.02, 's': sample('devDeploy'), 'g': 0.6})
            events.append({'t': T0 + 0.05, 's': sample('hitMetal'), 'g': 0.7, 'rate': 0.75, 'verb': 0.3})
        continue
    if shot not in flashes or cut.get('nosfx'):
        continue
    b = flashes[shot]['bright']
    slow = cut.get('slowsfx', shot.endswith('-slow'))
    gun = cut.get('gun') or GUNS[hash(shot) % len(GUNS)]
    last_gun = last_boom = -9
    for k in range(1, n):
        i0, i1 = int(pos[k - 1]), int(pos[k])
        if i1 <= i0: continue
        jump = max(b[j] - b[j - 1] for j in range(max(1, i0 + 1), i1 + 1))
        t = T0 + k / FPS
        if jump > 0.025 and t - last_boom > 0.45:
            big = jump > 0.06
            events.append({'t': t, 's': sample('explosionBig' if big else 'explosion'), 'g': 0.95 if big else 0.75,
                           'rate': 0.7 if slow else rng.uniform(0.92, 1.05), 'pan': rng.uniform(-0.4, 0.4), 'verb': 0.3})
            if big: hits.append({'t': t, 'k': 'boom', 'g': 0.5, 'len': 1.2})
            last_boom = t
        elif jump > 0.004 and t - last_gun > 0.11:
            events.append({'t': t, 's': sample(gun), 'g': 0.55, 'rate': 0.65 if slow else rng.uniform(0.95, 1.05), 'pan': rng.uniform(-0.5, 0.5), 'verb': 0.1})
            last_gun = t

# big source explosions for the final hits
SAMPLES['lowboom'] = SRC + 'kenney-scifi/lowFrequency_explosion_000.ogg'
for h in list(hits):
    if h['k'] in ('braam', 'lowboom'):
        events.append({'t': h['t'], 's': 'lowboom', 'g': 0.8 * h.get('g', 1), 'verb': 0.4})
hits = [h for h in hits if h['k'] != 'lowboom']

secs = []
bar = 0
for s in spec['sections']:
    secs.append({'name': s[0], 'from': bar, 'to': bar + s[1]})
    bar += s[1]
score = {'bpm': 60 * FPS / BEAT, 'seconds': TOTAL / FPS, 'sections': secs, 'hits': hits, 'events': events, 'samples': SAMPLES}
json.dump(score, open(os.path.join(CAP, 'score.json'), 'w'), indent=1)
print(f'score: {len(secs)} sections over {bar} bars, {len(events)} sound events, {len(hits)} hits')
if bar * 4 * BEAT != TOTAL:
    print(f'WARNING: sections cover {bar * 4 * BEAT} frames but the picture is {TOTAL}')

# ---------------------------------------------------------------- render score + mux
if '--no-audio' not in args:
    wav = os.path.join(CAP, 'trailer-score.wav')
    subprocess.run(['node', os.path.join(SITE, 'tools', 'score.mjs'), os.path.join(CAP, 'score.json'), wav], check=True)
    # static gain to -14 LUFS (web/YouTube loudness), measured on the rendered score
    m = subprocess.run(['ffmpeg', '-hide_banner', '-i', wav, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    lufs = float(m.rsplit('I:', 1)[1].split('LUFS')[0])
    gain = -14 - lufs
    print(f'score loudness {lufs:.1f} LUFS, gain {gain:+.1f} dB')
    silent = os.path.join(CAP, 'trailer-silent.mp4')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', silent, '-i', wav, '-map', '0:v', '-map', '1:a',
                    '-c:v', 'libx264', '-crf', '24', '-preset', 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac', '-b:a', '192k', '-af', f'volume={gain:.2f}dB,afade=t=out:st={TOTAL / FPS - 0.05}:d=0.05', '-t', f'{TOTAL / FPS + 0.0:.3f}',
                    '-movflags', '+faststart', OUT], check=True)
    print('wrote', OUT, f'{os.path.getsize(OUT) / 1e6:.1f} MB')
