#!/usr/bin/env python3
"""Find muzzle flashes and explosions in captured shots: per-frame share of very bright pixels.
Writes capture/flashes.json {shot: {"fps": n, "bright": [...per frame...]}} for the trailer's
sound design (gunshots on small spikes, explosions on big blooms).
Usage: tools/flashes.py [shots...]   (default: every battle shot)"""
import json, os, sys
import numpy as np
from PIL import Image

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FR = os.path.join(SITE, 'capture', 'frames')
OUT = os.path.join(SITE, 'capture', 'flashes.json')

def bright(path):
    im = Image.open(path).convert('L').resize((320, 180), Image.BILINEAR)
    a = np.asarray(im)
    return float((a > 232).mean())

data = json.load(open(OUT)) if os.path.exists(OUT) else {}
shots = sys.argv[1:] or sorted(s for s in os.listdir(FR) if '2-' in s and not s.startswith('sv-'))
for s in shots:
    files = sorted(f for f in os.listdir(os.path.join(FR, s)) if f.endswith('.jpg'))
    data[s] = {'fps': 30 if s.endswith('-hud') else 60, 'bright': [round(bright(os.path.join(FR, s, f)), 4) for f in files]}
    print(s, len(files), 'max', max(data[s]['bright']))
json.dump(data, open(OUT, 'w'))
