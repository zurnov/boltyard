#!/usr/bin/env python3
"""Score z-fighting flicker in captured frame sequences.

Z-fighting shows as patches that toggle A-B-A across consecutive frames while the camera
moves smoothly; ordinary motion changes pixels monotonically. For triples (t, t+1, t+2)
we count pixels where t+1 differs from both neighbours but t and t+2 agree and keep only
clustered pixels. Sparks and debris blink once, so a pixel only counts if it keeps toggling
across a window of 8 frames (pscore). Reports the worst share of the frame per segment.

Usage: tools/zflicker.py [output names from edit.json...]   (default: every output)
       tools/zflicker.py --shots gulch2-dive foundry2-crane  (whole shots)
"""
import json, os, sys
import numpy as np
from PIL import Image

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FR = os.path.join(SITE, 'capture', 'frames')
T = 28  # per-channel luma difference counted as a change


def load(path):
    im = Image.open(path).convert('L')
    im = im.resize((im.width // 2, im.height // 2), Image.BILINEAR)
    return np.asarray(im, dtype=np.int16)


def toggles(a, b, c):
    m = (np.abs(b - a) > T) & (np.abs(b - c) > T) & (np.abs(a - c) < T // 2)
    # keep clustered pixels (>=4 of 8 neighbours also toggling)
    p = np.pad(m, 1).astype(np.uint8)
    n = sum(p[1 + dy:p.shape[0] - 1 + dy, 1 + dx:p.shape[1] - 1 + dx]
            for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx)
    return m & (n >= 4)


def score(shot, lo=0.0, hi=1.0, step=6):
    d = os.path.join(FR, shot)
    files = sorted(f for f in os.listdir(d) if f.endswith('.jpg'))
    a, b = int(len(files) * lo), int(len(files) * hi)
    vals = []
    for i in range(a, max(a + 1, b - 2), step):
        f = [load(os.path.join(d, files[i + k])) for k in range(3)]
        vals.append((toggles(*f).mean() * 100, i))
    if not vals:
        return 0, 0, 0
    worst = max(vals)
    return worst[0], float(np.mean([v for v, _ in vals])), worst[1]

def persistent(frames, k=3):
    """Pixels that toggle A-B-A in at least k of the consecutive triples of `frames`.
    Debris, sparks and muzzle flashes blink once; coplanar faces keep fighting."""
    cnt = None
    for j in range(len(frames) - 2):
        m = toggles(*frames[j:j + 3]).astype(np.uint8)
        cnt = m if cnt is None else cnt + m
    return cnt >= k


def pscore(shot, lo=0.0, hi=1.0, every=20, win=8):
    d = os.path.join(FR, shot)
    files = sorted(f for f in os.listdir(d) if f.endswith('.jpg'))
    a, b = int(len(files) * lo), int(len(files) * hi)
    vals = []
    for i in range(a, max(a + 1, b - win), every):
        fr = [load(os.path.join(d, files[i + k])) for k in range(win)]
        vals.append((persistent(fr).mean() * 100, i))
    return vals



if __name__ == '__main__':
    if sys.argv[1:2] == ['--shots']:
        for s in sys.argv[2:]:
            w, m, i = score(s)
            print(f'{s:28s} worst {w:6.3f}%  mean {m:6.3f}%  @frame {i}')
        sys.exit()
    edit = json.load(open(os.path.join(SITE, 'tools', 'edit.json')))
    for name in sys.argv[1:] or list(edit):
        print(name)
        for seg in edit[name]['segments']:
            if 'shot' not in seg or seg['shot'].startswith('garage'):
                continue
            v = pscore(seg['shot'], seg.get('in', 0), seg.get('out', 1), every=8)
            w, i = max(v)
            flag = '  <-- flicker' if w > 0.1 else ''
            print(f"  {seg['shot']:26s} worst {w:5.2f}% @frame {i}{flag}")
